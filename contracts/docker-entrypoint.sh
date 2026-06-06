#!/usr/bin/env sh
# Boot Hardhat, deploy the contract, register the minter, then publish the
# deployed proxy address for the backend (via a shared volume).
set -e

SHARED_DIR="${SHARED_DIR:-/shared}"
RPC="http://127.0.0.1:8545"

# Bind to 0.0.0.0 so sibling containers (wallet-service, backend) can reach
# the chain at http://hardhat:8545 — the default 127.0.0.1 bind would not.
echo "[hardhat] starting node..."
npx hardhat node --hostname 0.0.0.0 >/tmp/hardhat.log 2>&1 &
HH_PID=$!

echo "[hardhat] waiting for JSON-RPC at $RPC ..."
until curl -s -X POST -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
      "$RPC" >/dev/null 2>&1; do
  # Bail early if the node died on startup.
  if ! kill -0 "$HH_PID" 2>/dev/null; then
    echo "[hardhat] node exited during startup:"; cat /tmp/hardhat.log; exit 1
  fi
  sleep 1
done

echo "[hardhat] deploying NFTmarketNFT..."
npx hardhat run scripts/deploy.js --network localhost

echo "[hardhat] registering minter..."
npx hardhat run scripts/setup-minter.js --network localhost

# Publish the deployment for the backend to consume.
mkdir -p "$SHARED_DIR"
cp deployment.json "$SHARED_DIR/deployment.json"
echo "[hardhat] published $(cat deployment.json | tr -d '\n') -> $SHARED_DIR/deployment.json"

echo "[hardhat] ready — chain running in foreground."
wait "$HH_PID"
