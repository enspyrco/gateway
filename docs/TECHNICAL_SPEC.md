# NFTmarket Technical Specification

AI art marketplace with verifiable provenance, watermark-based authentication, and clear copyright licensing.

## Problem Statement

1. **NFTs don't convey ownership** - buying an NFT doesn't transfer copyright or usage rights
2. **AI art has no provenance** - anyone can generate similar images, no way to prove who created first
3. **Stolen art is rampant** - images are re-minted without consequences
4. **Physical art lacks accessible authentication** - expensive gallery systems, easily forged certificates

## Solution

Combine invisible watermarking + NFT minting + legal licensing into a single transaction.

```
Artist uploads image
       ↓
Watermark embedded (with unique ID)
       ↓
Image encrypted (artist keeps encrypted blob)
       ↓
NFT minted with license terms (signed by artist)
       ↓
Key stored in KMS (linked to tokenId)
       ↓
Listed on marketplace
       ↓
Buyer purchases → gets NFT + encrypted blob + clear legal rights
       ↓
Anyone can verify authenticity via watermark detection
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NFTmarket Platform                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Frontend   │  │   Backend    │  │   Watermark Engine   │  │
│  │  (Flutter)   │  │  (Node.js)   │  │       (C++)          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         └────────────┬────┴──────────────────────┘              │
│                      │                                          │
├──────────────────────┼──────────────────────────────────────────┤
│                      ▼                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Polygon    │  │  Cloud KMS   │  │        IPFS          │  │
│  │  Blockchain  │  │   (Keys)     │  │  (Encrypted Blobs)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Watermark Engine (Existing)

Reuse `watermarking-functions/` C++ library:
- DFT-based Legendre sequence embedding
- Survives print-and-scan
- Non-blind detection (requires encrypted original)

### 2. Smart Contract (ERC-721, UUPS Upgradeable)

```solidity
// Polygon deployment — UUPS proxy pattern
contract NFTmarketNFT is ERC721Upgradeable, ERC721URIStorageUpgradeable,
    OwnableUpgradeable, ReentrancyGuardUpgradeable, EIP712Upgradeable, UUPSUpgradeable
{
    enum LicenseType {
        Display,      // Personal display only (0)
        Commercial,   // Commercial usage rights (1)
        Transfer      // Full copyright transfer (2)
    }

    struct TokenData {
        address creator;          // Original creator — never changes, always has Display rights
        address copyrightOwner;   // Who owns the copyright — changes on Transfer sales
        LicenseType ownerLicense; // What license the current NFT owner has
        bytes32 imageHash;        // SHA-256 of watermarked image
        uint256 mintedAt;
        string ipfsUri;           // IPFS URI of watermarked image (public)
        uint256 parentToken;      // Token this was licensed from (0 if original)
        uint256 originalToken;    // The root original token in the provenance chain
        bool isOriginal;          // True if this is the original mint, false if license
        uint256 authorityId;      // Which authority minted this token
        address minter;           // Wallet that minted (receives fees on sales)
    }

    struct Authority {
        address admin;           // Can add/remove minters for this authority
        uint96 feeBps;           // Fee in basis points (250 = 2.5%)
        bool isActive;
        uint256 registeredAt;
    }
}
```

#### Multi-License Marketplace

A single token can have up to 3 simultaneous listings — one per license type — at different prices. This allows sellers to offer Display at 0.5 ETH, Commercial at 2 ETH, and Transfer at 10 ETH simultaneously.

```
listings[tokenId][0] → Display listing
listings[tokenId][1] → Commercial listing
listings[tokenId][2] → Transfer listing
```

Key functions: `list()`, `buy()`, `delist(tokenId, licenseType)`, `delistAll(tokenId)`, `getAllListings(tokenId)`

### 3. Key Management

```
Cloud KMS (Google)
├── Master key (one, encrypts per-image keys)
└── Per-image keys (stored encrypted in Firestore)

Firestore: keys/{tokenId}
{
  encryptedKey: "base64...",    // Encrypted with master key
  imageHash: "sha256:...",      // Verify correct image
  created: timestamp
}
```

### 4. Encrypted Original Storage

```
IPFS (public, encrypted)
├── /encrypted/{tokenId}        // Encrypted original image
├── /previews/{tokenId}         // Visible preview/thumbnail
└── /licenses/{tokenId}         // Signed license document

NFT Metadata:
{
  "name": "Artwork Title",
  "image": "ipfs://Qm.../preview.jpg",
  "encrypted_original": "ipfs://Qm.../encrypted",
  "license": "ipfs://Qm.../license.pdf",
  "license_type": "commercial",
  "image_hash": "sha256:..."
}
```

### 5. License Types

| Type | Rights Granted | What Seller Keeps |
|------|----------------|-------------------|
| `Display` | Personal display, resale of NFT | Copyright, commercial rights |
| `Commercial` | Monetization, merchandise, derivatives | Copyright |
| `Transfer` | Full copyright transfer to buyer | Display rights only |

Prices are set by the seller per listing. License hierarchy is enforced on-chain — you cannot sell more rights than you have (reverts with `CannotEscalateRights`).

### 6. Detection Service

```
POST /api/detect
{
  "tokenId": "4582",
  "capturedImage": "base64...",
  "wallet": "0x..."
}

Response:
{
  "detected": true,
  "confidence": 8.2,
  "message": "NFTM4582",
  "owner": "0x...",
  "license": "commercial"
}
```

Access control:
- Anyone can request detection
- Results include current owner + license type
- Enables third-party verification

## User Flows

### Mint Flow

```
1. User connects wallet
2. Uploads image
3. System checks for duplicates (perceptual hash)
4. User selects license type
5. User signs license agreement (wallet signature)
6. System:
   a. Embeds watermark (unique ID)
   b. Computes image hash
   c. Encrypts original
   d. Generates per-image key
   e. Uploads encrypted blob to IPFS
   f. Uploads preview to IPFS
   g. Stores encrypted key in Firestore
   h. Mints NFT on Polygon
7. User receives:
   - NFT in wallet
   - Encrypted original (IPFS link)
   - Transaction receipt
```

### Purchase Flow

```
1. Buyer browses marketplace
2. Sees artwork + license type + price
3. Clicks "Buy"
4. Signs transaction (wallet)
5. NFT transfers on-chain
6. Buyer now:
   - Owns the NFT
   - Can download encrypted original from IPFS
   - Has rights per the license type
   - Can request detection to prove ownership
```

### Verification Flow

```
1. Anyone photographs suspected artwork
2. Uploads to NFTmarket verification page
3. System:
   a. Checks all registered images
   b. Runs watermark detection against matches
4. Returns:
   - Original registered owner
   - Current NFT owner
   - License type
   - Registration date
   - Confidence score
```

## Stolen Art Detection

### At Upload

```python
def check_stolen(image):
    # 1. Exact hash match
    if hash_exists(sha256(image)):
        return REJECT, "Exact duplicate exists"

    # 2. Perceptual hash match
    phash = compute_phash(image)
    matches = find_similar(phash, threshold=0.95)
    if matches:
        return REJECT, f"Too similar to #{matches[0].id}"

    # 3. Reverse image search (optional)
    external = reverse_search(image)
    if external:
        return FLAG, "Found online - verify ownership"

    return ALLOW
```

### At Detection Request

If watermark detected in commercial use:
1. Generate forensic report
2. Notify registered owner
3. Provide DMCA template

## Physical Art Support

```
Physical artwork
       ↓
Artist photographs (high-res)
       ↓
Standard mint flow
       ↓
Artist prints QR code sticker
       ↓
Attaches to back of artwork
       ↓
Anyone can scan → verify → see provenance

QR Code links to:
https://nftmarket.com/verify/{tokenId}

Page shows:
- Artwork image
- Artist info
- Current owner
- License type
- Full provenance history
```

## Database Schema

### On-Chain (Source of Truth)

Token ownership, IPFS URIs, Arweave URIs, license types, provenance, and marketplace listings all live on the blockchain via the `NFTmarketNFT` contract. The backend reads from the contract for gallery, marketplace, and verification endpoints.

### Arweave (Permanent Metadata)

```json
{
  "name": "Artwork Title",
  "description": "Artist description",
  "image": "ipfs://Qm.../watermarked.png",
  "license": { "type": "Transfer", "text": "..." },
  "properties": { "prompt": "...", "style": "...", "seed": 123 }
}
```

### Firestore Collections

Firestore stores **only** encrypted original references (not token metadata):

```
/encrypted-refs/{tokenId}
{
  storagePath: string,       // Firebase Storage path to encrypted original
  keyId: string,             // KMS key identifier
  created: timestamp
}
```

### AI Generations (In-Memory)

Generated images are stored in backend memory with 1-hour TTL. Not persisted to any database. See [AI Generation](generate.md).

## API Endpoints

### Public

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gallery` | GET | List all minted tokens |
| `/api/marketplace` | GET | List all active listings |
| `/api/marketplace/:tokenId` | GET | Get listing details (all license types) |
| `/api/marketplace/eip712/domain` | GET | Get EIP-712 domain for signatures |
| `/api/marketplace/nonce/:address` | GET | Get current nonce for address |
| `/api/verify/:tokenId` | GET | Public token verification |
| `/api/detect` | POST | Run watermark detection |
| `/api/generate/styles` | GET | Get AI generation style presets |

### Authenticated (SIWE wallet signature required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mint` | POST | Mint new token (watermark, encrypt, IPFS, blockchain) |
| `/api/marketplace/list/typed-data` | POST | Get EIP-712 data for listing |
| `/api/marketplace/buy/typed-data` | POST | Get EIP-712 data for buying |
| `/api/marketplace/list` | POST | Prepare listing (returns typed data + contract call) |
| `/api/marketplace/buy` | POST | Prepare purchase with license upgrade validation |
| `/api/marketplace/delist` | POST | Prepare delisting (single or all license types) |
| `/api/generate` | POST | Generate images from prompt (rate limited: 10/hr) |
| `/api/generate/:id` | GET | Get generation details |
| `/api/generate/:id/image/:index` | GET | Retrieve generated image as PNG |

The backend prepares transaction data; the client signs with their wallet and calls the smart contract directly. See [AI Generation](generate.md) for the full generate API.

## Revenue Model

Fees are configured per-authority in basis points (250 bps = 2.5%) and distributed via a pull pattern:

| Revenue Source | How It Works |
|----------------|-------------|
| Marketplace sales | Authority fee (configurable bps, max 50%) accrued to minter wallet |
| Fee withdrawal | Minters call `withdrawFees()` to collect accrued fees |

The fee goes to the **minter** of the token (the wallet that called `mint()`), not a fixed platform wallet. This supports the multi-authority model where third-party watermarking services can earn fees on tokens they mint.

### Cost Breakdown (per mint)

| Item | Cost |
|------|------|
| Polygon gas | ~$0.01 |
| IPFS pinning (Pinata) | ~$0.01 |
| Arweave metadata | ~$0.001 |
| KMS operation | ~$0.001 |
| Compute (watermark) | ~$0.01 |
| **Total** | ~$0.03 |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Flutter Web |
| Backend | Node.js / Express |
| Watermarking | C++ engine or Cloud API |
| AI Generation | Stability AI (Ultra endpoint) |
| Blockchain | Polygon (ERC-721, UUPS upgradeable) |
| Wallet | Wallet Service (dev) / WalletConnect (prod) |
| Image Storage | IPFS (Pinata) — watermarked previews |
| Metadata Storage | Arweave — permanent NFT metadata JSON |
| Encrypted Storage | Firebase Storage — encrypted originals |
| Database | Firestore — encrypted original references |
| Key Management | Google Cloud KMS |
| Auth | Sign-In with Ethereum (SIWE) |

## Security Considerations

### Key Management
- Master key never leaves KMS HSM
- Per-image keys encrypted at rest
- Key access logged (Cloud Audit Logs)

### Encrypted Originals
- AES-256 encryption
- Stored on IPFS (public but useless without key)
- Decryption only via API (ownership verified)

### Wallet Authentication
- Sign-In with Ethereum (SIWE) standard
- Signatures verified server-side
- No password storage

### Smart Contract
- Use OpenZeppelin audited base contracts
- Professional audit before mainnet
- Upgradeable proxy pattern (optional)

## Open Questions

1. **Detection access** — Free for everyone or paid/rate-limited?
2. **Dispute resolution** — How to handle conflicting ownership claims?
3. **Mainnet deployment** — Polygon PoS vs Polygon zkEVM?
4. **Fiat on-ramp** — Integration for users without crypto wallets?
