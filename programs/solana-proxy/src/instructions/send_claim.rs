use crate::errors::ProxyError;
use crate::events::{ClaimProofSubmitted, ClaimRequestSent};
use crate::instructions::msg_codec::{PayloadType, SolanaVaultOCCMessage};
use crate::instructions::quote_request::MessagingFee;
use oapp::endpoint::{instructions::SendParams, MessagingReceipt};

use crate::state::{BackwardFee, ClaimData, PeerConfig, ProxyConfig, BACKWARD_FEE_SEED, CLAIM_DATA_SEED, PEER_SEED, PROXY_CONFIG_SEED};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program, system_instruction};
use solana_program::keccak::hash;
use solana_program::keccak::Hash;

#[derive(Accounts)]
#[instruction(params: SubmitProofParams)]
pub struct SubmitProof<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + ClaimData::INIT_SPACE,
        seeds = [CLAIM_DATA_SEED, user.key().as_ref()],
        bump
    )]
    pub claim_data: Account<'info, ClaimData>,

    pub system_program: Program<'info, System>,
}

impl SubmitProof<'_> {
    pub fn apply(ctx: &mut Context<SubmitProof>, submit_proof_params: &SubmitProofParams) -> Result<()> {
        let evm_address = solana_to_evm_address(&ctx.accounts.user.key());

        let leaf = calculate_leaf(evm_address, &submit_proof_params.cumulative_amount);

        let root = process_proof(&submit_proof_params.merkle_proof, leaf);
        msg!("Root: {:?}", bytes32_to_hex(&root.to_bytes()));

        ctx.accounts.claim_data.bump = ctx.bumps.claim_data;
        ctx.accounts.claim_data.distribution_id = to_bytes32(&submit_proof_params.distribution_id.to_be_bytes());
        ctx.accounts.claim_data.root = root.to_bytes();
        ctx.accounts.claim_data.amount = submit_proof_params.cumulative_amount;
        ctx.accounts.claim_data.user = ctx.accounts.user.key();

        emit!(ClaimProofSubmitted {
            user: ctx.accounts.user.key(),
            distribution_id: submit_proof_params.distribution_id,
            cumulative_amount: submit_proof_params.cumulative_amount,
            merkle_root: root.to_bytes(),
        });

        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SubmitProofParams {
    pub distribution_id: u32,
    pub cumulative_amount: [u8; 32],
    pub merkle_proof: Vec<[u8; 32]>,
}

impl SubmitProofParams {
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

#[derive(Accounts)]
#[instruction(msg_fee: MessagingFee)]
pub struct SendClaim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        close = user,
        seeds = [CLAIM_DATA_SEED, user.key().as_ref()],
        bump = claim_data.bump,
    )]
    pub claim_data: Account<'info, ClaimData>,

    #[account(
        mut,
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
        bump = backward_fee.bump,
        constraint = backward_fee.order_backward_fee < msg_fee.native_fee @ProxyError::InsufficientMessagingFee
    )]
    pub backward_fee: Account<'info, BackwardFee>,

    pub system_program: Program<'info, System>,
}

impl SendClaim<'_> {
    pub fn apply(ctx: &mut Context<SendClaim>, msg_fee: &MessagingFee) -> Result<MessagingReceipt> {
        require!(!ctx.accounts.proxy_config.paused, ProxyError::Paused);

        let payload_type = PayloadType::ClaimRewardSolana;
        require!(payload_type.check_vault_payload_type(), ProxyError::InvalidPayloadType);

        let options = ctx.accounts.peer_config.enforced_options.get_enforced_options(&None);

        let vault_occ_message = SolanaVaultOCCMessage {
            token: payload_type.get_token_type() as u8,
            sender: ctx.accounts.user.key(),
            payload_type: payload_type as u8,
            payload: ctx.accounts.claim_data.encode_claim_payload(),
        };

        let backward_fee = ctx.accounts.backward_fee.order_backward_fee;

        if backward_fee > 0 {
            program::invoke(
                &system_instruction::transfer(ctx.accounts.user.key, &ctx.accounts.proxy_config.key(), backward_fee),
                &[ctx.accounts.user.to_account_info(), ctx.accounts.proxy_config.to_account_info()],
            )?;
        }

        let send_params = SendParams {
            dst_eid: ctx.accounts.proxy_config.orderly_eid,
            receiver: ctx.accounts.peer_config.peer_address,
            message: vault_occ_message.encode(),
            options,
            native_fee: msg_fee.native_fee - backward_fee,
            lz_token_fee: msg_fee.lz_token_fee,
        };

        let receipt = oapp::endpoint_cpi::send(
            ctx.accounts.proxy_config.endpoint_program,
            ctx.accounts.proxy_config.key(),
            ctx.remaining_accounts,
            &[PROXY_CONFIG_SEED, &[ctx.accounts.proxy_config.bump]],
            send_params,
        )?;

        emit!(ClaimRequestSent {
            guid: receipt.guid,
            user: ctx.accounts.user.key(),
            distribution_id: ctx.accounts.claim_data.distribution_id,
            cumulative_amount: ctx.accounts.claim_data.amount,
            merkle_root: ctx.accounts.claim_data.root,
        });
        Ok(receipt)
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ClaimPayload {
    pub distribution_id: u32,
    pub cumulative_amount: [u8; 32],
    pub merkle_root: [u8; 32],
}

// TODO: move to utils
fn calculate_leaf(evm_address: [u8; 20], cumulative_amount: &[u8; 32]) -> Hash {
    let mut data = Vec::with_capacity(64); // 32 bytes for evm_address + 32 bytes for cumulative_amount
    data.extend_from_slice(&to_bytes32(&evm_address));
    data.extend_from_slice(cumulative_amount);
    let hashed_address_and_amount = solana_program::keccak::hash(&data);
    let double_hashed_address_and_amount = solana_program::keccak::hash(&hashed_address_and_amount.to_bytes());
    double_hashed_address_and_amount
}

fn solana_to_evm_address(solana_address: &Pubkey) -> [u8; 20] {
    let hashed_solana_address = solana_program::keccak::hash(&solana_address.to_bytes());
    let mut evm_address = [0u8; 20];
    evm_address.copy_from_slice(&hashed_solana_address.to_bytes()[12..32]);
    evm_address
}

fn process_proof(proof: &[[u8; 32]], leaf: Hash) -> Hash {
    proof
        .iter()
        .fold(leaf, |computed_hash, &proof_element| hash_pair(computed_hash.to_bytes(), proof_element))
}

fn hash_pair(a: [u8; 32], b: [u8; 32]) -> Hash {
    if a < b {
        efficient_hash(a, b)
    } else {
        efficient_hash(b, a)
    }
}

fn efficient_hash(a: [u8; 32], b: [u8; 32]) -> Hash {
    let mut data = Vec::with_capacity(64);
    data.extend_from_slice(&a);
    data.extend_from_slice(&b);
    hash(&data)
}

pub fn bytes32_to_hex(bytes: &[u8; 32]) -> String {
    let broker_hash_hex: String = bytes
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<Vec<String>>()
        .join("");
    broker_hash_hex
}

pub fn to_bytes32(bytes: &[u8]) -> [u8; 32] {
    let mut bytes32 = [0u8; 32];
    // add ledding zeros to the bytes
    bytes32[32 - bytes.len()..].copy_from_slice(bytes);
    bytes32
}
