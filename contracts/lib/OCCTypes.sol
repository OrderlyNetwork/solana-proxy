// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/// @dev The token types that can be transferred
enum LedgerToken {
    ORDER,
    ESORDER,
    USDC,
    PLACEHOLDER
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
