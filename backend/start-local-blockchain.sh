#!/bin/bash
# Start backend with LOCAL HARDHAT BLOCKCHAIN (real minting!)

# Load .env first (for API keys, etc.)
source .env 2>/dev/null || true

# Hardhat local node settings (override .env)
export POLYGON_RPC_URL=http://127.0.0.1:8545

# Read contract address from deployment.json (override .env - auto-updated by deploy script)
DEPLOYMENT_FILE="../contracts/deployment.json"
if [ -f "$DEPLOYMENT_FILE" ]; then
  export NFTMARKET_CONTRACT_ADDRESS=$(cat "$DEPLOYMENT_FILE" | grep '"address"' | cut -d'"' -f4)
  echo "Loaded contract address from deployment.json: $NFTMARKET_CONTRACT_ADDRESS"
else
  echo "WARNING: No deployment.json found. Run 'npx hardhat run scripts/deploy.js --network localhost' first."
  exit 1
fi

# Use Hardhat account #1 as the minter (account #0 is the deployer/platform)
export MINTER_PRIVATE_KEY=59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Real blockchain - no mock!
export USE_MOCK_BLOCKCHAIN=false

# Mock some external services for local dev
export USE_MOCK_WATERMARK=true
export USE_MOCK_IPFS=false  # Use real Pinata IPFS
export USE_MOCK_ARWEAVE=true
export USE_MOCK_FIRESTORE=true
export MOCK_PERSISTENCE=true

# Rust blind detection binary
export BLIND_DETECT_BINARY="../watermark-rs/target/release/detect"

echo "Starting with LOCAL HARDHAT BLOCKCHAIN"
echo "Contract: $NFTMARKET_CONTRACT_ADDRESS"
echo "RPC: $POLYGON_RPC_URL"
echo ""

npm run dev
