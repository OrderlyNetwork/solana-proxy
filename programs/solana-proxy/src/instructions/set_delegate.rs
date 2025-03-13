use crate::errors::ProxyError;
use crate::state::{ProxyConfig, PROXY_CONFIG_SEED};
use anchor_lang::prelude::*;
use endpoint::instructions::SetDelegateParams as EndpointSetDelegateParams;
use oapp::endpoint;

#[derive(Accounts)]
#[instruction(params: SetDelegateParams)]
pub struct SetDelegate<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
        has_one = admin @ProxyError::InvalidProxyAdmin
    )]
    pub proxy_config: Account<'info, ProxyConfig>,
}

impl SetDelegate<'_> {
    pub fn apply(ctx: &mut Context<SetDelegate>, params: &SetDelegateParams) -> Result<()> {
        let seeds: &[&[u8]] = &[PROXY_CONFIG_SEED, &[ctx.accounts.proxy_config.bump]];
        let _ = oapp::endpoint_cpi::set_delegate(
            ctx.accounts.proxy_config.endpoint_program,
            ctx.accounts.proxy_config.key(),
            &ctx.remaining_accounts,
            seeds,
            EndpointSetDelegateParams { delegate: params.delegate },
        )?;
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetDelegateParams {
    pub delegate: Pubkey,
}
