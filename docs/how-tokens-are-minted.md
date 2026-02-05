# How Tokens Are Minted

A detailed walkthrough of the NFTmarket minting process.

---

## Overview

Minting transforms an uploaded image into an NFT with embedded provenance. The process involves watermarking, encryption, IPFS storage, and blockchain registration.

**Key constraint**: The watermark must contain the token ID, but the token ID is assigned during minting. We solve this by predicting the token ID before minting.

---

## The Minting Flow

### Step 1: Predict Token ID

```javascript
const currentSupply = await blockchainService.totalSupply();
const expectedTokenId = currentSupply + 1;
```

Token IDs are assigned sequentially by the smart contract. We query the current supply and predict the next ID will be `supply + 1`.

**Why this is necessary**: We need the token ID in the watermark, but minting happens later. This is hacky but unavoidable given the circular dependency:

```
Watermark needs tokenId
    ↓
Preview needs watermark
    ↓
Metadata needs preview URI
    ↓
Mint needs metadata URI
    ↓
Mint returns tokenId  ← too late
```

### Step 2: Apply Watermark

```javascript
const watermarkId = `${wallet}:${expectedTokenId}`;
const watermarkedBuffer = await watermarkService.applyWatermark(
  imageBuffer,
  wallet,
  expectedTokenId
);
```

The watermark embeds `walletAddress:tokenId` invisibly into the image using frequency domain techniques. This survives JPEG compression, screenshots, resizing, and most common transformations.

### Step 3: Calculate Image Hash

```javascript
const imageHash = crypto.createHash('sha256').update(watermarkedBuffer).digest('hex');
```

The SHA-256 hash is calculated from the **watermarked** image (not the original). This hash is stored on-chain for integrity verification - anyone can verify they have the authentic watermarked version.

### Step 4: Generate Preview

```javascript
const previewBuffer = await watermarkService.generatePreview(watermarkedBuffer);
```

The preview is generated **from the watermarked image**, not the original. This means:

- The preview contains the watermark
- Screenshots of the preview can be traced back to the token
- The preview is an 800x800 JPEG thumbnail

### Step 5: Encrypt Original

```javascript
const { encryptedBuffer, keyId } = await encryptionService.encrypt(
  watermarkedBuffer,
  mintId
);
```

The full-resolution watermarked image is encrypted with AES-256. The encryption key is stored in a key server (Google Cloud KMS in production). This ensures the watermarking authority retains a clean copy for watermark detection.

### Step 6: Upload Preview + Store Original

```javascript
// Preview goes to IPFS (public, content-addressed)
const previewUri = await ipfsService.upload(previewBuffer, `${mintId}-preview.jpg`);

// Encrypted original goes to Firebase Cloud Storage (private, key-controlled)
const storagePath = await storageService.uploadEncrypted(encryptedBuffer, mintId);
```

| File | Where | Visibility |
|------|-------|------------|
| Preview | IPFS (Pinata) | Public |
| Encrypted original | Firebase Cloud Storage | Private, requires key |

The encrypted original stays in centralized storage because it requires centralized key management anyway. Putting encrypted blobs on "decentralized" IPFS would be theater - they're useless without the key.

### Step 7: Generate License Hash

```javascript
const licenseText = generateLicenseTemplate(licenseType);
const licenseData = `${licenseText}|${signature}|${wallet}|${mintId}`;
const licenseHash = crypto.createHash('sha256').update(licenseData).digest('hex');
```

If a license type is specified, the license agreement text is hashed. This hash is stored on-chain to prove the agreement existed at mint time.

### Step 8: Create Metadata and Upload to Arweave

```javascript
const metadata = {
  name,
  description,
  image: previewUri,
  // Note: encrypted_original is NOT in metadata - it's private in Firebase Storage
  attributes: [
    { trait_type: 'Watermark ID', value: watermarkId },
    { trait_type: 'Creator', value: wallet },
    { trait_type: 'License Type', value: licenseType }
  ],
  properties: {
    image_hash: imageHash,
    watermark_id: watermarkId,
    created_at: timestamp,
    license_hash: licenseHash,
    license_type: licenseType
  }
};

const { txId } = await arweaveService.uploadJson(metadata, {
  'Token-ID': String(expectedTokenId),
  'Creator': wallet
});
const metadataUri = `ar://${txId}`;
```

The metadata JSON follows NFT standards and includes:

- `image`: IPFS URI of the watermarked preview
- `watermark_id`: The embedded watermark value (`wallet:tokenId`)
- `image_hash`: SHA-256 of the watermarked image (for integrity verification)

The encrypted original is stored in Firebase Cloud Storage (not in metadata) because it's private and requires key-controlled access.

### Step 9: Mint on Blockchain

```javascript
const { tokenId, transactionHash } = await blockchainService.mint(
  wallet,           // recipient
  metadataUri,      // Arweave URI of metadata JSON (ar://...)
  licenseTypeNum,   // 0=Display, 1=Commercial, 2=Transfer
  imageHash,        // SHA-256 of watermarked image (0x prefixed)
  licenseHash,      // SHA-256 of license agreement
  storagePath       // Firebase Storage path for encrypted original
);
```

The smart contract:

1. Assigns the next sequential token ID
2. Stores `TokenData` struct with creator, imageHash, storagePath
3. Mints the ERC-721 token to the recipient
4. Emits `Minted(tokenId, creator, imageHash)` event

### Step 10: Verify Token ID

```javascript
if (tokenId !== expectedTokenId) {
  console.warn(`Token ID mismatch! Expected ${expectedTokenId}, got ${tokenId}`);
}
```

We verify that the predicted token ID matches what we got. A mismatch indicates a race condition (another mint happened between our prediction and our mint). This should be rare in practice.

### Step 11: Store in Database

```javascript
await database.createToken({
  tokenId,
  mintId,
  wallet,
  name,
  description,
  watermarkId,
  keyId,              // Key server reference for decryption
  storagePath,        // Firebase Storage path for encrypted original
  previewUri,
  metadataUri,
  transactionHash,
  licenseType,
  licenseHash,
  createdAt
});
```

The database stores the complete record linking all components. This is used by the verification API and for key management.

---

## What Gets Stored Where

| Data | Location | Purpose |
|------|----------|---------|
| Token ownership | Blockchain | Source of truth for who owns what |
| Mint timestamp | Blockchain | Immutable proof of priority |
| creator, copyrightOwner | Blockchain | Rights tracking |
| Preview image (watermarked) | IPFS | Public display, traceable |
| Metadata JSON | Arweave | Permanent, immutable |
| Encrypted original (watermarked) | Firebase Cloud Storage | Watermark detection |
| Encryption key | Key server (Cloud KMS) | Controlled access to originals |
| Storage path | Database (Firestore) | Pointer to encrypted original |
| Watermark ID | Database + Metadata | Links image to token |

---

## The Watermark

Both the preview and the encrypted original contain the same watermark:

```
Format: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE0E:123"
        └─────────────── wallet ───────────────┘ └─ tokenId
```

This allows any copy of the image (screenshot, download, repost) to be traced back to:

1. The creator's wallet address
2. The exact token ID

The watermark survives:
- JPEG compression
- PNG/WebP conversion
- Resizing and scaling
- Screenshots
- Social media uploads (usually)
- Color adjustments (mostly)

---

## Race Condition Risk

The token ID prediction can fail if two mints happen simultaneously:

```
User A: totalSupply() → 5, predict ID 6
User B: totalSupply() → 5, predict ID 6
User A: mint() → gets ID 6
User B: mint() → gets ID 7, but watermark says 6
```

This is a known limitation. Mitigations:

1. **Logging**: The system logs a warning if mismatch occurs
2. **Low probability**: Sequential mints from different users are rare
3. **Partial functionality**: Wallet address in watermark still works for creator identification

A more robust solution would require contract changes (reserving IDs before minting) or a mutex at the application level.

---

## Response

On success, the API returns:

```json
{
  "success": true,
  "tokenId": 123,
  "transactionHash": "0x...",
  "watermarkId": "0x742d35Cc...:123",
  "storagePath": "encrypted-originals/abc123-def456",
  "previewUri": "ipfs://Qm...",
  "metadataUri": "ar://abc123...",
  "imageHash": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  "licenseHash": "a1b2c3..."
}
```

---

## Error Cases

| Error | Code | Cause |
|-------|------|-------|
| Missing image | `MISSING_IMAGE` | No file uploaded |
| Missing name | `MISSING_FIELDS` | Name field required |
| Invalid license | `INVALID_LICENSE_TYPE` | Must be display/commercial/transfer |
| Blockchain error | `MINT_FAILED` | Contract rejected transaction |

---

## Protecting Your Original

**Important**: There is no automatic duplicate detection. Artists must protect their original images.

### What This Means

- Anyone can mint any image
- If someone gets your unwatermarked original, they can mint it
- The blockchain timestamp proves who minted first, but doesn't prevent copies

### The Blockchain Timestamp Is Your Proof

Every mint is recorded on-chain with an immutable timestamp:

```
Token #42: Block 18,234,567 (January 15, 2025, 14:32:01 UTC)
Token #99: Block 18,300,000 (January 20, 2025, 09:15:44 UTC)
```

If two people mint the same image, **the earlier timestamp wins**. This cannot be forged.

### Best Practices for Artists

1. **Mint first, share later** - Never post unwatermarked originals online
2. **Keep originals private** - Store originals securely, don't share with untrusted parties
3. **The watermark is your proof** - Once minted, the watermarked version proves your ownership
4. **The timestamp is your priority** - Mint before anyone else can

### What Gets Watermarked

Both versions of the image contain the watermark:

| Image | Watermarked? | Where |
|-------|--------------|-------|
| Preview/thumbnail (800x800) | **Yes** | IPFS (public) |
| Full-resolution original | **Yes** | Firebase Storage (encrypted) |

The preview is generated from the watermarked image. Screenshots of the preview carry the watermark and can be traced back to the token.

### What the Watermarking Service Stores

The watermarking authority keeps an encrypted copy of every original for watermark detection:

| What | Where | Purpose |
|------|-------|---------|
| Watermarked preview | IPFS (public) | Display, traceable via watermark |
| Watermarked original | Firebase Storage (encrypted) | Watermark detection |
| Encryption key | Key server (Cloud KMS) | Controlled access to originals |
| Watermark ID | Database | Links image to token |
| Mint timestamp | Blockchain | Immutable proof of priority |

The key server ensures that encrypted originals can only be decrypted by the watermarking authority.

The watermarking authority uses the stored original to:
1. Extract watermarks from submitted images (compare against clean original)
2. Verify that an image belongs to a specific token
3. Detect if a watermark has been tampered with

### The Watermark Is the Defense

Once an image is minted:
- Every copy contains `wallet:tokenId` in the pixels
- Screenshots, downloads, reposts all carry the watermark
- The watermark survives JPEG, resizing, rotation, cropping
- Any copy can be traced back to its token (by the watermarking authority)

The watermark doesn't prevent copying - it enables the authority to prove ownership after the fact. **The authority is a central point of failure** - see [Central Point of Failure](central-point-of-failure.md).

---

*See also: [Protecting Originals](originals.md), [All About Watermarking](all-about-watermarking.md), [Smart Contracts Explained](smart-contracts-explained.md)*
