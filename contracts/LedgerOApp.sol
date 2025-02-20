// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { SolanaVaultMessage, OCCVaultMessage, EvmVaultMessage, SolanaLedgerMessage, OCCLedgerMessage, EvmLedgerMessage, LedgerToken, PayloadTypeChecker, LzOptions } from "./lib/OCCTypes.sol";
import { ILedgerOCCManager } from "./lib/ILedgerOCCManager.sol";
import { SolanaProxyMsgCodec } from "./lib/MsgCodec.sol";
import { OAppUpgradeable, MessagingFee, Origin } from "./layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppUpgradeable.sol";
import { OptionsBuilder } from "./layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";
/**
 * @title LedgerOApp for handle OApp message (claimReward) between ledger and Solana
 * @dev This contract also used to send OApp message from ledger to Solana to transfer USDC to user
 */
contract LedgerOApp is OAppUpgradeable {
    /// @dev OCCManager address
    address public occManagerAddr;

    mapping(uint8 => LzOptions) public payloadType2LzOptions;

    /// @dev mapping from chainId to eid
    mapping(uint256 => uint32) public chainId2Eid;

    /// @dev mapping from eid to chainId
    mapping(uint32 => uint256) public eid2ChainId;

    /// @dev solana eid
    uint32 public solanaEid;

    using SolanaProxyMsgCodec for bytes;
    using OptionsBuilder for bytes;
    using PayloadTypeChecker for uint8;
    /// @dev modifier that only allow OCCManager to call
    modifier onlyOCCManager() {
        require(msg.sender == occManagerAddr, "OnlyLedgerOCCManager can call this function");
        _;
    }

    function VERSION() external pure virtual returns (string memory) {
        return "1.0.0";
    }

    /* ========== Constructor and initializer ========== */

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the OApp with the provided endpoint and owner.
     * @param _endpoint The address of the LOCAL LayerZero endpoint.
     * @param _delegate The address of the delegate/owner of the OApp.
     * @param _solanaEid The eid of the Solana chain.
     */
    function initialize(address _endpoint, address _delegate, uint32 _solanaEid) public initializer {
        __initializeOApp(_endpoint, _delegate);
        require(_solanaEid != 0, "Zero eid");
        solanaEid = _solanaEid;
    }

    /* ========== Owner functions ========== */
    function setOCCManagerAddr(address _occManagerAddr) external onlyOwner {
        occManagerAddr = _occManagerAddr;
    }

    function setOptions(uint8 _payloadType, uint128 _gas, uint128 _value) external onlyOwner {
        require(_payloadType.checkLedgerPayloadType(), "LedgerOApp: invalid ledger payload type");
        payloadType2LzOptions[_payloadType] = LzOptions(_gas, _value);
    }

    function setChainId2Eid(uint256 chainId, uint32 eid) external onlyOwner {
        chainId2Eid[chainId] = eid;
        eid2ChainId[eid] = chainId;
    }

    function setSolanaEid(uint32 _solanaEid) external onlyOwner {
        require(_solanaEid != 0, "Zero eid");
        solanaEid = _solanaEid;
    }

    /* ========== Oapp functions ========== */
    /**
     * @notice Receive Oapp message from Solana Proxy and send to OCCManagervm.parseAddress
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 /*_guid*/,
        bytes calldata _message,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) internal override {
        require(solanaEid != 0, "LedgerOApp: Solana eid not set");

        if (_origin.srcEid == solanaEid) {
            SolanaVaultMessage memory solanaVaultMessage = _message.decodeSolanaVaultMessage();
            require(solanaVaultMessage.payloadType.checkVaultPayloadType(), "LedgerOApp: invalid vault payload type");
            require(eid2ChainId[solanaEid] != 0, "LedgerOApp: Solana chain id not set");
            OCCVaultMessage memory occVaultMessage = OCCVaultMessage({
                chainedEventId: 0, // @dev: chainEventId will be updated in OCCManager for solana proxy
                srcChainId: eid2ChainId[solanaEid],
                token: solanaVaultMessage.token,
                tokenAmount: uint256(0),
                sender: solanaVaultMessage.sender,
                payloadType: solanaVaultMessage.payloadType,
                payload: solanaVaultMessage.payload
            });
            ILedgerOCCManager(occManagerAddr).ledgerOappReceive(occVaultMessage);
        } else {
            revert("LedgerOApp: only Solana chain supported");
        }
    }

    /**
     * @notice Send message to Solana Proxy
     * @dev Only OCCManager can call this function
     */
    function ledgerOappSend(OCCLedgerMessage calldata _message) external onlyOCCManager {
        require(_message.payloadType.checkLedgerPayloadType(), "LedgerOApp: invalid ledger payload type");
        require(_message.dstChainId == eid2ChainId[solanaEid], "LedgerOApp: only send to solana");
        require(_message.token == LedgerToken.USDC, "LedgerOApp: Only USDC is supported");
        SolanaLedgerMessage memory solanaLedgerMessage = SolanaLedgerMessage({
            token: _message.token,
            receiver: _message.receiver,
            payloadType: _message.payloadType,
            payload: abi.encode(_message.tokenAmount)
        });
        bytes memory message = SolanaProxyMsgCodec.encodeSolanaLedgerMessage(solanaLedgerMessage);

        LzOptions memory typeOptions = payloadType2LzOptions[_message.payloadType];
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(
            typeOptions.gas,
            typeOptions.value
        );
        MessagingFee memory msgFee = _quote(solanaEid, message, options, false);

        _lzSend(solanaEid, message, options, msgFee, payable(this));
    }

    fallback() external payable {}

    receive() external payable {}
}
