# Zero-Knowledge Watermarks: Verification vs Extraction

The critical limitation of zero-knowledge watermark detection.

---

## The Key Insight

**Zero-knowledge watermark detection decentralizes *proof* but not *discovery*.**

| Operation | Input | Output | Can be ZK? |
|-----------|-------|--------|------------|
| **Verification** | Image + claimed watermark M | "Yes, M is present" or "No" | ✅ Yes |
| **Extraction** | Image only | "Watermark is M" (or none) | ❌ No |

Zero-knowledge lets you **verify a specific claim**, not **discover what's there**.

---

## Why Extraction Can't Be Zero-Knowledge

Extraction fundamentally requires revealing information:

```
Extraction:
  Input:  Image (unknown watermark)
  Output: "The watermark says 0x742d...:123"
          └── This IS the secret information!
```

If you output the watermark message, you've revealed it. There's nothing "zero-knowledge" about that.

---

## The Asymmetry

| Actor | Question | Answer |
|-------|----------|--------|
| **Token owner** | "Is this my image?" | ✅ Can prove it (knows their own watermark) |
| **Third party** | "Whose image is this?" | ❌ Cannot discover (doesn't know which watermark to check) |

---

## Concrete Example

### Alice (Token Owner)

```
Alice minted token #42 with watermark "0xAlice:42"

Alice finds her image on a pirate website
       ↓
Alice thinks: "That looks like my artwork"
       ↓
Alice generates ZK proof: "This image contains 0xAlice:42"
       ↓
Proof verifies ✅
       ↓
Alice can prove to anyone: "This is mine"
```

✅ **Works perfectly.** Alice knows her own watermark.

### Bob (Random Third Party)

```
Bob finds an image online

Bob thinks: "I wonder who owns this?"
       ↓
Bob has no idea which watermark to check
       ↓
Bob could try:
  - "Does it contain 0xAlice:42?" → generate proof → check
  - "Does it contain 0xBob:17?" → generate proof → check
  - "Does it contain 0xCharlie:99?" → generate proof → check
  - ... millions more possibilities
       ↓
Completely impractical
       ↓
Bob cannot answer "whose is this?"
```

❌ **Doesn't work.** Discovery requires the secret key.

---

## The Philosophical Layer

> **You can prove what you know, but you can't learn what you don't.**

The owner has knowledge (their watermark). ZK lets them prove it without revealing how.

The stranger has no knowledge. ZK can't conjure knowledge from nothing.

This is analogous to password verification vs password recovery:
- A system can verify "is this the correct password?" without storing it
- But it cannot answer "what IS the password?" - that's deliberately not recoverable

---

## What This Means for NFTmarket

### What ZK Enables

| Use Case | Works? |
|----------|--------|
| Artist proves they own an image | ✅ Yes |
| Buyer verifies seller's ownership claim | ✅ Yes |
| Artist submits DMCA with self-generated proof | ✅ Yes |
| Court case where owner proves their copyright | ✅ Yes |

### What ZK Does NOT Enable

| Use Case | Works? |
|----------|--------|
| Platform scans uploads for stolen content | ❌ No |
| Random person identifies owner of found image | ❌ No |
| Automated infringement detection | ❌ No |
| "Reverse lookup" from image to owner | ❌ No |

---

## The Two-Phase Architecture

This suggests a split:

**Discovery (Still Centralized)**
```
"What watermark is in this image?"
       ↓
Submit to authority
       ↓
Authority extracts (using secret key)
       ↓
Returns: "This is token #42, owned by 0xAlice"
```

**Proof (Decentralized via ZK)**
```
"Prove token #42 is really in this image"
       ↓
Alice generates ZK proof herself
       ↓
Anyone can verify
       ↓
No authority needed
```

The authority is needed to **identify**, but not to **prove**.

---

## If NFTmarket Disappears

| Function | Outcome |
|----------|---------|
| Can artists prove they own their images? | ✅ Yes (ZK proofs work forever) |
| Can buyers verify a seller's claim? | ✅ Yes |
| Can anyone scan internet for stolen art? | ❌ No (discovery dies) |
| Can platforms auto-detect infringement? | ❌ No |

---

## Summary

```
         Verification                    Discovery
         ────────────                    ─────────
         "Is X true?"                    "What is X?"
              │                               │
              ▼                               ▼
         ZK-enabled                    Requires secret key
         Decentralized                    Centralized
         Survives authority death         Dies with authority
```

The owner can always prove ownership. But finding out who owns an arbitrary image still requires the authority with the extraction key.

---

*Part of the NFTmarket documentation. See also: [Central Point of Failure](central-point-of-failure.md), [All About Watermarking](all-about-watermarking.md)*
