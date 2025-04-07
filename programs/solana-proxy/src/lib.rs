use crate::instructions::{LzReceiveParams, LzReceiveTypes};
use anchor_lang::prelude::*;
use oapp::endpoint::MessagingReceipt;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use errors::*;
use instructions::*;

// use oapp::endpoint::MessagingReceipt;
// use oft::instructions::OFTReceipt;

declare_id!("A7QtBhcE9pbi2LvLqt1SWV1EKjXAgFxAcEcViKg7reha");

#[program]
pub mod solana_proxy {
    use super::*;

    // ================================ Functions for User ================================
    pub fn send_request(ctx: Context<SendRequest>, params: RequestParams, msg_fee: MessagingFee) -> Result<MessagingReceipt> {
        SendRequest::apply(ctx, &params, &msg_fee)
    }

    pub fn quote_request(ctx: Context<QuoteRequest>, params: RequestParams) -> Result<MessagingFee> {
        QuoteRequest::apply(ctx, &params)
    }

    pub fn submit_proof(mut ctx: Context<SubmitProof>, params: SubmitProofParams) -> Result<()> {
        SubmitProof::apply(&mut ctx, &params)
    }

    pub fn send_claim(mut ctx: Context<SendClaim>, msg_fee: MessagingFee) -> Result<MessagingReceipt> {
        SendClaim::apply(&mut ctx, &msg_fee)
    }

    pub fn cancel_claim(mut ctx: Context<CancelClaim>) -> Result<()> {
        CancelClaim::apply(&mut ctx)
    }

    pub fn quote_claim(ctx: Context<QuoteClaim>) -> Result<MessagingFee> {
        QuoteClaim::apply(ctx)
    }

    pub fn lz_receive(mut ctx: Context<LzReceive>, params: LzReceiveParams) -> Result<()> {
        LzReceive::apply(&mut ctx, &params)
    }

    pub fn lz_receive_types(ctx: Context<LzReceiveTypes>, params: LzReceiveParams) -> Result<Vec<oapp::endpoint_cpi::LzAccount>> {
        LzReceiveTypes::apply(&ctx, &params)
    }

    // ================================ Functions for Admin ================================
    pub fn init_proxy(mut ctx: Context<InitProxy>, params: InitProxyParams) -> Result<()> {
        InitProxy::apply(&mut ctx, &params)
    }

    pub fn set_backward_fee(mut ctx: Context<SetBackwardFee>, params: SetBackwardFeeParams) -> Result<()> {
        SetBackwardFee::apply(&mut ctx, &params)
    }

    pub fn withdraw_fee(mut ctx: Context<WithdrawFee>, params: WithdrawFeeParams) -> Result<()> {
        WithdrawFee::apply(&mut ctx, &params)
    }

    pub fn set_pause(mut ctx: Context<SetPause>, params: SetPauseParams) -> Result<()> {
        SetPause::apply(&mut ctx, &params)
    }

    pub fn set_account_list(mut ctx: Context<SetAccountList>, params: SetAccountListParams) -> Result<()> {
        SetAccountList::apply(&mut ctx, &params)
    }

    pub fn set_peer_config(mut ctx: Context<SetPeerConfig>, params: SetPeerConfigParams) -> Result<()> {
        SetPeerConfig::apply(&mut ctx, &params)
    }

    pub fn set_delegate(mut ctx: Context<SetDelegate>, params: SetDelegateParams) -> Result<()> {
        SetDelegate::apply(&mut ctx, &params)
    }

    pub fn transfer_admin(ctx: Context<TransferAdmin>, params: TransferAdminParams) -> Result<()> {
        TransferAdmin::apply(ctx, &params)
    }
}
