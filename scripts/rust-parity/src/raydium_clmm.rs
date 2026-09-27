// Extracted from pinned upstream; see provenance.json and verify-source.mjs.
use anyhow::{anyhow, Result};
use solana_sdk::{pubkey, pubkey::Pubkey, instruction::{AccountMeta, Instruction}};

pub const PROGRAM_ID: Pubkey = pubkey!("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
pub const MEMO_PROGRAM: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
pub const SWAP_V2_DISCRIMINATOR: [u8; 8] = [43, 4, 237, 11, 26, 201, 30, 98];
pub const MIN_SQRT_PRICE_X64: u128 = 4_295_048_016;
pub const MAX_SQRT_PRICE_X64: u128 = 79_226_673_521_066_979_257_578_248_091;

pub fn tick_array_bitmap_extension(pool_state: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"pool_tick_array_bitmap_extension", pool_state.as_ref()],
        &PROGRAM_ID,
    )
    .0
}

#[derive(Clone, Debug)]
pub struct RaydiumClmmSwapV2Accounts {
    pub payer: Pubkey,
    pub amm_config: Pubkey,
    pub pool_state: Pubkey,
    pub input_token_account: Pubkey,
    pub output_token_account: Pubkey,
    pub input_vault: Pubkey,
    pub output_vault: Pubkey,
    pub observation_state: Pubkey,
    pub token_program: Pubkey,
    pub token_program_2022: Pubkey,
    pub input_vault_mint: Pubkey,
    pub output_vault_mint: Pubkey,
    pub tick_array_bitmap_extension: Option<Pubkey>,
    pub tick_arrays: Vec<Pubkey>,
}

#[derive(Clone, Copy, Debug)]
pub struct RaydiumClmmSwapV2Args {
    pub amount: u64,
    pub other_amount_threshold: u64,
    pub sqrt_price_limit_x64: u128,
    pub is_base_input: bool,
}

pub fn swap_v2(
    accounts: &RaydiumClmmSwapV2Accounts,
    args: RaydiumClmmSwapV2Args,
) -> Result<Instruction> {
    let bitmap_pda = tick_array_bitmap_extension(&accounts.pool_state);
    // Align with on-chain remaining-account scan: bitmap may be mixed into tick list.
    let mut bitmap = accounts
        .tick_array_bitmap_extension
        .filter(|b| *b == bitmap_pda);
    let mut tick_arrays = Vec::with_capacity(accounts.tick_arrays.len());
    for &key in &accounts.tick_arrays {
        if key == bitmap_pda {
            bitmap = Some(key);
        } else {
            tick_arrays.push(key);
        }
    }
    if tick_arrays.is_empty() {
        return Err(anyhow!("Raydium CLMM swap_v2 requires at least one tick array"));
    }
    let mut metas = Vec::with_capacity(13 + tick_arrays.len() + usize::from(bitmap.is_some()));
    metas.extend([
        AccountMeta::new_readonly(accounts.payer, true),
        AccountMeta::new_readonly(accounts.amm_config, false),
        AccountMeta::new(accounts.pool_state, false),
        AccountMeta::new(accounts.input_token_account, false),
        AccountMeta::new(accounts.output_token_account, false),
        AccountMeta::new(accounts.input_vault, false),
        AccountMeta::new(accounts.output_vault, false),
        AccountMeta::new(accounts.observation_state, false),
        AccountMeta::new_readonly(accounts.token_program, false),
        AccountMeta::new_readonly(accounts.token_program_2022, false),
        AccountMeta::new_readonly(MEMO_PROGRAM, false),
        AccountMeta::new_readonly(accounts.input_vault_mint, false),
        AccountMeta::new_readonly(accounts.output_vault_mint, false),
    ]);
    if let Some(ext) = bitmap {
        metas.push(AccountMeta::new(ext, false));
    }
    metas.extend(tick_arrays.iter().map(|key| AccountMeta::new(*key, false)));
    let mut data = [0u8; 41];
    data[..8].copy_from_slice(&SWAP_V2_DISCRIMINATOR);
    data[8..16].copy_from_slice(&args.amount.to_le_bytes());
    data[16..24].copy_from_slice(&args.other_amount_threshold.to_le_bytes());
    data[24..40].copy_from_slice(&args.sqrt_price_limit_x64.to_le_bytes());
    data[40] = u8::from(args.is_base_input);
    Ok(Instruction::new_with_bytes(PROGRAM_ID, &data, metas))
}


pub fn clmm_sqrt_limit(zero_for_one: bool, explicit: u128) -> u128 {
    if explicit != 0 {
        return explicit;
    }
    if zero_for_one {
        MIN_SQRT_PRICE_X64 + 1
    } else {
        MAX_SQRT_PRICE_X64 - 1
    }
}
