# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NFTmarket is an AI art marketplace that combines invisible watermarking, NFT minting on Polygon, and legal licensing. The platform solves the problem of NFT ownership not conveying actual copyright by embedding watermarks and attaching explicit license agreements to each mint.

## Architecture

Four independent components that communicate via API and blockchain:

```
Flutter Web App  →  Wallet Service  →  Polygon Blockchain
     ↓                    ↓                    ↓
  (no keys)         Private Keys         ERC-721 Contract
                    Sign & Submit        (NFTmarketNFT.sol)
     ↓
Node.js Backend
     ↓
Watermark C++
IPFS (Pinata)
Cloud KMS
Firestore
```

**Mint Flow**: Upload → Duplicate check → Watermark embed → Encrypt original → Upload to IPFS → Mint NFT → Store metadata in Firestore

**Generate Flow**: Enter prompt → Select style → Generate 4 images via Stability AI → Select favorite → Mint as NFT

**License Types** (hierarchical - can't sell more rights than you have):
- Display (personal use) - buyer gets NFT + display rights, seller keeps copyright
- Commercial (monetization) - buyer gets NFT + commercial usage, seller keeps copyright
- Transfer (full copyright) - buyer gets NFT + copyright, seller retains display rights only

## Project Structure

```
flutter/lib/
├── main.dart           # App entry, providers setup
├── router.dart         # GoRouter configuration
├── theme.dart          # Light/dark theme definitions
├── models/             # Data models (Token)
├── pages/              # Screen widgets
├── providers/          # State management (Provider)
├── services/           # API + wallet service communication
└── widgets/            # Reusable components

wallet-service/src/     # Wallet microservice (port 3001)
├── index.js            # Express app entry
├── config/             # Hardhat test accounts
├── middleware/         # Session validation
├── routes/             # API endpoints
└── services/           # Signing, transactions

backend/src/
├── index.js            # Express app setup
├── middleware/         # Auth, validation
├── routes/             # API endpoints
└── services/           # Business logic

contracts/
├── NFTmarketNFT.sol    # Main ERC-721 contract
├── scripts/            # Deployment scripts
└── test/               # Contract tests
```

## Commands

### Wallet Service (Node.js/Express)
```bash
cd wallet-service
npm install
npm run dev          # Development with nodemon (port 3001)
npm start            # Production
./start.sh           # Start with default env vars
```

### Backend (Node.js/Express)
```bash
cd backend
npm install
npm run dev          # Development with nodemon
npm start            # Production
npm test             # Run all Jest tests
npm test -- --testPathPattern=auth  # Run tests matching pattern

# Integration tests (require Hardhat node + deployed contract)
NFTMARKET_CONTRACT_ADDRESS=0x... RUN_INTEGRATION_TESTS=true npx jest test/integration/marketplace-flow.integration.test.js --runInBand
```

### Smart Contracts (Hardhat/Solidity)
```bash
cd contracts
npm install
npm run compile                    # Compile contracts
npm test                           # Run all tests
npx hardhat test test/NFTmarketNFT.test.js  # Single test file
npm run node                       # Start local Hardhat node
npm run deploy:local               # Deploy to local node
npm run deploy:mumbai              # Deploy to Polygon Mumbai testnet
npm run deploy:polygon             # Deploy to Polygon mainnet
```

### Flutter App
```bash
cd flutter
flutter pub get
flutter run -d chrome              # Run in Chrome
flutter test                       # Run tests
flutter analyze                    # Static analysis
dart format .                      # Format code
flutter build web                  # Build for production
```

## Key Technical Details

### Smart Contract (contracts/NFTmarketNFT.sol)
- ERC-721 with integrated marketplace and EIP-712 bilateral signatures
- 2.5% platform fee on marketplace sales
- Duplicate prevention via `imageHashExists` mapping
- License hierarchy: Display (0) < Commercial (1) < Transfer (2)
- Cannot sell more rights than you have (no rights escalation)
- Transfer sales: buyer gets copyright, seller retains display rights
- Auto-delists tokens on external transfers

Key functions:
- `list(tokenId, price, licenseType, licenseHash, expiry, signature)` - List with seller's EIP-712 signature
- `buy(tokenId, signature)` - Buy with buyer's EIP-712 signature + payment
- `delist(tokenId)` - Remove listing
- `checkDisplayRights(tokenId, address)` / `checkCommercialRights` / `checkCopyrightOwnership` - Rights queries

### Marketplace API (backend/src/routes/marketplace.js)

**Read operations** (public):
- `GET /api/marketplace` - List all active listings
- `GET /api/marketplace/:tokenId` - Get listing details
- `GET /api/marketplace/nonce/:address` - Get nonce for EIP-712 signing
- `GET /api/marketplace/eip712/domain` - Get EIP-712 domain

**Write operations** require wallet signatures - API provides typed data to sign:
- `POST /api/marketplace/list/typed-data` - Get EIP-712 data for listing (auth required)
- `POST /api/marketplace/buy/typed-data` - Get EIP-712 data for buying (auth required)

Client flow: Get typed data from API → Sign with wallet → Call contract directly

### AI Generation API (backend/src/routes/generate.js)
- `GET /api/generate/styles` - Get available style presets (public)
- `POST /api/generate` - Generate images from prompt (auth required)
- `GET /api/generate/:id` - Get generation details
- `GET /api/generate/:id/image/:index` - Retrieve generated image

### Backend Services (backend/src/services/)
- `watermark.js`: Cloud API or local C++ binary for invisible watermarking
- `encryption.js`: AES-256 encryption, supports Google Cloud KMS or dev key
- `ipfs.js`: Pinata uploads for encrypted blobs and metadata
- `blockchain.js`: Ethers.js contract interactions, marketplace functions, mock mode support
- `ai-generation.js`: Stability AI integration for image generation, 10 style presets

### Watermark Service (backend/src/services/watermark.js)
- Supports cloud API via `WATERMARK_API_URL` and `WATERMARK_API_KEY` environment variables
- Falls back to local C++ binary (`WATERMARK_BINARY` env var) if API not configured
- Mock mode available via `USE_MOCK_WATERMARK=true`

### Watermark Cloud API (WATERMARK_API_URL)
- `POST /watermark`: multipart/form-data with `image` (file), `message`, `strength` fields
- Returns SSE stream with progress updates, then `downloadUrl`
- `GET /download/{jobId}`: Download watermarked image (available 5 minutes)
- Header: `X-API-Key` required

### Rate Limiting
- AI generation endpoint: 10 requests per hour per wallet (Stability AI is expensive)
- Stored generations have 1-hour TTL with automatic cleanup every 10 minutes

### Mock Mode Environment Variables
All services support mock mode for testing without external dependencies:
- `USE_MOCK_WATERMARK=true` - Skip C++ binary, return PNG as-is
- `USE_MOCK_IPFS=true` - In-memory storage with fake hashes
- `USE_MOCK_ARWEAVE=true` - In-memory storage for metadata
- `USE_MOCK_FIRESTORE=true` - In-memory Maps (document database)
- `USE_MOCK_STORAGE=true` - In-memory blob storage (Firebase Storage)
- `USE_MOCK_BLOCKCHAIN=true` - In-memory token/listing storage
- `USE_MOCK_AI=true` - Return placeholder images instead of calling Stability AI
- `USE_KMS=false` - Use `DEV_ENCRYPTION_KEY` instead of Cloud KMS

See `backend/mock.md` for detailed mock service documentation.

### Authentication
Uses Sign-In with Ethereum (SIWE). Client creates message, signs with wallet, sends as Bearer token (base64-encoded JSON with `message` and `signature` fields).

### Flutter State Management
- `WalletProvider`: WalletConnect session management, test account switching
- `MintProvider`: Multi-step mint flow state
- Uses `go_router` for navigation with wallet connection guards

### Test Accounts (Dev Mode)
In debug mode, the Flutter app shows a test account picker instead of real wallet connection. Five named test accounts for marketplace testing:

| Nickname | Hardhat Account | Address |
|----------|-----------------|---------|
| Alice | #2 | `0x3C44...93BC` |
| Bob | #3 | `0x90F7...3906` |
| Sam | #4 | `0x15d3...6A65` |
| Joe | #5 | `0x9965...A4dc` |
| Mary | #6 | `0x976E...0aa9` |
| Platform | #1 | `0x7099...F5Ee` (fee collection) |

Fee simulation in Flutter tracks: subscription (0.01 ETH/month), mint (0.001 ETH), AI generation (0.0005 ETH).

## Environment Configuration

Wallet Service requires: `RPC_URL` (default: localhost:8545), `CHAIN_ID` (default: 31337), `PORT` (default: 3001).

Backend requires: `POLYGON_RPC_URL`, `NFTMARKET_CONTRACT_ADDRESS`, `MINTER_PRIVATE_KEY`, `PINATA_JWT`, `STABILITY_API_KEY`, Firebase credentials, and optionally `WATERMARK_API_URL`/`WATERMARK_API_KEY` or KMS config.

Contracts require: `PRIVATE_KEY`, RPC URLs for target networks, `POLYGONSCAN_API_KEY` for verification.

All components have `.env.example` files with required variables.

### Quick Start (Local Development)

**Option 1: All-in-one script**
```bash
./start-all.sh   # Starts Hardhat, deploys contract, wallet service, backend, Flutter
```

**Option 2: Manual startup**
```bash
# Terminal 1: Start Hardhat node
cd contracts && npx hardhat node

# Terminal 2: Deploy contract
cd contracts && npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Start wallet service
cd wallet-service && npm run dev

# Terminal 4: Start backend
cd backend && npm run dev

# Terminal 5: Start Flutter
cd flutter && flutter run -d chrome
```

### Quick Start (Local Development)

```bash
# Terminal 1: Start Hardhat node
cd contracts && npx hardhat node

# Terminal 2: Deploy contract
cd contracts && npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Start backend
cd backend && npm run dev

# Terminal 4: Start Flutter
cd flutter && flutter run -d chrome
```

### Local Development Mode

**Full Mock Mode** (no external services):
```bash
cd backend && ./start-dev.sh
```
This enables: `USE_MOCK_WATERMARK`, `USE_MOCK_IPFS`, `USE_MOCK_FIRESTORE`, `USE_MOCK_BLOCKCHAIN`, `USE_KMS=false`

**Local Blockchain Mode** (real contract, mock services):
```bash
# Terminal 1: Start Hardhat node
cd contracts && npx hardhat node

# Terminal 2: Deploy contract
npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Start wallet service
cd wallet-service && npm run dev

# Terminal 4: Start backend
cd backend && ./start-local-blockchain.sh
```

Generate a dev encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## File Conventions

- Flutter: Standard Flutter/Dart conventions, flutter_lints
- Backend: CommonJS modules, camelCase
- Contracts: Solidity style guide, custom errors over require strings

## CI/CD

GitHub Actions runs on push/PR to `main` and `develop`. Only runs checks for changed components (flutter, backend, or contracts). Non-code changes (docs, config) can merge without CI.

## Storage Architecture

| Storage | Type | What it Stores |
|---------|------|----------------|
| Firestore | Document DB | Token metadata, user data, AI generations |
| Firebase Storage | Blob storage | Encrypted originals, watermarked backups |
| IPFS (Pinata) | Decentralized | Preview images (public) |
| Arweave | Permanent | NFT metadata JSON |
| Blockchain | On-chain | Token ownership, marketplace listings |

## Important Notes

- **Wallet Service**: Separate microservice handles all private key management and signing. Flutter never has direct access to private keys.
- Watermark engine is external C++ (referenced but not in this repo)
- Encrypted originals stored in Firebase Storage, keys in Cloud KMS
- Watermarked images backed up to Firebase Storage (in case IPFS fails)
- Contract uses OpenZeppelin v5.0 base contracts
- Platform wallet receives 2.5% of marketplace sales
- Marketplace uses bilateral EIP-712 signatures (both buyer and seller sign the same license agreement)
- Third-party marketplaces can trade NFTs via standard ERC-721 or use the integrated marketplace (see `talk/buy-and-sell.md`)
