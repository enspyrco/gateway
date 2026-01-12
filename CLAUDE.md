# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tindart is an AI art marketplace that combines invisible watermarking, NFT minting on Polygon, and legal licensing. The platform solves the problem of NFT ownership not conveying actual copyright by embedding watermarks and attaching explicit license agreements to each mint.

## Architecture

Three independent components that communicate via API and blockchain:

```
Flutter Web App  →  Node.js Backend  →  Polygon Blockchain
     ↓                    ↓                    ↓
  WalletConnect      Watermark C++        ERC-721 Contract
                     IPFS (Pinata)        (TindartNFT.sol)
                     Cloud KMS
                     Firestore
```

**Mint Flow**: Upload → Duplicate check → Watermark embed → Encrypt original → Upload to IPFS → Mint NFT → Store metadata in Firestore

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
├── TindartNFT.sol      # Main ERC-721 contract
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
npm test             # Jest tests
```

### Smart Contracts (Hardhat/Solidity)
```bash
cd contracts
npm install
npm run compile                    # Compile contracts
npm test                           # Run all tests
npx hardhat test test/TindartNFT.test.js  # Single test file
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

### Smart Contract (contracts/TindartNFT.sol)
- ERC-721 with ERC-2981 royalties (2.5% to creator on secondary sales)
- 2.5% platform fee on marketplace sales
- Duplicate prevention via `imageHashExists` mapping
- Integrated marketplace: `list()`, `delist()`, `buy()`
- Auto-delists tokens on external transfers

### Backend Services (backend/src/services/)
- `watermark.js`: Interfaces with external C++ binaries (`WATERMARK_BINARY` env var)
- `encryption.js`: AES-256 encryption, supports Google Cloud KMS or dev key
- `ipfs.js`: Pinata uploads for encrypted blobs and metadata
- `blockchain.js`: Ethers.js contract interactions with server-side minting wallet
- `duplicate.js`: SHA-256 hash + perceptual hash checking

### Authentication
Uses Sign-In with Ethereum (SIWE). Client creates message, signs with wallet, sends as Bearer token (base64-encoded JSON with `message` and `signature` fields).

### Flutter State Management
- `WalletProvider`: WalletConnect session management
- `MintProvider`: Multi-step mint flow state
- Uses `go_router` for navigation with wallet connection guards

## Environment Configuration

Backend requires: `POLYGON_RPC_URL`, `TINDART_CONTRACT_ADDRESS`, `MINTER_PRIVATE_KEY`, `PINATA_JWT`, Firebase credentials, and optionally KMS config.

Contracts require: `PRIVATE_KEY`, RPC URLs for target networks, `POLYGONSCAN_API_KEY` for verification.

Both components have `.env.example` files with all required variables.

## File Conventions

- Flutter: Standard Flutter/Dart conventions, flutter_lints
- Backend: CommonJS modules, camelCase
- Contracts: Solidity style guide, custom errors over require strings

## Important Notes

- Watermark engine is external C++ (referenced but not in this repo)
- Encrypted originals stored on IPFS, keys in Cloud KMS
- Contract uses OpenZeppelin v5.0 base contracts
- Platform wallet receives 2.5% of marketplace sales
