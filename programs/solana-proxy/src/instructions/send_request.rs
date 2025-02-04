use anchor_lang::prelude::*;

use crate::events::RequestSent;
use crate::instructions::msg_codec::{SolanaVaultOCCMessage, TokenType};
use crate::instructions::quote_request::MessagingFee;
use crate::state::{PeerConfig, ProxyConfig, PEER_SEED, PROXY_CONFIG_SEED};
use crate::ProxyError;
use oapp::endpoint::{instructions::SendParams, MessagingReceipt};

#[derive(Accounts)]
#[instruction(params: RequestParams)]
pub struct SendRequest<'info> {
    #[account(
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
}

impl SendRequest<'_> {
    pub fn apply(ctx: Context<SendRequest>, params: &RequestParams, msg_fee: &MessagingFee) -> Result<MessagingReceipt> {
        require!(!ctx.accounts.proxy_config.paused, ProxyError::Paused);

        let options = ctx.accounts.peer_config.enforced_options.get_enforced_options(&None);

        let vault_occ_message = SolanaVaultOCCMessage {
            token: TokenType::PLACEHOLDER as u8,
            sender: params.user_account,
            payload_type: params.payload_type,
            payload: params.payload.clone(),
        };

        let send_params = SendParams {
            dst_eid: ctx.accounts.proxy_config.orderly_eid,
            receiver: ctx.accounts.peer_config.peer_address,
            message: vault_occ_message.encode(),
            options,
            native_fee: msg_fee.native_fee,
            lz_token_fee: msg_fee.lz_token_fee,
        };

        let receipt = oapp::endpoint_cpi::send(
            ctx.accounts.proxy_config.endpoint_program,
            ctx.accounts.proxy_config.key(),
            ctx.remaining_accounts,
            &[PROXY_CONFIG_SEED, &[ctx.accounts.proxy_config.bump]],
            send_params,
        )?;

        emit!(RequestSent { guid: receipt.guid, request: params.clone() });

        Ok(receipt)
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RequestParams {
    pub user_account: Pubkey,
    pub payload_type: u8,
    pub payload: Vec<u8>,
}
