use anchor_lang::prelude::error_code;

// Vault errors
#[error_code]
pub enum ProxyError {
    #[msg("Signer is not the Proxy admin")]
    InvalidProxyAdmin,
    #[msg("The same admin is set")]
    SameAdmin,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Invalid fee")]
    InvalidFee,
    #[msg("Invalid mint authority")]
    InvalidMintAuthority,
    #[msg("Solana Proxy is Paused")]
    ProxyPaused,
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
    #[msg("Insufficient messaging fee")]
    InsufficientMessagingFee,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Invalid Ledger token type")]
    InvalidLedgerTokenType,
    #[msg("Invalid peer config param")]
    InvalidPeerConfigParam,
}
