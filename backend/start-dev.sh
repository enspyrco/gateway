#!/bin/bash
export USE_MOCK_WATERMARK=true
export USE_MOCK_IPFS=true
export USE_MOCK_FIRESTORE=true
export USE_MOCK_BLOCKCHAIN=true
export USE_KMS=false
export MOCK_PERSISTENCE=false

# Rust blind detection binary
export BLIND_DETECT_BINARY="./blind-detector/detect_blind3"  # build: see blind-detector/README.md

npm run dev
