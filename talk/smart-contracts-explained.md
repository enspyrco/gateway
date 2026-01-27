# Smart Contracts and NFTs Explained

A summary of how the NFTmarket smart contract works.

---

## What Is a Smart Contract?

A smart contract is:

1. **A database** - stores data (who owns what, listings, licenses)
2. **+ Code** - has functions that modify that data (mint, buy, transfer)
3. **On a blockchain** - replicated across thousands of computers

| Traditional App | Smart Contract |
|-----------------|----------------|
| Database (Postgres) | State variables (mappings, structs) |
| Backend code (Node.js) | Solidity functions |
| Runs on your server | Runs on the blockchain |
| You control it | No one controls it |

Once deployed, the code is permanent and no single party controls it.

---

## What Is an NFT?

An NFT is **not** a special kind of smart contract. An NFT is just a **record in a database** - and that database is a smart contract.

```
Smart Contract (the database)
├── Token #0 → owned by 0xAlice
├── Token #1 → owned by 0xBob
├── Token #2 → owned by 0xAlice
└── Token #3 → owned by 0xCharlie
```

An NFT is just a row in a table that says "token X is owned by address Y."

### ERC-721: The Standard Interface

ERC-721 defines what functions an NFT contract must have:

- `ownerOf(tokenId)` - Who owns this token?
- `transferFrom(from, to, id)` - Transfer ownership
- `balanceOf(address)` - How many tokens does this address own?

### What Makes It "Non-Fungible"?

**Non-fungible means non-interchangeable** - each token has a unique identity, not necessarily a different price.

- **Fungible:** 1 dollar bill = any other dollar bill (interchangeable)
- **Non-Fungible:** Token #0 ≠ Token #1 (unique identity)

Two NFTs can have the same market price. "Non-fungible" just means they're tracked individually and can't be swapped blindly.

---

## What Is IPFS?

**IPFS (InterPlanetary File System)** is a decentralized file storage network.

| Traditional Web | IPFS |
|-----------------|------|
| `https://example.com/image.png` | `ipfs://QmX4z...abc` |
| Location-based (specific server) | Content-based (hash of file) |
| Server goes down = file gone | File exists if anyone has it |

### Why NFTs Use IPFS

Storing images on-chain is extremely expensive. So NFTs store:

- **On-chain:** Just the URI (`ipfs://Qm...`)
- **On IPFS:** The actual image and metadata

The image lives on IPFS, the ownership record lives on the blockchain.

### Pinning Services

Files only exist on IPFS if someone hosts them. Services like **Pinata** guarantee your files stay available for a monthly fee.

---

## How NFTmarket Handles Copyright

Normally, buying an NFT gives you **zero copyright**. You own the token, not the art. The artist retains full copyright.

### The NFTmarket Approach

This contract encodes a **license type** into each token:

```
enum LicenseType {
    Display,      // Personal display only ($1)
    Commercial,   // Can monetize - sell prints, merch ($5)
    Transfer      // Full copyright transfer ($10)
}
```

Each token stores:

- `licenseType` - What rights were purchased
- `licenseHash` - Hash of the signed legal agreement

### The Mint Flow

1. Buyer selects license type
2. Buyer signs a real legal agreement via wallet signature
3. Hash of signed agreement stored on-chain
4. Token minted with license type embedded

### What This Proves

In a legal dispute, you can show:

- Token ownership (on-chain)
- License type purchased (on-chain)
- Signed agreement hash matches (on-chain)
- Original signed document (off-chain, hash verifiable)

**Important:** Smart contracts can't enforce copyright law - courts do that. The contract provides immutable evidence, not enforcement.

---

## The NFTmarket Contract

### Key Features

| Feature | Details |
|---------|---------|
| Standard | ERC-721 + ERC-2981 (royalties) |
| Blockchain | Polygon |
| Royalties | 2.5% to creator on secondary sales |
| Platform Fee | 2.5% on marketplace sales |

### Marketplace Functions

- `mint()` - Create new NFT with license type
- `list(tokenId, price)` - List for sale
- `delist(tokenId)` - Remove listing
- `buy(tokenId)` - Purchase (payable)

### Security Features

- **Duplicate prevention** - Same image can't be minted twice
- **ReentrancyGuard** - Protects against reentrancy attacks
- **Auto-delist** - Tokens transferred outside marketplace are delisted

---

## Summary

- A **smart contract** is a database + code running on a blockchain
- An **NFT** is just a record of ownership in that database
- **IPFS** stores the actual files; the blockchain stores ownership
- **Non-fungible** means unique identity, not different price
- This project adds **license types** to NFTs to address copyright
- The contract provides **evidence** for legal purposes, not enforcement

---

*Generated from a discussion about the NFTmarket codebase.*
