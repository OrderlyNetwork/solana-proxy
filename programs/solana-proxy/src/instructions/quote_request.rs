use crate::instructions::msg_codec::{PayloadType, SolanaVaultOCCMessage, TokenType};
use crate::instructions::RequestParams;
use crate::state::{PeerConfig, ProxyConfig, PEER_SEED, PROXY_CONFIG_SEED};
use crate::ProxyError;
use anchor_lang::prelude::*;
use oapp::endpoint::instructions::QuoteParams;

#[derive(Accounts)]
#[instruction(params: RequestParams)]
pub struct QuoteRequest<'info> {
    #[account()]
    pub user: Signer<'info>,
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

impl QuoteRequest<'_> {
    pub fn apply(ctx: Context<QuoteRequest>, params: &RequestParams) -> Result<MessagingFee> {
        require!(!ctx.accounts.proxy_config.paused, ProxyError::Paused);
        let payload_type = PayloadType::from_u8(params.payload_type);
        require!(payload_type.check_vault_payload_type(), ProxyError::InvalidPayloadType);
        let options = ctx.accounts.peer_config.enforced_options.get_enforced_options(&None);

        let vault_occ_message = SolanaVaultOCCMessage {
            token: TokenType::PLACEHOLDER as u8,
            sender: ctx.accounts.user.key(),
            payload_type: params.payload_type,
            payload: params.payload.clone(),
        };
        let endpoint_quote_params = QuoteParams {
            sender: ctx.accounts.proxy_config.key(),
            dst_eid: ctx.accounts.proxy_config.orderly_eid,
            receiver: ctx.accounts.peer_config.peer_address,
            message: vault_occ_message.encode(),
            pay_in_lz_token: false,
            options,
        };
        // calling endpoint cpi
        let messaging_fee = oapp::endpoint_cpi::quote(ctx.accounts.proxy_config.endpoint_program, ctx.remaining_accounts, endpoint_quote_params)?;

        return Ok(MessagingFee { native_fee: messaging_fee.native_fee, lz_token_fee: messaging_fee.lz_token_fee });
    }
}

// Redefined MessagingFee here as a workaround to be able to use view() in tests
// https://github.com/coral-xyz/anchor/issues/3220
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct MessagingFee {
    pub native_fee: u64,
    pub lz_token_fee: u64,
}
