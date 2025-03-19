use crate::instructions::RequestParams;
use anchor_lang::prelude::*;

#[event]
pub struct RequestSent {
    pub guid: [u8; 32],
    pub request: RequestParams,
}

#[event]
pub struct ClaimProofSubmitted {
    pub user: Pubkey,
    pub distribution_id: u32,
    pub cumulative_amount: [u8; 32],
    pub merkle_root: [u8; 32],
}

#[event]
pub struct ClaimRequestSent {
    pub guid: [u8; 32],
    pub user: Pubkey,
    pub distribution_id: [u8; 32],
    pub cumulative_amount: [u8; 32],
    pub merkle_root: [u8; 32],
}

#[event]
pub struct ClaimCancelled {
    pub user: Pubkey,
    pub distribution_id: [u8; 32],
    pub cumulative_amount: [u8; 32],
    pub merkle_root: [u8; 32],
}

#[event]
pub struct AdminRoleTransferred {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct ProxyPaused {
    pub paused: bool,
}
