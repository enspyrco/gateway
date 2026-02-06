#!/bin/bash
# Stop all NFTmarket services
# Usage: ./stop-services.sh

echo "=== Stopping NFTmarket Services ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Stop backend (by pattern and by port)
pkill -9 -f "nodemon.*backend" 2>/dev/null
pkill -9 -f "node.*backend/src" 2>/dev/null
if lsof -ti:3000 > /dev/null 2>&1; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null
  echo -e "${RED}Stopped${NC} Backend (port 3000)"
else
  echo "Backend was not running"
fi

# Stop wallet service (by pattern and by port)
pkill -9 -f "nodemon.*wallet-service" 2>/dev/null
pkill -9 -f "node.*wallet-service/src" 2>/dev/null
if lsof -ti:3001 > /dev/null 2>&1; then
  lsof -ti:3001 | xargs kill -9 2>/dev/null
  echo -e "${RED}Stopped${NC} Wallet service (port 3001)"
else
  echo "Wallet service was not running"
fi

# Stop Hardhat node (by pattern and by port)
pkill -9 -f "hardhat node" 2>/dev/null
if lsof -ti:8545 > /dev/null 2>&1; then
  lsof -ti:8545 | xargs kill -9 2>/dev/null
  echo -e "${RED}Stopped${NC} Hardhat node (port 8545)"
else
  echo "Hardhat node was not running"
fi

# Give processes time to fully terminate
sleep 1

echo ""
echo -e "${GREEN}All services stopped${NC}"
