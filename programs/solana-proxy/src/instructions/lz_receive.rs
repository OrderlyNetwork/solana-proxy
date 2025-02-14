use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address, AssociatedToken};
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};
use oapp::endpoint::{cpi::accounts::Clear, instructions::ClearParams, ConstructCPIContext};
use crate::instructions::LzReceiveParams;

use crate::errors::ProxyError;
use crate::instructions::msg_codec::{SolanaLedgerOCCMessage, TokenType};
use crate::state::{PeerConfig, ProxyConfig, PEER_SEED, PROXY_CONFIG_SEED};

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceive<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
    )]
    pub proxy_config: Account<'info, ProxyConfig>,

    #[account(
        seeds = [
            PEER_SEED,
            &proxy_config.key().to_bytes(),
            &params.src_eid.to_be_bytes()
        ],
        bump = peer_config.bump,
        constraint = peer_config.peer_address == params.sender @ ProxyError::InvalidSender
    )]
    pub peer_config: Account<'info, PeerConfig>,

    #[account(
        mint::token_program = token_program,
        constraint = proxy_config.usdc_token_account == token_mint.key() @ ProxyError::InvalidUSDCAccount
    )]
    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = proxy_config,
        associated_token::token_program = token_program
    )]
    pub proxy_token_account: Account<'info, TokenAccount>,

    /// CHECK: 
    #[account(
        constraint = SolanaLedgerOCCMessage::get_receiver(&params.message) == receiver.key() @ ProxyError::InvalidReceiver
    )]
    pub receiver: AccountInfo<'info>,

    #[account(
        mut,    
        associated_token::mint = token_mint,
        associated_token::authority = receiver,
        associated_token::token_program = token_program
    )]
    pub receiver_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> LzReceive<'info> {
    fn transfer_token_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.proxy_token_account.to_account_info(),
            to: self.receiver_token_account.to_account_info(),
            authority: self.proxy_config.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
    pub fn apply(ctx: &mut Context<LzReceive>, params: &LzReceiveParams) -> Result<()> {
        let seeds: &[&[u8]] = &[PROXY_CONFIG_SEED, &[ctx.accounts.proxy_config.bump]];

        let accounts_for_clear = &ctx.remaining_accounts[0..Clear::MIN_ACCOUNTS_LEN];
        let _ = oapp::endpoint_cpi::clear(
            ctx.accounts.proxy_config.endpoint_program,
            ctx.accounts.proxy_config.key(),
            accounts_for_clear,
            seeds,
            ClearParams {
                receiver: ctx.accounts.proxy_config.key(),
                src_eid: params.src_eid,
                sender: params.sender,
                nonce: params.nonce,
                guid: params.guid,
                message: params.message.clone(),
            },
        )?;

        let message = SolanaLedgerOCCMessage::decode(&params.message)?;
        require!(message.payload_type.check_ledger_payload_type(), ProxyError::InvalidLedgerPayloadType);
        // convert Vec<u8> to [u8; 32]
        let mut amount_bytes = [0u8; 32];
        amount_bytes.copy_from_slice(&message.payload[0..32]);
        let usdc_amount = SolanaLedgerOCCMessage::get_usdc_amount(&amount_bytes);
        let proxy_seeds: &[&[u8]] = &[PROXY_CONFIG_SEED, &[ctx.accounts.proxy_config.bump]];
        transfer(
            ctx.accounts
                .transfer_token_ctx()
                .with_signer(&[&proxy_seeds[..]]),
                usdc_amount,
        )?;
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AccountWithdrawSol {
    // pub account_id: [u8; 32],
    pub sender: [u8; 32],
    pub receiver: [u8; 32],
    pub broker_hash: [u8; 32],
    pub token_hash: [u8; 32],
    pub token_amount: u64,
    pub fee: u64,
    pub chain_id: u64,
    pub withdraw_nonce: u64,
}
