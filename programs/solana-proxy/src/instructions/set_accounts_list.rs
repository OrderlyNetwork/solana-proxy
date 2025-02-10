use crate::errors::ProxyError;
use crate::state::{AccountList, LzReceiveTypesAccounts, ProxyConfig, ACCOUNT_LIST_SEED, LZ_RECEIVE_TYPES_SEED, PROXY_CONFIG_SEED};
use anchor_lang::prelude::*;

// Setialize the oapp_config and vault_owner pda
#[derive(Accounts)]
#[instruction(params: SetAccountListParams)]
pub struct SetAccountList<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
        has_one = admin @ProxyError::InvalidProxyAdmin
    )]
    pub proxy_config: Account<'info, ProxyConfig>,
    #[account(
        mut,
        seeds = [LZ_RECEIVE_TYPES_SEED, &proxy_config.key().as_ref()],
        bump
    )]
    pub lz_receive_types: Account<'info, LzReceiveTypesAccounts>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + AccountList::INIT_SPACE,
        seeds = [ACCOUNT_LIST_SEED, &proxy_config.key().as_ref()],
        bump
    )]
    pub accounts_list: Account<'info, AccountList>,

    pub system_program: Program<'info, System>,
}

impl SetAccountList<'_> {
    pub fn apply(ctx: &mut Context<SetAccountList>, params: &SetAccountListParams) -> Result<()> {
        // ctx.accounts.lz_receive_types.account_list = ctx.accounts.accounts_list.key();
        ctx.accounts.accounts_list.bump = ctx.bumps.accounts_list;
        ctx.accounts.accounts_list.usdc_token_account = params.usdc_token_account;
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetAccountListParams {
    pub usdc_token_account: Pubkey,
}
