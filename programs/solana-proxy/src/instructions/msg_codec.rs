use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum TokenType {
    ORDER,
    ESORDER,
    USDC,
    PLACEHOLDER,
}

impl TokenType {
    pub fn check_vault_token_type(&self) -> bool {
        match self {
            TokenType::PLACEHOLDER => true,
            _ => false,
        }
    }

    pub fn check_ledger_token_type(&self) -> bool {
        match self {
            TokenType::USDC => true,
            _ => false,
        }
    }
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
    pub payload_type: PayloadType,
    pub payload: Vec<u8>,
}

pub const TOKEN_TYPE_OFFSET: usize = 1;
pub const RECEIVER_OFFSET: usize = TOKEN_TYPE_OFFSET + 32;
pub const PAYLOAD_TYPE_OFFSET: usize = RECEIVER_OFFSET + 1;
pub const PAYLOAD_OFFSET: usize = PAYLOAD_TYPE_OFFSET;

impl SolanaLedgerOCCMessage {
    pub fn get_token_type(message: &[u8]) -> TokenType {
        let token_type = u8::from_be_bytes(message[0..TOKEN_TYPE_OFFSET].try_into().expect("Failed to convert token type"));
        match token_type {
            0 => TokenType::ORDER,
            1 => TokenType::ESORDER,
            2 => TokenType::USDC,
            _ => TokenType::PLACEHOLDER,
        }
    }

    pub fn get_receiver(message: &[u8]) -> Pubkey {
        let mut receiver = [0u8; 32];
        receiver.copy_from_slice(&message[TOKEN_TYPE_OFFSET..RECEIVER_OFFSET]);
        Pubkey::new_from_array(receiver)
    }

    pub fn get_payload_type(message: &[u8]) -> PayloadType {
        let payload_type = u8::from_be_bytes(
            message[RECEIVER_OFFSET..PAYLOAD_TYPE_OFFSET]
                .try_into()
                .expect("Failed to convert payload type"),
        );
        PayloadType::from_u8(payload_type)
    }

    pub fn get_payload(message: &[u8]) -> Vec<u8> {
        let mut payload = Vec::new();
        payload.extend_from_slice(&message[PAYLOAD_TYPE_OFFSET..]);
        payload
    }

    pub fn get_usdc_amount(amount_bytes: &[u8; 32]) -> u64 {
        let mut amount = [0u8; 8];
        amount.copy_from_slice(&amount_bytes[32 - 8..32]);
        u64::from_be_bytes(amount)
    }

    pub fn decode(message: &[u8]) -> Result<Self> {
        let token_type = Self::get_token_type(message);
        let receiver = Self::get_receiver(message);
        let payload_type = Self::get_payload_type(message);
        let payload = Self::get_payload(message);
        Ok(Self { token: token_type, receiver, payload_type, payload })
    }
}

#[derive(PartialEq, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum PayloadType {
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

    /* ====== Placeholder ====== */
    PLACEHOLDER,
}

impl PayloadType {
    pub fn get_token_type(&self) -> TokenType {
        // For all types of the message sent from Solana Proxy to Orderly Omniledger, the token type is PLACEHOLDER
        // For the staking message sent throung Solana OFT compose pattern, the token type is ORDER,  and will be checked on Orderly Side
        match self {
            _ => TokenType::PLACEHOLDER,
        }
    }

    pub fn get_backward_token_type(&self) -> TokenType {
        match self {
            // Only ClaimUsdcRevenueBackward msg will be sent from Orderly Omniledger to Solana Proxy
            PayloadType::ClaimUsdcRevenueBackward => TokenType::USDC,
            // The following payload types will be sent from Orderly Omniledger to Solana OFT directly
            PayloadType::ClaimRewardBackward => TokenType::ORDER,
            PayloadType::WithdrawOrderBackward => TokenType::ORDER,
            PayloadType::ClaimVestingRequestBackward => TokenType::ORDER,

            _ => TokenType::PLACEHOLDER,
        }
    }

    pub fn check_claim_payload_type(&self) -> bool {
        match self {
            PayloadType::ClaimRewardSolana => true,
            _ => false,
        }
    }

    pub fn check_request_payload_type(&self) -> bool {
        match self {
            PayloadType::CreateOrderUnstakeRequest => true,
            PayloadType::CancelOrderUnstakeRequest => true,
            PayloadType::WithdrawOrder => true,
            PayloadType::EsOrderUnstakeAndVest => true,
            PayloadType::CancelVestingRequest => true,
            PayloadType::CancelAllVestingRequests => false,
            PayloadType::ClaimVestingRequest => true,
            PayloadType::RedeemValor => true,
            PayloadType::ClaimUsdcRevenue => true,
            PayloadType::UnstakeOrderNow => true,
            _ => false,
        }
    }

    pub fn check_ledger_payload_type(&self) -> bool {
        // The following payload types are supported to receive by Solana Proxy
        match self {
            PayloadType::ClaimUsdcRevenueBackward => true,
            _ => false,
        }
    }

    pub fn from_u8(value: u8) -> Self {
        match value {
            0 => PayloadType::ClaimReward,
            1 => PayloadType::Stake,
            2 => PayloadType::CreateOrderUnstakeRequest,
            3 => PayloadType::CancelOrderUnstakeRequest,
            4 => PayloadType::WithdrawOrder,
            5 => PayloadType::EsOrderUnstakeAndVest,
            6 => PayloadType::CancelVestingRequest,
            7 => PayloadType::CancelAllVestingRequests,
            8 => PayloadType::ClaimVestingRequest,
            9 => PayloadType::RedeemValor,
            10 => PayloadType::ClaimUsdcRevenue,
            11 => PayloadType::ClaimRewardBackward,
            12 => PayloadType::WithdrawOrderBackward,
            13 => PayloadType::ClaimVestingRequestBackward,
            14 => PayloadType::ClaimUsdcRevenueBackward,
            15 => PayloadType::UnstakeOrderNow,
            16 => PayloadType::ClaimRewardSolana,
            _ => PayloadType::PLACEHOLDER,
        }
    }
}
