use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
use instructions::*;

use oft::instructions::OFTReceipt;
use oapp::endpoint::MessagingReceipt;

declare_id!("2mk17sMDoTrxWKYm2hCVpD4pQcbSG2mnQdQzfdHVTKey");

#[program]
pub mod solana_proxy {
    use super::*;

    pub fn init_proxy(ctx: Context<SetProxy>, params: SetProxyParams) -> Result<()> {
        SetProxy::apply(ctx, &params)
    }
    pub fn claim_reward(mut ctx: Context<ClaimReward>, params: ClaimRewardParams, oapp_params: OAppSendParams) -> Result<(MessagingReceipt, OFTReceipt)> {
        ClaimReward::apply(&mut ctx, &params, &oapp_params)
    }
}

#[derive(Accounts)]
pub struct Initialize {}
