use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
use instructions::*;

use oapp::endpoint::MessagingReceipt;
use oft::instructions::OFTReceipt;

declare_id!("8KmTH6XgYBjehQwvcG1qjheBBE9oX7djuWvVbArvomFv");

#[program]
pub mod solana_proxy {
    use super::*;

    pub fn init_proxy(ctx: Context<InitProxy>, params: InitProxyParams) -> Result<()> {
        InitProxy::apply(ctx, &params)
    }

    pub fn transfer_ownership(ctx: Context<TransferOwnership>, params: TransferOwnershipParams) -> Result<()> {
        TransferOwnership::apply(ctx, &params)
    }

    pub fn claim_reward(
        mut ctx: Context<ClaimReward>,
        params: ClaimRewardParams,
        oapp_params: OAppSendParams,
    ) -> Result<(MessagingReceipt, OFTReceipt)> {
        ClaimReward::apply(&mut ctx, &params, &oapp_params)
    }

    // pub fn claim_reward(
    //     mut ctx: Context<ClaimReward>,
    //     params: ClaimRewardParams,
    //     oapp_params: OAppSendParams,
    // ) -> Result<()> {
    //     ClaimReward::apply(&mut ctx, &params, &oapp_params)
    // }

    pub fn quote_claim_reward(ctx: Context<QuoteClaimReward>, params: ClaimRewardParams) -> Result<MessagingFee> {
        QuoteClaimReward::apply(&ctx, &params)
    }
}

#[derive(Accounts)]
pub struct Initialize {}
