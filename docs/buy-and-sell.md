# How NFTs Are Bought and Sold

The NFTmarket marketplace with bilateral signatures and license-aware transfers.

---

## Overview

NFTmarket has an integrated marketplace in the smart contract. Key features:

- **Bilateral signatures** - Both buyer and seller sign the agreement
- **License types** - Seller chooses what rights to transfer
- **On-chain license hash** - Legal agreement is recorded on-chain
- **Platform fee** - 2.5% goes to platform

---

## The Three License Types

When listing a token, the seller chooses what rights to sell:

| License | What Buyer Gets | What Seller Keeps |
|---------|-----------------|-------------------|
| **Display** | Token + personal display rights | Copyright, commercial rights |
| **Commercial** | Token + commercial usage rights | Copyright |
| **Transfer** | Token + full copyright | Display rights only |

**Key constraint:** You can't sell more rights than you have.

```
Creator mints with Transfer → can sell Display, Commercial, or Transfer
Buyer gets Commercial → can only resell Display or Commercial (not Transfer)
```

---

## Listing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        SELLER                                │
│                                                              │
│  1. Choose token, price, license type                       │
│  2. Read license agreement text                             │
│  3. Sign license agreement (EIP-712)                        │
│  4. Call contract.list() with signature                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SMART CONTRACT                          │
│                                                              │
│  1. Verify seller owns token                                │
│  2. Verify seller has rights to sell this license type     │
│  3. Verify seller's signature                               │
│  4. Store listing (price, license, signature, expiry)      │
│  5. Emit Listed event                                       │
└─────────────────────────────────────────────────────────────┘
```

### What Gets Stored On-Chain

```solidity
struct Listing {
    address seller;
    uint256 price;
    LicenseType licenseType;    // Display, Commercial, or Transfer
    bytes32 licenseHash;        // SHA-256 of license agreement
    uint256 nonce;              // Replay protection
    uint256 expiry;             // Optional expiration
    bytes sellerSignature;      // EIP-712 signature
    bool active;
}
```

---

## Buying Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         BUYER                                │
│                                                              │
│  1. Browse listings, find token                             │
│  2. Read license agreement (same one seller signed)        │
│  3. Sign purchase acceptance (EIP-712)                      │
│  4. Call contract.buy() with signature + payment           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SMART CONTRACT                          │
│                                                              │
│  1. Verify listing is active and not expired                │
│  2. Verify payment is sufficient                            │
│  3. Verify buyer's signature                                │
│  4. Transfer license rights (based on license type)        │
│  5. Distribute payment (seller, platform fee)              │
│  6. Transfer NFT ownership                                  │
│  7. Emit Sold + BilateralAgreement events                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Bilateral Signatures

Both parties sign the same license agreement:

```
┌─────────────┐         ┌─────────────┐
│   SELLER    │         │    BUYER    │
│             │         │             │
│ Signs:      │         │ Signs:      │
│ - tokenId   │         │ - tokenId   │
│ - price     │         │ - price     │
│ - license   │         │ - license   │
│ - hash      │         │ - hash      │
│ - nonce     │         │ - seller    │
│ - expiry    │         │ - nonce     │
└─────────────┘         └─────────────┘
        │                       │
        └───────────┬───────────┘
                    ▼
         ┌─────────────────────┐
         │   BilateralAgreement │
         │   Event (on-chain)   │
         │                      │
         │  Both signatures     │
         │  recorded forever    │
         └─────────────────────┘
```

This proves both parties agreed to the exact same terms.

---

## License Rights Transfer

### Display Sale (New License Token Minted)

A **new license token** is minted for the buyer. The seller keeps their original token and full copyright.

```
Before: Seller owns Token 0 (original, Transfer rights)
After:  Seller still owns Token 0 (unchanged)
        Buyer receives Token N (license token, Display rights)
        Token N → parentToken=0, isOriginal=false
```

The original token's other listings remain active — the seller can still sell Commercial or Transfer.

### Commercial Sale (New License Token Minted)

Same mechanics as Display — a new license token is minted for the buyer.

```
Before: Seller owns Token 0 (original, Commercial or Transfer rights)
After:  Seller still owns Token 0 (unchanged)
        Buyer receives Token N (license token, Commercial rights)
        Token N → parentToken=0, isOriginal=false
```

### Transfer Sale (Token + Copyright Transfer)

The actual token transfers to the buyer along with copyright. Seller retains personal display rights.

```
Before: Seller owns Token 0, Copyright=Seller
After:  Buyer owns Token 0, Copyright=Buyer, License=Transfer
        Seller gets hasDisplayRights[seller][Token 0] = true
```

All listings for this token are cleared (since ownership changed). The seller can still display the image for personal use, but has no commercial rights.

### License Token Sales

License tokens (non-originals) **cannot sub-license**. They can only be sold via Transfer, which transfers the token itself:

```
Bob owns Token 1 (license token, Display rights)
Bob lists Token 1 as Transfer → Token 1 moves to Carol
Carol now has Display rights (same as Bob had)
```

Attempting to list a license token as Display or Commercial reverts with `LicenseTokensCannotSubLicense`.

---

## Payment Distribution

```
Sale price: 1 ETH (authority fee: 250 bps = 2.5%)
                    ┌─────────────────────┐
                    │   Minter fee: 2.5%  │ → 0.025 ETH (accrued, pull pattern)
                    ├─────────────────────┤
                    │   Seller: 97.5%     │ → 0.975 ETH (paid immediately)
                    └─────────────────────┘
```

- **Minter fee**: Configurable per-authority in basis points (max 50%). Accrued to the wallet that minted the token — withdrawn via `withdrawFees()` (pull pattern).
- **Seller**: Remainder paid immediately on purchase.

---

## Delisting

Owner can delist a specific license type or all at once:

```solidity
// Remove one license type listing
function delist(uint256 tokenId, LicenseType licenseType) external {
    // Only seller can delist
    // Sets listing for this license type to inactive
    // Emits Delisted event
}

// Remove all license type listings for a token
function delistAll(uint256 tokenId) external {
    // Only token owner can call
    // Clears Display, Commercial, and Transfer listings
    // Emits Delisted event
}
```

Listings also auto-expire if `expiry` timestamp passes.

### Multi-License Listings

A token can have up to 3 simultaneous listings — one per license type — at different prices:

```
Token 0 listings:
  [Display]    → 0.5 ETH (active)
  [Commercial] → 2.0 ETH (active)
  [Transfer]   → 10 ETH  (active)
```

When a buyer purchases a specific license type, only that listing is consumed:
- **Display/Commercial purchase**: The listing is consumed, a new license token is minted, other listings remain active
- **Transfer purchase**: All listings are cleared (ownership is changing)

---

## External Transfers

If a token is transferred outside the marketplace (e.g., direct transfer, OpenSea), the contract **automatically delists all license types** via the `_update` hook:

```solidity
function _update(address to, uint256 tokenId, address auth) internal override {
    // Auto-delist all license types when transferred
    for (uint8 i = 0; i <= uint8(LicenseType.Transfer); i++) {
        if (listings[tokenId][i].active) {
            listings[tokenId][i].active = false;
        }
    }
    emit Delisted(tokenId, from);
}
```

This is proactive, not passive — listings don't just fail on buy, they are actively cleaned up when ownership changes.

---

## Third-Party Marketplaces

NFTmarket tokens are standard ERC-721, so any marketplace can trade them. But there are two paths with different trade-offs:

### Path 1: Standard ERC-721 Transfer

Any marketplace (OpenSea, Blur, etc.) can trade using standard `transferFrom()`:

```
OpenSea listing → Buyer pays → transferFrom() → NFT moves
```

| Pros | Cons |
|------|------|
| Works on any marketplace | No bilateral license agreement |
| No fee to NFTmarket | License rights don't update on-chain |
| Simple integration | No `BilateralAgreement` event recorded |

The buyer inherits whatever license the seller had. No new signed agreement.

### Path 2: Use NFTmarket's Integrated Marketplace

Third parties can call `list()` and `buy()` directly on the NFTmarket contract:

```
Third-party UI → Generate EIP-712 data → User signs → Call NFTmarket contract
```

Everything needed is public:

| Component | Access |
|-----------|--------|
| EIP-712 type hashes | On-chain constants |
| Domain separator | `getDomainSeparator()` |
| `list()` / `buy()` | Public functions |
| License templates | Can replicate or create own |

| Pros | Cons |
|------|------|
| Full bilateral signatures | 2.5% goes to NFTmarket |
| License rights update on-chain | More complex integration |
| Legal agreements on Arweave | Must replicate signature flow |

### How Third Parties Make Money

If they use Path 2, the 2.5% platform fee goes to NFTmarket. Options for third parties:

| Strategy | How It Works |
|----------|--------------|
| **Add fee to price** | List at 1.05 ETH, pocket 0.05, forward 1.0 to contract |
| **Use Path 1 instead** | Standard ERC-721 transfer, charge their own fee, no fee to NFTmarket |
| **Subscription model** | Charge sellers/buyers for platform access |
| **Premium features** | Analytics, promotion, curation services |
| **Wrapper contract** | Their contract takes a cut before calling NFTmarket |
| **Revenue share** | Partner with NFTmarket for a cut of the 2.5% |

Most third-party marketplaces would likely use **Path 1** (standard ERC-721) and charge their own fees, bypassing the integrated marketplace entirely.

### What Only NFTmarket Can Do

| Action | Why |
|--------|-----|
| Mint new tokens | Requires watermark secret key |
| Verify watermarks | Requires watermark secret key |
| Prove provenance | Only NFTmarket can extract `wallet:tokenId` from images |

The watermark is the moat. Anyone can trade the NFT, but only NFTmarket can prove which token an image belongs to.

### The Contract as Protocol

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   NFTmarket     │     │  Third-Party A  │     │  Third-Party B  │
│   (official)    │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │   Path 2 (integrated) │   Path 1 (ERC-721)   │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   NFTmarketNFT.sol      │
                    │                         │
                    │   Standard ERC-721 +    │
                    │   Optional integrated   │
                    │   marketplace           │
                    └─────────────────────────┘
```

---

## API Endpoints

The backend doesn't execute transactions - it provides data for the client:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/marketplace` | List all active listings |
| `GET /api/marketplace/:tokenId` | Get listing details |
| `POST /api/marketplace/list/typed-data` | Get EIP-712 data for listing |
| `POST /api/marketplace/buy/typed-data` | Get EIP-712 data for buying |
| `GET /api/marketplace/nonce/:address` | Get nonce for signatures |

The client signs the typed data and calls the smart contract directly.

---

## EIP-712 Typed Data

Both listing and purchase use EIP-712 structured signatures:

### Listing Offer (Seller signs)

```javascript
{
  types: {
    ListingOffer: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'licenseType', type: 'uint8' },
      { name: 'licenseHash', type: 'bytes32' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' }
    ]
  },
  primaryType: 'ListingOffer',
  domain: { name: 'NFTmarket', version: '1', chainId, verifyingContract },
  message: { tokenId, price, licenseType, licenseHash, nonce, expiry }
}
```

### Purchase Acceptance (Buyer signs)

```javascript
{
  types: {
    PurchaseAcceptance: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'licenseType', type: 'uint8' },
      { name: 'licenseHash', type: 'bytes32' },
      { name: 'seller', type: 'address' },
      { name: 'nonce', type: 'uint256' }
    ]
  },
  primaryType: 'PurchaseAcceptance',
  domain: { name: 'NFTmarket', version: '1', chainId, verifyingContract },
  message: { tokenId, price, licenseType, licenseHash, seller, nonce }
}
```

---

## Security Features

| Feature | Purpose |
|---------|---------|
| Nonce | Prevents signature replay |
| Expiry | Listings can auto-expire |
| ReentrancyGuard | Prevents reentrancy attacks on buy |
| Ownership check | Can't list/sell token you don't own |
| Rights escalation check | Can't sell more rights than you have |
| Bilateral signatures | Both parties must agree |

---

## Events

```solidity
event Listed(uint256 tokenId, address seller, uint256 price, LicenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry);
event Delisted(uint256 tokenId, address seller);
event Sold(uint256 tokenId, address seller, address buyer, uint256 price, LicenseType, bytes32 licenseHash);
event BilateralAgreement(uint256 tokenId, bytes sellerSignature, bytes buyerSignature, uint256 timestamp);
event CopyrightTransferred(uint256 tokenId, address from, address to);
event DisplayRightsRetained(uint256 tokenId, address seller);
```

All marketplace activity is recorded on-chain via events.

---

## Fraud Scenarios

### What the watermark protects against

If someone takes an **already-watermarked image** (screenshot, download, etc.) and tries to mint it:

1. The original watermark is still embedded (original `wallet:tokenId`)
2. Detection via `/api/detect` reveals the original token
3. The fraudster's token has a later timestamp
4. Proof of fraud is clear

### What the watermark does NOT protect against

If someone obtains the **original unwatermarked image** before or after minting:

| Scenario | Outcome |
|----------|---------|
| Artist mints first, fraudster mints second | Artist has earlier timestamp = proof of fraud |
| Fraudster mints first with stolen original | Fraudster has earlier timestamp. Artist looks like the fraud. |

When a fraudster mints an original image, the system watermarks it with the **fraudster's** `wallet:tokenId`. There's no competing watermark to detect. The only evidence is timestamp comparison.

### If you buy a fraudulent token

**Bad luck.**

The buyer has no automatic recourse. Options:

1. **Compare timestamps** - Find the earlier token with the same image. The later one is the fraud.
2. **Sue the seller** - The seller's wallet address is on-chain. Legal action is the only recovery path.
3. **Social pressure** - Public exposure of the fraudster's wallet

The platform does not offer refunds or fraud protection. Buyer beware.

### Best protection for artists

**Mint before your original leaks.** Once minted, the watermark and timestamp protect you. Before minting, there's no protection.

---

## Summary

```
┌───────────────────────────────────────────────────────────────┐
│                     MARKETPLACE FLOW                           │
│                                                                │
│  1. Seller lists: sign agreement, set price/license, call list │
│  2. Buyer browses: see listings via API                        │
│  3. Buyer buys: sign agreement, send payment, call buy        │
│  4. Contract: verify both signatures, transfer NFT + rights   │
│  5. Payment: split between seller and platform                │
│  6. Record: both signatures stored on-chain forever           │
└───────────────────────────────────────────────────────────────┘
```

The bilateral signature system means both parties have signed the exact same license agreement, creating a legally binding record on-chain.

---

*Part of the NFTmarket documentation. See also: [Smart Contracts Explained](smart-contracts-explained.md), [How Tokens Are Minted](how-tokens-are-minted.md), [Copyright Reality](copyright.md)*
