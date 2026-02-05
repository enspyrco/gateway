# Perceptual Hashing

An exploration of duplicate detection techniques and why NFTmarket doesn't use them.

**Note**: NFTmarket does not implement automatic duplicate detection. This document explains why.

---

## The Problem with Regular Hashes

A cryptographic hash like SHA-256 produces a completely different output for even tiny changes:

```
Original image              → 7f83b1657ff1fc53b92dc18148a1d65d...
Same image + 1 pixel change → a9c3e8d12b4f7e219f8c3a2b1d4e5f67...
Same image as JPEG          → 2c6b8e91f3d4a7b8c9e0f1a2b3c4d5e6...
```

This is by design - cryptographic hashes detect any modification. But for duplicate detection, we need the opposite: a hash that stays the same when an image *looks* the same.

---

## What Is a Perceptual Hash?

A perceptual hash produces similar outputs for visually similar images:

```
Original image              → f8c3e0a1
Same image + 1 pixel change → f8c3e0a1  (identical)
Same image resized 50%      → f8c3e0a1  (identical)
Same image as JPEG          → f8c3e0a3  (1 bit different)
Completely different image  → 3a7b921c  (very different)
```

The hash captures the *structure* of the image, not the exact pixels.

---

## How It Works

### Step 1: Shrink the Image

Reduce to a tiny size (8x8 = 64 pixels). This removes fine details and keeps only the overall structure.

```
Original 1000x1000:          Shrunk to 8x8:
┌─────────────────┐          ┌────────┐
│                 │          │▓▓░░░░▓▓│
│  [photo of      │          │▓▓▓░░▓▓▓│
│   a cat]        │    →     │░▓▓▓▓▓▓░│
│                 │          │░░▓▓▓▓░░│
│                 │          │░░░▓▓░░░│
└─────────────────┘          └────────┘
```

### Step 2: Convert to Grayscale

Remove color information. We only care about light and dark regions.

### Step 3: Compare to Average

Calculate the average brightness of all 64 pixels. Then for each pixel:
- Brighter than average → `1`
- Darker than average → `0`

```
Pixels:     Average = 128

142  156   98  102  ...     1  1  0  0  ...
138  145  134  110  ...  →  1  1  1  0  ...
 89  112  167  178  ...     0  0  1  1  ...
...                         ...
```

### Step 4: Build the Hash

The 64 bits become a 16-character hex string:

```
1100011011100110...  →  c6e6...  →  f8c3e0a1
```

---

## Comparing Hashes

Two hashes are compared using **Hamming distance** - the number of bits that differ.

```
Hash 1: f8c3e0a1  →  11111000110000111110000010100001
Hash 2: f8c3e0a3  →  11111000110000111110000010100011
                                                   ^^
                                            2 bits differ
```

**Similarity = matching bits / total bits**

```
62 matching / 64 total = 97% similar
```

NFTmarket rejects images with >95% similarity.

---

## Algorithm Variants

The technique described above is called **aHash** (average hash). There are more sophisticated versions:

### aHash (Average Hash)
What NFTmarket currently uses.

```
1. Shrink to 8x8
2. Grayscale
3. Compare each pixel to average
4. Output 64 bits
```

**Pros**: Very fast, simple
**Cons**: Sensitive to gamma/brightness changes

### dHash (Difference Hash)

Instead of comparing to average, compare each pixel to its neighbor.

```
1. Shrink to 9x8 (72 pixels)
2. Grayscale
3. For each row: is pixel[i] > pixel[i+1]?
4. Output 64 bits
```

**Pros**: Better at handling brightness changes
**Cons**: Slightly more complex

### pHash (DCT-based Perceptual Hash)

Uses Discrete Cosine Transform (same math as JPEG compression).

```
1. Shrink to 32x32
2. Grayscale
3. Apply DCT transform
4. Keep only top-left 8x8 coefficients (low frequencies)
5. Compare to average of those coefficients
6. Output 64 bits
```

**Pros**: Most robust, handles more transformations
**Cons**: Slower, more complex

### Wavelet Hash

Uses wavelet decomposition instead of DCT.

**Pros**: Best robustness
**Cons**: Slowest, most complex

### Comparison

| Algorithm | Speed | Rotation | Scaling | Crop | Brightness |
|-----------|-------|----------|---------|------|------------|
| aHash | Fastest | Poor | Good | Poor | Poor |
| dHash | Fast | Poor | Good | Poor | Good |
| pHash | Medium | Fair | Good | Fair | Good |
| Wavelet | Slow | Good | Good | Good | Good |

---

## Real-World Usage

Perceptual hashing is everywhere, even if you haven't heard of it:

### Image Search
- **Google Images**: Reverse image search
- **TinEye**: Entire business model built on perceptual hashing
- **Pinterest**: Visual search and "similar pins"

### Content Moderation
- **Facebook/Instagram**: Detecting reposted content
- **PhotoDNA** (Microsoft): CSAM detection, used by most major platforms
- **Apple CSAM scanning**: The controversial on-device scanning

### Copyright Enforcement
- **YouTube Content ID**: Hashes video frames and audio
- **Audible Magic**: Audio fingerprinting for music
- **Stock photo sites**: Detecting unlicensed usage

### Media Identification
- **Shazam**: Audio perceptual hashing (spectrogram → hash)
- **Apple Photos**: "Similar photos" grouping
- **Google Photos**: Duplicate detection

---

## Limitations

Perceptual hashing is **brittle**. Many simple transformations break it:

| Transformation | aHash | dHash | pHash |
|----------------|-------|-------|-------|
| Resize | OK | OK | OK |
| JPEG compress | OK | OK | OK |
| Brightness change | BREAKS | OK | OK |
| Rotation (any angle) | BREAKS | BREAKS | BREAKS |
| Mirror/flip | BREAKS | BREAKS | BREAKS |
| Add border | BREAKS | BREAKS | BREAKS |
| Crop 10% | BREAKS | BREAKS | BREAKS |
| Add text overlay | BREAKS | BREAKS | BREAKS |

Someone who wants to bypass duplicate detection just needs to:
- Rotate 5 degrees
- Add a thin border
- Crop slightly
- Mirror the image

**This is a fundamental limitation.** Perceptual hashing only catches lazy, exact copies.

---

## The Better Approach: Watermark Detection

Here's the insight: **if an image contains our watermark, it's already been minted**.

The watermark is specifically designed to survive all the transformations that break perceptual hashing:
- Rotation ✓
- Borders ✓
- Cropping ✓
- JPEG compression ✓
- Resizing ✓

So instead of (or in addition to) perceptual hashing:

```
1. Upload image
2. Try to extract watermark from image
3. If watermark found → this is a copy of token #X → REJECT
4. If no watermark → proceed with perceptual hash check
5. If perceptual hash matches → similar to existing image → REJECT
6. Otherwise → allow mint
```

This catches:
- **Copies of NFTmarket images**: Watermark extraction catches them
- **Copies of external images**: Perceptual hash catches exact copies
- **Modified copies of external images**: Still a gap (no watermark to find)

The watermark check is more robust for our own images. Perceptual hashing is a fallback for images that originated outside the platform.

---

## NFTmarket Implementation

Located in `backend/src/services/duplicate.js`:

```javascript
// Simplified from actual code
async function computePerceptualHash(imageBuffer) {
  // Shrink to 8x8 grayscale
  const pixels = await sharp(imageBuffer)
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  // Calculate average
  const avg = pixels.reduce((sum, p) => sum + p, 0) / pixels.length;

  // Build hash
  let hash = "";
  for (const pixel of pixels) {
    hash += pixel > avg ? "1" : "0";
  }

  // Convert to hex
  return binaryToHex(hash);
}

function hammingSimilarity(hash1, hash2) {
  const bin1 = hexToBinary(hash1);
  const bin2 = hexToBinary(hash2);

  let matches = 0;
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] === bin2[i]) matches++;
  }

  return matches / bin1.length;
}
```

The mint process:
1. Compute pHash of uploaded image
2. Compare against all stored pHashes
3. Reject if any match >95% similar
4. After successful mint, store the pHash for future comparisons

---

## Perceptual Hash vs Watermark

| | Perceptual Hash | Watermark Extraction |
|---|---|---|
| **Purpose** | Catch lazy copies | Catch any copy of our images |
| **Survives rotation** | No | Yes |
| **Survives border** | No | Yes |
| **Survives crop** | No | Yes (partial) |
| **Survives JPEG** | Yes | Yes |
| **Works on external images** | Yes | No (no watermark to find) |

**The watermark is the better duplicate detector for images that originated on NFTmarket.**

The perceptual hash is only useful for:
1. Catching exact copies of external images (not minted here)
2. A fast pre-check before the more expensive watermark extraction

Current implementation only uses perceptual hashing. Adding watermark extraction at upload time would significantly improve duplicate detection.

---

## Current State vs Ideal

### What We Have Now

1. SHA-256 exact hash check (catches identical files)
2. Perceptual hash check (catches resized/compressed copies)

### What We Should Add

1. **Watermark extraction on upload** - if watermark found, reject immediately
2. Better perceptual hashing (proper DCT-based pHash instead of aHash)
3. Store rotated/mirrored variants of the hash

### Scaling Challenges

The current implementation compares against every stored hash:

```javascript
const pHashDocs = await db
  .collection("imageHashes")
  .limit(10000)  // ← This won't scale
  .get();
```

At scale, you need:
- **Locality-Sensitive Hashing (LSH)**: Groups similar hashes into buckets
- **VP-Trees**: Efficient nearest-neighbor search in metric spaces
- **Approximate Nearest Neighbors (ANN)**: Libraries like Faiss, Annoy

---

## Why NFTmarket Doesn't Use Duplicate Detection

After evaluating these options, NFTmarket decided against automatic duplicate detection:

1. **Perceptual hashing is too brittle** - Simple transformations bypass it
2. **Comparing against all minted images is expensive** - O(n) comparisons at scale
3. **Web-based reverse image search doesn't help** - It searches the public web, not our database
4. **Building our own image search index is complex** - Requires vector databases, CNN embeddings, infrastructure

### The Alternative: Watermark-Based Provenance

Instead of trying to prevent duplicates, NFTmarket focuses on **proving ownership after the fact**:

- Every minted image gets a watermark with `wallet:tokenId`
- The watermark survives all the transformations that break perceptual hashing
- Disputes are resolved by extracting the watermark and checking timestamps

### Artist Responsibility

This means artists must protect their originals:

- **Mint first, share later** - Don't post unwatermarked images online
- **Keep originals private** - Anyone with the unwatermarked original could mint it
- **Timestamps prove priority** - If two people mint similar images, the earlier timestamp wins

### The Blockchain Timestamp Is the Resolution

Every mint is recorded on-chain with an immutable timestamp:

```
Token #42: Block 18,234,567 (January 15, 2025, 14:32:01 UTC)
Token #99: Block 18,300,000 (January 20, 2025, 09:15:44 UTC)
```

The earlier timestamp wins. This cannot be forged or disputed.

### Both Preview and Original Are Watermarked

The preview thumbnail is generated from the watermarked image, so even screenshots of the preview can be traced back to the token.

The blockchain provides immutable timestamps. The watermark (extracted by the watermarking authority) provides proof of which token an image belongs to. Together, they support ownership verification without requiring expensive duplicate detection.

---

*See also: [Protecting Originals](originals.md), [How Tokens Are Minted](how-tokens-are-minted.md), [All About Watermarking](all-about-watermarking.md)*
