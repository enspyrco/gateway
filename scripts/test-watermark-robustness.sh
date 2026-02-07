#!/bin/bash
#
# Watermark Robustness Test Suite
#
# Tests watermark detection survival across various image degradations.
# This helps determine which degradations the watermark can survive
# and establishes thresholds for "verified replacement" functionality.
#
# Usage: ./test-watermark-robustness.sh <source_image>
#
# Prerequisites:
#   - Rust watermark tools built: cargo build --release
#   - C++ watermark encoder available (for embedding)
#
# The script will:
#   1. Embed a test watermark (wallet + token ID) into the source image
#   2. Apply 21 different degradations using the degrade tool
#   3. Run detection on each degraded image
#   4. Generate a summary report with pass/fail status

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WATERMARK_RS="$PROJECT_ROOT/watermark-rs"
DETECT_BIN="$WATERMARK_RS/target/release/detect"
DEGRADE_BIN="$WATERMARK_RS/target/release/degrade"

# Test watermark data
TEST_WALLET="0x1234567890abcdef1234567890abcdef12345678"
TEST_TOKEN_ID="42"

# Temporary directories
TEMP_DIR="${TMPDIR:-/tmp}/watermark-test-$$"
DEGRADED_DIR="$TEMP_DIR/degraded"

# Track results
PASSED=0
FAILED=0
declare -a RESULTS

usage() {
    echo "Usage: $0 <source_image> [options]"
    echo ""
    echo "Options:"
    echo "  --wallet <address>   Wallet address for watermark (default: test address)"
    echo "  --token <id>         Token ID for watermark (default: 42)"
    echo "  --keep               Keep temporary files for inspection"
    echo "  --verbose            Show detailed output"
    echo ""
    echo "Example:"
    echo "  $0 ~/Desktop/photos/nfts/art.png"
    echo "  $0 test.png --wallet 0xabc... --token 123"
}

cleanup() {
    if [ "$KEEP_FILES" != "true" ]; then
        rm -rf "$TEMP_DIR"
    else
        echo -e "${BLUE}Keeping temp files at: $TEMP_DIR${NC}"
    fi
}

check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"

    # Build Rust tools if needed
    if [ ! -f "$DETECT_BIN" ] || [ ! -f "$DEGRADE_BIN" ]; then
        echo "Building Rust watermark tools..."
        (cd "$WATERMARK_RS" && cargo build --release)
    fi

    if [ ! -f "$DETECT_BIN" ]; then
        echo -e "${RED}Error: detect binary not found at $DETECT_BIN${NC}"
        exit 1
    fi

    if [ ! -f "$DEGRADE_BIN" ]; then
        echo -e "${RED}Error: degrade binary not found at $DEGRADE_BIN${NC}"
        exit 1
    fi

    echo -e "${GREEN}Prerequisites OK${NC}"
}

embed_watermark() {
    local source="$1"
    local output="$2"
    local wallet="$3"
    local token_id="$4"

    echo -e "${BLUE}Embedding watermark...${NC}"
    echo "  Wallet: $wallet"
    echo "  Token ID: $token_id"

    # For now, we'll use the backend API or a mock
    # In production, this would call the watermark service

    # Check if we have the C++ encoder
    if command -v watermark-encode &> /dev/null; then
        watermark-encode "$source" "$output" "$wallet" "$token_id"
    elif [ -n "$WATERMARK_API_URL" ]; then
        # Use the watermark API
        echo "  Using watermark API at $WATERMARK_API_URL"
        # This would need curl and streaming support
        echo -e "${YELLOW}API embedding not implemented in script yet${NC}"
        # For testing, just copy the image
        cp "$source" "$output"
    else
        # Mock mode: just copy the image
        # In real testing, you'd need to embed an actual watermark first
        echo -e "${YELLOW}WARNING: No watermark encoder available, using mock mode${NC}"
        echo "  (Detection tests will fail without real watermark)"
        cp "$source" "$output"
    fi

    echo -e "${GREEN}Watermark embedded: $output${NC}"
}

run_detection() {
    local image="$1"
    local name="$2"

    if [ "$VERBOSE" == "true" ]; then
        echo "  Testing: $name"
    fi

    # Run detection and capture output
    local output
    if output=$("$DETECT_BIN" "$image" 2>&1); then
        # Check if it found the expected wallet
        if echo "$output" | grep -qi "$TEST_WALLET"; then
            RESULTS+=("PASS|$name|$output")
            ((PASSED++))
            return 0
        elif echo "$output" | grep -qi "detected"; then
            # Detected something but wrong wallet
            RESULTS+=("PARTIAL|$name|Wrong wallet detected")
            ((FAILED++))
            return 1
        else
            RESULTS+=("FAIL|$name|No watermark detected")
            ((FAILED++))
            return 1
        fi
    else
        RESULTS+=("FAIL|$name|Detection error: $output")
        ((FAILED++))
        return 1
    fi
}

generate_degradations() {
    local watermarked="$1"
    local output_dir="$2"

    echo -e "${BLUE}Generating degraded images...${NC}"

    # Use the 'all' subcommand to generate all degradations at once
    "$DEGRADE_BIN" "$watermarked" "$output_dir/dummy" all "$output_dir"
}

run_tests() {
    local source_image="$1"

    # Setup
    mkdir -p "$TEMP_DIR"
    mkdir -p "$DEGRADED_DIR"
    trap cleanup EXIT

    check_prerequisites

    # Step 1: Embed watermark
    local watermarked="$TEMP_DIR/watermarked.png"
    embed_watermark "$source_image" "$watermarked" "$TEST_WALLET" "$TEST_TOKEN_ID"

    # Step 2: Test detection on original watermarked image
    echo -e "\n${BLUE}Testing original watermarked image...${NC}"
    if run_detection "$watermarked" "original"; then
        echo -e "${GREEN}  Original: PASS${NC}"
    else
        echo -e "${RED}  Original: FAIL${NC}"
        echo -e "${YELLOW}  Note: If using mock mode, detection will fail${NC}"
    fi

    # Step 3: Generate all degradations
    echo -e "\n${BLUE}Generating degraded versions...${NC}"
    generate_degradations "$watermarked" "$DEGRADED_DIR"

    # Step 4: Test each degraded image
    echo -e "\n${BLUE}Running detection on degraded images...${NC}"

    for file in "$DEGRADED_DIR"/*; do
        if [ -f "$file" ]; then
            local name=$(basename "$file")
            if run_detection "$file" "$name"; then
                echo -e "${GREEN}  $name: PASS${NC}"
            else
                echo -e "${RED}  $name: FAIL${NC}"
            fi
        fi
    done

    # Generate report
    generate_report
}

generate_report() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "               WATERMARK ROBUSTNESS TEST REPORT"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Test Configuration:"
    echo "  Wallet:   $TEST_WALLET"
    echo "  Token ID: $TEST_TOKEN_ID"
    echo ""
    echo "Results Summary:"
    echo "  Passed: $PASSED"
    echo "  Failed: $FAILED"
    local total=$((PASSED + FAILED))
    if [ $total -gt 0 ]; then
        local rate=$((PASSED * 100 / total))
        echo "  Success Rate: ${rate}%"
    fi
    echo ""
    echo "───────────────────────────────────────────────────────────────"
    echo "Detailed Results:"
    echo "───────────────────────────────────────────────────────────────"
    printf "%-30s %-10s\n" "Degradation" "Status"
    echo "───────────────────────────────────────────────────────────────"

    for result in "${RESULTS[@]}"; do
        IFS='|' read -r status name details <<< "$result"
        case $status in
            PASS)
                printf "%-30s ${GREEN}%-10s${NC}\n" "$name" "PASS"
                ;;
            PARTIAL)
                printf "%-30s ${YELLOW}%-10s${NC}\n" "$name" "PARTIAL"
                ;;
            FAIL)
                printf "%-30s ${RED}%-10s${NC}\n" "$name" "FAIL"
                ;;
        esac
        if [ "$VERBOSE" == "true" ] && [ -n "$details" ]; then
            echo "    $details"
        fi
    done

    echo "───────────────────────────────────────────────────────────────"
    echo ""

    # Interpretation
    echo "Interpretation:"
    if [ $PASSED -gt 15 ]; then
        echo -e "${GREEN}  Excellent robustness! Watermark survives most degradations.${NC}"
    elif [ $PASSED -gt 10 ]; then
        echo -e "${YELLOW}  Good robustness. Watermark handles common transformations.${NC}"
    elif [ $PASSED -gt 5 ]; then
        echo -e "${YELLOW}  Moderate robustness. May need adjustments for some use cases.${NC}"
    else
        echo -e "${RED}  Poor robustness. Watermark is fragile under transformation.${NC}"
    fi
    echo ""

    if [ "$KEEP_FILES" == "true" ]; then
        echo "Test files preserved at: $TEMP_DIR"
        echo "  - watermarked.png: Original with watermark"
        echo "  - degraded/: All degraded versions"
    fi
}

# Parse arguments
KEEP_FILES=false
VERBOSE=false

if [ $# -lt 1 ]; then
    usage
    exit 1
fi

SOURCE_IMAGE="$1"
shift

while [ $# -gt 0 ]; do
    case "$1" in
        --wallet)
            TEST_WALLET="$2"
            shift 2
            ;;
        --token)
            TEST_TOKEN_ID="$2"
            shift 2
            ;;
        --keep)
            KEEP_FILES=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate source image
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo -e "${RED}Error: Source image not found: $SOURCE_IMAGE${NC}"
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          WATERMARK ROBUSTNESS TEST SUITE                      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Source: $SOURCE_IMAGE"
echo ""

run_tests "$SOURCE_IMAGE"
