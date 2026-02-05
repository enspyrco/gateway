# Mint Architecture

## Storage Layer

| Store | Purpose |
|-------|---------|
| **Blockchain** | Ownership, listings, rights (source of truth) |
| **IPFS** | Full watermarked image (public) |
| **Arweave** | Metadata + legal contract (permanent) |
| **Firebase Storage** | Encrypted original blob |
| **Key Server** | Allows decryption of originals in Firebase Storage |

## Mint Flow

```
1. Upload original
       │
       ▼
2. Apply watermark (wallet + tokenId)
       │
       ▼
3. Upload watermarked image to IPFS
       │
       ▼
4. Encrypt original
       │
       ├──► Store encrypted blob in Firebase Storage
       │
       └──► Store decryption key in Key Server
       │
       ▼
5. Upload metadata + legal contract to Arweave
       │
       ▼
6. Mint NFT on blockchain
       │
       ▼
7. Return token ID to user
```

## What Each Store Contains

### Blockchain (Polygon)
- Token ID
- Owner address
- Creator address
- Copyright owner address
- License type (Display / Commercial / Transfer)
- Image hash (SHA-256 of watermarked image)
- License hash (SHA-256 of signed license)
- IPFS URI (link to watermarked image)
- Arweave URI (link to metadata + legal contract)
- Encrypted blob reference (Firebase Storage path)

### IPFS
- Full-scale watermarked image (PNG/JPG)

### Arweave
- Metadata JSON (name, description, creator, attributes)
- Legal license document (terms, signatures, timestamp)

### Firebase Storage
- AES-256 encrypted original image

### Key Server
- Decryption keys for encrypted originals
- Releases keys only to authorized parties

## Key Architecture Decisions

- Blockchain holds **links** (IPFS URI, Arweave URI) not the actual data
- Original image is **never public** - encrypted in Firebase Storage
- Key Server is the **gatekeeper** for accessing originals
- Watermarked image on IPFS serves as the public-facing version
