use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;

use crate::{state::ProxyAuthority, PROXY_AUTHORITY_SEED};

#[derive(Accounts)]
#[instruction(params: ClaimRewardParams)]
pub struct ClaimReward<'info> {
	#[account(mut)]
    pub user: Signer<'info>,

	#[account(mut, seeds = [PROXY_AUTHORITY_SEED], bump = proxy_authority.bump)]
	pub proxy_authority: Account<'info, ProxyAuthority>,
	pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl ClaimReward<'_> {
	pub fn apply(_ctx: &mut Context<ClaimReward>, params: &ClaimRewardParams) -> Result<()> {
		msg!("ClaimReward instruction called");
		msg!("distribution_id: {}", params.distribution_id);
		msg!("cumulative_amount: {:?}", params.cumulative_amount);
		msg!("merkle_proof: {:?}", params.merkle_proof);

		let params_encoded = params.encode();
		msg!("Encoded params: {:?}", params_encoded);

		Ok(())
	}
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ClaimRewardParams {
    pub distribution_id: u32,
	pub cumulative_amount: [u8; 32],
	pub merkle_proof: Vec<[u8; 32]>
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