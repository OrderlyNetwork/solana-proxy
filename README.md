# Solana Proxy for Orderly Network

## Prerequisites

- Setup Rust, Solana, Anchor, Node.js correct version, according to [OFT Token Contract](./README_OFT.md).
- Deployed OFT token contract on Solana and Orderly Network. This project based on the OFT token contract example, so, you can use it for OFT token deployment. Please refer to [OFT Token Contract](./README_OFT.md) for more details.
  Remember the address of the deployed OFT token program and OFT escrow PDA, it will be used in the config file.

## Build the Solana Proxy program

### Install .Node.js dependencies

```bash
pnpm install
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

In the `.env` just created, set `SOLANA_PRIVATE_KEY` to your private key value in base58 format. Since the locally stored keypair is in an integer array format, we'd need to encode it into base58 first.

### Set currently used network

There are several environments, supported: "local", "dev", "qa", "staging", "prod". You can set the environment by command `pnpm env:<env>`. For example, to set the environment to "dev":

```bash
pnpm env:dev
```

It will call `./scripts/switch_env_to.sh` and set ENV and RPC_URL_SOLANA_TESTNET variables in the .env file and also setup solana config correspondently.

## Deploy Proxy program to Solana

```bash
anchor deploy -p solana-proxy
```

Remember the address of the deployed proxy program, it will be used in the config file.

## Prepare config

All scripts and tasks, using config file, correspondent to the current environment. Config file provide scripts with necessary address and params and should be updated before task usage. The config files are located in `./config` folder and named as `<env>.json`. To prepare the config file, you need to know next parameters:

- `proxyProgramId` - Solana address of the deployed proxy program
- `oftProgramId` - Solana address of the deployed OFT token program
- `oftEscrowAta` - OFT token account address, which will be used for escrow

You can pass these address to the corresponding config file in the `./config` folder or provide them to the update script as arguments.

### Update Proxy program config (address added into config file)

```bash
npx hardhat proxy:updateConfig
```

### Update Proxy program config (address passed as arguments)

```bash
npx hardhat proxy:updateConfig --proxy-program-id 8KmTH6XgYBjehQwvcG1qjheBBE9oX7djuWvVbArvomFv --oft-program-id rU4eMA4wSoXLUodsLJWTJyQhAhdYps5rf4SRwpT7nHa --oft-escrow-ata 2rFLj7sGaYxSdh52XBgc6GSdeCH8GgaKcSevsbcVwn4i
```

This operation also print console string to run solana-test-validator with cloned accounts from selected environment to test the proxy locally like next:

```bash
solana-test-validator --clone-upgradeable-program rU4eMA4wSoXLUodsLJWTJyQhAhdYps5rf4SRwpT7nHa --clone-upgradeable-program 76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6 --clone-upgradeable-program 7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH --clone-upgradeable-program 6doghB248px58JSSwG4qejQ46kFMW4AMj7vzJnWZHNZn --clone-upgradeable-program 8ahPGPjEbpgGaZx2NV1iG5Shj7TDwvsjkEDcGWjt94TP --clone-upgradeable-program HtEYV4xB4wvsj5fgTkcfuChYpvGYzgzwvNhgDZQNh7wW --clone-upgradeable-program 7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH -c 2rFLj7sGaYxSdh52XBgc6GSdeCH8GgaKcSevsbcVwn4i -c AHSXYVVQ9xmzZ45UxURcxjLCPqCVGn2qLnk6E7dwF4Dg -c G6VK2LVKfZf3R7gt23GRGavsPkw9mutcXFnSELD4pRNh -c 8nUroYvjdDAQNmob4JuryrGPjsWUUx29uoR7bKTMggfN -c DFQfCeNpWYZCxaUA1qcwnACHuM8LjNnVMQH7yeopw9Jh -c 3hfYq9afjFbedp4GZk6n9ZefuCbhvgf4z4Jiyw2QEEPY -c 526PeNZfw8kSnDU4nmzJFVJzJWNhwmZykEyJr5XWz5Fv -c 2uk9pQh3tB5ErV7LGQJcbWjb4KeJ2UJki5qJZ8QG56G3 -c GQGf8sqsCDbUTVYuUNJZ4Y49DD7vgHxdavDqzv1Xhkpr -c 2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ -c 6R7bwnNJEEKrcWKrY64LKSmGTPaQsJMTDtuV8Z5fAjCX -c Fwp955krKJXiyYRY1Ex2VFcrMJD2kLBp8X7mxakRffPe -c AwrbHeCyniXaQhiJZkLhgWdUCteeWSGaSN1sTfLiY7xK -c CSFsUupvJEQQd1F4SsXGACJaxQX4eropQMkGV2696eeQ -c 4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb -c F8E8QGhKmHEx2esh5LpVizzcP4cHYhzXdXTwg9w3YYY2 -c 7n1YeBMVEUCJ4DscKAcpVQd6KXU7VpcEcc15ZuMcL4U3 --url devnet --reset
```

## Proxy initialization

Before using the proxy, you need to initialize it. It will create proxy config PDA. To initialize the proxy, you need to know next parameters:

- `occManagerAddress` - EVM address of the deployed OCC Manager contract on the Ordely Network

```bash
npx hardhat proxy:init --occ-manager-address '0xc0ffee254729296a45a3885639AC7E10F9d54979'
```

This also add `occManagerAddress` to the config file.

## Create Lookup table

Some operations require a lookup table. So, next operation will create it:

```bash
npx hardhat proxy:createLookupTable
```

If Lookup table already exists, you can use `--force` flag to recreate it.

```bash
npx hardhat proxy:createLookupTable --force
```

This also add `proxyLookupTable` to the config file.

## Claim Rewards

To claim rewards, you need to know next parameters:

- `distributionId` - ID of the distribution in the Omnichain Ledger contract on the Orderly Network
- `cumulativeAmount`- cumulative amount of rewards to claim
- `merkleProof` - merkle proof of the claim

```bash
npx hardhat proxy:claim-reward --distribution-id 1 --cumulative-amount 1000000000000000000 --merkle-proof "0xae04af11dc3968a94f29f8d0b4f11c1890c2483a239c5a333545fc73d953bb1d","0x93544216020fd51b6fcaaa9a88420f01d90f6298a4c39c1d20b02653b578eb60","0xcf7d0d4c8b5c18c3788e473dc0cdc256c5f2b01c8eca797ea19ceded9a184c49"
```

## Send User Request

There are several types of user requests, supported:
| Number | Request type name | Amount Means |
|--------|------------------------------|------------------------|
| 1 | Stake | Staking amount |
| 2 | CreateOrderUnstakeRequest | Unstaking amount |
| 3 | CancelOrderUnstakeRequest | Ignored, should be 0 |
| 4 | WithdrawOrder | Ignored, should be 0 |
| 5 | EsOrderUnstakeAndVest | Unstaking amount |
| 6 | CancelVestingRequest | Request id |
| 8 | ClaimVestingRequest | Request id |
| 9 | RedeemValor | Amount to redeem |
| 10 | ClaimUsdcRevenue | Ignored, should be 0 |
| 15 | UnstakeOrderNow | Unstaking amount |

To send user request, you need to call `proxy:send-user-request`, provide amount, according to the table above, and payload type. Payload type can be number or string, according to the request name from the table above, case ignored (e.g. `stake` or `Stake` or `1`).

Examples:

### Stake Order

```bash
npx hardhat proxy:send-user-request --amount 10000000000 --payload-type stake
```
### Create Order Unstake Request

```bash
npx hardhat proxy:send-user-request --amount 10000000000 --payload-type CreateOrderUnstakeRequest
```

### Cancel Order Unstake Request

```bash
npx hardhat proxy:send-user-request --amount 0 --payload-type CancelOrderUnstakeRequest
```
