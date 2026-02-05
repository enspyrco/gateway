# Backend Overview

The backend is a Node.js/Express API server that coordinates everything between the Flutter app and external services.

## Architecture

```
Flutter App
    ↓
Backend (port 3000)
    ├── Authentication (verify wallet signatures)
    ├── Minting pipeline:
    │   ├── Watermark image (embed owner:tokenId)
    │   ├── Encrypt original (AES-256)
    │   ├── Upload watermarked to IPFS (public preview)
    │   ├── Upload metadata to Arweave (permanent)
    │   ├── Store encrypted original in Firebase Storage
    │   └── Call blockchain to mint NFT
    ├── Gallery API (read tokens from blockchain)
    ├── Marketplace API (listings, buy/sell prep)
    ├── License API (generate license documents)
    └── Detect API (extract watermark, verify ownership)
    ↓
External Services:
    - Hardhat/Polygon (blockchain)
    - Pinata (IPFS - images)
    - Arweave (permanent metadata)
    - Firebase Storage (encrypted originals)
    - Cloud KMS (encryption keys)
```

## Why Not Call Blockchain Directly from Flutter?

- Minting requires server-side processing (watermarking, encryption)
- Private keys for the minter account stay on server
- Coordinates multiple services atomically
- Validates requests before expensive blockchain operations

## Key Files

| File | Purpose |
|------|---------|
| `src/index.js` | Express app setup, route registration |
| `src/middleware/auth.js` | SIWE authentication |
| `src/routes/mint.js` | Minting pipeline |
| `src/routes/gallery.js` | Token viewing |
| `src/routes/marketplace.js` | Listings, buy/sell |
| `src/routes/license.js` | License documents |
| `src/routes/detect.js` | Watermark detection |
| `src/services/blockchain.js` | Ethers.js contract calls |
| `src/services/ipfs.js` | Pinata uploads |
| `src/services/arweave.js` | Permanent metadata storage |
| `src/services/watermark.js` | Invisible watermarking |
| `src/services/encryption.js` | AES-256 encryption |

## API Endpoints

### Public (no auth)
- `GET /api/gallery` - List all galleries
- `GET /api/gallery/:address` - Get wallet's tokens
- `GET /api/marketplace` - List active listings
- `GET /api/marketplace/:tokenId` - Get listing details

### Authenticated (requires SIWE token)
- `POST /api/mint` - Mint new NFT
- `POST /api/marketplace/list` - Prepare listing
- `POST /api/marketplace/buy` - Prepare purchase
- `POST /api/marketplace/delist` - Remove listing
- `POST /api/detect` - Check watermark ownership

## Mock Modes

For local development, external services can be mocked:

| Variable | Effect |
|----------|--------|
| `USE_MOCK_BLOCKCHAIN=true` | In-memory tokens |
| `USE_MOCK_IPFS=true` | In-memory storage |
| `USE_MOCK_ARWEAVE=true` | In-memory metadata |
| `USE_MOCK_WATERMARK=true` | Skip watermarking |
| `USE_MOCK_FIRESTORE=true` | In-memory database |
| `MOCK_PERSISTENCE=true` | Save mock data to disk |

## Running

```bash
# Development (with nodemon auto-reload)
npm run dev

# With local blockchain
./start-local-blockchain.sh

# Production
npm start
```
