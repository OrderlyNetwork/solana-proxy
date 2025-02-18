use crate::errors::ProxyError;
use crate::state::{ProxyConfig, PROXY_CONFIG_SEED};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct WithdrawFee<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
        has_one = admin @ProxyError::InvalidProxyAdmin
    )]
    pub proxy_config: Account<'info, ProxyConfig>,

    #[account(mut)]
    pub fee_collector: AccountInfo<'info>,
}

impl WithdrawFee<'_> {
    pub fn apply(ctx: &mut Context<WithdrawFee>, params: &WithdrawFeeParams) -> Result<()> {
        // Get the required lamports to keep the proxy config account alive
        let required_lamports = Rent::get()?.minimum_balance(8 + ProxyConfig::INIT_SPACE);
        let surplus_lamports = ctx.accounts.proxy_config.get_lamports() - required_lamports;

        if surplus_lamports >= params.amount {
            ctx.accounts.proxy_config.sub_lamports(params.amount)?;
            ctx.accounts.fee_collector.add_lamports(params.amount)?;

            Ok(())
        } else {
            Err(ProxyError::InsufficientBalance.into())
        }
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawFeeParams {
    pub amount: u64,
}
