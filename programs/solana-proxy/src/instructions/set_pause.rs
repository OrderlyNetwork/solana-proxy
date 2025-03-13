use crate::errors::ProxyError;
use crate::events::ProxyPaused;
use crate::state::{ProxyConfig, PROXY_CONFIG_SEED};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: SetPauseParams)]
pub struct SetPause<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
        has_one = admin @ProxyError::InvalidProxyAdmin
    )]
    pub proxy_config: Account<'info, ProxyConfig>,
}

impl SetPause<'_> {
    pub fn apply(ctx: &mut Context<SetPause>, params: &SetPauseParams) -> Result<()> {
        ctx.accounts.proxy_config.paused = params.paused;
        emit!(ProxyPaused { paused: params.paused });
        msg!("Proxy paused: {}", params.paused);
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetPauseParams {
    pub paused: bool,
}
