use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::instructions::PROXY_CONFIG_SEED;
use crate::state::ProxyConfig;

#[derive(Accounts)]
#[instruction(params: InitProxyParams)]
pub struct InitProxy<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + ProxyConfig::INIT_SPACE,
        seeds = [PROXY_CONFIG_SEED],
        bump
    )]
    pub proxy_config: Box<Account<'info, ProxyConfig>>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = token_mint,
        associated_token::authority = proxy_config,
        associated_token::token_program = token_program
    )]
    pub proxy_escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl InitProxy<'_> {
    pub fn apply(ctx: Context<InitProxy>, params: &InitProxyParams) -> Result<()> {
        ctx.accounts.proxy_config.bump = ctx.bumps.proxy_config;
        ctx.accounts.proxy_config.owner = params.owner;
        ctx.accounts.proxy_config.nonce = params.nonce;
        ctx.accounts.proxy_config.dst_eid = params.dst_eid;
        ctx.accounts.proxy_config.sol_chain_id = params.sol_chain_id;
        ctx.accounts.proxy_config.mint = ctx.accounts.token_mint.key();
        ctx.accounts.proxy_config.oft_program = params.oft_program;
        ctx.accounts.proxy_config.occ_manager_address = params.occ_manager_address;
        msg!("Proxy Config initialized");
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct InitProxyParams {
    pub owner: Pubkey,
    pub nonce: u64,
    pub dst_eid: u32,
    pub sol_chain_id: u128,
    pub oft_program: Pubkey,
    pub occ_manager_address: [u8; 32],
}
