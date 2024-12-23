use anchor_lang::prelude::*;

use crate::instructions::PROXY_AUTHORITY_SEED;
use crate::state::ProxyAuthority;

#[derive(Accounts)]
#[instruction(params: SetProxyParams)]
pub struct SetProxy<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + ProxyAuthority::INIT_SPACE,
        seeds = [PROXY_AUTHORITY_SEED],
        bump
    )]
    pub proxy_authority: Account<'info, ProxyAuthority>,
    pub system_program: Program<'info, System>,
}

impl SetProxy<'_> {
    pub fn apply(ctx: Context<SetProxy>, params: &SetProxyParams) -> Result<()> {
        ctx.accounts.proxy_authority.bump = ctx.bumps.proxy_authority;
        ctx.accounts.proxy_authority.owner = params.owner;
        ctx.accounts.proxy_authority.nonce = params.nonce;
        ctx.accounts.proxy_authority.dst_eid = params.dst_eid;
        ctx.accounts.proxy_authority.sol_chain_id = params.sol_chain_id;
        msg!("Set Proxy Authority");
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetProxyParams {
    pub owner: Pubkey,
    pub nonce: u64,
    pub dst_eid: u32,
    pub sol_chain_id: u128,
}
