# NFTmarket Licensing System

This document explains the licensing system used in NFTmarket, which enables creators to sell different levels of rights to their artwork while maintaining full provenance tracking.

## Overview

NFTmarket implements a **hierarchical licensing system** where:
- **Original tokens** can grant licenses (mint new tokens) or transfer full copyright
- **License tokens** can be transferred (sold) but cannot sub-license

This design solves a key problem with traditional NFTs: purchasing an NFT doesn't convey any actual copyright or usage rights. NFTmarket makes these rights explicit and enforceable on-chain.

## License Types

Three license levels form a strict hierarchy:

| Level | Type | Rights Granted |
|-------|------|----------------|
| 0 | **Display** | Personal display only. Cannot use commercially. |
| 1 | **Commercial** | Commercial usage rights. Can monetize, create merchandise. |
| 2 | **Transfer** | Full copyright transfer. All rights including sublicensing. |

### Rights Cannot Be Escalated

You can only sell rights equal to or less than what you have:
- Transfer holder → can sell Display, Commercial, or Transfer
- Commercial holder → can only sell Commercial or Display
- Display holder → can only sell Display

## How Sales Work

### Original Token Sales

When selling an **original token** (created by the original mint):

| Sale Type | What Happens | Seller Keeps | Buyer Gets |
|-----------|--------------|--------------|------------|
| Display | New token minted | Original + full copyright | License token (Display) |
| Commercial | New token minted | Original + full copyright | License token (Commercial) |
| Transfer | Token transferred | Display rights only | Original token + copyright |

### License Token Sales

**License tokens cannot sub-license.** They can only be sold via Transfer, which transfers the token itself (not copyright) to the new owner.

| Sale Type | What Happens |
|-----------|--------------|
| Display/Commercial | **NOT ALLOWED** - reverts with `LicenseTokensCannotSubLicense` |
| Transfer | Token transferred, buyer gets same license level |

## Provenance Tracking

Every token maintains a complete provenance chain:

```solidity
struct TokenData {
    address creator;          // Original artist - never changes
    address copyrightOwner;   // Current copyright holder
    LicenseType ownerLicense; // License level of current owner
    uint256 parentToken;      // Token this was licensed from (0 if original)
    uint256 originalToken;    // Root of the provenance chain
    bool isOriginal;          // true = original mint, false = license token
    // ... other fields
}
```

### Provenance Chain

You can trace any token back to the original:

```
Original (tokenId: 0)
├── Display License (tokenId: 1) → granted to Alice
├── Commercial License (tokenId: 2) → granted to Bob
│   └── (Bob can sell token 2 to Carol, but cannot sub-license)
└── Commercial License (tokenId: 3) → granted to Dave
```

### Events for Provenance

The contract emits events for complete on-chain provenance:

```solidity
// When original is minted
event Minted(uint256 indexed tokenId, address indexed creator, bytes32 imageHash);

// When license is granted (Display/Commercial sale)
event LicenseGranted(
    uint256 indexed newTokenId,    // The new license token
    uint256 indexed parentTokenId, // The source token
    uint256 indexed originalTokenId, // Root of chain
    address licensor,              // Who granted the license
    address licensee,              // Who received it
    LicenseType licenseType,       // Display or Commercial
    bytes32 licenseHash            // Hash of license agreement
);

// When copyright transfers (Transfer sale)
event CopyrightTransferred(uint256 indexed tokenId, address indexed from, address indexed to);

// When seller retains display rights after Transfer
event DisplayRightsRetained(uint256 indexed tokenId, address indexed holder);
```

### Querying Provenance

```solidity
// Get full chain from token back to original
function getProvenanceChain(uint256 tokenId) returns (uint256[] memory)

// Get token data including parent and original
function getTokenData(uint256 tokenId) returns (
    // ... other fields ...
    uint256 parentToken,
    uint256 originalToken,
    bool isOriginal
)
```

## Example Scenarios

### Scenario 1: Artist Sells Display Licenses

1. Alice mints artwork → Token 0 (original, Transfer rights)
2. Alice lists Token 0 for Display license sale
3. Bob buys → Token 1 minted (license, Display rights)
4. Carol buys → Token 2 minted (license, Display rights)
5. Alice still owns Token 0 with full copyright

Result:
- Token 0: Alice owns, Transfer rights, is original
- Token 1: Bob owns, Display rights, parent=0, can sell to others
- Token 2: Carol owns, Display rights, parent=0, can sell to others

### Scenario 2: License Token Changes Hands

1. Continuing from above, Bob sells Token 1 to Dave
2. Bob lists Token 1 as Transfer (the only option for license tokens)
3. Dave buys → Token 1 transfers to Dave
4. Dave now has Display rights (same as Bob had)

Result:
- Token 1: Dave owns, Display rights, provenance preserved

### Scenario 3: Copyright Transfer

1. Alice sells Token 0 as Transfer to Eve
2. Token 0 transfers, copyright goes to Eve
3. Alice retains Display rights (recorded on-chain)
4. Eve can now grant new licenses from Token 0

Result:
- Token 0: Eve owns, Transfer rights, is still original
- Alice has Display rights (moral rights preserved)
- Eve can create new license tokens from Token 0

## Rights Verification

Query who has what rights:

```solidity
// Anyone with display rights (owner, creator, or retained from Transfer)
function checkDisplayRights(uint256 tokenId, address account) returns (bool)

// Anyone with commercial rights (copyright owner or Commercial+ license holder)
function checkCommercialRights(uint256 tokenId, address account) returns (bool)

// The current copyright owner
function checkCopyrightOwnership(uint256 tokenId, address account) returns (bool)

// Maximum license level the current owner can sell
function getMaxSellableLicense(uint256 tokenId) returns (LicenseType)
```

## Key Invariants

1. **Creator always has Display rights** (moral rights, cannot be taken away)
2. **Copyright owner never changes** unless Transfer sale occurs
3. **License tokens cannot sub-license** - they can only change hands
4. **Provenance is immutable** - parentToken and originalToken never change
5. **Rights cannot escalate** - you can't sell more rights than you have

## Smart Contract Errors

| Error | When It Occurs |
|-------|----------------|
| `CannotEscalateRights` | Trying to list original token above your license level |
| `LicenseTokensCannotSubLicense` | Trying to list license token as Display/Commercial |
| `NotTokenOwner` | Trying to list/delist token you don't own |

## Bilateral Agreement

All marketplace sales require both seller and buyer to sign EIP-712 typed data agreeing to the license terms. This creates a legally binding bilateral agreement recorded on-chain:

```solidity
event BilateralAgreement(
    uint256 indexed tokenId,
    bytes sellerSignature,
    bytes buyerSignature,
    uint256 timestamp
);
```

The `licenseHash` in both signatures is the SHA-256 hash of the full license text, ensuring both parties agreed to the exact same terms.
