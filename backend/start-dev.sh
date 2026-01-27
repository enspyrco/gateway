#!/bin/bash
export USE_MOCK_WATERMARK=true
export USE_MOCK_IPFS=true
export USE_MOCK_FIRESTORE=true
export USE_MOCK_BLOCKCHAIN=true
export USE_KMS=false
export DEV_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

npm run dev
