use crate::events::AdminRoleTransferred;
use anchor_lang::prelude::*;

use crate::state::{ProxyConfig, PROXY_CONFIG_SEED};
use crate::ProxyError;

#[derive(Accounts)]
#[instruction(params: TransferAdminParams)]
pub struct TransferAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
        has_one = admin @ProxyError::InvalidProxyAdmin
    )]
    pub proxy_config: Account<'info, ProxyConfig>,

    pub system_program: Program<'info, System>,
}

impl TransferAdmin<'_> {
    pub fn apply(ctx: Context<TransferAdmin>, params: &TransferAdminParams) -> Result<()> {
        ctx.accounts.proxy_config.admin = params.new_admin;
        // msg!("Proxy Admin Role transferred to {}", params.new_admin);
        emit!(AdminRoleTransferred { old_admin: ctx.accounts.proxy_config.admin, new_admin: params.new_admin });
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct TransferAdminParams {
    pub new_admin: Pubkey,
}
