//! Executes the pinned upstream instruction builders, without RPC or signing.
mod raydium_clmm;
mod whirlpool;
mod meteora_dlmm;
use solana_sdk::{pubkey, pubkey::Pubkey, instruction::Instruction};
use serde_json::{json, Value};
use std::{io::{self, Read}, str::FromStr};
fn key(n: u8) -> Pubkey { Pubkey::new_from_array([n; 32]) }
fn encode(ix: Instruction) -> Value {
    json!({"programId":ix.program_id.to_string(), "keys":ix.accounts.iter().map(|m|json!({"pubkey":m.pubkey.to_string(),"isSigner":m.is_signer,"isWritable":m.is_writable})).collect::<Vec<_>>(), "data":ix.data})
}
fn main() {
    let token = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    let token2022 = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    if std::env::args().any(|arg| arg == "--dlmm-input") {
        let mut input = String::new(); io::stdin().read_to_string(&mut input).unwrap();
        let inputs: Vec<Value> = serde_json::from_str(&input).unwrap();
        let outputs: Vec<Value> = inputs.iter().map(|v| {
            let forward = v["forward"].as_bool().unwrap();
            let a = meteora_dlmm::MeteoraDlmmSwap2Accounts {
                lb_pair:key(1), bitmap_extension:if v["bitmap"].as_bool().unwrap() {Some(key(8))} else {None}, reserve_x:key(4), reserve_y:key(5),
                user_token_in:key(if forward {11} else {12}), user_token_out:key(if forward {12} else {11}),
                token_x_mint:key(2), token_y_mint:key(3), oracle:key(7), user:key(10), token_x_program:token, token_y_program:token2022,
                bin_arrays:v["binArrays"].as_array().unwrap().iter().map(|key| Pubkey::from_str(key.as_str().unwrap()).unwrap()).collect(),
            };
            encode(meteora_dlmm::swap2(&a, v["amount"].as_str().unwrap().parse().unwrap(), v["minimum"].as_str().unwrap().parse().unwrap()).unwrap())
        }).collect();
        println!("{}", serde_json::to_string(&outputs).unwrap()); return;
    }
    let mut cases = vec![];
    for forward in [true, false] {
        for (amount, minimum) in [(1u64, 0u64), (9_007_199_254_740_993, 9_007_199_254_740_991), (u64::MAX, u64::MAX)] {
            for bitmap in [false, true] {
                for count in [1u8, 3] {
                    let ticks: Vec<Pubkey> = (0..count).map(|i| key(20+i)).collect();
                    let a = raydium_clmm::RaydiumClmmSwapV2Accounts {
                        payer:key(10), amm_config:key(6), pool_state:key(1), input_token_account:key(11), output_token_account:key(12),
                        input_vault:key(if forward {4} else {5}), output_vault:key(if forward {5} else {4}), observation_state:key(7),
                        token_program:token, token_program_2022:token2022, input_vault_mint:key(if forward {2} else {3}),
                        output_vault_mint:key(if forward {3} else {2}), tick_array_bitmap_extension:if bitmap {Some(raydium_clmm::tick_array_bitmap_extension(&key(1)))} else {None}, tick_arrays:ticks.clone(),
                    };
                    let args = raydium_clmm::RaydiumClmmSwapV2Args {amount, other_amount_threshold:minimum, sqrt_price_limit_x64:0, is_base_input:true};
                    let actual = raydium_clmm::swap_v2(&a, args).unwrap();
                    let high_level_default = raydium_clmm::swap_v2(&a, raydium_clmm::RaydiumClmmSwapV2Args {sqrt_price_limit_x64:raydium_clmm::clmm_sqrt_limit(forward, 0), ..args}).unwrap();
                    cases.push(json!({"venue":"raydiumClmm","forward":forward,"bitmap":bitmap,"count":count,"amount":amount.to_string(),"minimum":minimum.to_string(),"instruction":encode(actual),"highLevelDefaultInstruction":encode(high_level_default)}));
                    // Node prepares real synthetic DLMM quotes, then sends only builder
                    // inputs back through --dlmm-input for execution of the Rust swap2.
                    cases.push(json!({"venue":"meteoraDlmm","forward":forward,"bitmap":bitmap,"count":count,"amount":amount.to_string(),"minimum":minimum.to_string()}));
                }
            }
            let a = whirlpool::WhirlpoolSwapV2Accounts {token_program_a:token, token_program_b:token2022, token_authority:key(10), whirlpool:key(1), mint_a:key(2), mint_b:key(3), owner_a:key(if forward {11} else {12}), vault_a:key(4), owner_b:key(if forward {12} else {11}), vault_b:key(5), tick_arrays:vec![key(20),key(21),key(22)]};
            for explicit in [false, true] {
                let sqrt = if explicit {18_446_744_073_709_551_616u128} else {0};
                let a = whirlpool::swap_v2(&a, whirlpool::WhirlpoolSwapV2Args {amount, other_amount_threshold:minimum,sqrt_price_limit:sqrt,amount_specified_is_input:true,a_to_b:forward}).unwrap();
                cases.push(json!({"venue":"orcaWhirlpool","forward":forward,"explicit":explicit,"amount":amount.to_string(),"minimum":minimum.to_string(),"sqrt":if explicit {sqrt} else {whirlpool::default_sqrt_price_limit(forward)}.to_string(),"instruction":encode(a)}));
            }
        }
    }
    println!("{}", serde_json::to_string(&cases).unwrap());
}
