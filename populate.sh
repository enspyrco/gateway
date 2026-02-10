#!/bin/bash
# Populate the blockchain with test NFTs
# Usage: ./populate.sh
#
# Prerequisites:
#   - Run ./start-services.sh first
#   - Test images in ~/Desktop/photos/nfts/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check services are running
if ! curl -s http://localhost:3000/api/gallery > /dev/null 2>&1; then
  echo "Error: Backend not running. Run ./start-services.sh first."
  exit 1
fi

if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo "Error: Wallet service not running. Run ./start-services.sh first."
  exit 1
fi

# Run populate script from backend directory (has ethers installed)
cd backend
node ../populate.js
