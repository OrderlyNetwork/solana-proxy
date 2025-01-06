use anchor_lang::prelude::*;

use crate::{state::ProxyConfig, PROXY_CONFIG_SEED};
use oft::{cpi::accounts::QuoteSend, ConstructCPIContext};

use super::ClaimRewardParams;

#[derive(Accounts)]
#[instruction(params: ClaimRewardParams)]
pub struct QuoteClaimReward<'info> {
    #[account(seeds = [PROXY_CONFIG_SEED], bump = proxy_authority.bump)]
    pub proxy_authority: Account<'info, ProxyConfig>,
}

impl QuoteClaimReward<'_> {
    pub fn apply(ctx: &Context<QuoteClaimReward>, claim_reward_params: &ClaimRewardParams) -> Result<MessagingFee> {
        msg!("ClaimReward instruction called");
        msg!("distribution_id: {}", claim_reward_params.distribution_id);
        msg!("cumulative_amount: {:?}", claim_reward_params.cumulative_amount);
        msg!("merkle_proof: {:?}", claim_reward_params.merkle_proof);
        msg!("remaining_accounts len: {}", ctx.remaining_accounts.len());

        let params_encoded = claim_reward_params.encode();
        msg!("Encoded params: {:?}", params_encoded);

        let _send_params = oft::instructions::QuoteSendParams {
            dst_eid: ctx.accounts.proxy_authority.dst_eid,
            to: ctx.accounts.proxy_authority.occ_manager_address,
            amount_ld: 0,
            min_amount_ld: 0,
            options: vec![],
            compose_msg: None,
            pay_in_lz_token: false,
        };

        let _cpi_context = QuoteSend::construct_context(ctx.accounts.proxy_authority.oft_program, ctx.remaining_accounts)?;

        // let rtn = oft::cpi::quote_send(cpi_context, send_params)?;

        // Ok(rtn.get())

        Ok(MessagingFee { native_fee: 0, lz_token_fee: 0 })
    }
}

// Redefined MessagingFee here as a workaround to be able to use view() in tests
// https://github.com/coral-xyz/anchor/issues/3220
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct MessagingFee {
    pub native_fee: u64,
    pub lz_token_fee: u64,
}
