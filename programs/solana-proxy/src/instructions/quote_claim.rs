use crate::errors::ProxyError;
use crate::instructions::msg_codec::{PayloadType, SolanaVaultOCCMessage};
use crate::instructions::quote_request::MessagingFee;
use crate::state::{BackwardFee, ClaimData, PeerConfig, ProxyConfig, BACKWARD_FEE_SEED, CLAIM_DATA_SEED, PEER_SEED, PROXY_CONFIG_SEED};
use anchor_lang::prelude::*;
use oapp::endpoint::instructions::QuoteParams;

#[derive(Accounts)]
pub struct QuoteClaim<'info> {
    #[account()]
    pub user: Signer<'info>,

    #[account(
        seeds = [CLAIM_DATA_SEED, user.key().as_ref()],
        bump = claim_data.bump,
    )]
    pub claim_data: Account<'info, ClaimData>,

    #[account(
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
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
        bump = backward_fee.bump
    )]
    pub backward_fee: Account<'info, BackwardFee>,
}

impl QuoteClaim<'_> {
    pub fn apply(ctx: Context<QuoteClaim>) -> Result<MessagingFee> {
        require!(!ctx.accounts.proxy_config.paused, ProxyError::ProxyPaused);

        let payload_type = PayloadType::ClaimRewardSolana;

        let options = ctx.accounts.peer_config.enforced_options.get_enforced_options(&None);

        let vault_occ_message = SolanaVaultOCCMessage {
            token: payload_type.get_token_type() as u8,
            sender: ctx.accounts.user.key(),
            payload_type: payload_type as u8,
            payload: ctx.accounts.claim_data.encode_claim_payload(),
        };
        let endpoint_quote_params = QuoteParams {
            sender: ctx.accounts.proxy_config.key(),
            dst_eid: ctx.accounts.proxy_config.orderly_eid,
            receiver: ctx.accounts.peer_config.peer_address,
            message: vault_occ_message.encode(),
            pay_in_lz_token: false,
            options,
        };

        let messaging_fee = oapp::endpoint_cpi::quote(ctx.accounts.proxy_config.endpoint_program, ctx.remaining_accounts, endpoint_quote_params)?;
        let backward_fee = ctx.accounts.backward_fee.order_backward_fee;
        Ok(MessagingFee {
            // Add the backward fee for claim reward
            native_fee: messaging_fee.native_fee + backward_fee,
            lz_token_fee: messaging_fee.lz_token_fee,
        })
    }
}
