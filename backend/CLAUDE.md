# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Backend Overview

Express.js API handling watermarking, encryption, IPFS uploads, and blockchain interactions for the NFTmarket platform. See the root `CLAUDE.md` for full project architecture.

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Development with nodemon
npm start                # Production
npm test                 # Run unit tests (all services mocked)
npm test -- --testPathPattern=marketplace  # Run tests matching pattern
npm test -- test/services/blockchain.test.js  # Run single test file
npm run test:integration # Run integration tests against local Hardhat
npm run test:e2e         # Run E2E tests with real services (see below)
```

### Development Scripts

```bash
./start-dev.sh              # Full mock mode (no external services)
./start-local-blockchain.sh # Real Hardhat blockchain, mock other services
./start-local-real.sh       # All real services
```

### E2E Tests (Real Services)

```bash
# 1. Start Hardhat node
cd contracts && npx hardhat node

# 2. Deploy contract
npx hardhat run scripts/deploy.js --network localhost

# 3. Run E2E tests
cd backend
NFTMARKET_CONTRACT_ADDRESS=0x... RUN_E2E_TESTS=true npm run test:e2e
```

## Code Structure

```
src/
├── index.js           # Express app, route registration, public/auth middleware
├── middleware/
│   └── auth.js        # SIWE authentication, mock signature support
├── routes/
│   ├── mint.js        # /api/mint - upload, watermark, encrypt, mint
│   ├── marketplace.js # /api/marketplace - list, buy, delist (auth required)
│   ├── gallery.js     # /api/gallery - view tokens by owner, sync endpoint
│   ├── generate.js    # /api/generate - AI image generation
│   ├── detect.js      # /api/detect - watermark detection
│   ├── verify.js      # /api/verify - token verification
│   └── license.js     # /api/license - license agreement text
└── services/
    ├── blockchain.js     # Ethers.js contract calls, mock mode
    ├── watermark.js      # Cloud API or C++ binary, mock mode
    ├── encryption.js     # AES-256, Cloud KMS or dev key
    ├── ipfs.js           # Pinata uploads, mock mode
    ├── arweave.js        # Permanent metadata storage, mock mode
    ├── firestore.js      # Token metadata storage, mock mode
    ├── storage.js        # Firebase Storage for encrypted originals
    ├── ai-generation.js  # Stability AI integration, mock mode
    └── mock-persistence.js # Saves mock data to .mock-data/ directory
```

## Route Ordering

**IMPORTANT**: In `index.js`, specific routes must come BEFORE parameterized routes:

```javascript
// Public routes in index.js (before auth middleware)
app.get('/api/marketplace/eip712/domain', ...)  // Must be before /:tokenId
app.get('/api/marketplace/nonce/:address', ...) // Must be before /:tokenId
app.get('/api/marketplace/:tokenId', ...)       // Catch-all last
app.get('/api/marketplace', ...)                // List all

// Authenticated routes come after
app.use('/api/marketplace', authMiddleware, marketplaceRouter);
```

## Mock Mode

All external services support mock mode via environment variables. See `mock.md` for details.

| Variable | Effect |
|----------|--------|
| `USE_MOCK_BLOCKCHAIN=true` | In-memory token/listing storage |
| `USE_MOCK_IPFS=true` | In-memory storage, fake CIDs |
| `USE_MOCK_ARWEAVE=true` | In-memory metadata storage |
| `USE_MOCK_FIRESTORE=true` | In-memory Maps |
| `USE_MOCK_STORAGE=true` | In-memory blob storage |
| `USE_MOCK_WATERMARK=true` | Return image unchanged |
| `USE_MOCK_AI=true` | Return placeholder images |
| `USE_KMS=false` | Use `DEV_ENCRYPTION_KEY` instead of Cloud KMS |

### Mock Persistence

Mock services now persist to `.mock-data/` directory via `mock-persistence.js`:
- Data survives backend restarts
- JSON files for tokens, listings, IPFS content, etc.
- Use `clearAll()` to reset mock state

## Authentication

SIWE (Sign-In with Ethereum) via Bearer token. Token is base64-encoded JSON:
```json
{"message": "...", "signature": "0x..."}
```

In dev mode (`NODE_ENV=development`), mock signatures are accepted.

## Key Patterns

- Routes delegate to services; business logic lives in `services/`
- All async errors propagate to Express error handler
- Mock mode checks happen at service level: `if (USE_MOCK) { ... }`
- Token IDs stored as numbers internally; convert with `Number(tokenId)` when querying

## Gallery Sync

The gallery reads from Firestore, but buy transactions only update the blockchain. To sync:

```bash
curl -X POST http://localhost:3000/api/gallery/sync
```

This updates Firestore ownership to match blockchain state. Flutter calls this automatically after buy transactions.

## Wallet Service (Dev Mode)

A separate wallet microservice (`../wallet-service/`) handles signing in dev mode:
- Manages Hardhat test accounts (Alice, Bob, Sam, Joe, Mary)
- Signs EIP-712 typed data
- Submits transactions to blockchain
- Runs on port 3001

```bash
cd ../wallet-service && npm run dev  # Start wallet service
```

## Common Issues

1. **401 on public endpoints**: Check route ordering in `index.js` - specific routes must come before `/:tokenId`
2. **Contract address mismatch**: Backend loads from `deployment.json`, ensure it matches Hardhat deployment
3. **Stale gallery data**: Call `/api/gallery/sync` after blockchain transactions
4. **Port 3000 in use**: `lsof -ti:3000 | xargs kill -9`
