use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProxyAuthority {
    /// Bump seed for the proxy authority PDA
    pub bump: u8,
    pub owner: Pubkey,
    pub nonce: u64,
    pub dst_eid: u32,
    pub sol_chain_id: u128,
    pub oft_program: Pubkey
}
