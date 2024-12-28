use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProxyConfig {
    pub bump: u8,
    pub owner: Pubkey,
    pub nonce: u64,
    pub dst_eid: u32,
    pub sol_chain_id: u128,
    pub mint: Pubkey,
    pub oft_program: Pubkey,
    pub occ_manager_address: [u8; 32]
}
