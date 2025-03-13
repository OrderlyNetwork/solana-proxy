// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/// @dev The token types that can be transferred
enum LedgerToken {
    ORDER,
    ESORDER,
    USDC,
    PLACEHOLDER
}

/// @dev The data type of the payload, only types 2 - 10, 14, 15 and 16 are supported for Solana by LedgerOApp, other types (type 0 only for EVM chains ) are relayed through OFT contracts
enum PayloadDataType {
    /* ====== Payloads From vault side ====== */
    ClaimReward, // 0
    Stake, // 1
    CreateOrderUnstakeRequest, // 2
    CancelOrderUnstakeRequest, // 3
    WithdrawOrder, // 4
    EsOrderUnstakeAndVest, // 5
    CancelVestingRequest, // 6
    CancelAllVestingRequests, // 7 Not supported anymore. Do not remove for backward compatibility
    ClaimVestingRequest, // 8
    RedeemValor, // 9
    ClaimUsdcRevenue, // 10
    /* ====== Backward Payloads from ledger side ====== */
    ClaimRewardBackward, // 11
    WithdrawOrderBackward, // 12
    ClaimVestingRequestBackward, // 13
    ClaimUsdcRevenueBackward, // 14
    /* ====== New Payloads ====== */
    UnstakeOrderNow, // 15
    ClaimRewardSolana // 16
}

library PayloadTypeChecker {
    function checkVaultPayloadType(uint8 _payloadType) internal pure returns (bool) {
        return
            _payloadType == uint8(PayloadDataType.CreateOrderUnstakeRequest) ||
            _payloadType == uint8(PayloadDataType.CancelOrderUnstakeRequest) ||
            _payloadType == uint8(PayloadDataType.WithdrawOrder) ||
            _payloadType == uint8(PayloadDataType.EsOrderUnstakeAndVest) ||
            _payloadType == uint8(PayloadDataType.CancelVestingRequest) ||
            _payloadType == uint8(PayloadDataType.CancelAllVestingRequests) ||
            _payloadType == uint8(PayloadDataType.ClaimVestingRequest) ||
            _payloadType == uint8(PayloadDataType.RedeemValor) ||
            _payloadType == uint8(PayloadDataType.ClaimUsdcRevenue) ||
            _payloadType == uint8(PayloadDataType.UnstakeOrderNow) ||
            _payloadType == uint8(PayloadDataType.ClaimRewardSolana);
    }

    function checkLedgerPayloadType(uint8 _payloadType) internal pure returns (bool) {
        return _payloadType == uint8(PayloadDataType.ClaimUsdcRevenueBackward);
    }
}

/**
 * @dev LzOptions is a struct that contains the options for the LayerZero message
 * @param gas The gas limit for the LayerZero message
 * @param value The value for the LayerZero message
 */
struct LzOptions {
    uint128 gas;
    uint128 value;
}

struct EvmVaultMessage {
    /// @dev the event id for the message, different id for different chains
    uint256 chainedEventId;
    /// @dev the source chain id, the sender can omit this field
    uint256 srcChainId;
    /// @dev the symbol of the token
    LedgerToken token;
    /// @dev the amount of token
    uint256 tokenAmount;
    /// @dev the address of the sender
    address sender;
    /// @dev payloadType is the type of the payload
    uint8 payloadType;
    /// @dev payload is the data to be sent
    bytes payload;
}

struct EvmLedgerMessage {
    /// @dev the destination chain id
    uint256 dstChainId;
    /// @dev the symbol of the token
    LedgerToken token;
    /// @dev the amount of token
    uint256 tokenAmount;
    /// @dev the address of the receiver
    address receiver;
    /// @dev payloadType is the type of the payload
    uint8 payloadType;
    /// @dev payload is the data to be sent
    bytes payload;
}

struct OCCVaultMessage {
    /// @dev the event id for the message, different id for different chains
    uint256 chainedEventId;
    /// @dev the source chain id, the sender can omit this field
    uint256 srcChainId;
    /// @dev the symbol of the token
    LedgerToken token;
    /// @dev the amount of token
    uint256 tokenAmount;
    /// @dev the address of the sender
    bytes32 sender;
    /// @dev payloadType is the type of the payload
    uint8 payloadType;
    /// @dev payload is the data to be sent
    bytes payload;
}

struct OCCLedgerMessage {
    /// @dev the destination chain id
    uint256 dstChainId;
    /// @dev the symbol of the token
    LedgerToken token;
    /// @dev the amount of token
    uint256 tokenAmount;
    /// @dev the address of the receiver
    bytes32 receiver;
    /// @dev payloadType is the type of the payload
    uint8 payloadType;
    /// @dev payload is the data to be sent
    bytes payload;
}

struct SolanaVaultMessage {
    LedgerToken token;
    /// @dev the address of the sender
    bytes32 sender;
    /// @dev payloadType is the type of the payload
    uint8 payloadType;
    /// @dev payload
    bytes payload;
}

struct SolanaLedgerMessage {
    /// @dev the symbol of the token
    LedgerToken token;
    /// @dev the address of the receiver
    bytes32 receiver;
    /// @dev payloadType is the type of the payload
    uint8 payloadType;
    /// @dev payload
    bytes payload;
}
