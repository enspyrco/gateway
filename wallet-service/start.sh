#!/bin/bash
# Start the wallet service

export RPC_URL=${RPC_URL:-http://localhost:8545}
export CHAIN_ID=${CHAIN_ID:-31337}
export PORT=${PORT:-3001}

echo "Starting Wallet Service..."
echo "  RPC URL: $RPC_URL"
echo "  Chain ID: $CHAIN_ID"
echo "  Port: $PORT"

node src/index.js
