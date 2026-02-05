#!/bin/bash
# Start all NFTmarket services (except Flutter)
# Usage: ./start-services.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== NFTmarket Services Startup ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Stop any existing services first
echo -e "${YELLOW}Stopping any existing services...${NC}"
pkill -f "hardhat node" 2>/dev/null || true
pkill -f "nodemon.*wallet-service" 2>/dev/null || true
pkill -f "nodemon.*backend" 2>/dev/null || true
pkill -f "node.*wallet-service/src" 2>/dev/null || true
pkill -f "node.*backend/src" 2>/dev/null || true
sleep 2

# Clear stale mock data (blockchain is being reset, so mock data must be cleared too)
echo -e "${YELLOW}Clearing stale mock data...${NC}"
rm -rf backend/.mock-data
echo -e "  ${GREEN}Mock data cleared${NC}"

# 1. Start Hardhat node
echo -e "${YELLOW}Starting Hardhat node...${NC}"
cd contracts
npx hardhat node > /tmp/hardhat-node.log 2>&1 &
HARDHAT_PID=$!
echo "  Hardhat PID: $HARDHAT_PID"

# Wait for Hardhat to be ready
echo "  Waiting for Hardhat node..."
for i in {1..30}; do
  if curl -s -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
    echo -e "  ${GREEN}Hardhat node ready${NC}"
    break
  fi
  sleep 1
done

# 2. Deploy contract
echo -e "${YELLOW}Deploying contract...${NC}"
npx hardhat run scripts/deploy.js --network localhost 2>&1 | grep -E "(Proxy address|✅)"
echo -e "  ${GREEN}Contract deployed${NC}"

# 3. Add minter (account #0 for backend)
echo -e "${YELLOW}Adding minter...${NC}"
npx hardhat run scripts/setup-minter.js --network localhost 2>&1 | grep -v WARNING
echo -e "  ${GREEN}Minter setup complete${NC}"

cd "$SCRIPT_DIR"

# 4. Start wallet service
echo -e "${YELLOW}Starting wallet service...${NC}"
cd wallet-service
npm run dev > /tmp/wallet-service.log 2>&1 &
WALLET_PID=$!
echo "  Wallet service PID: $WALLET_PID"

# Wait for wallet service
for i in {1..15}; do
  if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}Wallet service ready (port 3001)${NC}"
    break
  fi
  sleep 1
done

cd "$SCRIPT_DIR"

# 5. Start backend
echo -e "${YELLOW}Starting backend...${NC}"
cd backend
npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend
for i in {1..15}; do
  if curl -s http://localhost:3000/api/gallery > /dev/null 2>&1; then
    echo -e "  ${GREEN}Backend ready (port 3000)${NC}"
    break
  fi
  sleep 1
done

cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}=== All services started ===${NC}"
echo ""
echo "Services running:"
echo "  - Hardhat node:    http://localhost:8545  (log: /tmp/hardhat-node.log)"
echo "  - Wallet service:  http://localhost:3001  (log: /tmp/wallet-service.log)"
echo "  - Backend:         http://localhost:3000  (log: /tmp/backend.log)"
echo ""
echo "Contract: $(cat contracts/deployment.json | grep '"address"' | cut -d'"' -f4)"
echo ""
echo "Now start Flutter:"
echo "  cd flutter && flutter run -d chrome"
echo ""
echo "To stop all services: ./stop-services.sh"
