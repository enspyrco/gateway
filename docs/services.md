# NFTmarket Services

This document lists all services and APIs used by the NFTmarket platform.

## Local Services (Self-Hosted)

### Hardhat Node
- **Port**: 8545
- **Purpose**: Local Ethereum blockchain for development/testing
- **What it does**: Runs a local blockchain with pre-funded test accounts. Deploys and executes the NFTmarketNFT smart contract.
- **Start**: `cd contracts && npx hardhat node`
- **Test accounts**: 20 accounts with 10,000 ETH each

### Backend API
- **Port**: 3000
- **Purpose**: Main application server
- **What it does**: Handles minting flow (watermark → encrypt → IPFS → blockchain), marketplace preparation, gallery queries, and serves as IPFS gateway in mock mode.
- **Start**: `cd backend && ./start-local-blockchain.sh`
- **Key endpoints**:
  - `POST /api/mint` - Mint new NFT (watermark, upload, mint)
  - `GET /api/gallery` - List galleries
  - `GET /api/marketplace` - List active listings
  - `POST /api/marketplace/list` - Prepare listing (returns typed data to sign)
  - `GET /ipfs/:hash` - Mock IPFS gateway

### Wallet Service
- **Port**: 3001
- **Purpose**: Key management and transaction signing
- **What it does**: Manages test account private keys, signs EIP-712 typed data, submits transactions to blockchain. Keeps private keys out of the frontend.
- **Start**: `cd wallet-service && npm run dev`
- **Key endpoints**:
  - `GET /api/accounts` - List available test accounts
  - `POST /api/accounts/select` - Select account, get session
  - `POST /api/sign/typed-data` - Sign EIP-712 data
  - `POST /api/transaction/send` - Sign and submit transaction
  - `POST /api/auth/token` - Generate SIWE auth token

### Flutter Web App
- **Port**: Random (typically 5xxxx)
- **Purpose**: User interface
- **What it does**: Web frontend for browsing galleries, minting NFTs, listing/buying on marketplace.
- **Start**: `cd flutter && flutter run -d chrome`

## Mock Services (Persistent, Development Only)

These run inside the backend process. Data is persisted to `backend/.mock-data/` and survives restarts.

### Mock IPFS
- **Env**: `USE_MOCK_IPFS=true`
- **Purpose**: Simulates IPFS storage without Pinata
- **What it does**: Stores uploaded files with fake CID hashes. Serves files via `http://localhost:3000/ipfs/{hash}`.
- **Persistence**: `backend/.mock-data/ipfs.json`

### Mock Firestore
- **Env**: `USE_MOCK_FIRESTORE=true`
- **Purpose**: Simulates Firebase Firestore
- **What it does**: Stores token metadata, user data, license info.
- **Persistence**: `backend/.mock-data/firestore-*.json`
- **Note**: Use `POST /api/gallery/sync` to sync with blockchain state.

### Mock Arweave
- **Env**: `USE_MOCK_ARWEAVE=true`
- **Purpose**: Simulates Arweave permanent storage
- **What it does**: Stores NFT metadata JSON with fake transaction IDs (`ar://mock_xxx`).
- **Persistence**: `backend/.mock-data/arweave.json`

### Mock Firebase Storage
- **Env**: `USE_MOCK_STORAGE=true`
- **Purpose**: Simulates Firebase Cloud Storage
- **What it does**: Stores encrypted original images.
- **Persistence**: `backend/.mock-data/storage.json`

### Mock Blockchain
- **Env**: `USE_MOCK_BLOCKCHAIN=true`
- **Purpose**: Simulates blockchain without Hardhat
- **What it does**: Token storage, listing storage, nonce tracking. Useful for unit tests.
- **Persistence**: `backend/.mock-data/blockchain-*.json`
- **Note**: NOT used when running with local Hardhat (we use real blockchain)

### Clearing Mock Data
To reset all mock data:
```bash
rm -rf backend/.mock-data/*.json
```

## External APIs (Cloud Services)

### Watermarking API
- **URL**: `https://watermarking-api-78940960204.us-central1.run.app`
- **Auth**: `X-API-Key` header
- **Purpose**: Embeds invisible watermarks into images
- **What it does**: Takes an image + message, embeds the message as an invisible watermark using frequency-domain techniques. Returns watermarked image.
- **Endpoints**:
  - `POST /watermark` - Upload image, returns SSE stream with progress, then download URL
  - `GET /download/:jobId` - Download watermarked image (available 5 minutes)
- **Env vars**: `WATERMARK_API_URL`, `WATERMARK_API_KEY`
- **Mock**: `USE_MOCK_WATERMARK=true` skips watermarking, returns image as-is

### Pinata (IPFS Pinning)
- **URL**: `https://api.pinata.cloud`
- **Auth**: JWT token
- **Purpose**: Permanent decentralized storage for preview images
- **What it does**: Pins files to IPFS network, provides gateway for retrieval.
- **Env vars**: `PINATA_JWT`, `PINATA_GATEWAY`
- **Mock**: `USE_MOCK_IPFS=true`

### Arweave (Permanent Storage)
- **URL**: `https://arweave.net`
- **Purpose**: Permanent storage for NFT metadata JSON
- **What it does**: Stores metadata permanently (200+ years) on Arweave blockchain.
- **Env vars**: `ARWEAVE_KEY` (wallet JSON)
- **Mock**: `USE_MOCK_ARWEAVE=true`

### Google Cloud KMS
- **Purpose**: Encryption key management
- **What it does**: Manages encryption keys for original image encryption. Keys never leave Google's HSMs.
- **Env vars**: `USE_KMS=true`, `KMS_KEY_NAME`
- **Mock**: `USE_KMS=false` + `DEV_ENCRYPTION_KEY` uses a local hex key

### Firebase (Firestore + Storage)
- **Purpose**: Token metadata database + encrypted original storage
- **What it does**:
  - Firestore: Stores token metadata, ownership, license history
  - Storage: Stores encrypted original images
- **Env vars**: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`
- **Mock**: `USE_MOCK_FIRESTORE=true`, `USE_MOCK_STORAGE=true`

### Stability AI
- **URL**: `https://api.stability.ai`
- **Purpose**: AI image generation
- **What it does**: Generates images from text prompts (used in "Generate" feature).
- **Env vars**: `STABILITY_API_KEY`
- **Mock**: `USE_MOCK_AI=true` returns placeholder images

## Service Dependencies

```
Flutter App
    ↓
Wallet Service (signing) ←→ Backend API
    ↓                           ↓
    └──────→ Hardhat Node ←─────┘
                  ↓
           Smart Contract

Backend API
    ↓
    ├→ Watermarking API (embed watermark)
    ├→ Mock/Real IPFS (store preview)
    ├→ Mock/Real Arweave (store metadata)
    ├→ Mock/Real Firestore (store token data)
    ├→ Mock/Real Storage (store encrypted original)
    └→ Mock/Real KMS (encryption keys)
```

## Quick Start (Local Development)

```bash
# Terminal 1: Hardhat
cd contracts && npx hardhat node

# Terminal 2: Deploy contract
cd contracts && npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Wallet service
cd wallet-service && npm run dev

# Terminal 4: Backend (with real watermarking)
cd backend && ./start-local-blockchain.sh

# Terminal 5: Flutter
cd flutter && flutter run -d chrome

# After backend starts, sync Firestore from blockchain:
curl -X POST http://localhost:3000/api/gallery/sync
```

## Environment Variables Summary

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `POLYGON_RPC_URL` | Backend | Yes | Blockchain RPC endpoint |
| `NFTMARKET_CONTRACT_ADDRESS` | Backend | Yes* | Deployed contract address |
| `MINTER_PRIVATE_KEY` | Backend | Yes | Private key for minting transactions |
| `WATERMARK_API_URL` | Backend | No | Watermarking service URL |
| `WATERMARK_API_KEY` | Backend | No | Watermarking service API key |
| `PINATA_JWT` | Backend | No | Pinata IPFS API token |
| `STABILITY_API_KEY` | Backend | No | Stability AI API key |
| `USE_MOCK_*` | Backend | No | Enable mock services |

*Auto-loaded from `contracts/deployment.json` if not set
