use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum TokenType {
    ORDER,
    ESORDER,
    USDC,
    PLACEHOLDER,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SolanaVaultOCCMessage {
    pub token: u8,
    pub sender: Pubkey,
    pub payload_type: u8,
    pub payload: Vec<u8>,
}

pub const VAULT_MESSAGE_SIZE: usize = 1 + 32 + 1;

impl SolanaVaultOCCMessage {
    pub fn encode(&self) -> Vec<u8> {
        let mut encoded = Vec::with_capacity(VAULT_MESSAGE_SIZE + self.payload.len());
        encoded.extend_from_slice(&self.token.to_be_bytes());
        encoded.extend_from_slice(&self.sender.to_bytes());
        encoded.extend_from_slice(&self.payload_type.to_be_bytes());
        encoded.extend_from_slice(&self.payload);
        encoded
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SolanaLedgerOCCMessage {
    pub token: TokenType,
    pub receiver: Pubkey,
    pub payload_type: u8,
    pub payload: Vec<u8>,
}

pub const TOKEN_TYPE_OFFSET: usize = 1;
pub const RECEIVER_OFFSET: usize = TOKEN_TYPE_OFFSET + 32;
pub const PAYLOAD_TYPE_OFFSET: usize = RECEIVER_OFFSET + 1;
pub const PAYLOAD_OFFSET: usize = PAYLOAD_TYPE_OFFSET;

impl SolanaLedgerOCCMessage {
    pub fn decode(encoded: &[u8]) {}
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum PayloadDataType {
    /* ====== Payloads From vault side ====== */
    ClaimReward,               // 0
    Stake,                     // 1
    CreateOrderUnstakeRequest, // 2
    CancelOrderUnstakeRequest, // 3
    WithdrawOrder,             // 4
    EsOrderUnstakeAndVest,     // 5
    CancelVestingRequest,      // 6
    CancelAllVestingRequests,  // 7 Not supported anymore. Do not remove for backward compatibility
    ClaimVestingRequest,       // 8
    RedeemValor,               // 9
    ClaimUsdcRevenue,          // 10
    /* ====== Backward Payloads from ledger side ====== */
    ClaimRewardBackward,         // 11
    WithdrawOrderBackward,       // 12
    ClaimVestingRequestBackward, // 13
    ClaimUsdcRevenueBackward,    // 14
    /* ====== New Payloads ====== */
    UnstakeOrderNow,   // 15
    ClaimRewardSolana, // 16
}

impl PayloadDataType {
    pub fn get_token_type(&self) -> TokenType {
        match self {
            PayloadDataType::ClaimReward => TokenType::ORDER,
            PayloadDataType::Stake => TokenType::ORDER,
            PayloadDataType::CreateOrderUnstakeRequest => TokenType::ORDER,
            PayloadDataType::CancelOrderUnstakeRequest => TokenType::ORDER,
            PayloadDataType::WithdrawOrder => TokenType::ORDER,
            PayloadDataType::EsOrderUnstakeAndVest => TokenType::ESORDER,
            PayloadDataType::CancelVestingRequest => TokenType::ESORDER,
            PayloadDataType::CancelAllVestingRequests => TokenType::ESORDER,
            PayloadDataType::ClaimVestingRequest => TokenType::ESORDER,
            PayloadDataType::RedeemValor => TokenType::ESORDER,
            PayloadDataType::ClaimUsdcRevenue => TokenType::USDC,
            PayloadDataType::ClaimRewardBackward => TokenType::ORDER,
            PayloadDataType::WithdrawOrderBackward => TokenType::ORDER,
            PayloadDataType::ClaimVestingRequestBackward => TokenType::ORDER,
            PayloadDataType::ClaimUsdcRevenueBackward => TokenType::USDC,
            PayloadDataType::UnstakeOrderNow => TokenType::ORDER,
            PayloadDataType::ClaimRewardSolana => TokenType::ORDER,
        }
    }

    pub fn check_vault_payload_type(&self) -> bool {
        match self {
            PayloadDataType::ClaimReward => true,
            PayloadDataType::CreateOrderUnstakeRequest => true,
            PayloadDataType::CancelOrderUnstakeRequest => true,
            PayloadDataType::WithdrawOrder => true,
            PayloadDataType::EsOrderUnstakeAndVest => true,
            PayloadDataType::CancelVestingRequest => true,
            PayloadDataType::CancelAllVestingRequests => true,
            PayloadDataType::ClaimVestingRequest => true,
            PayloadDataType::RedeemValor => true,
            PayloadDataType::ClaimUsdcRevenue => true,
            PayloadDataType::ClaimUsdcRevenueBackward => true,
            PayloadDataType::UnstakeOrderNow => true,
            PayloadDataType::ClaimRewardSolana => true,
            _ => false,
        }
    }

    pub fn check_ledger_payload_type(&self) -> bool {
        match self {
            PayloadDataType::ClaimUsdcRevenueBackward => true,
            _ => false,
        }
    }
}

pub fn to_bytes32(bytes: &[u8]) -> [u8; 32] {
    let mut bytes32 = [0u8; 32];
    // add ledding zeros to the bytes
    bytes32[32 - bytes.len()..].copy_from_slice(bytes);
    bytes32
}
