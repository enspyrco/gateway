# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Backend Overview

Express.js API handling watermarking, encryption, IPFS uploads, and blockchain interactions for the NFTmarket platform. See the root `CLAUDE.md` for full project architecture.

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Development with nodemon
npm start                # Production
npm test                 # Run all Jest tests (mocked)
npm test -- --testPathPattern=marketplace  # Run tests matching pattern
npm test -- test/services/blockchain.test.js  # Run single test file
npm run test:integration # Run integration tests against local Anvil
```

### Development Scripts

```bash
./start-dev.sh              # Full mock mode (no external services)
./start-local-blockchain.sh # Real Hardhat blockchain, mock other services
```

## Code Structure

```
src/
├── index.js           # Express app, route registration, middleware
├── middleware/
│   └── auth.js        # SIWE authentication, mock signature support
├── routes/
│   ├── mint.js        # /api/mint - upload, watermark, encrypt, mint
│   ├── marketplace.js # /api/marketplace - list, buy, delist
│   ├── generate.js    # /api/generate - AI image generation
│   ├── detect.js      # /api/detect - watermark detection
│   └── verify.js      # /api/verify - token verification
└── services/
    ├── blockchain.js     # Ethers.js contract calls, mock mode
    ├── watermark.js      # C++ binary interface, mock mode
    ├── encryption.js     # AES-256, Cloud KMS or dev key
    ├── ipfs.js           # Pinata uploads, mock mode
    ├── firestore.js      # Token metadata storage, mock mode
    ├── duplicate.js      # SHA-256 + perceptual hash checking
    └── ai-generation.js  # Stability AI integration, mock mode

test/
├── setup.js           # Sets mock environment variables
├── services/
│   ├── blockchain.test.js   # 15 tests for blockchain service
│   └── marketplace.test.js  # 18 tests for marketplace functions
└── routes/
    └── mint.test.js         # 16 integration tests for mint API
```

## Mock Mode

All external services support mock mode via environment variables:

| Variable | Effect |
|----------|--------|
| `USE_MOCK_BLOCKCHAIN=true` | In-memory token/listing storage |
| `USE_MOCK_IPFS=true` | In-memory storage, fake CIDs |
| `USE_MOCK_FIRESTORE=true` | In-memory Maps |
| `USE_MOCK_WATERMARK=true` | Return image unchanged |
| `USE_MOCK_AI=true` | Return placeholder images instead of Stability AI |
| `USE_KMS=false` | Use `DEV_ENCRYPTION_KEY` instead of Cloud KMS |

Mock blockchain service in `blockchain.js` includes: `resetMock()` and `getMockTokens()` for test utilities.

## Authentication

SIWE (Sign-In with Ethereum) via Bearer token. Token is base64-encoded JSON:
```json
{"message": "...", "signature": "0x..."}
```

In dev mode (`NODE_ENV=development`), mock signatures are accepted for testing without real wallet signing.

## Key Patterns

- Routes delegate to services; business logic lives in `services/`
- All async errors propagate to Express error handler
- Mock mode checks happen at service level: `if (USE_MOCK) { ... }`
- Token IDs stored as numbers internally; convert with `Number(tokenId)` when querying

## Integration Tests

Integration tests for `NFTLicensingSystem` contract run against a local Anvil node:

```bash
# Terminal 1: Start Anvil
cd contracts && anvil

# Terminal 2: Deploy contract
cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Terminal 3: Run tests (set contract address from deployment output)
cd backend
NFT_LICENSING_ADDRESS=0x... npm run test:integration
```

Tests cover: artwork creation, license minting, marketplace (list/offer/accept), and pause mechanism.
