# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NFTmarket is an AI art marketplace that combines invisible watermarking, NFT minting on Polygon, and legal licensing. The platform solves the problem of NFT ownership not conveying actual copyright by embedding watermarks and attaching explicit license agreements to each mint.

## Architecture

Three independent components that communicate via API and blockchain:

```
Flutter Web App  →  Node.js Backend  →  Polygon Blockchain
     ↓                    ↓                    ↓
  WalletConnect      Watermark C++        ERC-721 Contract
                     IPFS (Pinata)        (NFTmarketNFT.sol)
                     Cloud KMS
                     Firestore
```

**Mint Flow**: Upload → Duplicate check → Watermark embed → Encrypt original → Upload to IPFS → Mint NFT → Store metadata in Firestore

**Generate Flow**: Enter prompt → Select style → Generate 4 images via Stability AI → Select favorite → Mint as NFT

**License Types**: Display (personal use, $1), Commercial (monetization rights, $5), Transfer (full copyright, $10)

## Project Structure

```
flutter/lib/
├── main.dart           # App entry, providers setup
├── router.dart         # GoRouter configuration
├── theme.dart          # Light/dark theme definitions
├── models/             # Data models (Token)
├── pages/              # Screen widgets
├── providers/          # State management (Provider)
├── services/           # API communication
└── widgets/            # Reusable components

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

### Backend (Node.js/Express)
```bash
cd backend
npm install
npm run dev          # Development with nodemon
npm start            # Production
npm test             # Run all Jest tests
npm test -- --testPathPattern=auth  # Run tests matching pattern
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
- ERC-721 with ERC-2981 royalties (2.5% to creator on secondary sales)
- 2.5% platform fee on marketplace sales
- Duplicate prevention via `imageHashExists` mapping
- Integrated marketplace: `list(tokenId, price)`, `delist(tokenId)`, `buy(tokenId)`
- Auto-delists tokens on external transfers
- `getListing(tokenId)` returns seller, price, active status

### Marketplace API (backend/src/routes/marketplace.js)
- `GET /api/marketplace` - List all active listings (public)
- `GET /api/marketplace/:tokenId` - Get listing details
- `POST /api/marketplace/list` - List token for sale (auth required)
- `POST /api/marketplace/buy` - Buy listed token (auth required)
- `POST /api/marketplace/delist` - Remove listing (auth required)

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
- `duplicate.js`: SHA-256 hash + perceptual hash checking
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
- `USE_MOCK_FIRESTORE=true` - In-memory Maps
- `USE_MOCK_BLOCKCHAIN=true` - In-memory token/listing storage
- `USE_MOCK_AI=true` - Return placeholder images instead of calling Stability AI
- `USE_KMS=false` - Use `DEV_ENCRYPTION_KEY` instead of Cloud KMS

### Authentication
Uses Sign-In with Ethereum (SIWE). Client creates message, signs with wallet, sends as Bearer token (base64-encoded JSON with `message` and `signature` fields).

### Flutter State Management
- `WalletProvider`: WalletConnect session management, test account switching
- `MintProvider`: Multi-step mint flow state
- Uses `go_router` for navigation with wallet connection guards

### Test Account Switching (Dev Mode)
In debug mode, the Flutter app shows a test account picker instead of real wallet connection. Four Hardhat accounts are available for testing marketplace flows (buy/sell between users).

## Environment Configuration

Backend requires: `POLYGON_RPC_URL`, `NFTMARKET_CONTRACT_ADDRESS`, `MINTER_PRIVATE_KEY`, `PINATA_JWT`, `STABILITY_API_KEY`, Firebase credentials, and optionally `WATERMARK_API_URL`/`WATERMARK_API_KEY` or KMS config.

Contracts require: `PRIVATE_KEY`, RPC URLs for target networks, `POLYGONSCAN_API_KEY` for verification.

Both components have `.env.example` files with all required variables.

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

# Terminal 3: Start backend
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

## Important Notes

- Watermark engine is external C++ (referenced but not in this repo)
- Encrypted originals stored on IPFS, keys in Cloud KMS
- Contract uses OpenZeppelin v5.0 base contracts
- Platform wallet receives 2.5% of marketplace sales
