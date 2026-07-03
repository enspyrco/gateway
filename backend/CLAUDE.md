# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Backend Overview

Express.js API handling watermarking, IPFS uploads, and blockchain interactions for the NFTmarket platform. See the root `CLAUDE.md` for full project architecture.

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
│   ├── mint.js        # /api/mint - upload, watermark, mint
│   ├── marketplace.js # /api/marketplace - list, buy, delist (uses blockchain + Arweave)
│   ├── gallery.js     # /api/gallery - view tokens (uses blockchain + IPFS only)
│   ├── generate.js    # /api/generate - AI image generation
│   ├── detect.js      # /api/detect/blind - blind watermark detection (Rust blind)
│   ├── perceptual.js  # /api/perceptual - perceptual hash matching for infringement
│   ├── verify.js      # /api/verify - token verification (uses blockchain + Arweave)
│   └── license.js     # /api/license - license documents (uses blockchain + Arweave)
└── services/
    ├── blockchain.js     # Ethers.js contract calls, mock mode
    ├── watermark.js      # Cloud API or local binary for watermark embedding
    ├── ipfs.js           # Pinata uploads for watermarked images, mock mode
    ├── arweave.js        # Permanent metadata/license storage, mock mode
    ├── perceptual.js     # Perceptual hashing for infringement detection
    ├── ai-generation.js  # Stability AI integration, mock mode
    └── mock-persistence.js # Optional disk persistence for mock data
```

## Storage Architecture

| Storage | What it stores |
|---------|----------------|
| Blockchain | Token ownership, IPFS URI, Arweave URI, license type, provenance, imageHash |
| Arweave | Metadata JSON (name, description), license documents |
| IPFS | Watermarked images (public) |
| Perceptual DB | Hash signatures for infringement detection |

Routes use the correct data sources:
- `gallery.js`, `marketplace.js`, `verify.js`, `license.js` → Blockchain + Arweave
- `detect.js` → Rust blind detector (extracts wallet:tokenId from watermark)
- `perceptual.js` → In-memory perceptual hash database

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
| `USE_MOCK_WATERMARK=true` | Return image unchanged, mock blind detection |
| `USE_MOCK_AI=true` | Return placeholder images |

### Mock Persistence

Mock services can persist to `.mock-data/` directory via `mock-persistence.js`:
- Set `MOCK_PERSISTENCE=false` to disable (default in startup scripts)
- When enabled, data survives backend restarts
- JSON files for tokens, listings, IPFS content, etc.
- Use `clearAll()` to reset mock state

## Watermark Detection

The system uses **blind detection** - the C++ blind detector (`blind-detector/detect_blind3`) extracts the `wallet:tokenId` message directly from the watermarked image without needing a reference image. It normalizes the extracted coefficients before correlation — detector source lives in the private watermarking-functions submodule.

```bash
# Binary location (set via BLIND_DETECT_BINARY env var); built automatically
# in the Docker image. Local build:
cd blind-detector && g++ -O2 detect_blind3.cpp WatermarkDetection.cpp Utilities.cpp \
    -o detect_blind3 $(pkg-config --cflags --libs opencv4)
```

Endpoints:
- `POST /api/detect/blind` (auth) — decode an uploaded image
- `GET /api/detect/token/:tokenId` (public) — decode a minted token's stored image; results cached per token, decodes serialized (CPU-heavy)

Detection returns:
- `detected`: boolean
- `message`: "walletAddress:tokenId"
- `confidence`: detection confidence score (peak/RMS of weakest sequence)
- `verified`: message matches on-chain creator:tokenId (token route only)
- `token`: blockchain data if token exists (blind route only)

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

## Token ID Reservation

The mint flow uses on-chain token ID reservation to ensure the watermark ID matches the minted token ID. See `docs/reserve-token.md` for full details.

```javascript
// 1. Reserve token ID on-chain (guaranteed)
const reservation = await blockchainService.reserveTokenId();

// 2. Watermark with reserved ID
const watermarkId = `${wallet}:${reservation.tokenId}`;

// 3. Mint with reserved ID (first parameter)
await blockchainService.mint(reservation.tokenId, wallet, uri, ...);
```

The old approach of predicting token IDs via `totalSupply()` was removed - it failed on real blockchains due to concurrent mints.

## Gallery

The gallery reads from blockchain, then follows the IPFS URI to get watermarked images:

1. Blockchain → get token data including `ipfsUri`
2. IPFS → fetch watermarked image via `ipfsService.getGatewayUrl(token.ipfsUri)`

Token ownership comes from blockchain (source of truth).

## Wallet Service (Dev Mode)

A separate wallet microservice (`../wallet-service/`) handles signing in dev mode:
- Manages Hardhat test accounts (Alice, Bob, Sam, Joe, Mary)
- Signs EIP-712 typed data
- Submits transactions to blockchain
- Runs on port 3001

```bash
cd ../wallet-service && npm run dev  # Start wallet service
```

## Image URL Field Names

The API uses `imageUrl` (from blockchain IPFS URI) as the primary image field. For backwards compatibility, some endpoints also return `previewUrl`. When updating routes, ensure both fields are populated:

```javascript
const ipfsUri = tokenData.ipfsUri;
const imageUrl = ipfsUri ? ipfsService.getGatewayUrl(ipfsUri) : null;
res.json({
  imageUrl,
  previewUrl: imageUrl, // backwards compatibility
});
```

## Blockchain Persistence (Local Dev)

Hardhat node resets on restart. For persistent local blockchain, use Anvil:

```bash
cd contracts
npm run node:persistent  # Uses Anvil with state file
```

State saves to `.anvil-state.json` on graceful shutdown (Ctrl+C).

## E2E Simulation Tests

The simulation test suite randomly mints, lists, and buys tokens across 5 test wallets, then verifies blockchain state matches expectations.

```bash
# Run 10 simulation tests (restarts blockchain between each)
./test/e2e/run-simulation-suite.sh

# Run single simulation
node test/e2e/marketplace-simulation.js
```

Test flow:
1. Phase 1: Mint tokens (1-2 per wallet)
2. Phase 2: List some tokens with random license types
3. Phase 3: Buy all listings
4. Phase 4: Second round of list/buy
5. Verification: Compare expected state to actual blockchain/API state

Success criteria:
- **Perfect run**: All operations succeed + verification passes
- **Verification passed**: Some operations may fail (network hiccups) but final state is correct

## Graceful Shutdown

Backend and wallet service handle SIGTERM/SIGINT for clean port release:
- Keep-alive timeout: 65 seconds
- Shutdown timeout: 5 seconds max wait
- Critical for test suite which restarts services between runs

## Common Issues

1. **401 on public endpoints**: Check route ordering in `index.js` - specific routes must come before `/:tokenId`
2. **Contract address mismatch**: Backend loads from `deployment.json`, ensure it matches Hardhat deployment
3. **Gallery empty after redeploy**: Contract was redeployed - need to mint new tokens
4. **Port 3000 in use**: `lsof -ti:3000 | xargs kill -9`
5. **Broken images**: Ensure route returns `imageUrl` from blockchain's `ipfsUri` field
6. **Watermark API failing**: Set `USE_MOCK_WATERMARK=true` in start script if cloud API unavailable
7. **Nonce errors in tests**: Occasional "nonce too low" errors occur but don't affect verification - the retry logic handles most cases
8. **IPFS CORS errors**: Images must be proxied through backend (`/ipfs/:hash`) not direct Pinata gateway URLs
