#!/bin/bash
export USE_MOCK_WATERMARK=true
export USE_MOCK_IPFS=true
export USE_MOCK_FIRESTORE=true
export USE_MOCK_BLOCKCHAIN=true
export USE_KMS=false
export MOCK_PERSISTENCE=false

# Rust blind detection binary
export BLIND_DETECT_BINARY="../watermark-rs/target/release/detect"

npm run dev
