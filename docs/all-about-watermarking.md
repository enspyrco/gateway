# All About Watermarking in NFTmarket

How invisible watermarks work with blockchain provenance to establish ownership.

---

## What Is a Digital Watermark?

A digital watermark is information invisibly embedded into an image. Unlike a visible logo overlay, digital watermarks are:

- **Imperceptible** - Cannot be seen during normal viewing
- **Robust** - Survives compression, resizing, screenshots, format conversion
- **Detectable** - Can be extracted using specialized software

The watermark is encoded by modifying the frequency domain of the image. This alters pixel values in ways that survive common transformations while remaining invisible to the human eye.

---

## What NFTmarket Embeds

When you mint an NFT, the platform should embed your **wallet address and token ID** into the image.

| Embedded Data | Example |
|---------------|---------|
| Creator's wallet address | `0x742d35Cc6634C0532925a3b844Bc9e7595f8fE0E` |
| Token ID | `12345` |

Both pieces are needed: the wallet proves who created it, the token ID identifies exactly which NFT it is.

### The Token ID Problem

We need both wallet address and token ID in the watermark, but the token ID is assigned during minting. The watermark needs to be in the preview, and the preview URI goes in the metadata, and the metadata URI is passed to the mint function. Circular dependency.

### The Solution: Predict the Token ID

Token IDs are assigned sequentially. Before minting, we query `totalSupply()` and predict the next ID will be `currentSupply + 1`. Then:

```
1. Upload image
2. Query totalSupply() → predict next tokenId
3. Apply watermark (wallet + predicted tokenId)
4. Calculate imageHash from watermarked image
5. Generate preview from watermarked image
6. Encrypt watermarked original
7. Upload preview to IPFS, encrypted to Firebase Storage
8. Create metadata with preview URI
9. Mint NFT → verify we got the predicted tokenId
10. Store in Firestore
```

This is admittedly hacky. A race condition could cause a mismatch if two mints happen simultaneously. In practice this is rare, and the system logs a warning if it occurs.

---

## The Dual-Proof System

NFTmarket uses two independent systems that serve different purposes:

### Layer 1: The Watermark (Embedded in Pixels)

The watermark **identifies the token**. It's baked into the file itself and travels with any copy of the image.

- Survives screenshots, downloads, JPEG compression, resizing
- Can be extracted from any copy of the image
- Contains: creator wallet address + token ID

### Layer 2: The Blockchain (Immutable Record)

The blockchain proves **who currently owns the rights**. The smart contract stores:

- `creator` - original artist (never changes)
- `copyrightOwner` - who holds current rights (changes on Transfer sales)
- `mintedAt` - timestamp proving when the token was created

### Why Both Layers Matter

| Watermark | Blockchain |
|-----------|------------|
| Identifies which token | Records who owns it |
| Survives image distortion | Immutable ownership history |
| Embedded in pixels | External record |
| The only link after transformation | Source of truth for rights |

If someone reposts your art without permission:

1. Extract the watermark → get wallet + token ID
2. Query the blockchain for that token → confirm creator, check current owner
3. You have proof of which token it is and who owns the rights

---

## How Verification Works

The `/api/verify/:tokenId` endpoint returns:

```json
{
  "tokenId": 123,
  "creator": "0xArtist...",
  "currentOwner": "0xCollector...",
  "watermarkId": "0xArtist...",
  "verified": true,
  "chain": "Polygon"
}
```

To verify a suspicious image (with token ID in watermark):

1. Extract the watermark from the image
2. The watermark contains wallet address + token ID
3. Query the blockchain for that token ID
4. Confirm the creator matches the wallet in the watermark
5. Check who currently owns the copyright

The watermark is the only thing that survives image transformation, which is why it must contain the token ID.

---

## Robustness: What Watermarks Survive

Digital watermarks are designed to survive common transformations:

| Transformation | Survives? | Notes |
|----------------|-----------|-------|
| JPEG compression | Yes | Designed for this |
| PNG to JPEG conversion | Yes | Format-agnostic |
| Resizing/scaling | Yes | Multi-resolution embedding |
| Screenshots | Yes | Minimal transformation |
| Social media upload | Usually | Depends on compression level |
| Color adjustments | Mostly | Embedded in luminance channel |
| Print and scan | Sometimes | Most challenging attack |
| Cropping | Partial | Depends on how much is removed |

### The Robustness Trade-off

Watermarks balance three competing goals:

- **Robustness** - Survives transformations
- **Imperceptibility** - Can't be seen
- **Capacity** - How much data can be embedded

You can only optimize for two. NFTmarket prioritizes robustness and imperceptibility, embedding just enough data (a wallet address) to establish provenance.

---

## What Watermarks Don't Do

### They Don't Stop Determined Attackers

If someone knows the watermarking algorithm and has the resources, they may be able to remove or alter the watermark. Watermarks provide evidence, not prevention.

### They Don't Replace Legal Action

Watermarks provide **proof** for legal disputes - they don't enforce anything themselves. If someone infringes your copyright, you still need to pursue legal remedies.

### They Don't Prevent Screenshots

Anyone can screenshot or download your image. The watermark travels with the copy, providing evidence if you need to prove ownership later.

---

## How Watermarks Relate to Licenses

Each NFT includes a license type (Display, Commercial, or Transfer) that defines what rights the owner has.

```
Watermark: Proves who created it
Blockchain: Proves who owns what rights
License: Defines what those rights allow
```

The license agreement is:

1. Signed by both parties (EIP-712 signatures)
2. Hashed and stored on-chain (`licenseHash`)
3. Full document stored on Arweave
4. Can be verified by comparing hashes

The watermark doesn't encode the license - it establishes the creator identity that the license references.

---

## The Complete Provenance Chain

```
┌─────────────────────────────────────────────────────────────┐
│                         MINTING                              │
│                                                              │
│  Original Image                                              │
│       ↓                                                      │
│  Query totalSupply() → predict tokenId                     │
│       ↓                                                      │
│  Apply watermark (wallet + predicted tokenId)              │
│       ↓                                                      │
│  Calculate imageHash (of watermarked image)                │
│       ↓                                                      │
│  Generate preview (from watermarked image)                 │
│       ↓                                                      │
│  Encrypt watermarked original                               │
│       ↓                                                      │
│  Upload preview to IPFS, encrypted to Firebase             │
│       ↓                                                      │
│  Create metadata JSON                                       │
│       ↓                                                      │
│  Mint NFT on Polygon (verify predicted ID)                 │
│       ↓                                                      │
│  Store in Firestore                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    VERIFICATION                              │
│                                                              │
│  Suspicious Image (JPEG, screenshot, whatever)             │
│       ↓                                                      │
│  Extract watermark → wallet + tokenId                      │
│       ↓                                                      │
│  Query blockchain for token #tokenId                       │
│       ↓                                                      │
│  Confirm creator matches wallet from watermark             │
│       ↓                                                      │
│  Check copyrightOwner → who has rights now?                │
└─────────────────────────────────────────────────────────────┘

The watermark is the sole link between an image and its token.
```

---

## Regulatory Context

Some jurisdictions are beginning to regulate AI-generated content:

- **China** - Requires digital watermarks on AI-generated images
- **United States** - No current federal requirement
- **EU AI Act** - May require disclosure of AI content

NFTmarket's watermarking serves provenance purposes, but the same technology could satisfy disclosure requirements where they exist.

---

## Protecting Your Original

**There is no automatic duplicate detection.** Artists must protect their unwatermarked originals.

### Why?

- Anyone can upload any image and mint it
- If someone has your unwatermarked original, they can mint it
- Automatic detection of "similar" images is too expensive and unreliable

### The Blockchain Timestamp Is Your Proof

Every mint is recorded on-chain with an immutable timestamp. If two people mint the same image:

- Token #42 minted at block 18,234,567 (January 15, 2025, 14:32:01 UTC)
- Token #99 minted at block 18,300,000 (January 20, 2025, 09:15:44 UTC)

**The earlier timestamp wins.** The blockchain is the authoritative record of who minted first. This cannot be forged or disputed.

### Best Practices

1. **Mint first, share later** - Never post unwatermarked originals online
2. **Keep originals private** - Don't share with untrusted parties
3. **The watermark is your proof** - Once minted, every copy carries your `wallet:tokenId`
4. **The timestamp is your priority** - Mint before anyone else can

### What Gets Watermarked

Both copies of the image contain the watermark:

| Image | Watermarked? | Visibility |
|-------|--------------|------------|
| Preview/thumbnail | **Yes** | Public on IPFS |
| Full-resolution original | **Yes** | Encrypted in Firebase Storage |

The preview is generated from the watermarked image, so even screenshots of the thumbnail carry the `wallet:tokenId` watermark and can be traced back to the token.

### What the Watermarking Service Stores

The watermarking authority keeps an encrypted copy of every original for watermark detection:

| What | Where | Purpose |
|------|-------|---------|
| Watermarked preview | IPFS (public) | Display, also contains watermark |
| Watermarked original | Firebase Cloud Storage (encrypted) | Watermark detection |
| Encryption key | Key server (Cloud KMS) | Controlled access to originals |
| Watermark ID | Database (Firestore) | Links image to token |
| Mint timestamp | Blockchain | Immutable proof of priority |

The encrypted original is stored in Firebase rather than IPFS because it requires centralized key management anyway. IPFS would be theater - the blob is useless without the key.

The key server ensures that encrypted originals can only be decrypted by the watermarking authority.

The watermarking authority uses the stored original to:
1. Extract watermarks from submitted images
2. Verify that an image belongs to a specific token
3. Detect if a watermark has been tampered with

---

## Summary

| Component | Purpose |
|-----------|---------|
| Watermark | Embeds creator wallet + token ID in image pixels |
| Encrypted original | Stored by NFTmarket for watermark detection |
| Blockchain timestamp | Proves who minted first |
| Smart Contract | Stores creator, owner, and rights |
| License | Defines what owner can legally do |

The watermark is the **only** thing that survives image transformation. It travels with any copy and can be extracted by the watermarking authority to identify the exact token. The blockchain provides the chain of title and immutable timestamps.

**No automatic duplicate detection** - artists must guard their originals and mint before sharing.

**Central point of failure** - watermark extraction requires the authority's secret key. See [Central Point of Failure](central-point-of-failure.md).

---

*Part of the NFTmarket documentation. See also: [Protecting Originals](originals.md), [How Tokens Are Minted](how-tokens-are-minted.md), [Smart Contracts Explained](smart-contracts-explained.md)*
