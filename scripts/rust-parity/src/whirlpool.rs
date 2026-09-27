// Extracted from pinned upstream; see provenance.json and verify-source.mjs.
use anyhow::{anyhow, Result};
use solana_sdk::{pubkey, pubkey::Pubkey, instruction::{AccountMeta, Instruction}};

pub const PROGRAM_ID: Pubkey = pubkey!("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
pub const MEMO_PROGRAM: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
pub const SWAP_V2_DISCRIMINATOR: [u8; 8] = [43, 4, 237, 11, 26, 201, 30, 98];
pub const MIN_SQRT_PRICE: u128 = 4_295_048_016;
pub const MAX_SQRT_PRICE: u128 = 79_226_673_515_401_279_992_447_579_055;

pub fn oracle(whirlpool: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"oracle", whirlpool.as_ref()], &PROGRAM_ID).0
}

pub fn default_sqrt_price_limit(a_to_b: bool) -> u128 {
    if a_to_b {
        MIN_SQRT_PRICE
    } else {
        MAX_SQRT_PRICE
    }
}

#[derive(Clone, Debug)]
pub struct WhirlpoolSwapV2Accounts {
    pub token_program_a: Pubkey,
    pub token_program_b: Pubkey,
    pub token_authority: Pubkey,
    pub whirlpool: Pubkey,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub owner_a: Pubkey,
    pub vault_a: Pubkey,
    pub owner_b: Pubkey,
    pub vault_b: Pubkey,
    pub tick_arrays: Vec<Pubkey>,
}

#[derive(Clone, Copy, Debug)]
pub struct WhirlpoolSwapV2Args {
    pub amount: u64,
    pub other_amount_threshold: u64,
    /// Pass `0` to use explicit full-range defaults (`MIN`/`MAX`). On-chain also
    /// treats `0` as no-limit and remaps the same way.
    pub sqrt_price_limit: u128,
    pub amount_specified_is_input: bool,
    pub a_to_b: bool,
}

pub fn swap_v2(
    accounts: &WhirlpoolSwapV2Accounts,
    args: WhirlpoolSwapV2Args,
) -> Result<Instruction> {
    if accounts.tick_arrays.len() < 3 {
        return Err(anyhow!(
            "Whirlpool swap_v2 requires 3 tick arrays (got {})",
            accounts.tick_arrays.len()
        ));
    }
    let ticks = [
        accounts.tick_arrays[0],
        accounts.tick_arrays[1],
        accounts.tick_arrays[2],
    ];
    let metas = vec![
        AccountMeta::new_readonly(accounts.token_program_a, false),
        AccountMeta::new_readonly(accounts.token_program_b, false),
        AccountMeta::new_readonly(MEMO_PROGRAM, false),
        AccountMeta::new_readonly(accounts.token_authority, true),
        AccountMeta::new(accounts.whirlpool, false),
        AccountMeta::new_readonly(accounts.mint_a, false),
        AccountMeta::new_readonly(accounts.mint_b, false),
        AccountMeta::new(accounts.owner_a, false),
        AccountMeta::new(accounts.vault_a, false),
        AccountMeta::new(accounts.owner_b, false),
        AccountMeta::new(accounts.vault_b, false),
        AccountMeta::new(ticks[0], false),
        AccountMeta::new(ticks[1], false),
        AccountMeta::new(ticks[2], false),
        AccountMeta::new(oracle(&accounts.whirlpool), false),
    ];
    let sqrt_price_limit = if args.sqrt_price_limit == 0 {
        default_sqrt_price_limit(args.a_to_b)
    } else {
        args.sqrt_price_limit
    };
    let mut data = Vec::with_capacity(43);
    data.extend_from_slice(&SWAP_V2_DISCRIMINATOR);
    data.extend_from_slice(&args.amount.to_le_bytes());
    data.extend_from_slice(&args.other_amount_threshold.to_le_bytes());
    data.extend_from_slice(&sqrt_price_limit.to_le_bytes());
    data.push(u8::from(args.amount_specified_is_input));
    data.push(u8::from(args.a_to_b));
    data.push(0); // remaining_accounts_info: None
    Ok(Instruction::new_with_bytes(PROGRAM_ID, &data, metas))
}
