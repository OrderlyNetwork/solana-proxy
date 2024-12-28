use anchor_lang::prelude::*;

use crate::instructions::PROXY_CONFIG_SEED;
use crate::state::ProxyConfig;
use crate::ProxyError;

#[derive(Accounts)]
#[instruction(params: TransferOwnershipParams)]
pub struct TransferOwnership<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
        has_one = owner @ProxyError::InvalidProxyOwner
    )]
    pub proxy_config: Account<'info, ProxyConfig>,

    pub system_program: Program<'info, System>,
}

impl TransferOwnership<'_> {
    pub fn apply(ctx: Context<TransferOwnership>, params: &TransferOwnershipParams) -> Result<()> {
        ctx.accounts.proxy_config.owner = params.new_owner;
        msg!("Proxy Ownership transferred to {}", params.new_owner);
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct TransferOwnershipParams {
    pub new_owner: Pubkey,
}
