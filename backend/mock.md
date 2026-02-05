# Mock Services Documentation

This document describes all services that can be mocked for development and testing.

## Quick Reference

| Service | Environment Variable | Default |
|---------|---------------------|---------|
| Blockchain | `USE_MOCK_BLOCKCHAIN` | `false` |
| IPFS | `USE_MOCK_IPFS` | `false` |
| Arweave | `USE_MOCK_ARWEAVE` | `false` |
| Firestore | `USE_MOCK_FIRESTORE` | `false` |
| Firebase Storage | `USE_MOCK_STORAGE` | `false` |
| Watermark | `USE_MOCK_WATERMARK` | `false` |
| AI Generation | `USE_MOCK_AI` | `false` |
| Encryption/KMS | `USE_KMS` | `true` (set to `false` for dev mode) |
| Payments | `USE_MOCK_PAYMENTS` | `false` |

## Startup Scripts

| Script | Purpose | What's Mocked |
|--------|---------|---------------|
| `start-dev.sh` | Full mock mode, no external services | Everything |
| `start-local-blockchain.sh` | Local Hardhat node | Everything except blockchain |
| `start-local-real.sh` | All real services | Nothing |

## Service Details

### Blockchain (`USE_MOCK_BLOCKCHAIN`)

**Real implementation:** Polygon network via ethers.js, or local Hardhat node

**Mock implementation:** In-memory storage with Maps
- Token ownership tracking
- Marketplace listings
- Sequential token ID generation
- Simulated transaction hashes

**File:** `src/services/blockchain.js`

**When to use mock:**
- Unit tests (no Hardhat running)
- Quick backend testing without blockchain

**When to use real (Hardhat):**
- Integration testing
- Testing smart contract interactions
- Testing EIP-712 signatures

---

### IPFS (`USE_MOCK_IPFS`)

**Real implementation:** Pinata API for pinning files to IPFS network

**Mock implementation:** In-memory Map
- Generates fake CIDs (`Qm...` format)
- Stores buffers in memory
- No actual network calls

**File:** `src/services/ipfs.js`

**When to use mock:**
- Unit tests
- Development without Pinata account

**When to use real:**
- Integration testing
- Verifying IPFS upload/retrieval works

---

### Arweave (`USE_MOCK_ARWEAVE`)

**Real implementation:** Arweave network for permanent metadata storage

**Mock implementation:** In-memory Map
- Generates fake transaction IDs
- Returns `ar://` URIs
- Stores JSON in memory

**File:** `src/services/arweave.js`

**When to use mock:**
- Unit tests
- Development without Arweave wallet/funds

**When to use real:**
- Testing permanent storage
- Production

---

### Firestore (`USE_MOCK_FIRESTORE`)

**Real implementation:** Google Cloud Firestore (NoSQL document database)

**Mock implementation:** In-memory Maps
- `tokensById` - Token documents
- `tokensByWallet` - Ownership index
- `generations` - AI generation records

**File:** `src/services/firestore.js`

**What Firestore stores:**
```javascript
{
  tokenId: 1,
  mintId: "uuid",
  wallet: "0x...",
  name: "My NFT",
  description: "...",
  imageHash: "sha256...",
  watermarkId: "0x...:1",
  keyId: "encryption-key-id",
  storagePath: "encrypted/uuid.bin",
  previewUri: "ipfs://Qm...",
  metadataUri: "ar://...",
  createdAt: Date
}
```

**When to use mock:**
- Unit tests
- Development without Firebase project

---

### Firebase Storage (`USE_MOCK_STORAGE`)

**Real implementation:** Google Cloud Storage for binary files

**Mock implementation:** In-memory Map for blob storage

**File:** `src/services/storage.js`

**What Firebase Storage stores:**
- `encrypted/{mintId}.bin` - Encrypted original images
- `watermarked/{mintId}.png` - Full-resolution watermarked image backup (in case IPFS fails)

**Difference from Firestore:**

| Firestore | Firebase Storage |
|-----------|------------------|
| Document database | Blob/file storage |
| JSON-like documents | Binary files |
| Queryable by fields | Get/put by path only |
| Token metadata | Actual image files |

**When to use mock:**
- Unit tests
- Development without Firebase project

---

### Watermark (`USE_MOCK_WATERMARK`)

**Real implementation:**
- Cloud API (`WATERMARK_API_URL` + `WATERMARK_API_KEY`)
- Local C++ binary (`WATERMARK_BINARY` path)

**Mock implementation:** Returns input image unchanged (PNG converted)

**File:** `src/services/watermark.js`

**What watermarking does:**
- Embeds invisible watermark with `wallet:tokenId`
- Generates low-res preview
- Watermark survives screenshots, cropping, compression

**When to use mock:**
- Unit tests
- Development without C++ binary compiled

**When to use real:**
- Testing watermark detection
- Production

---

### AI Generation (`USE_MOCK_AI`)

**Real implementation:** Stability AI API for image generation

**Mock implementation:** Returns placeholder images (solid color or pattern)

**File:** `src/services/ai-generation.js`

**Rate limiting:** 10 requests/hour per wallet (real API is expensive)

**When to use mock:**
- Unit tests
- Development without Stability API key
- Avoiding API costs during testing

**When to use real:**
- Testing actual image generation
- Production

---

### Encryption/KMS (`USE_KMS`)

**Real implementation:** Google Cloud KMS for key management
- Keys stored securely in cloud
- Envelope encryption

**Dev implementation:** Local AES-256 encryption
- Uses `DEV_ENCRYPTION_KEY` environment variable
- Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**File:** `src/services/encryption.js`

**When to use KMS (`USE_KMS=true`):**
- Production
- Staging environments

**When to use dev mode (`USE_KMS=false`):**
- Local development
- Unit tests

---

### Payments (`USE_MOCK_PAYMENTS`)

**Real implementation:** Actual ETH transfers on blockchain

**Mock implementation:** In-memory balance tracking

**File:** `src/services/payment.js`

---

## Flutter App Mocking

The Flutter app uses debug mode (`kDebugMode`) to enable test features:

### Test Wallets

Instead of WalletConnect/MetaMask, debug mode provides 5 named test accounts:

| Nickname | Address | Hardhat Account |
|----------|---------|-----------------|
| Alice | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | #2 |
| Bob | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | #3 |
| Sam | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | #4 |
| Joe | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | #5 |
| Mary | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` | #6 |

Plus a platform wallet for fee collection:

| Nickname | Address | Hardhat Account |
|----------|---------|-----------------|
| Platform | `0x70997970C51812dc3A010C7d01b50e44D9c4F5Ee` | #1 |

**File:** `flutter/lib/providers/wallet_provider.dart`

### Fee Simulation

Debug mode includes simulated fee tracking:

| Fee Type | Amount | Purpose |
|----------|--------|---------|
| Subscription | 0.01 ETH/month | Platform access |
| Mint | 0.001 ETH | Per NFT minted |
| AI Generation | 0.0005 ETH | Per image generated |

---

## Test Configuration

Tests (`test/setup.js`) enable all mocks:

```javascript
process.env.USE_MOCK_WATERMARK = 'true';
process.env.USE_MOCK_IPFS = 'true';
process.env.USE_MOCK_ARWEAVE = 'true';
process.env.USE_MOCK_FIRESTORE = 'true';
process.env.USE_MOCK_BLOCKCHAIN = 'true';
process.env.USE_MOCK_AI = 'true';
```

---

## What's Never Mocked

These always run real, regardless of environment:

| Component | Reason |
|-----------|--------|
| Express server | Core framework |
| Auth middleware (SIWE) | Security critical |
| Image processing (sharp) | Fast, no external deps |
| Hashing (SHA-256) | Fast, deterministic |
| UUID generation | Fast, no external deps |

---

## Recommended Configurations

### Unit Tests
```bash
USE_MOCK_BLOCKCHAIN=true
USE_MOCK_IPFS=true
USE_MOCK_ARWEAVE=true
USE_MOCK_FIRESTORE=true
USE_MOCK_STORAGE=true
USE_MOCK_WATERMARK=true
USE_MOCK_AI=true
USE_KMS=false
```

### Local Development (with Hardhat)
```bash
USE_MOCK_BLOCKCHAIN=false  # Real Hardhat
USE_MOCK_IPFS=true         # Or false with Pinata
USE_MOCK_ARWEAVE=true
USE_MOCK_FIRESTORE=true    # Or false with Firebase
USE_MOCK_STORAGE=true
USE_MOCK_WATERMARK=false   # Real watermarking
USE_MOCK_AI=true           # Save API costs
USE_KMS=false
```

### Production
```bash
USE_MOCK_BLOCKCHAIN=false
USE_MOCK_IPFS=false
USE_MOCK_ARWEAVE=false
USE_MOCK_FIRESTORE=false
USE_MOCK_STORAGE=false
USE_MOCK_WATERMARK=false
USE_MOCK_AI=false
USE_KMS=true
```
