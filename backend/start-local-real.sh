#!/bin/bash
# Start backend with LOCAL HARDHAT BLOCKCHAIN and REAL WATERMARKING
#
# Prerequisites:
#   1. Start Firestore emulator (from repo root):
#      firebase emulators:start --only firestore --import ./emulator-data --export-on-exit ./emulator-data
#
#   2. Start Hardhat node:
#      cd contracts && npx hardhat node
#
#   3. Deploy contract (first time or after node restart):
#      cd contracts && npx hardhat run scripts/deploy.js --network localhost

# Hardhat local node settings
export POLYGON_RPC_URL=http://127.0.0.1:8545
export NFTMARKET_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

# Use Hardhat account #1 as the minter (account #0 is the deployer/platform)
export MINTER_PRIVATE_KEY=59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Real blockchain and watermarking
export USE_MOCK_BLOCKCHAIN=false
export USE_MOCK_WATERMARK=false

# Watermark API (set these in your .env or uncomment and fill in)
# export WATERMARK_API_URL=https://your-watermark-api.com
# export WATERMARK_API_KEY=your-api-key

# Firestore Local Emulator (run: firebase emulators:start --only firestore)
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_PROJECT_ID=demo-nftmarket
export USE_MOCK_FIRESTORE=false

# Still mock IPFS
export USE_MOCK_IPFS=true
export USE_KMS=false
export DEV_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

echo "Starting with:"
echo "  - Hardhat blockchain: $POLYGON_RPC_URL"
echo "  - Contract: $NFTMARKET_CONTRACT_ADDRESS"
echo "  - Firestore emulator: $FIRESTORE_EMULATOR_HOST"
echo "  - Watermark: Cloud API"
echo ""
echo "Make sure you have running:"
echo "  - firebase emulators:start --only firestore --import ./emulator-data --export-on-exit ./emulator-data"
echo "  - npx hardhat node (in contracts/)"
echo ""

npm run dev
