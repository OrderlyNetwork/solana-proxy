use anchor_lang::prelude::*;
#[account]
#[derive(InitSpace)]
pub struct ClaimData {
    pub bump: u8,
    pub distribution_id: [u8; 32],
    pub amount: [u8; 32],
    pub root: [u8; 32],
    pub user: Pubkey,
}

impl ClaimData {
    pub fn encode_claim_payload(&self) -> Vec<u8> {
        let mut encoded = Vec::with_capacity(32 * 3);
        encoded.extend_from_slice(&self.distribution_id);
        encoded.extend_from_slice(&self.amount);
        encoded.extend_from_slice(&self.root);
        encoded
    }
}
