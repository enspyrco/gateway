#!/bin/bash
# Run marketplace simulation tests with fresh blockchain each time
#
# Usage: ./run-simulation-suite.sh [num_tests]
# Default: 10 tests

NUM_TESTS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTRACTS_DIR="$(cd "$PROJECT_ROOT/../contracts" && pwd)"
WALLET_SERVICE_DIR="$(cd "$PROJECT_ROOT/../wallet-service" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Results tracking
PASSED=0
FAILED=0
declare -a RESULTS

echo "========================================"
echo "NFTmarket Simulation Test Suite"
echo "========================================"
echo "Running $NUM_TESTS tests"
echo ""

cleanup() {
    # Send SIGTERM and wait for graceful shutdown
    pkill -TERM -f "hardhat node" 2>/dev/null || true
    pkill -TERM -f "nodemon.*wallet-service" 2>/dev/null || true
    pkill -TERM -f "nodemon.*src/index.js" 2>/dev/null || true
    pkill -TERM -f "node.*wallet-service" 2>/dev/null || true
    pkill -TERM -f "node.*backend" 2>/dev/null || true

    # Wait for ports to be released
    local attempts=0
    while [ $attempts -lt 10 ]; do
        if ! lsof -i :3000 -i :3001 -i :8545 >/dev/null 2>&1; then
            break
        fi
        sleep 0.5
        ((attempts++))
    done
    sleep 1
}

wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
        ((attempt++))
    done

    echo "  $name failed to start after $max_attempts seconds"
    return 1
}

start_services() {
    echo "  Starting Hardhat node..."
    cd "$CONTRACTS_DIR"
    npx hardhat node > /tmp/hardhat.log 2>&1 &
    sleep 3

    echo "  Deploying contract..."
    npx hardhat run scripts/deploy.js --network localhost > /tmp/deploy.log 2>&1
    if [ $? -ne 0 ]; then
        echo "  Contract deployment failed"
        cat /tmp/deploy.log
        return 1
    fi

    echo "  Starting wallet service..."
    cd "$WALLET_SERVICE_DIR"
    npm run dev > /tmp/wallet-service.log 2>&1 &

    echo "  Starting backend..."
    cd "$PROJECT_ROOT"
    ./start-local-blockchain.sh > /tmp/backend.log 2>&1 &

    echo "  Waiting for services..."
    if ! wait_for_service "http://localhost:3001/health" "Wallet service"; then
        return 1
    fi
    if ! wait_for_service "http://localhost:3000/health" "Backend"; then
        return 1
    fi

    echo "  All services ready"
    return 0
}

run_test() {
    local test_num=$1

    cd "$PROJECT_ROOT"
    node test/e2e/marketplace-simulation.js > /tmp/test-$test_num.log 2>&1
    local exit_code=$?

    # Show last part of output
    echo ""
    tail -25 /tmp/test-$test_num.log
    echo ""

    if [ $exit_code -eq 0 ] && grep -q "SUCCESS" /tmp/test-$test_num.log; then
        echo -e "${GREEN}Test $test_num: PASSED${NC}"
        RESULTS[$test_num]="PASSED"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}Test $test_num: FAILED${NC}"
        RESULTS[$test_num]="FAILED"
        ((FAILED++))
        return 1
    fi
}

# Trap to cleanup on exit
trap cleanup EXIT

# Initial cleanup
cleanup

# Run the tests
for i in $(seq 1 $NUM_TESTS); do
    echo ""
    echo "========================================"
    echo -e "${YELLOW}Test $i of $NUM_TESTS${NC}"
    echo "========================================"

    # Clean up previous run
    cleanup

    # Start fresh services
    if ! start_services; then
        echo -e "${RED}Failed to start services for test $i${NC}"
        RESULTS[$i]="FAILED (services)"
        ((FAILED++))
        continue
    fi

    # Run the test
    run_test $i
done

# Final cleanup
cleanup

# Print summary
echo ""
echo "========================================"
echo "Test Suite Summary"
echo "========================================"
echo ""

for i in $(seq 1 $NUM_TESTS); do
    if [ "${RESULTS[$i]}" = "PASSED" ]; then
        echo -e "  Test $i: ${GREEN}${RESULTS[$i]}${NC}"
    else
        echo -e "  Test $i: ${RED}${RESULTS[$i]}${NC}"
    fi
done

echo ""
echo "========================================"
echo -e "Passed: ${GREEN}$PASSED${NC} / $NUM_TESTS"
echo -e "Failed: ${RED}$FAILED${NC} / $NUM_TESTS"
echo "========================================"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
