# Protecting Original Images

How originals are protected before and after minting.

---

## How Vanilla NFTs Work (No Protection)

Standard NFTs don't protect the original image at all:

```
Token #123
    → tokenURI: ipfs://Qm.../metadata.json
        → image: ipfs://Qm.../image.png  ← completely public
```

Anyone can:
1. Look up the token URI
2. Read the metadata
3. Download the full-resolution original
4. Use it however they want

**There is no encryption. No access control. No key.**

The common refrain is "you're buying the token, not the image." The image is public; you're just buying a database entry that says you own token #123.

---

## How NFTmarket Is Different

NFTmarket encrypts the high-resolution original:

```
Token #123
    → tokenURI: ipfs://Qm.../metadata.json
        → image: ipfs://Qm.../preview.jpg       ← public, watermarked
        → encrypted_original: ipfs://Qm.../blob  ← encrypted, needs key
```

The preview is public (and watermarked). The full-resolution original is encrypted and only accessible through the watermarking service.

---

## Before Minting: Artist Responsibility

**The unwatermarked original is a secret.** Whoever has it can mint it.

There is no automatic duplicate detection. If someone gets your original before you mint:

1. They upload it
2. They mint it
3. Their token has the earlier timestamp
4. They "own" it

### Best Practices

| Do | Don't |
|----|-------|
| Keep originals on encrypted storage | Post originals on social media |
| Mint first, share later | Send originals to "collaborators" |
| Share only watermarked versions | Store originals in cloud drives with weak passwords |

The moment you mint, the watermarked version becomes the public version. The unwatermarked original should never leave your control.

---

## After Minting: The Watermarking Service

Once minted, the watermarking service stores an encrypted copy of the watermarked original.

### What Gets Stored

```
┌─────────────────────────────────────────────────────┐
│                    IPFS (Public)                     │
│                                                      │
│  Preview image (watermarked, visible)               │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                 Arweave (Permanent)                  │
│                                                      │
│  Metadata JSON (name, description, attributes)      │
│  License documents                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              Firebase Cloud Storage                  │
│                                                      │
│  Encrypted original (watermarked, AES-256)          │
│  Used for watermark detection by the authority      │
└─────────────────────────────────────────────────────┘
                         │
                         │ encrypted with
                         ▼
┌─────────────────────────────────────────────────────┐
│                Key Server (Cloud KMS)                │
│                                                      │
│  AES-256 key for each mint                          │
│  Only accessible by the watermarking service        │
└─────────────────────────────────────────────────────┘
                         │
                         │ key ID stored in
                         ▼
┌─────────────────────────────────────────────────────┐
│                 Database (Firestore)                 │
│                                                      │
│  tokenId → keyId mapping                            │
│  watermarkId, metadata, transaction hash            │
└─────────────────────────────────────────────────────┘
```

**Why Firebase instead of IPFS for the encrypted original?**

The encrypted blob is useless without the key. Since key management is centralized (Cloud KMS), putting the blob on "decentralized" IPFS is theater. Firebase Cloud Storage is simpler, cheaper, and honest about what's centralized.

### Why Encrypt?

The watermarked original is proof. If it were public:

- Anyone could extract the watermark
- The "proof copy" would be no different from any other copy
- No controlled access for watermark detection

By encrypting, the watermarking authority can:

1. Store the original securely
2. Decrypt when needed for watermark detection
3. Verify submitted images against the clean original

---

## The Key Server

The key server (Google Cloud KMS in production) manages encryption keys.

### How It Works

1. **At mint time**: Generate AES-256 key, encrypt original, store key in KMS
2. **Key ID stored**: Database records which KMS key encrypts which token's original
3. **At decrypt time**: Service requests key from KMS, decrypts the blob

### Access Control

Only the watermarking service can request keys from KMS. This is enforced by:

- IAM roles (only the service account has access)
- Audit logging (every key access is logged)
- Key rotation policies

The token owner doesn't get direct access to the encryption key. They get the watermarked preview, which is sufficient for display and provenance.

---

## Single Point of Failure?

Yes. There are several.

### Key Server (Cloud KMS)

**If KMS goes down:**
- New mints fail (can't encrypt)
- Dispute resolution fails (can't decrypt)
- Existing previews still work (they're public on IPFS)

**If KMS keys are lost:**
- Encrypted originals become permanently inaccessible
- Previews still exist and contain the watermark
- Blockchain records are unaffected

**Mitigation:**
- KMS has built-in redundancy and backup
- Key material is replicated across regions
- Google's SLA covers availability

### Database (Firestore)

**If Firestore goes down:**
- Can't look up which key decrypts which token
- Can't verify watermark IDs
- Blockchain is unaffected (on-chain data still accessible)

**If Firestore data is lost:**
- Key ID mappings lost
- Would need to rebuild from blockchain events + Arweave metadata

**Mitigation:**
- Firestore has automatic backups
- Critical data also stored in Arweave metadata (permanent)
- Blockchain events are permanent record

### IPFS (Pinata) - Previews Only

**If Pinata stops pinning:**
- Preview images may become unavailable on IPFS
- Content-addressed, so can be re-pinned if you have the data

**Mitigation:**
- **Run your own IPFS peer** - Pin all content for redundancy
- Encourage collectors to pin their own previews
- Content-addressed means anyone with the data can re-pin

### Firebase Cloud Storage - Encrypted Originals

**If Firebase Storage goes down:**
- Can't access encrypted originals
- Dispute resolution temporarily unavailable

**If Firebase Storage data is lost:**
- Encrypted originals permanently lost
- Previews still exist on IPFS with watermarks

**Mitigation:**
- Firebase has automatic redundancy and backups
- Cross-region replication available
- Regular backup exports

### The Watermarking Service Itself

**If the service shuts down:**
- No new mints
- No watermark detection (can't access KMS)
- Existing tokens still work (blockchain + IPFS)
- Previews still display, watermarks still extractable

**Mitigation:**
- Open source the watermark extraction
- Document key recovery procedures
- Consider decentralized key management (future)

---

## What's Actually Centralized

| Component | Centralized? | Impact if Lost |
|-----------|--------------|----------------|
| Blockchain (Polygon) | No | N/A - decentralized |
| Arweave (metadata, licenses) | No | Permanent by design |
| IPFS previews | No | Re-pin from own peer or collectors |
| Pinning (Pinata) | Yes | Run own IPFS peer for redundancy |
| Encrypted originals (Firebase) | Yes | Can't run watermark detection |
| Key server (KMS) | Yes | Can't decrypt originals |
| Database (Firestore) | Yes | Can't look up key mappings |
| Watermark secret key | Yes | Can't extract watermarks |

The blockchain, Arweave, and IPFS previews are decentralized. The encrypted originals, key management, and database are centralized (Firebase/GCP).

### The Trade-off

Decentralized key management exists (e.g., Lit Protocol, threshold encryption) but adds complexity. For MVP:

- Centralized KMS is simpler and reliable
- Google's infrastructure is battle-tested
- Can migrate to decentralized solution later

---

## Recovery Scenarios

### "I lost my original"

The watermarking service has the encrypted copy. If you're the verified owner:

1. Prove ownership (sign message with wallet)
2. Service decrypts the original
3. You get the watermarked high-resolution file

### "Someone stole my art"

1. Submit the suspicious image to the watermarking authority
2. Authority extracts watermark → get `wallet:tokenId`
3. Query blockchain → confirm your token was minted first
4. Watermark proves which token the image belongs to

### "The service shut down"

1. Your token still exists on-chain
2. Preview still on IPFS (run own peer for redundancy)
3. **Watermark extraction no longer possible** (secret key lost)
4. Encrypted original inaccessible (KMS keys lost)

This is the central point of failure. See [Central Point of Failure](central-point-of-failure.md).

---

## Summary

| Phase | Who Protects | How |
|-------|--------------|-----|
| Before minting | Artist | Keep original secret |
| After minting | Watermarking authority | Encrypted storage + key server |
| Watermark detection | Watermarking authority | Decrypt original, extract watermark |
| Service failure | Blockchain only | On-chain timestamp survives, watermark extraction lost |

The unwatermarked original is the artist's responsibility. Once minted, the watermarking authority maintains an encrypted copy for watermark detection. **The authority is a central point of failure** - if it disappears, watermark extraction becomes impossible (secret key lost).

---

*See also: [All About Watermarking](all-about-watermarking.md), [How Tokens Are Minted](how-tokens-are-minted.md), [Central Point of Failure](central-point-of-failure.md)*
