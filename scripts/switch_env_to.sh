#!/bin/bash

print_usage() {
  echo "Usage: $0 <environment>"
  echo "Valid environments: LOCAL, DEV, QA, STAGING, PROD"
}

# Check if an argument is provided
if [ -z "$1" ]; then
  print_usage
  exit 1
fi

# Convert the environment value to uppercase
ENV_VALUE=$(echo "$1" | tr '[:lower:]' '[:upper:]')

# Validate the environment value
case $ENV_VALUE in
  LOCAL|DEV|QA|STAGING|PROD)
    ;;
  *)
    echo "Invalid environment: $ENV_VALUE"
    print_usage
    exit 1
    ;;
esac

# Update or set the ENV variable in the .env file
if grep -q '^ENV=' .env; then
  sed -i "s/^ENV=.*/ENV=$ENV_VALUE/" .env
else
  echo "ENV=$ENV_VALUE" >> .env
fi

RPC_URL_TESTNET="\"https://api.devnet.solana.com\""

# Determine the cluster value based on the environment
case $ENV_VALUE in
  LOCAL)
    CLUSTER_VALUE="localnet"
    RPC_URL_TESTNET="\"http://localhost:8899\""
    SOLANA_CONFIG="localhost"
    ;;
  PROD)
    CLUSTER_VALUE="mainnet"
    SOLANA_CONFIG="mainnet-beta"
    ;;
  *)
    CLUSTER_VALUE="devnet"
    SOLANA_CONFIG="devnet"
    ;;
esac

# Update the cluster value in the Anchor.toml file
sed -i "/^\[provider\]/,/^\[/{s/^cluster = .*/cluster = \"$CLUSTER_VALUE\"/}" Anchor.toml

# Update the RPC_URL_SOLANA_TESTNET value in the .env file
if grep -q '^RPC_URL_SOLANA_TESTNET=' .env; then
  sed -i "s|^RPC_URL_SOLANA_TESTNET=.*|RPC_URL_SOLANA_TESTNET=$RPC_URL_TESTNET|" .env
else
  echo "RPC_URL_SOLANA_TESTNET=$RPC_URL_TESTNET" >> .env
fi

# Set the solana config
solana config set --url $SOLANA_CONFIG