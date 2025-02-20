use crate::*;

// | 32 bytes: send_to | 32: amount in 18 decimals | compose_msg |
const SEND_TO_OFFSET: usize = 0;
const SEND_AMOUNT_SD_OFFSET: usize = 32;
const COMPOSE_MSG_OFFSET: usize = 64;
const DUST_DECIMALS: u32 = 8; // 18 (erc20 decimals on evm) - 10 (spl decimals of solana)

pub fn encode(
    send_to: [u8; 32],
    amount_sd: u64,
    sender: Pubkey,
    compose_msg: &Option<Vec<u8>>,
) -> Vec<u8> {
    let amount_bytes32 = u64_to_bytes32(amount_sd);
    if let Some(msg) = compose_msg {
        let mut encoded = Vec::with_capacity(96 + msg.len()); // 32 + 32 + 32
        encoded.extend_from_slice(&send_to);
        encoded.extend_from_slice(&amount_bytes32);
        encoded.extend_from_slice(sender.to_bytes().as_ref());
        encoded.extend_from_slice(&msg);
        encoded
    } else {
        let mut encoded = Vec::with_capacity(64); // 32 + 32
        encoded.extend_from_slice(&send_to);
        encoded.extend_from_slice(&amount_bytes32);
        encoded
    }
}

pub fn send_to(message: &[u8]) -> [u8; 32] {
    let mut send_to = [0; 32];
    send_to.copy_from_slice(&message[SEND_TO_OFFSET..SEND_AMOUNT_SD_OFFSET]);
    send_to
}

pub fn amount_sd(message: &[u8]) -> u64 {
    let mut amount_sd_bytes = [0u8; COMPOSE_MSG_OFFSET - SEND_AMOUNT_SD_OFFSET];
    amount_sd_bytes.copy_from_slice(&message[SEND_AMOUNT_SD_OFFSET..COMPOSE_MSG_OFFSET]);
    let (_, amount_sd) = bytes32_to_u64(&amount_sd_bytes);
    amount_sd
}

pub fn compose_msg(message: &[u8]) -> Option<Vec<u8>> {
    if message.len() > COMPOSE_MSG_OFFSET {
        Some(message[COMPOSE_MSG_OFFSET..].to_vec())
    } else {
        None
    }
}

pub fn u64_to_bytes32(value_u64: u64) -> [u8; 32] {
    let value_u128: u128 = (value_u64 as u128) * (10u64.pow(DUST_DECIMALS) as u128);
    let mut value_bytes32 = [0u8; 32];
    value_bytes32[16..].copy_from_slice(&value_u128.to_be_bytes());
    value_bytes32
}

pub fn bytes32_to_u64(value_bytes32: &[u8; 32]) -> (u128, u64) {
    let zero_padding = u128::from_be_bytes(
        value_bytes32[..16]
            .try_into()
            .expect("Slice with incorrect length"),
    );
    let value_u128 = u128::from_be_bytes(
        value_bytes32[16..]
            .try_into()
            .expect("Slice with incorrect length"),
    );

    let value_without_dust = value_u128 / (10u64.pow(DUST_DECIMALS) as u128); // 去掉最低8位十进制数
                                                                              // println!("value_without_dust: {}", value_without_dust);
    (zero_padding, value_without_dust as u64)
}
