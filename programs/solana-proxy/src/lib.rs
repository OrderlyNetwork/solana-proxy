use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
use instructions::*;

declare_id!("2mk17sMDoTrxWKYm2hCVpD4pQcbSG2mnQdQzfdHVTKey");

#[program]
pub mod solana_proxy {
    use super::*;

    pub fn init_proxy(ctx: Context<SetProxy>, params: SetProxyParams) -> Result<()> {
        SetProxy::apply(ctx, &params)
    }
    pub fn claim_reward(mut ctx: Context<ClaimReward>, params: ClaimRewardParams) -> Result<()> {
        ClaimReward::apply(&mut ctx, &params)
    }
}

#[derive(Accounts)]
pub struct Initialize {}
