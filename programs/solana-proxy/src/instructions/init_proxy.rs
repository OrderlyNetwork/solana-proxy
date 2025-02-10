use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use oapp::endpoint::instructions::RegisterOAppParams;

use crate::state::{AccountList, LzReceiveTypesAccounts, ProxyConfig, ACCOUNT_LIST_SEED, LZ_RECEIVE_TYPES_SEED, PROXY_CONFIG_SEED};

#[derive(Accounts)]
#[instruction(params: InitProxyParams)]
pub struct InitProxy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + ProxyConfig::INIT_SPACE,
        seeds = [PROXY_CONFIG_SEED],
        bump
    )]
    pub proxy_config: Account<'info, ProxyConfig>,

    #[account(
        init,
        payer = payer,
        space = 8 + LzReceiveTypesAccounts::INIT_SPACE,
        seeds = [LZ_RECEIVE_TYPES_SEED, &proxy_config.key().as_ref()],
        bump
    )]
    pub lz_receive_types_accounts: Account<'info, LzReceiveTypesAccounts>,

    // #[account(
    //     init,
    //     payer = payer,
    //     space = 8 + AccountList::INIT_SPACE,
    //     seeds = [ACCOUNT_LIST_SEED, &proxy_config.key().as_ref()],
    //     bump
    // )]
    // pub account_list: Account<'info, AccountList>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = token_mint,
        associated_token::authority = proxy_config,
        associated_token::token_program = token_program
    )]
    pub proxy_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl InitProxy<'_> {
    pub fn apply(ctx: &mut Context<InitProxy>, params: &InitProxyParams) -> Result<()> {
        ctx.accounts.proxy_config.bump = ctx.bumps.proxy_config;
        ctx.accounts.proxy_config.endpoint_program = params.endpoint_program;
        ctx.accounts.proxy_config.usdc_token_account = params.usdc_token_account;
        ctx.accounts.proxy_config.admin = params.admin;
        ctx.accounts.proxy_config.orderly_eid = params.orderly_eid;
        ctx.accounts.proxy_config.sol_chain_id = params.sol_chain_id;
        ctx.accounts.proxy_config.paused = false;

        // Initialize the lz_receive_types_accounts
        ctx.accounts.lz_receive_types_accounts.proxy_config = ctx.accounts.proxy_config.key();
        // ctx.accounts.lz_receive_types_accounts.account_list = ctx.accounts.account_list.key();

        // Initialize the account_list
        // ctx.accounts.account_list.bump = ctx.bumps.account_list;
        // ctx.accounts.account_list.usdc_token_account = params.usdc_token_account;

        // Register the oapp
        oapp::endpoint_cpi::register_oapp(
            ctx.accounts.proxy_config.endpoint_program,
            ctx.accounts.proxy_config.key(),
            ctx.remaining_accounts,
            &[PROXY_CONFIG_SEED, &[ctx.bumps.proxy_config]],
            RegisterOAppParams { delegate: params.admin },
        )?;
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct InitProxyParams {
    pub endpoint_program: Pubkey,
    pub usdc_token_account: Pubkey,
    pub admin: Pubkey,
    pub orderly_eid: u32,
    pub sol_chain_id: u32,
}
