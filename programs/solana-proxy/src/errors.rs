use anchor_lang::prelude::error_code;

// Vault errors
#[error_code]
pub enum ProxyError {
    #[msg("Proxy owner is not the same as the payer")]
    InvalidVaultOwner,
}