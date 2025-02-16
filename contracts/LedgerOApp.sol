// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { SolanaVaultMessage, OCCVaultMessage, EvmVaultMessage, SolanaLedgerMessage, OCCLedgerMessage, EvmLedgerMessage, LedgerToken } from "./lib/OCCTypes.sol";
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

    /// @dev fee for message send to Solana mapping
    mapping(uint8 => uint256) public payloadType2OappFee;

    uint128 public defaultOappGas;

    /// @dev mapping from chainId to eid
    mapping(uint256 => uint32) public chainId2Eid;

    /// @dev mapping from eid to chainId
    mapping(uint32 => uint256) public eid2ChainId;

    /// @dev solana eid
    uint32 public solanaEid;

    using SolanaProxyMsgCodec for bytes;
    using OptionsBuilder for bytes;

    /// @dev modifier that only allow OCCManager to call
    modifier onlyOCCManager() {
        require(msg.sender == occManagerAddr, "OnlyLedger");
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
     * @param _owner The address of the owner of the OApp.
     */
    function initialize(address _endpoint, address _owner) public initializer {
        __initializeOApp(_endpoint, _owner);
    }

    /* ========== Owner functions ========== */
    function setOCCManagerAddr(address _occManagerAddr) external onlyOwner {
        occManagerAddr = _occManagerAddr;
    }

    function setPayloadType2OappFee(uint8 payloadType, uint256 oappFee) external onlyOwner {
        payloadType2OappFee[payloadType] = oappFee;
    }

    function setDefaultOappGas(uint128 _defaultOappGas) external onlyOwner {
        defaultOappGas = _defaultOappGas;
    }

    function setChainId2Eid(uint256 chainId, uint32 eid) external onlyOwner {
        chainId2Eid[chainId] = eid;
        eid2ChainId[eid] = chainId;
    }

    function setSolanaEid(uint32 _solanaEid) external onlyOwner {
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
        if (_origin.srcEid == solanaEid) {
            SolanaVaultMessage memory solanaVaultMessage = _message.decodeSolanaVaultMessage();
            OCCVaultMessage memory occVaultMessage = OCCVaultMessage({
                chainedEventId: 0, // @dev: chainEventId will update in OCCManager for solana proxy
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
        SolanaLedgerMessage memory solanaLedgerMessage = SolanaLedgerMessage({
            token: _message.token,
            receiver: _message.receiver,
            payloadType: _message.payloadType,
            payload: abi.encode(_message.tokenAmount)
        });
        bytes memory message = SolanaProxyMsgCodec.encodeSolanaLedgerMessage(solanaLedgerMessage);
        uint128 oappGas = defaultOappGas;
        if (oappGas == 0) {
            oappGas = 800000;
        }
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(oappGas, 0);
        MessagingFee memory msgFee = _quote(solanaEid, message, options, false);

        _lzSend(solanaEid, message, options, msgFee, payable(this));
    }

    /**
     * @notice estimate the Layerzero fee for sending a message from ledger to Solana chain in _lzSend
     */
    function estimateOappFeeFromLedgerToSolana(OCCLedgerMessage memory _message) internal view returns (uint256) {
        return payloadType2OappFee[_message.payloadType];
    }

    fallback() external payable {}

    receive() external payable {}

    /// gap for upgradeable
    uint256[48] private __gap;
}
