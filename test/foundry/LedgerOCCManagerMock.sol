// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { ILedgerOCCManager, OCCVaultMessage, EvmLedgerMessage } from "../../contracts/lib/ILedgerOCCManager.sol";

contract LedgerOCCManagerMock is ILedgerOCCManager {
    uint32 public solanaEid;
    mapping(uint32 => uint256) public eid2ChainId;
    mapping(uint256 => uint32) public chainId2Eid;

    function setSolanaEid(uint32 _solanaEid) external {
        solanaEid = _solanaEid;
    }

    function setEid2ChainId(uint32 _eid, uint256 _chainId) external {
        eid2ChainId[_eid] = _chainId;
        chainId2Eid[_chainId] = _eid;
    }

    function ledgerSendToVault(EvmLedgerMessage memory /*message*/) external payable {
        return;
    }

    function collectUnvestedOrders(uint256 /*_amount*/) external pure {
        return;
    }

    function ledgerOappReceive(OCCVaultMessage memory /*message*/) external pure {
        return;
    }

    receive() external payable {}

    fallback() external payable {}
}
