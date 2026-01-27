#!/bin/bash
# Start backend with LOCAL HARDHAT BLOCKCHAIN (real minting!)

# Hardhat local node settings
export POLYGON_RPC_URL=http://127.0.0.1:8545
export NFTMARKET_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Use Hardhat account #1 as the minter (account #0 is the deployer/platform)
export MINTER_PRIVATE_KEY=59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Real blockchain - no mock!
export USE_MOCK_BLOCKCHAIN=false

# Still mock these (no real IPFS/Firestore)
export USE_MOCK_WATERMARK=true
export USE_MOCK_IPFS=true
export USE_MOCK_FIRESTORE=true
export USE_KMS=false
export DEV_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

echo "Starting with LOCAL HARDHAT BLOCKCHAIN"
echo "Contract: $NFTMARKET_CONTRACT_ADDRESS"
echo "RPC: $POLYGON_RPC_URL"
echo ""

npm run dev
