use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount},
};

use crate::{state::ProxyConfig, MessagingReceipt, PROXY_CONFIG_SEED};
use oft::{cpi::accounts::Send, instructions::OFTReceipt, ConstructCPIContext};

#[derive(Accounts)]
#[instruction(params: ClaimRewardParams)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, seeds = [PROXY_CONFIG_SEED], bump = proxy_config.bump)]
    pub proxy_config: Box<Account<'info, ProxyConfig>>,

    #[account(
        associated_token::mint = proxy_config.mint,
        associated_token::authority = proxy_config,
        associated_token::token_program = token_program
    )]
    pub proxy_escrow: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl ClaimReward<'_> {
    pub fn apply(
        ctx: &mut Context<ClaimReward>,
        claim_reward_params: &ClaimRewardParams,
        oapp_params: &OAppSendParams,
    ) -> Result<(MessagingReceipt, OFTReceipt)> {
        // pub fn apply(ctx: &mut Context<ClaimReward>, claim_reward_params: &ClaimRewardParams, oapp_params: &OAppSendParams) -> Result<()> {
        msg!("ClaimReward instruction called");
        msg!("distribution_id: {}", claim_reward_params.distribution_id);
        msg!("cumulative_amount: {:?}", claim_reward_params.cumulative_amount);
        msg!("merkle_proof: {:?}", claim_reward_params.merkle_proof);
        msg!("native_fee: {}", oapp_params.native_fee);
        msg!("lz_token_fee: {}", oapp_params.lz_token_fee);

        let params_encoded = claim_reward_params.encode();
        msg!("Encoded params: {:?}", params_encoded);

        let send_params = oft::instructions::SendParams {
            dst_eid: ctx.accounts.proxy_config.dst_eid,
            to: ctx.accounts.proxy_config.occ_manager_address,
            amount_ld: 0,
            min_amount_ld: 0,
            options: vec![],
            compose_msg: None,
            native_fee: oapp_params.native_fee,
            lz_token_fee: oapp_params.lz_token_fee,
        };

        // ctx.remaining_accounts.borrow_mut()[0].is_signer = true;

        let cpi_context = Send::construct_context(ctx.accounts.proxy_config.oft_program, ctx.remaining_accounts)?;

        let proxy_escrow_key = ctx.accounts.proxy_escrow.key();
        let seeds = &[PROXY_CONFIG_SEED, proxy_escrow_key.as_ref(), &[ctx.accounts.proxy_config.bump]];

        let rtn = oft::cpi::send(cpi_context.with_signer(&[seeds]), send_params)?;

        Ok(rtn.get())
        // Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ClaimRewardParams {
    pub distribution_id: u32,
    pub cumulative_amount: [u8; 32],
    pub merkle_proof: Vec<[u8; 32]>,
}

impl ClaimRewardParams {
    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(36 + &self.merkle_proof.len() * 32); // 4 + 32 + 32 * n
        buf.extend_from_slice(&self.distribution_id.to_be_bytes());
        buf.extend_from_slice(&self.cumulative_amount);
        buf.extend_from_slice(&(self.merkle_proof.len() as u32).to_le_bytes());
        for proof in &self.merkle_proof {
            buf.extend_from_slice(proof);
        }
        buf
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OAppSendParams {
    pub native_fee: u64,
    pub lz_token_fee: u64,
}
