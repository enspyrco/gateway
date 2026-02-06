#!/bin/bash
# Smoke test for NFTmarket services
# Run after start-services.sh to verify everything works
# Usage: ./smoke-test.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"

echo "=== NFTmarket Smoke Test ==="
echo ""

ERRORS=0

# Test 1: Hardhat node
echo -n "1. Hardhat node responding... "
if curl -s -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | grep -q "result"; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  ERRORS=$((ERRORS + 1))
fi

# Test 2: Wallet service
echo -n "2. Wallet service healthy... "
if curl -s http://localhost:3001/health | grep -q '"status":"ok"'; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  ERRORS=$((ERRORS + 1))
fi

# Test 3: Backend service
echo -n "3. Backend service healthy... "
if curl -s http://localhost:3000/api/gallery | grep -q "galleries"; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  ERRORS=$((ERRORS + 1))
fi

# Test 4: Contract deployed
echo -n "4. Contract deployed... "
CONTRACT_ADDRESS=$(cat contracts/deployment.json 2>/dev/null | grep '"address"' | cut -d'"' -f4)
if [ -n "$CONTRACT_ADDRESS" ]; then
  echo -e "$PASS ($CONTRACT_ADDRESS)"
else
  echo -e "$FAIL"
  ERRORS=$((ERRORS + 1))
fi

# Test 5: Minter registered
echo -n "5. Minter registered on contract... "
cd contracts
MINTER_CHECK=$(npx hardhat run scripts/check-minter.js --network localhost 2>&1)
cd "$SCRIPT_DIR"

if echo "$MINTER_CHECK" | grep -q "MINTER_OK"; then
  echo -e "$PASS"
else
  echo -e "$FAIL (minter not registered!)"
  ERRORS=$((ERRORS + 1))
fi

# Test 6: Can reserve token ID
echo -n "6. Can reserve token ID... "
cd contracts
RESERVE_CHECK=$(npx hardhat run scripts/check-reserve.js --network localhost 2>&1)
cd "$SCRIPT_DIR"

if echo "$RESERVE_CHECK" | grep -q "RESERVE_OK"; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  echo "  Error: $(echo "$RESERVE_CHECK" | grep -v WARNING | tail -1)"
  ERRORS=$((ERRORS + 1))
fi

# Test 7: Mint endpoint accepts requests (auth tested separately)
echo -n "7. Mint endpoint responding... "
# Just verify the endpoint exists and returns proper error for unauthenticated request
MINT_RESULT=$(curl -s -X POST http://localhost:3000/api/mint 2>&1)

if echo "$MINT_RESULT" | grep -q "AUTH_FAILED\|Unauthorized\|auth\|Authentication"; then
  echo -e "$PASS (auth required - correct)"
else
  echo -e "$FAIL (unexpected response)"
  echo "  Response: $MINT_RESULT"
  ERRORS=$((ERRORS + 1))
fi

# Test 8: Gallery API returns data structure
echo -n "8. Gallery API structure correct... "
GALLERY_RESULT=$(curl -s "http://localhost:3000/api/gallery")
if echo "$GALLERY_RESULT" | grep -q '"galleries":\['; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  ERRORS=$((ERRORS + 1))
fi

# Test 9: Marketplace API returns data structure
echo -n "9. Marketplace API structure correct... "
MARKET_RESULT=$(curl -s "http://localhost:3000/api/marketplace")
if echo "$MARKET_RESULT" | grep -q '"listings":\['; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  ERRORS=$((ERRORS + 1))
fi

# Test 10: Backend mock services configured for local dev
echo -n "10. Mock services configured... "
ENV_FILE="backend/.env"
MOCK_ERRORS=""

# Check that required mock modes are enabled for local dev
if ! grep -q "USE_MOCK_WATERMARK=true" "$ENV_FILE" 2>/dev/null; then
  MOCK_ERRORS="${MOCK_ERRORS}Watermark "
fi
if ! grep -q "USE_MOCK_ARWEAVE=true" "$ENV_FILE" 2>/dev/null; then
  MOCK_ERRORS="${MOCK_ERRORS}Arweave "
fi
if ! grep -q "USE_MOCK_FIRESTORE=true" "$ENV_FILE" 2>/dev/null; then
  MOCK_ERRORS="${MOCK_ERRORS}Firestore "
fi

if [ -z "$MOCK_ERRORS" ]; then
  echo -e "$PASS"
else
  echo -e "$FAIL (missing: ${MOCK_ERRORS})"
  ERRORS=$((ERRORS + 1))
fi

# Test 11: End-to-end mint test with test account
echo -n "11. E2E mint test... "

# Step 1: Select Alice account (test account #2)
ALICE_ADDRESS="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
SELECT_RESULT=$(curl -s -X POST http://localhost:3001/api/accounts/select \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"${ALICE_ADDRESS}\"}")

SESSION_ID=$(echo "$SELECT_RESULT" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo -e "$FAIL (couldn't create session)"
  ERRORS=$((ERRORS + 1))
else
  # Step 2: Get SIWE auth token from wallet service
  TOKEN_RESULT=$(curl -s -X POST http://localhost:3001/api/auth/token \
    -H "X-Session-Id: ${SESSION_ID}" \
    -H "Content-Type: application/json")

  AUTH_TOKEN=$(echo "$TOKEN_RESULT" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$AUTH_TOKEN" ]; then
    echo -e "$FAIL (couldn't get auth token)"
    ERRORS=$((ERRORS + 1))
  else
    # Step 3: Pick a test image
    # Primary: real images from ~/Desktop/photos/nfts (for accurate watermarking tests)
    # Fallback: create minimal PNG (for CI/other developers without test images)
    TEST_IMAGES_DIR="$HOME/Desktop/photos/nfts"
    TEST_IMAGE_FILE=""
    IMAGE_NAME=""
    MIME_TYPE=""

    if [ -d "$TEST_IMAGES_DIR" ]; then
      # macOS-compatible random selection (no shuf)
      TEST_IMAGE_FILE=$(ls "$TEST_IMAGES_DIR"/*.jpg 2>/dev/null | sort -R 2>/dev/null | head -1)
      # Fallback if sort -R not available
      if [ -z "$TEST_IMAGE_FILE" ]; then
        TEST_IMAGE_FILE=$(ls "$TEST_IMAGES_DIR"/*.jpg 2>/dev/null | awk 'BEGIN{srand()} {print rand()"\t"$0}' | sort -n | cut -f2 | head -1)
      fi
      if [ -n "$TEST_IMAGE_FILE" ] && [ -f "$TEST_IMAGE_FILE" ]; then
        IMAGE_NAME=$(basename "$TEST_IMAGE_FILE" .jpg)
        MIME_TYPE="image/jpeg"
      fi
    fi

    # Fallback: create minimal PNG if no test images available
    if [ -z "$TEST_IMAGE_FILE" ] || [ ! -f "$TEST_IMAGE_FILE" ]; then
      TEST_IMAGE_FILE="/tmp/smoke-test-fallback.png"
      # Minimal 1x1 red PNG (base64 encoded)
      echo -n "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==" | base64 -d > "$TEST_IMAGE_FILE"
      IMAGE_NAME="fallback-test"
      MIME_TYPE="image/png"
    fi

    # Step 4: Call mint endpoint with multipart form-data
    MINT_RESULT=$(curl -s -X POST http://localhost:3000/api/mint \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      -F "image=@${TEST_IMAGE_FILE};type=${MIME_TYPE}" \
      -F "name=Smoke Test ${IMAGE_NAME}" \
      -F "description=Automated smoke test" 2>&1)

    # Check for success or acceptable error
    if echo "$MINT_RESULT" | grep -q '"tokenId"'; then
      TOKEN_ID=$(echo "$MINT_RESULT" | grep -o '"tokenId":[0-9]*' | cut -d':' -f2)
      echo -e "$PASS (minted token #${TOKEN_ID} from ${IMAGE_NAME}.jpg)"
    elif echo "$MINT_RESULT" | grep -q "DUPLICATE"; then
      echo -e "$PASS (duplicate ${IMAGE_NAME}.jpg - OK)"
    elif echo "$MINT_RESULT" | grep -q "error"; then
      ERROR_MSG=$(echo "$MINT_RESULT" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 | head -1)
      echo -e "$FAIL ($ERROR_MSG)"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "$FAIL"
      echo "  Response: $(echo "$MINT_RESULT" | head -c 200)"
      ERRORS=$((ERRORS + 1))
    fi
  fi
fi

echo ""
echo "================================"
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}$ERRORS test(s) failed${NC}"
  exit 1
fi
