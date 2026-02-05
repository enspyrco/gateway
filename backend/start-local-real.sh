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

# Read contract address from deployment.json
DEPLOYMENT_FILE="$(dirname "$0")/../contracts/deployment.json"
if [ -f "$DEPLOYMENT_FILE" ]; then
  export NFTMARKET_CONTRACT_ADDRESS=$(cat "$DEPLOYMENT_FILE" | grep '"address"' | sed 's/.*: *"\([^"]*\)".*/\1/')
  echo "Loaded contract address from deployment.json: $NFTMARKET_CONTRACT_ADDRESS"
else
  export NFTMARKET_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
  echo "Warning: deployment.json not found, using default address"
fi

# Use Hardhat account #1 as the minter (account #0 is the deployer/platform)
export MINTER_PRIVATE_KEY=59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Real blockchain, mock watermarking
export USE_MOCK_BLOCKCHAIN=false
export USE_MOCK_WATERMARK=true

# Watermark API (set these in your .env or uncomment and fill in)
# export WATERMARK_API_URL=https://your-watermark-api.com
# export WATERMARK_API_KEY=your-api-key

# Mock Firestore (in-memory only, no disk persistence)
export USE_MOCK_FIRESTORE=true
export MOCK_PERSISTENCE=false

# Real IPFS (Pinata)
export USE_MOCK_IPFS=false
export USE_KMS=false
export DEV_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

echo "Starting with:"
echo "  - Hardhat blockchain: $POLYGON_RPC_URL"
echo "  - Contract: $NFTMARKET_CONTRACT_ADDRESS"
echo "  - Firestore emulator: $FIRESTORE_EMULATOR_HOST"
echo "  - Watermark: Cloud API"
echo "  - IPFS: Pinata (real)"
echo ""
echo "Make sure you have running:"
echo "  - firebase emulators:start --only firestore --import ./emulator-data --export-on-exit ./emulator-data"
echo "  - npx hardhat node (in contracts/)"
echo ""

npm run dev
