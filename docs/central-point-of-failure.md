# Central Point of Failure

An honest assessment of what happens if the watermarking authority disappears.

---

## The Hard Truth

If NFTmarket (the watermarking authority) goes bankrupt, shuts down, or loses its infrastructure:

| Component | Status | Impact |
|-----------|--------|--------|
| Blockchain records | **Survives** | Ownership, timestamps, creator info intact |
| Arweave metadata | **Survives** | Name, description, attributes permanent |
| Arweave licenses | **Survives** | Legal agreements verifiable forever |
| IPFS previews | **At risk** | Re-pin from own peer or collectors |
| Encrypted originals | **Lost** | Cannot run watermark detection |
| Encryption keys (KMS) | **Lost** | Cannot decrypt originals |
| Watermark secret key | **Lost** | Cannot extract watermarks |
| Watermark extraction | **Degraded** | See below |
| Firestore records | **Lost** | Token → key mappings gone |

---

## Watermark Extraction: The Critical Question

The watermark is embedded using frequency-domain techniques (DCT/DWT). But extraction requires more than just the algorithm.

### What's Needed to Extract

1. **The algorithm** - Standard watermarking techniques
2. **The embedding parameters** - Strength, frequency bands, block size
3. **The format** - How `wallet:tokenId` is encoded
4. **The secret key** - A cryptographic key used to determine embedding locations

### The Secret Key

The watermark uses a secret key to:
- Determine which frequency coefficients carry the data
- Generate the pseudorandom spreading sequence
- Scramble the embedded message

**This key must remain secret.** If published, attackers could:
- Extract watermarks from any image
- Forge watermarks (embed fake `wallet:tokenId`)
- Remove watermarks by targeting known locations

### The Implication

Publishing the algorithm alone won't help. Watermark extraction will **always** require either:
1. NFTmarket's extraction service, or
2. Access to the secret key

**The watermarking authority is a true central point of failure. There is no "publish the spec" escape hatch.**

---

## What Still Works Without the Watermarking Authority

### Blockchain (Polygon)

Completely independent. Forever accessible:

- Token ownership (`ownerOf`)
- Creator address (`getTokenData`)
- Mint timestamp (block number)
- Image hash (for exact-match verification)
- License hash (can verify against Arweave document)

### Arweave

Permanent and decentralized:

- Metadata JSON (name, description, image URI)
- License documents (full legal text)
- Content hashes for verification

### What You Can Prove

Even without the watermarking authority:

1. **"I own token #123"** - Query blockchain
2. **"Token #123 was minted on Jan 15, 2025"** - Block timestamp
3. **"The license agreement says X"** - Fetch from Arweave, verify hash
4. **"This exact file is token #123"** - Compare SHA-256 to on-chain imageHash

### What You Cannot Prove

Without watermark extraction:

1. **"This screenshot is from token #123"** - Can't extract watermark
2. **"This JPEG is a copy of my NFT"** - Can't trace transformed images
3. **"This repost is my art"** - No way to link image to token

---

## The Watermark Was the Whole Point

The watermark is what makes NFTmarket different from regular NFTs:

| Regular NFT | NFTmarket |
|-------------|-----------|
| Owns token, not image | Owns token + embedded proof |
| Screenshot = no connection | Screenshot = traceable |
| "Right-click save" wins | Watermark survives |

**If watermark extraction dies, NFTmarket tokens become regular NFTs.**

They still have value (blockchain ownership, licenses), but lose the unique provenance feature.

---

## IPFS Failure: Where the Watermark Saves You

IPFS is a different failure mode. If Pinata stops pinning and nobody re-pins the content:

| Component | Status |
|-----------|--------|
| Preview on IPFS | **Gone** (unless own peer running) |
| Copies in the wild | **Still contain watermark** |

### The Watermark Is the Recovery Mechanism

Here's the key insight: **every copy of the image contains the watermark**.

```
Original preview on IPFS     → contains wallet:tokenId
Screenshot someone took      → contains wallet:tokenId
JPEG shared on Twitter       → contains wallet:tokenId
Cropped version on Instagram → contains wallet:tokenId (probably)
```

Even if the "official" IPFS copy disappears:

1. Someone has a copy (screenshot, download, repost)
2. Extract the watermark → get `wallet:tokenId`
3. Query blockchain for that token → get creator, owner, metadata URI
4. Fetch metadata from Arweave (permanent) → get name, description, license

**The watermark lets you reconstruct provenance from any surviving copy.**

### IPFS vs Arweave vs Watermark

| Storage | Survives if... | Contains... |
|---------|----------------|-------------|
| IPFS | Someone pins it | The "official" preview |
| Arweave | Always (permanent) | Metadata, licenses |
| Watermark | Any copy exists anywhere | Link to token |

The watermark is the most resilient because it's embedded in the pixels, not dependent on any storage infrastructure.

### Recovery Scenario

1. IPFS preview disappears (Pinata shuts down)
2. Artist finds a screenshot they posted on Twitter
3. Extract watermark → `0x742d...:123`
4. Query blockchain → confirm token #123, get Arweave metadata URI
5. Fetch from Arweave → full metadata intact
6. Re-upload screenshot to IPFS, re-pin
7. Provenance chain restored

The watermark is the bridge that survives storage failures.

### What the Watermark Doesn't Recover

- The encrypted high-resolution original (needs KMS keys)
- Exact pixel-perfect copy (watermark survives transformation, but data is lossy)

But for proving "this image belongs to token #123" - any copy works.

---

## Mitigations

### 1. Key Escrow (Limited Protection)

Store the secret key with a trusted third party (law firm, academic institution) with instructions to:
- Operate an extraction service if NFTmarket ceases, or
- Release the key only for legitimate verification (not public)

**Problem**: Once the key is public, anyone can forge or remove watermarks.

### 2. Multi-Party Extraction Service

Split the secret key using threshold cryptography. Multiple independent parties must cooperate to extract watermarks.

- Any 3 of 5 keyholders can extract
- No single party can forge or remove watermarks
- Survives any 2 parties disappearing

**Trade-off**: Complex, requires trusted parties, operational overhead.

### 3. Decentralized Key Management

Replace Cloud KMS with threshold encryption (e.g., Lit Protocol). Keys are split across a decentralized network. No single entity can lose them.

**Trade-off**: Adds complexity, still experimental technology.

### 4. Store Encrypted Originals on Arweave

Currently in Firebase (centralized). Could store on Arweave with encrypted keys stored separately.

**Trade-off**: More expensive, still need key management solution.

### 5. Multiple Watermarking Authorities

Federated system where multiple parties can extract watermarks. Any one surviving party can verify provenance.

**Trade-off**: Coordination complexity, trust distribution.

---

## Comparison to Other Systems

### Regular NFTs (OpenSea, etc.)

- No watermarking, no provenance beyond "you own this token"
- IPFS images can disappear
- No license enforcement
- **Single point of failure**: Pinning service (or none at all)

### NFTmarket

- Watermark provides image → token link
- Multiple storage layers (Arweave, IPFS, Firebase)
- Explicit licenses on-chain
- **Single point of failure**: Watermarking authority

### Fully Decentralized (Theoretical)

- Watermark spec published openly
- Threshold-encrypted originals on Arweave
- Decentralized key management
- **Single point of failure**: None (but complex, expensive)

---

## What Would Bankruptcy Look Like?

### Immediate (Day 1)

- API goes offline
- New mints impossible
- Existing tokens still work (blockchain, Arweave)
- IPFS content may start disappearing (Pinata unpaid)

### Short-term (Week 1)

- IPFS previews may start disappearing (Pinata unpaid)
- Encrypted originals inaccessible
- Watermark extraction unavailable

### Long-term (Month 1+)

- Watermarks become unreadable (secret key lost)
- Tokens become "regular NFTs" - blockchain record only
- Licenses still verifiable on Arweave
- Community could re-pin IPFS content

### No "Publish the Spec" Option

Unlike open-source software, the watermark secret key cannot be published without enabling forgery and removal. The watermarking authority is a permanent dependency.

---

## The Honest Assessment

**NFTmarket has a central point of failure.** The watermarking authority is essential for:

1. Minting new tokens
2. Extracting watermarks from images (requires secret key)
3. Accessing encrypted originals (requires KMS keys)
4. Running watermark detection

The blockchain and Arweave provide durability for ownership records and legal documents. But the unique value proposition - "trace any copy back to its token" - depends on the watermarking authority surviving.

### Minimum Viable Decentralization

To make tokens valuable beyond NFTmarket's lifespan:

1. **Publish the watermark specification** (extraction algorithm, parameters)
2. **Open source the extraction tool**
3. **Ensure IPFS content is widely pinned**

The encrypted originals will be lost, but the core provenance feature (watermark → token) can survive.

---

## Recommendations for Artists

1. **Keep your own copies** - Don't rely solely on NFTmarket's encrypted storage
2. **Pin your own IPFS content** - Use Pinata, Infura, or run your own node
3. **Save the Arweave transaction IDs** - Your metadata and licenses are permanent
4. **Understand the risk** - The watermark feature dies if NFTmarket dies
5. **The blockchain is your fallback** - Ownership, timestamps, and licenses survive forever

---

## Summary

### Two Different Failure Modes

**IPFS Failure (Pinata stops pinning):**

| Component | Outcome |
|-----------|---------|
| IPFS preview | Gone from IPFS |
| Watermark in copies | **Still works** - extract from any copy |
| Arweave metadata | Safe (permanent) |
| Recovery | Find any copy → extract watermark → restore provenance |

The watermark is the safety net. Any copy anywhere can rebuild the chain.

**NFTmarket Failure (company shuts down):**

| Component | Outcome |
|-----------|---------|
| Blockchain records | Safe (decentralized) |
| Arweave metadata/licenses | Safe (permanent) |
| IPFS previews | At risk (run own peer for redundancy) |
| Encrypted originals | Lost (can't run watermark detection) |
| Watermark secret key | Lost |
| Watermark extraction | **Lost** (secret key required) |

**The tokens don't become worthless** - they become regular NFTs with nice legal documentation. But the watermark-based provenance, the thing that makes NFTmarket special, requires NFTmarket to keep operating.

### The Key Difference

- **IPFS fails** → Watermark saves you (any copy works)
- **NFTmarket fails** → Watermark dies with it (secret key lost)

### Why There's No Easy Fix

The secret key cannot be published because it would enable:
- Forging watermarks (fake provenance)
- Removing watermarks (destroy provenance)

This is fundamental to watermark security. The watermarking authority is a permanent, unavoidable central point of failure.

---

*Part of the NFTmarket documentation. See also: [Protecting Originals](originals.md), [All About Watermarking](all-about-watermarking.md)*
