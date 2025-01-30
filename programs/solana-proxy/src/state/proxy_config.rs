use anchor_lang::prelude::*;
use oapp::endpoint::{instructions::RegisterOAppParams, ID as ENDPOINT_ID};

#[account]
#[derive(InitSpace)]
pub struct ProxyConfig {
    pub bump: u8,
    pub endpoint_program: Pubkey,
    pub usdc_token_account: Pubkey,
    pub admin: Pubkey,
    pub orderly_eid: u32,
    pub sol_chain_id: u128,
    pub paused: bool,
}

#[account]
#[derive(InitSpace)]
pub struct LzReceiveTypesAccounts {
    pub proxy_config: Pubkey,
    // pub account_list: Pubkey, // point to the AccountList pda, should be updated if a new AccountList applied
}

// #[account]
// #[derive(InitSpace)]
// pub struct AccountList {
//     pub bump: u8,
//     pub usdc_pda: Pubkey,
//     // can add more pda accounts here in the future with different seeds
// }
