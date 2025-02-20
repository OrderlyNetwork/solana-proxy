# Solana Proxy for Orderly Network

To support users to send Staking related requests from Solana to Orderly chain, we have to deploy a program named Proxy on Solana and a smart contract named LedgerOApp on Orderly Network. Both are built on top of the LayerZero OApp protocol to send and receive messages between Solana and Orderly Network.

For the information flow, please refer to the [README](https://gitlab.com/orderlynetwork/orderly-v2/omnichain-ledger/-/tree/audit-for-solana#payload-types-and-message-flow-for-solana-support) of `OmniLedger` repo.

## Prerequisites

- This repo is built on top of LayerZero [codebase](https://github.com/LayerZero-Labs/devtools/tree/main/examples/oft-solana) by running command `LZ_ENABLE_SOLANA_OFT_EXAMPLE=1 npx create-lz-oapp@latest`
- Setup Rust, Solana, Anchor, Node.js correct version, according to [OFT Token Contract](./README_OFT.md).
- Deployed OFT token contract on Solana and Orderly Network. This project based on the OFT token contract example, so, you can use it for OFT token deployment. Please refer to [OFT Token Contract](./README_OFT.md) for more details.
  Remember the address of the deployed OFT token program and OFT escrow PDA, it will be used in the config file.

## Build the Solana Proxy program

### Install .Node.js dependencies

```bash
pnpm install
```

### Key generation for Solana Proxy

```bash
solana-keygen new -o ./solana_proxy-keypair.json
anchor keys sync
```

### Build the Solana Proxy program

```bash
anchor build
```

## Environment setup

### Prepare `.env`

```bash
cp .env.example .env
```

In the `.env` just created, you need to set the following variables:

- `PRIVATE_KEY` - your evm private key
- `RPC_URL_SOLANA` - RPC URL for Solana mainnet
- `RPC_URL_SOLANA_TESTNET` - RPC URL for Solana devnet
- `ANCHOR_WALLET` - path to your solana wallet file

### Set the ENV variable

There are four environments defined as `ENV` in the [file](./tasks/proxy/constants.ts), supported:

- `local` - Solana localhost, for local testing
- `dev` - Solana devnet, for development
- `qa` - Solana devnet, for quality assurance
- `staging` - Solana devnet, for staging
- `mainnet` - Solana mainnet-beta, for production

Please note:

1. If you are on the `local` env, please set the `cluster = "Localnet"` in the [Anchor config file](./Anchor.toml).
2. If you are on the `dev`, `qa`, or `staging` env, please set the `cluster = "Devnet"` in the [Anchor config file](./Anchor.toml).
3. If you are on the `mainnet` env, please set the `cluster = "Mainnet"` in the [Anchor config file](./Anchor.toml).

## Deploy Proxy program to Solana

```bash
anchor deploy -p solana-proxy
```

Copy the address of the deployed Solana Proxy program into the the `PROXY_ACCOUNTS.env.programId` in the [file](./tasks/proxy/constants.ts). Only after this step, you can run the following commands to interact with your deployed Solana Proxy program.

Run the command to list all commands you can use to interact with your deployed Solana Proxy program:

```bash
npx hardhat
...
sol:proxy:admin                       Transfer Admin for Solana Proxy
sol:proxy:claim                       Claim reward from Solana Proxy
sol:proxy:getconfig                   Get Config for Solana Proxy
sol:proxy:init                        Create and init Proxy Config PDA
sol:proxy:lzReceiveTypes              Get LZ Receive Types for Solana Proxy
sol:proxy:pause                       Pause Solana Proxy
sol:proxy:pda                         Get PDA for Solana Proxy and Solana OFT
sol:proxy:quote                       Get quote for Solana Proxy
sol:proxy:quoteclaim                  Quote claim for Solana Proxy
sol:proxy:request                     Send request for Solana Proxy
sol:proxy:setaccountlist              Set Account List for Solana Proxy
sol:proxy:setconfig                   Set Config for Solana Proxy
sol:proxy:setfee                      Set backwar fee for Solana Proxy
sol:proxy:setpeer                     Set Peer Config for Solana Proxy
sol:proxy:stake                       Stake from Solana through Solana OFT
sol:proxy:submitproof                 Send request for Solana Proxy
sol:proxy:withdrawfee                 Withdraw fee for Solana Proxy
...
```

## Set up Soalana Proxy

### Init Solana Proxy

```bash
npx hardhat proxy:init --env <env>
```

This command will try to initialize the Solana Proxy program and register it as an OAPP on LayerZero's Endpoint, and try to initialize some necessary PDA for the Solana Proxy program to send and receive messages. Please refer the [task file](./tasks/proxy/setProxy.ts) for more details.

### Set Peer

A peer is the counterpart `LedgerOApp` for the Solana Proxy program on the Orderly Network. It is a smart contract that will be used to send and receive messages.

You have to deploy the `LedgerOApp` contract on the Orderly Network before setting up the peer for Solana Proxy. And copy the address of the deployed `LedgerOApp` contract into the the `PROXY_ACCOUNTS.env.peerAddress` in the [file](./tasks/proxy/constants.ts).

Please note: I didn't include the `LedgerOApp` deployment/configuration tasks in this repo, you have to refer to [a similar repo]() for that.

```bash
npx hardhat proxy:setPeer --env <env>
```

### Set Configuration

The LayerZero provide a out-of-the-box configuration for the Solana Proxy program on Solana Devnet, but you have to set it yourself for Mainnet deployment.

```bash
npx hardhat proxy:setconfig --env <env>
```

After setting the configuration, you can fetch and print the configuration to the console (If `AccountNotFound` error, please wait for transaction confirmation and try again):

```bash
npx hardhat proxy:getconfig --env <env>
```

### Set on Localnet

If you want to deploy and set up the Solana Proxy program on Localnet, you have to set up the local node and clone some necessary accounts from the devnet:

```bash
solana-test-validator --clone-upgradeable-program 76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6 --clone-upgradeable-program 7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH --clone-upgradeable-program HtEYV4xB4wvsj5fgTkcfuChYpvGYzgzwvNhgDZQNh7wW --clone-upgradeable-program 6doghB248px58JSSwG4qejQ46kFMW4AMj7vzJnWZHNZn --clone-upgradeable-program 8ahPGPjEbpgGaZx2NV1iG5Shj7TDwvsjkEDcGWjt94TP -c 2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ -c 526PeNZfw8kSnDU4nmzJFVJzJWNhwmZykEyJr5XWz5Fv -c Fwp955krKJXiyYRY1Ex2VFcrMJD2kLBp8X7mxakRffPe -c 3hfYq9afjFbedp4GZk6n9ZefuCbhvgf4z4Jiyw2QEEPY -c 2uk9pQh3tB5ErV7LGQJcbWjb4KeJ2UJki5qJZ8QG56G3 -c 4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb -c CSFsUupvJEQQd1F4SsXGACJaxQX4eropQMkGV2696eeQ -c AwrbHeCyniXaQhiJZkLhgWdUCteeWSGaSN1sTfLiY7xK -c Fwp955krKJXiyYRY1Ex2VFcrMJD2kLBp8X7mxakRffPe -c FFf52Jx9Biw3QUjcZ3nPYyuGy9bE8Dmzv1AJryjzJX6X -c 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU -c 8g3yNyoXr6N4c8eQapQ1jeX5oDYY2kgzvDx6Lb9qunhA -c BWp8HaYYhiNHekt3zgQhqoCrRftneGxxfgKmCZ6svHN -c BswrQQoPKAFojTuJutZcBMtigAgTghEH4M8ofn3EG2X2 -c BbGKfxuPwDmu58BjPpd7PMG69TqnZjSpKaLDMgf9E9Dr -c 5zekkyLszMmcPKhJNhkwctXdEEg4xLtwbfayZkaFhNCQ  -c G6VK2LVKfZf3R7gt23GRGavsPkw9mutcXFnSELD4pRNh --url devnet --reset
```

## Set up LedgerOApp

Currently, only the source code of the `LedgerOApp` is provided in the [folder](./contracts/LedgerOApp.sol), you can refer to this repo for the deployment and configuration.

TODO @Zion : Add the deployment and configuration tasks for `LedgerOApp` in this repo.

## Message Flow

There are many types of messages between the `Solana Proxy` and the `LedgerOApp`, this section will introduce the message flow and the payload types.

All messages are related to the `ORDER` token, which is used to incentivize the Orderly users.
The ORDER token is created as the native ERC20 token on the Ethereum, and extended to other chains via LayerZero's OFT standard, including Arbitrum, Optimism, Base, Polygon, Avalanche, Orderly and **Solana**.

For the users on EVM chains, all messages are relayed through OFT channel using the [Compose pattern](https://docs.layerzero.network/v2/developers/evm/oft/oft-patterns-extensions#composed-oft).

But Solana has strict limitation for transaction size and the CPI limit, so we have to set up an OApp channel between the Solana and the Orderly network to relay most of the messages.

The following table shows the supported payload types, message direction and the transport method.

| #   | Payload Type                | Direction | Transport | Function          | Notes                                               |
| --- | --------------------------- | --------- | --------- | ----------------- | --------------------------------------------------- |
| 0   | ClaimReward                 | Forward   | OFT       | lzCompose         | EVM-specific reward claim, NOT supported for Solana |
| 1   | Stake                       | Forward   | OFT       | lzCompose         | Token staking                                       |
| 2   | CreateOrderUnstakeRequest   | Forward   | OApp      | ledgerOappReceive | Request to unstake ORDER                            |
| 3   | CancelOrderUnstakeRequest   | Forward   | OApp      | ledgerOappReceive | Cancel pending unstake                              |
| 4   | WithdrawOrder               | Forward   | OApp      | ledgerOappReceive | Withdraw staked ORDER                               |
| 5   | EsOrderUnstakeAndVest       | Forward   | OApp      | ledgerOappReceive | Unstake and vest esORDER                            |
| 6   | CancelVestingRequest        | Forward   | OApp      | ledgerOappReceive | Cancel specific vesting                             |
| 7   | CancelAllVestingRequests    | Forward   | OApp      | ledgerOappReceive | Deprecated - NOT supported anymore                  |
| 8   | ClaimVestingRequest         | Forward   | OApp      | ledgerOappReceive | Claim vested tokens                                 |
| 9   | RedeemValor                 | Forward   | OApp      | ledgerOappReceive | Redeem Valor tokens                                 |
| 10  | ClaimUsdcRevenue            | Forward   | OApp      | ledgerOappReceive | Claim USDC revenue                                  |
| 11  | ClaimRewardBackward         | Backward  | OFT       | ledgerSendToVault | Reward claim response                               |
| 12  | WithdrawOrderBackward       | Backward  | OFT       | ledgerSendToVault | Withdrawal response                                 |
| 13  | ClaimVestingRequestBackward | Backward  | OFT       | ledgerSendToVault | Vesting claim response                              |
| 14  | ClaimUsdcRevenueBackward    | Backward  | OApp      | ledgerSendToVault | USDC claim response                                 |
| 15  | UnstakeOrderNow             | Forward   | OApp      | ledgerOappReceive | Immediate unstaking                                 |
| 16  | ClaimRewardSolana           | Forward   | OApp      | ledgerOappReceive | Solana-specific reward claim. For Solana only       |

## User Requests

### Stake ORDER

A user holding ORDER token on Solana can stake their ORDER token into Orderly Network and start earning rewards.

```bash
npx hardhat sol:proxy:stake --env <env> --amount 1
```

This command will bridge 1 ORDER token to Orderly Network and stake it into the staking pool. Due to the limitation of the transaction size and the CPI limit, we can only achieve this through OFT's Compose pattern. And we have to use the [Address-Lookup Table](https://solana.com/developers/guides/advanced/lookup-tables) to shrink the transaction size under the limit.

If you deployed the Solana Proxy program, please create and extend the ALT by add flag `--extend-alt` to the command.
The ALT address should be stored in the `OFT_ACCOUNTS.env.alt` in the [file](./tasks/proxy/constants.ts).

A user who stakes ORDER token will get `Valor` as the staking reward.

### Claim Reward

For the traders and market makers, they can claim the rewards based on their trading activities periodically, the merkle proof is necessary to validate when claiming the reward.

On EVM chains, users can submit their proof and relay it to Orderly newtork within the same transaction; But on Solana, we have to split the process into two transactions:

1. Submit the proof to the Solana Proxy program for root calculation,
2. Relay the Merkle root to OmniLedger for validation.

Command to submit the proof:

```bash
npx hardhat sol:proxy:submitproof --env dev --distribution-id 2 --cumulative-amount 1 --merkle-proof "2924269a0a937d37e0ad32cfaca1378e9cfaea61e0f899bedf2c36ace63faa0f","160e0c1f63803c827c8398ce521642033effd335935d7518fb19dac8b867d299","b3eb9d2be1b3564f6278bca25c9e7e5af9ecac4940c0d0779b4ef0df2f9c7931"
```

Command to relay the Merkle root to OmniLedger:

```bash
npx hardhat sol:proxy:claim --env local
```

If the Merkle root is valid, a backward message type (`ClaimRewardBackward`) will be sent through the OFT channel: Orderly OFT -> Solana OFT. User will receive the ORDER token in their Solana OFT token account.

### Unstake ORDER

A user can send a request to unstake their ORDER token from Orderly Network, and wait for the unstake period, then send a request to withdraw the unstaked ORDER token.

Command to send a request to unstake ORDER:

```bash
npx hardhat sol:proxy:request --env dev --payload-type CreateOrderUnstakeRequest --payload 1 // payload is the amount to unstake
```

Command to withdraw the unstaked ORDER token:

```bash
npx hardhat sol:proxy:request --env dev --payload-type WithdrawOrder
```

If a user wants to withdraw the staked ORDER token immediately, it can send a request

```bash
npx hardhat sol:proxy:request --env dev --payload-type UnstakeOrderNow --payload 1 // payload is the amount to unstake
```

Both `WithdrawOrder` and `UnstakeOrderNow` will trigger a backward message type (`WithdrawOrderBackward`) to be sent through the OFT channel: Orderly OFT -> Solana OFT. User will receive the ORDER token in their Solana OFT token account.

### esORDER Related

There are types for claiming rewards, one is the ORDER token, the other is the esORDER. esORDER is not a real token, it is a virtual token as trading reward. Users whoes reward is esORDER will automatically stake their esORDER after claiming, and get `Valor` as the staking reward.

Users who hold esORDER can vest their esORDER into ORDER token with time.

Command to vest esORDER:

```bash
npx hardhat sol:proxy:request --env dev --payload-type EsOrderUnstakeAndVest --payload 1 // payload is the amount to vest
```

Command to cancel the vesting:

```bash
npx hardhat sol:proxy:request --env dev --payload-type CancelVestingRequest --payload 1 // payload is request id of EsOrderUnstakeAndVest
```

Command to claim the vested ORDER token:

```bash
npx hardhat sol:proxy:request --env dev --payload-type RedeemValor --payload 1 // payload is request id of EsOrderUnstakeAndVest
```

The `ClaimVestingRequest` will trigger a backward message type (`ClaimVestingRequestBackward`) to be sent through the OFT channel: Orderly OFT -> Solana OFT. User will receive the ORDER token in their Solana OFT token account.

### Claim Revenue

As stake holders (ORDER or esORDER), they can claim the revenue according to their stake amount and time.

User can redeem their `Valor`

```bash
npx hardhat sol:proxy:request --env dev --payload-type RedeemValor --payload 1 // payload is valor amount to redeem
```

Command to claim the revenue:

```bash
npx hardhat sol:proxy:request --env dev --payload-type ClaimUsdcRevenue
```

This command will trigger a backward message type (`ClaimUsdcRevenueBackward`) to be sent through the OApp channel: Orderly LedgerOApp -> Solana Proxy. User will receive the USDC in their USDC token account.

More details related to the user requests can be found in the [document](https://orderly.network/docs/introduction/tokenomics/order-staking/staking).
