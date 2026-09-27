// Extracted from pinned upstream; see provenance.json and verify-source.mjs.
use anyhow::{anyhow, Result};
use solana_sdk::{pubkey, pubkey::Pubkey, instruction::{AccountMeta, Instruction}};

pub const PROGRAM_ID: Pubkey = pubkey!("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
pub const MEMO_PROGRAM: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
pub const EVENT_AUTHORITY: Pubkey = pubkey!("D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6");
pub const SWAP2_DISCRIMINATOR: [u8; 8] = [65, 75, 63, 76, 235, 91, 91, 136];

#[derive(Clone, Debug)]
pub struct MeteoraDlmmSwap2Accounts {
    pub lb_pair: Pubkey,
    pub bitmap_extension: Option<Pubkey>,
    pub reserve_x: Pubkey,
    pub reserve_y: Pubkey,
    pub user_token_in: Pubkey,
    pub user_token_out: Pubkey,
    pub token_x_mint: Pubkey,
    pub token_y_mint: Pubkey,
    pub oracle: Pubkey,
    pub user: Pubkey,
    pub token_x_program: Pubkey,
    pub token_y_program: Pubkey,
    pub bin_arrays: Vec<Pubkey>,
}

pub fn swap2(
    accounts: &MeteoraDlmmSwap2Accounts,
    amount_in: u64,
    min_out: u64,
) -> Result<Instruction> {
    if accounts.bin_arrays.is_empty() {
        return Err(anyhow!("Meteora DLMM swap2 requires at least one bin array"));
    }
    let mut metas = Vec::with_capacity(16 + accounts.bin_arrays.len());
    let bitmap_meta = match accounts.bitmap_extension {
        Some(key) => AccountMeta::new(key, false),
        None => AccountMeta::new_readonly(PROGRAM_ID, false),
    };
    metas.extend([
        AccountMeta::new(accounts.lb_pair, false),
        bitmap_meta,
        AccountMeta::new(accounts.reserve_x, false),
        AccountMeta::new(accounts.reserve_y, false),
        AccountMeta::new(accounts.user_token_in, false),
        AccountMeta::new(accounts.user_token_out, false),
        AccountMeta::new_readonly(accounts.token_x_mint, false),
        AccountMeta::new_readonly(accounts.token_y_mint, false),
        AccountMeta::new(accounts.oracle, false),
        AccountMeta::new_readonly(PROGRAM_ID, false), // host_fee_in None sentinel
        AccountMeta::new_readonly(accounts.user, true),
        AccountMeta::new_readonly(accounts.token_x_program, false),
        AccountMeta::new_readonly(accounts.token_y_program, false),
        AccountMeta::new_readonly(MEMO_PROGRAM, false),
        AccountMeta::new_readonly(EVENT_AUTHORITY, false),
        AccountMeta::new_readonly(PROGRAM_ID, false),
    ]);
    metas.extend(accounts.bin_arrays.iter().map(|key| AccountMeta::new(*key, false)));
    // IDL swap2 args: amount_in + min_amount_out + RemainingAccountsInfo { slices: Vec }
    // Empty slices → Borsh u32 length 0 (4 zero bytes after min_out).
    let mut data = [0u8; 28];
    data[..8].copy_from_slice(&SWAP2_DISCRIMINATOR);
    data[8..16].copy_from_slice(&amount_in.to_le_bytes());
    data[16..24].copy_from_slice(&min_out.to_le_bytes());
    Ok(Instruction::new_with_bytes(PROGRAM_ID, &data, metas))
}
