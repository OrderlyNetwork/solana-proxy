use crate::errors::ProxyError;
use crate::state::{BackwardFee, ProxyConfig, BACKWARD_FEE_SEED, PROXY_CONFIG_SEED};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: SetBackwardFeeParams)]
pub struct SetBackwardFee<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
        has_one = admin @ProxyError::InvalidProxyAdmin
    )]
    pub proxy_config: Account<'info, ProxyConfig>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + BackwardFee::INIT_SPACE,
        seeds = [BACKWARD_FEE_SEED],
        bump
    )]
    pub backward_fee: Account<'info, BackwardFee>,
    pub system_program: Program<'info, System>,
}

impl SetBackwardFee<'_> {
    pub fn apply(ctx: &mut Context<SetBackwardFee>, params: &SetBackwardFeeParams) -> Result<()> {
        ctx.accounts.backward_fee.bump = ctx.bumps.backward_fee;
        ctx.accounts.backward_fee.order_backward_fee = params.order_backward_fee;
        ctx.accounts.backward_fee.usdc_backward_fee = params.usdc_backward_fee;
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetBackwardFeeParams {
    pub order_backward_fee: u64,
    pub usdc_backward_fee: u64,
}
