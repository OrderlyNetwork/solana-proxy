use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program, system_instruction};

use crate::events::RequestSent;
use crate::instructions::msg_codec::{PayloadType, SolanaVaultOCCMessage};
use crate::instructions::quote_request::MessagingFee;
use crate::state::{BackwardFee, PeerConfig, ProxyConfig, BACKWARD_FEE_SEED, PEER_SEED, PROXY_CONFIG_SEED};
use crate::ProxyError;
use oapp::endpoint::{instructions::SendParams, MessagingReceipt};

#[derive(Accounts)]
#[instruction(params: RequestParams, msg_fee: MessagingFee)]
pub struct SendRequest<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump
    )]
    pub proxy_config: Account<'info, ProxyConfig>,

    #[account(
        seeds = [
            PEER_SEED,
            &proxy_config.key().to_bytes(),
            &proxy_config.orderly_eid.to_be_bytes()
        ],
        bump = peer_config.bump
    )]
    pub peer_config: Account<'info, PeerConfig>,

    #[account(
        seeds = [BACKWARD_FEE_SEED],
        bump = backward_fee.bump,
    )]
    pub backward_fee: Account<'info, BackwardFee>,
}

impl SendRequest<'_> {
    pub fn apply(ctx: Context<SendRequest>, params: &RequestParams, msg_fee: &MessagingFee) -> Result<MessagingReceipt> {
        require!(!ctx.accounts.proxy_config.paused, ProxyError::ProxyPaused);

        let payload_type = PayloadType::from_u8(params.payload_type);
        let backward_fee: u64;
        if payload_type == PayloadType::WithdrawOrder
            || payload_type == PayloadType::ClaimVestingRequest
            || payload_type == PayloadType::UnstakeOrderNow
        {
            backward_fee = ctx.accounts.backward_fee.order_backward_fee;
        } else if payload_type == PayloadType::ClaimUsdcRevenue {
            backward_fee = ctx.accounts.backward_fee.usdc_backward_fee;
        } else {
            backward_fee = 0;
        }

        require!(backward_fee < msg_fee.native_fee, ProxyError::InsufficientMessagingFee);

        require!(payload_type.check_request_payload_type(), ProxyError::InvalidPayloadType);

        let options = ctx.accounts.peer_config.enforced_options.get_enforced_options(&None);

        let vault_occ_message = SolanaVaultOCCMessage {
            token: payload_type.get_token_type() as u8,
            sender: ctx.accounts.user.key(),
            payload_type: payload_type as u8,
            payload: params.payload.clone(),
        };

        let send_params = SendParams {
            dst_eid: ctx.accounts.proxy_config.orderly_eid,
            receiver: ctx.accounts.peer_config.peer_address,
            message: vault_occ_message.encode(),
            options,
            native_fee: msg_fee.native_fee - backward_fee,
            lz_token_fee: 0,
        };

        let receipt = oapp::endpoint_cpi::send(
            ctx.accounts.proxy_config.endpoint_program,
            ctx.accounts.proxy_config.key(),
            ctx.remaining_accounts,
            &[PROXY_CONFIG_SEED, &[ctx.accounts.proxy_config.bump]],
            send_params,
        )?;

        if backward_fee > 0 {
            program::invoke(
                &system_instruction::transfer(ctx.accounts.user.key, &ctx.accounts.proxy_config.key(), backward_fee),
                &[ctx.accounts.user.to_account_info(), ctx.accounts.proxy_config.to_account_info()],
            )?;
        }

        emit!(RequestSent { guid: receipt.guid, request: params.clone() });

        Ok(receipt)
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RequestParams {
    pub payload_type: u8,
    pub payload: Vec<u8>,
}
