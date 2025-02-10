use anchor_lang::prelude::error_code;

// Vault errors
#[error_code]
pub enum ProxyError {
    #[msg("Signer is not the Proxy admin")]
    InvalidProxyAdmin,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Invalid fee")]
    InvalidFee,
    #[msg("Invalid mint authority")]
    InvalidMintAuthority,
    #[msg("Solana Proxy is Paused")]
    Paused,
    #[msg("User is not the owner of the account")]
    InvalidUser,
    #[msg("Invalid payload type")]
    InvalidPayloadType,
    #[msg("Invalid USDC account")]
    InvalidUSDCAccount,
    #[msg("Invalid receiver")]
    InvalidReceiver,
    #[msg("Invalid Ledger payload type")]
    InvalidLedgerPayloadType,
    #[msg("Invalid sender")]
    InvalidSender,
}
