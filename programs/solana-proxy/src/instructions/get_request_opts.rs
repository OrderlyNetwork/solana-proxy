use anchor_lang::prelude::*;

use crate::{state::ProxyConfig, PROXY_CONFIG_SEED};

#[derive(Accounts)]
#[instruction(params: GetRequestOptsParams)]
pub struct GetRequestOpts<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, seeds = [PROXY_CONFIG_SEED], bump = proxy_config.bump)]
    pub proxy_config: Box<Account<'info, ProxyConfig>>,
}

impl GetRequestOpts<'_> {
    pub fn apply(ctx: &mut Context<GetRequestOpts>, get_request_opts_params: &GetRequestOptsParams) -> Result<RequestOpts> {
        msg!("GetRequestOpts instruction called");
        msg!("reuqest_type: {}", get_request_opts_params.request_type);
        let proxy_config = &mut ctx.accounts.proxy_config;
        proxy_config.nonce += 1;

        msg!("nonce: {}", proxy_config.nonce);
        Ok(RequestOpts { nonce: proxy_config.nonce })
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct GetRequestOptsParams {
    pub request_type: u8,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RequestOpts {
    pub nonce: u64,
}
