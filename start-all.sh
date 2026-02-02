#!/bin/bash
# Start all NFTmarket services for local development
#
# This script starts:
# 1. Hardhat node (local blockchain)
# 2. Deploys the contract
# 3. Wallet service (port 3001)
# 4. Backend API (port 3000)
# 5. Flutter web app
#
# Prerequisites:
# - Node.js and npm installed
# - Flutter installed
# - All dependencies installed (run npm install in each directory)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Track PIDs for cleanup
PIDS=()

cleanup() {
    log_info "Shutting down services..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    log_info "Done."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if a port is in use
port_in_use() {
    lsof -i ":$1" >/dev/null 2>&1
}

# Wait for a port to be ready
wait_for_port() {
    local port=$1
    local timeout=${2:-30}
    local count=0
    while ! nc -z localhost "$port" 2>/dev/null; do
        if [ $count -ge $timeout ]; then
            log_error "Timeout waiting for port $port"
            return 1
        fi
        sleep 1
        count=$((count + 1))
    done
    return 0
}

# 1. Start Hardhat node
log_info "Starting Hardhat node..."
if port_in_use 8545; then
    log_warn "Port 8545 already in use, assuming Hardhat is running"
else
    cd "$PROJECT_ROOT/contracts"
    npx hardhat node &
    PIDS+=($!)
    wait_for_port 8545 30
    log_success "Hardhat node started on port 8545"
fi

# 2. Deploy contract
log_info "Deploying contract..."
cd "$PROJECT_ROOT/contracts"
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy.js --network localhost 2>&1)
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[a-fA-F0-9]{40}' | head -1)

if [ -z "$CONTRACT_ADDRESS" ]; then
    log_error "Failed to extract contract address from deployment output"
    log_error "Output was: $DEPLOY_OUTPUT"
    cleanup
fi

log_success "Contract deployed at: $CONTRACT_ADDRESS"
export NFTMARKET_CONTRACT_ADDRESS="$CONTRACT_ADDRESS"

# 3. Start wallet service
log_info "Starting wallet service..."
if port_in_use 3001; then
    log_warn "Port 3001 already in use, assuming wallet service is running"
else
    cd "$PROJECT_ROOT/wallet-service"
    npm install --silent 2>/dev/null
    RPC_URL=http://localhost:8545 CHAIN_ID=31337 PORT=3001 node src/index.js &
    PIDS+=($!)
    wait_for_port 3001 10
    log_success "Wallet service started on port 3001"
fi

# 4. Start backend
log_info "Starting backend..."
if port_in_use 3000; then
    log_warn "Port 3000 already in use, assuming backend is running"
else
    cd "$PROJECT_ROOT/backend"
    ./start-local-blockchain.sh &
    PIDS+=($!)
    wait_for_port 3000 10
    log_success "Backend started on port 3000"
fi

# 5. Start Flutter
log_info "Starting Flutter web app..."
cd "$PROJECT_ROOT/flutter"
flutter run -d chrome &
PIDS+=($!)

log_success "All services started!"
log_info ""
log_info "Services running:"
log_info "  - Hardhat node: http://localhost:8545"
log_info "  - Wallet service: http://localhost:3001"
log_info "  - Backend API: http://localhost:3000"
log_info "  - Contract: $CONTRACT_ADDRESS"
log_info ""
log_info "Press Ctrl+C to stop all services"

# Wait for all background processes
wait
