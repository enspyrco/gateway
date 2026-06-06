#!/usr/bin/env sh
# Resolve the local-Hardhat contract address before starting the API.
#
# The `hardhat` container deploys NFTmarketNFT and publishes its address to a
# shared volume (deployment.json). Because the backend may boot before that
# deploy finishes, we wait for the file (bounded) and export the proxy address
# as NFTMARKET_CONTRACT_ADDRESS — unless one was already provided (e.g. when
# pointing at real Polygon instead of the on-box chain).
set -e

SHARED_DIR="${SHARED_DIR:-/shared}"
DEPLOYMENT="$SHARED_DIR/deployment.json"

read_address() {
  node -e "process.stdout.write(require('$DEPLOYMENT').address)" 2>/dev/null || true
}

if [ -z "$NFTMARKET_CONTRACT_ADDRESS" ] && [ "$USE_MOCK_BLOCKCHAIN" != "true" ]; then
  echo "[entrypoint] Waiting for $DEPLOYMENT (contract address)..."
  attempts=0
  while [ -z "$NFTMARKET_CONTRACT_ADDRESS" ] && [ "$attempts" -lt 90 ]; do
    if [ -f "$DEPLOYMENT" ]; then
      NFTMARKET_CONTRACT_ADDRESS="$(read_address)"
      [ -n "$NFTMARKET_CONTRACT_ADDRESS" ] && break
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  if [ -n "$NFTMARKET_CONTRACT_ADDRESS" ]; then
    export NFTMARKET_CONTRACT_ADDRESS
    echo "[entrypoint] Resolved NFTMARKET_CONTRACT_ADDRESS=$NFTMARKET_CONTRACT_ADDRESS"
  else
    echo "[entrypoint] WARNING: no contract address after wait; backend startup will fail its env check."
  fi
fi

exec node src/index.js
