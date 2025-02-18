// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

// LedgerOApp imports
import { PayloadDataType, LzOptions, PayloadDataType, LedgerToken, SolanaVaultMessage, SolanaLedgerMessage, OCCLedgerMessage } from "../../contracts/lib/OCCTypes.sol";
import { SolanaProxyMsgCodec } from "../../contracts/lib/MsgCodec.sol";
import { LedgerOApp, Origin } from "../../contracts/LedgerOApp.sol";

// LedgerOCCManager imports
import { LedgerOCCManagerMock } from "./LedgerOCCManagerMock.sol";

// OApp imports
import { IOAppOptionsType3, EnforcedOptionParam } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import { GUID, AddressCast } from "@layerzerolabs/lz-evm-protocol-v2/contracts/libs/GUID.sol";
import { EndpointV2Mock } from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";
// OZ imports
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Forge imports
import "forge-std/console.sol";

// DevTools imports
import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";

contract LedgerOAppTest is TestHelperOz5 {
    using OptionsBuilder for bytes;
    using SolanaProxyMsgCodec for bytes;
    using AddressCast for address;
    address private executor = address(0x0);
    address private owner = address(0x1);
    address private occManager = address(0x2);
    bytes32 private solanaProxy = bytes32(uint256(3));
    bytes32 private solanaUser = bytes32(uint256(4));
    address private lzEndpoint;
    uint32 private orderlyEid = 1;
    uint32 private solanaEid = 2;
    uint256 private solanaChainId = 901901901;
    uint128 private solanaGas = 500000;
    uint128 private solanaValue = 0;
    LedgerOApp private ledgerOApp;
    function setUp() public virtual override {
        super.setUp();
        vm.deal(address(this), 100 ether);
        vm.deal(owner, 100 ether);
        vm.deal(occManager, 100 ether);

        setUpEndpoints(2, LibraryType.UltraLightNode);

        LedgerOApp ledgerOAppImpl = new LedgerOApp();
        bytes memory ledgerOAppInitData = abi.encodeWithSignature(
            "initialize(address,address,uint32)",
            endpoints[orderlyEid],
            owner,
            solanaEid
        );

        ERC1967Proxy ledgerOAppProxy = new ERC1967Proxy(address(ledgerOAppImpl), ledgerOAppInitData);

        ledgerOApp = LedgerOApp(payable(address(ledgerOAppProxy)));

        LedgerOCCManagerMock ledgerOCCManagerImpl = new LedgerOCCManagerMock();

        ERC1967Proxy ledgerOCCManagerProxy = new ERC1967Proxy(address(ledgerOCCManagerImpl), "");

        occManager = address(ledgerOCCManagerProxy);

        vm.startPrank(owner);
        ledgerOApp.setOCCManagerAddr(occManager);
        ledgerOApp.setChainId2Eid(solanaChainId, solanaEid);
        ledgerOApp.setOptions(uint8(PayloadDataType.ClaimUsdcRevenueBackward), solanaGas, solanaValue);
        ledgerOApp.setPeer(solanaEid, solanaProxy);
        vm.stopPrank();
    }

    function test_initialize_setup() public view {
        assertEq(ledgerOApp.owner(), owner);
        assertEq(ledgerOApp.solanaEid(), solanaEid);
    }

    function test_owner_functions() public view {
        assertEq(ledgerOApp.occManagerAddr(), occManager);
        assertEq(ledgerOApp.eid2ChainId(solanaEid), solanaChainId);
        assertEq(ledgerOApp.chainId2Eid(solanaChainId), solanaEid);

        (uint128 gas, uint128 value) = ledgerOApp.payloadType2LzOptions(
            uint8(PayloadDataType.ClaimUsdcRevenueBackward)
        );
        assertEq(gas, solanaGas);
        assertEq(value, solanaValue);

        assertEq(ledgerOApp.peers(solanaEid), solanaProxy);
    }

    function test_receive_message() public {
        uint64 nonce = 0;
        LedgerToken tokenType = LedgerToken.PLACEHOLDER;
        bytes32 sender = solanaProxy;
        address senderInEvm = address(bytes20(sender));
        uint256 tokenAmount = 100 ether;
        uint256 requestId = 2;
        bytes memory extraData = bytes("");
        bytes memory msgData;
        bytes memory payloadData;

        for (uint8 msgType = 0; msgType <= 16; msgType++) {
            // Skip unsupported payload types
            if (
                msgType == uint8(PayloadDataType.ClaimReward) ||
                msgType == uint8(PayloadDataType.Stake) ||
                msgType == uint8(PayloadDataType.ClaimRewardBackward) ||
                msgType == uint8(PayloadDataType.WithdrawOrderBackward) ||
                msgType == uint8(PayloadDataType.ClaimVestingRequestBackward) ||
                msgType == uint8(PayloadDataType.ClaimUsdcRevenueBackward)
            ) {
                continue;
            } else if (
                msgType == uint8(PayloadDataType.CancelVestingRequest) ||
                msgType == uint8(PayloadDataType.CancelAllVestingRequests) ||
                msgType == uint8(PayloadDataType.ClaimUsdcRevenueBackward)
            ) {
                payloadData = abi.encode(requestId);
            } else {
                payloadData = abi.encode(tokenAmount);
            }
            msgData = _encodeSolanaVaultMessage(tokenType, sender, PayloadDataType(msgType), payloadData);

            bytes32 guid = GUID.generate(++nonce, solanaEid, senderInEvm, solanaEid, address(ledgerOApp).toBytes32());
            vm.startPrank(endpoints[orderlyEid]);
            ledgerOApp.lzReceive(
                Origin({ srcEid: solanaEid, sender: solanaProxy, nonce: nonce }),
                guid,
                msgData,
                executor,
                extraData
            );
            vm.stopPrank();
        }
    }

    function test_send_message() public {
        vm.deal(address(ledgerOApp), 100 ether);

        vm.startPrank(occManager);
        uint256 dstChainId = solanaChainId;
        LedgerToken tokenType = LedgerToken.USDC;
        uint256 tokenAmount = 100 * 10 ** 6;
        bytes32 receiver = solanaUser;
        uint8 payloadType = uint8(PayloadDataType.ClaimUsdcRevenueBackward);
        bytes memory payload = bytes("");

        OCCLedgerMessage memory occLedgerMessage = OCCLedgerMessage({
            dstChainId: dstChainId,
            token: tokenType,
            tokenAmount: tokenAmount,
            receiver: receiver,
            payloadType: payloadType,
            payload: payload
        });
        ledgerOApp.ledgerOappSend(occLedgerMessage);
        vm.stopPrank();
    }

    function _encodeSolanaVaultMessage(
        LedgerToken _tokenType,
        bytes32 _sender,
        PayloadDataType _payloadType,
        bytes memory _payload
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(_tokenType), _sender, uint8(_payloadType), _payload);
    }

    // function _decodeSolanaLedgerMessage(bytes calldata _message) internal pure returns (SolanaLedgerMessage memory) {
    //     return
    //         SolanaLedgerMessage({
    //             token: LedgerToken(_message.tokenType()),
    //             receiver: _message.sender(),
    //             payloadType: PayloadDataType(_message.payloadType()),
    //             payload: _message.payload()
    //         });
    // }
}
