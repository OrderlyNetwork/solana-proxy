use crate::errors::ProxyError;
use crate::events::ClaimCancelled;
use crate::state::{ClaimData, CLAIM_DATA_SEED};
use anchor_lang::prelude::*;

/// The `CancelClaim` context allows users to cancel a claim request and close the ClaimData account,
/// refunding the rent to the user. This instruction can be executed even when the protocol is paused.
#[derive(Accounts)]
pub struct CancelClaim<'info> {
    /// The user who owns the ClaimData account and will receive the rent refund
    #[account(mut)]
    pub user: Signer<'info>,

    /// The ClaimData account to be closed. It's closed to the user, refunding the rent.
    /// The constraint ensures that only the owner of the account can close it.
    #[account(
        mut,
        close = user,
        seeds = [CLAIM_DATA_SEED, user.key().as_ref()],
        bump = claim_data.bump,
        constraint = claim_data.user == user.key() @ ProxyError::InvalidUser,
    )]
    pub claim_data: Account<'info, ClaimData>,

    pub system_program: Program<'info, System>,
}

impl CancelClaim<'_> {
    /// Apply the CancelClaim instruction
    /// This function does not check if the protocol is paused, allowing users to cancel
    /// their claim requests and retrieve their rent at any time.
    pub fn apply(ctx: &mut Context<CancelClaim>) -> Result<()> {
        // Emit an event to log the cancellation
        emit!(ClaimCancelled {
            user: ctx.accounts.user.key(),
            distribution_id: ctx.accounts.claim_data.distribution_id,
            cumulative_amount: ctx.accounts.claim_data.amount,
            merkle_root: ctx.accounts.claim_data.root,
        });
        
        msg!("Claim cancelled and ClaimData account closed");
        
        Ok(())
    }
}