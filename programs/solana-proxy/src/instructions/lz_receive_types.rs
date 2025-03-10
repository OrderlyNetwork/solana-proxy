use crate::instructions::msg_codec::SolanaLedgerOCCMessage;
use crate::state::{AccountList, ProxyConfig, ACCOUNT_LIST_SEED, PEER_SEED, PROXY_CONFIG_SEED};
use anchor_lang::prelude::*;
use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_spl::associated_token::{get_associated_token_address, ID as ASSOCIATED_TOKEN_ID};
use anchor_spl::token::ID as TOKEN_PROGRAM_ID;
use oapp::endpoint_cpi::LzAccount;
// use oapp::LzReceiveParams;
#[derive(Accounts)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceiveTypes<'info> {
    #[account(
        seeds = [PROXY_CONFIG_SEED],
        bump = proxy_config.bump,
    )]
    pub proxy_config: Account<'info, ProxyConfig>,
    #[account(
        seeds = [ACCOUNT_LIST_SEED, &proxy_config.key().as_ref()],
        bump = account_list.bump
    )]
    pub account_list: Account<'info, AccountList>,
}

impl LzReceiveTypes<'_> {
    pub fn apply(ctx: &Context<LzReceiveTypes>, params: &LzReceiveParams) -> Result<Vec<LzAccount>> {
        let mut accounts = vec![
            LzAccount { pubkey: Pubkey::default(), is_signer: true, is_writable: true }, // 0: signer
            LzAccount { pubkey: ctx.accounts.proxy_config.key(), is_signer: false, is_writable: false }, // 1: proxy config
        ];
        let (peer_config, _) = Pubkey::find_program_address(
            &[PEER_SEED, ctx.accounts.proxy_config.key().as_ref(), &ctx.accounts.proxy_config.orderly_eid.to_be_bytes()],
            ctx.program_id,
        );
        let token_mint = ctx.accounts.proxy_config.usdc_token_account;
        // let token_mint = ctx.accounts.account_list.usdc_token_account;

        let proxy_token_account = get_associated_token_address(&ctx.accounts.proxy_config.key(), &token_mint);
        let receiver = SolanaLedgerOCCMessage::get_receiver(&params.message);
        let receiver_token_account = get_associated_token_address(&receiver, &token_mint);
        let token_program = TOKEN_PROGRAM_ID;
        let system_program = SYSTEM_PROGRAM_ID;
        let associated_token_program = ASSOCIATED_TOKEN_ID;

        accounts.extend_from_slice(&[
            LzAccount { pubkey: peer_config, is_signer: false, is_writable: false },
            LzAccount { pubkey: token_mint, is_signer: false, is_writable: false },
            LzAccount { pubkey: proxy_token_account, is_signer: false, is_writable: true },
            LzAccount { pubkey: receiver, is_signer: false, is_writable: false },
            LzAccount { pubkey: receiver_token_account, is_signer: false, is_writable: true },
            LzAccount { pubkey: token_program, is_signer: false, is_writable: false },
            LzAccount { pubkey: associated_token_program, is_signer: false, is_writable: false },
            LzAccount { pubkey: system_program, is_signer: false, is_writable: false },
        ]);

        let (event_authority_account, _) = Pubkey::find_program_address(&[oapp::endpoint_cpi::EVENT_SEED], &ctx.program_id);
        accounts.extend_from_slice(&[
            // LzAccount { pubkey: solana_program::system_program::ID, is_signer: false, is_writable: false },
            LzAccount { pubkey: event_authority_account, is_signer: false, is_writable: false },
            LzAccount { pubkey: ctx.program_id.key(), is_signer: false, is_writable: false },
        ]);

        let endpoint_program = ctx.accounts.proxy_config.endpoint_program;
        // remaining accounts 0..9
        let accounts_for_clear = oapp::endpoint_cpi::get_accounts_for_clear(
            endpoint_program,
            &ctx.accounts.proxy_config.key(),
            params.src_eid,
            &params.sender,
            params.nonce,
        );
        accounts.extend(accounts_for_clear);

        Ok(accounts)
    }
}

// Redefine LzReceiveParams to avoid the Anchor IdlError: Type not found: {"name":"params","type":{"defined":"LzReceiveParams"}}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct LzReceiveParams {
    pub src_eid: u32,
    pub sender: [u8; 32],
    pub nonce: u64,
    pub guid: [u8; 32],
    pub message: Vec<u8>,
    pub extra_data: Vec<u8>,
}
