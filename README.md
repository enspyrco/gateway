# NFTmarket

AI art marketplace with verifiable provenance, watermark-based authentication, and clear copyright licensing.

## Problem

- **NFTs don't convey ownership** - buying an NFT doesn't transfer copyright or usage rights
- **AI art has no provenance** - anyone can generate similar images, no way to prove who created first
- **Stolen art is rampant** - images are re-minted without consequences

## Solution

Combine invisible watermarking + NFT minting + legal licensing into a single transaction.

```
Artist uploads image
       ↓
Watermark embedded (unique ID)
       ↓
Image encrypted (original preserved)
       ↓
NFT minted with license terms
       ↓
Listed on marketplace
       ↓
Buyer purchases → gets NFT + clear legal rights
       ↓
Anyone can verify authenticity via watermark detection
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     NFTmarket Platform                       │
├─────────────────────────────────────────────────────────────┤
│  Flutter Web    │    Node.js API    │    Watermark Engine   │
│   (Frontend)    │     (Backend)     │        (C++)          │
├─────────────────────────────────────────────────────────────┤
│     Polygon     │    Cloud KMS      │         IPFS          │
│   Blockchain    │     (Keys)        │   (Encrypted Blobs)   │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
NFTmarket/
├── backend/          # Node.js Express API
│   └── src/
│       ├── routes/       # mint, detect, verify endpoints
│       ├── services/     # watermark, encryption, IPFS, blockchain
│       └── middleware/   # SIWE authentication
├── contracts/        # Solidity smart contracts
│   ├── NFTmarketNFT.sol  # ERC-721 with marketplace
│   ├── scripts/          # Deployment scripts
│   └── test/             # Contract tests
└── flutter/          # Flutter web frontend
    └── lib/
        ├── pages/        # home, mint, gallery, verify, token detail
        ├── providers/    # wallet, mint state management
        └── services/     # API client
```

## Features

### License Types

| Type | Rights | Price |
|------|--------|-------|
| Display | Personal display, resale of NFT | $1 |
| Commercial | Monetization, merchandise, derivatives | $5 |
| Transfer | Full copyright transfer | $10 |

### Smart Contract

- ERC-721 with integrated marketplace
- 2.5% royalty to creator on secondary sales (EIP-2981)
- 2.5% platform fee
- Duplicate prevention via image hash

### Security

- Invisible DFT-based watermarking (survives print-and-scan)
- AES-256 encryption of originals
- Google Cloud KMS for key management
- Sign-In with Ethereum (SIWE) authentication

## Setup

### Prerequisites

- Node.js 18+
- Flutter 3.0+
- Polygon wallet funded with MATIC

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Configure environment variables
npm run dev
```

Required environment variables (see `backend/.env.example`):
- Firebase Admin SDK credentials
- Google Cloud KMS configuration
- Pinata API keys
- Contract addresses

### Smart Contracts

```bash
cd contracts
npm install
cp .env.example .env
# Configure private key and RPC URLs

npm run compile
npm test
npm run deploy:mumbai  # Testnet
```

Required environment variables (see `contracts/.env.example`):
- Private key for deployment
- RPC URLs for Polygon networks
- Polygonscan API key for verification

### Flutter App

```bash
cd flutter
flutter pub get
flutter run -d chrome
```

## Development

### Running Tests

```bash
# Flutter
cd flutter && flutter test

# Backend
cd backend && npm test

# Contracts
cd contracts && npm test
```

### CI/CD

GitHub Actions runs on push/PR to `main` and `develop`:
- Flutter: format, analyze, test
- Backend: npm test
- Contracts: compile, test

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/verify/:tokenId` | Get token verification info |
| POST | `/api/detect` | Run watermark detection |

### Authenticated

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/mint` | Watermark + encrypt + mint NFT |
| GET | `/api/mint/price` | Get minting prices |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Flutter Web |
| Backend | Node.js, Express |
| Blockchain | Polygon (ERC-721) |
| Wallet | WalletConnect, MetaMask |
| Storage | IPFS (Pinata), Firestore |
| Key Management | Google Cloud KMS |
| Auth | Sign-In with Ethereum (SIWE) |

## License

MIT
