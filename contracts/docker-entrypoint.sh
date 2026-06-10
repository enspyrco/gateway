#!/usr/bin/env sh
# Boot a persistent Anvil chain, deploy the contract + register the minter on
# first boot only, then publish the proxy address for the backend (shared volume).
#
# Reproducibility (Gate 0): the chain state lives in a named volume at
# $STATE_FILE. On first boot the file is absent -> we deploy + register the
# minter, and Anvil persists the resulting state. On every subsequent boot the
# state file is reloaded, so the contract, the minter, AND every minted NFT come
# back intact -- `docker compose restart` no longer empties the gallery.
#
# Why Anvil over `hardhat node`: Hardhat's node is in-memory only; Anvil's
# --state file gives deterministic persistence with the same default mnemonic
# (so account addresses and the deployed proxy address are identical to the old
# Hardhat setup: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512).
set -e

SHARED_DIR="${SHARED_DIR:-/shared}"
STATE_FILE="${STATE_FILE:-/state/anvil-state.json}"
RPC="http://127.0.0.1:8545"

mkdir -p "$(dirname "$STATE_FILE")" "$SHARED_DIR"

# Bind to 0.0.0.0 so sibling containers (wallet-service, backend) reach the
# chain at http://hardhat:8545. --state-interval checkpoints periodically so an
# ungraceful kill loses at most 30s of chain state (the SIGTERM trap below
# handles the graceful case with a final dump).
echo "[chain] starting anvil (state: $STATE_FILE)..."
anvil --host 0.0.0.0 --chain-id 31337 \
      --state "$STATE_FILE" --state-interval 30 \
      >/tmp/anvil.log 2>&1 &
ANVIL_PID=$!

# Forward termination to anvil so it writes a final state dump on
# `docker compose stop/restart` (sh does not forward signals to children).
trap 'echo "[chain] stopping anvil (final state dump)..."; kill -TERM "$ANVIL_PID" 2>/dev/null; wait "$ANVIL_PID"' TERM INT

echo "[chain] waiting for JSON-RPC at $RPC ..."
until curl -s -X POST -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
      "$RPC" >/dev/null 2>&1; do
  if ! kill -0 "$ANVIL_PID" 2>/dev/null; then
    echo "[chain] anvil exited during startup:"; cat /tmp/anvil.log; exit 1
  fi
  sleep 1
done

# Decide first-boot vs reload by whether the contract actually has code on the
# (reloaded) chain — not merely whether deployment.json exists. The published
# address survives in the persistent $SHARED_DIR volume independently of the
# chain state volume, so checking the file alone is unsafe: after a fresh chain
# volume but a stale deployment.json, the file would lie. `cast code` is the
# source of truth (Foundry is installed for anvil anyway).
NEEDS_DEPLOY=1
if [ -f "$SHARED_DIR/deployment.json" ]; then
  ADDR=$(grep -o '0x[0-9a-fA-F]\{40\}' "$SHARED_DIR/deployment.json" | head -1)
  if [ -n "$ADDR" ]; then
    CODE=$(cast code "$ADDR" --rpc-url "$RPC" 2>/dev/null || echo "0x")
    if [ "$CODE" != "0x" ] && [ -n "$CODE" ]; then
      NEEDS_DEPLOY=0
    fi
  fi
fi

if [ "$NEEDS_DEPLOY" = "0" ]; then
  echo "[chain] persisted chain reloaded — contract live at $ADDR:"
  echo "        $(tr -d '\n' < "$SHARED_DIR/deployment.json")"
else
  echo "[chain] fresh chain (no contract code on-chain) — deploying NFTmarketNFT..."
  npx hardhat run scripts/deploy.js --network localhost

  echo "[chain] registering minter..."
  npx hardhat run scripts/setup-minter.js --network localhost

  cp deployment.json "$SHARED_DIR/deployment.json"
  echo "[chain] published $(tr -d '\n' < deployment.json) -> $SHARED_DIR/deployment.json"
fi

echo "[chain] ready — anvil running in foreground."
wait "$ANVIL_PID"
