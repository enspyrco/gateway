# Provenance

## How Provenance Is Tracked

Every ownership change emits events that create an immutable history on the blockchain.

## Events That Track Provenance

| Event | What It Records |
|-------|-----------------|
| `Transfer(from, to, tokenId)` | ERC-721 standard - every ownership change |
| `Minted(tokenId, creator, imageHash)` | Original creation (from = 0x0) |
| `Sold(tokenId, seller, buyer, price, licenseType, licenseHash)` | Marketplace sale with terms |
| `CopyrightTransferred(tokenId, from, to)` | Copyright ownership change |
| `BilateralAgreement(tokenId, sellerSig, buyerSig, timestamp)` | Signed license agreement |

## Where Events Are Stored

Events are stored **on the blockchain** in transaction logs.

```
Smart Contract emits event
       │
       ▼
Event stored in transaction receipt (logs)
       │
       ▼
Logs are part of the block (immutable)
       │
       ▼
Indexed by topic (tokenId, addresses)
```

| What | Where |
|------|-------|
| Event data | Transaction logs on-chain |
| Indexed fields | Bloom filter for fast queries |
| Full history | Every Ethereum/Polygon node |

## Building the Provenance Chain

```
1. Query all Transfer events for tokenId
       │
       ▼
2. First Transfer (from = 0x0) = Original mint
       │
       ▼
3. Each subsequent Transfer = Ownership change
       │
       ▼
4. Match with Sold events for price/license details
       │
       ▼
5. Current owner = last "to" address
```

## Querying Events

```javascript
// Get all transfers for a token
const filter = contract.filters.Transfer(null, null, tokenId);
const events = await contract.queryFilter(filter);

// Returns array of all Transfer events for that token
```

## Example Provenance Chain

```
Token #42 Provenance:
─────────────────────
1. 2024-01-15: Minted by Alice (creator)
2. 2024-02-20: Sold to Bob for 0.5 ETH (Display license)
3. 2024-03-10: Sold to Carol for 1.2 ETH (Commercial license)
4. Current owner: Carol
   Copyright owner: Alice (never transferred)
```

## Key Point

Events are stored forever on-chain. Any node can reconstruct the full provenance history by querying logs. No separate database needed.
