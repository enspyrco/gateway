# Wallet Signing & Licensing

## License Signing Flow

### Listing (Seller Signs)

```
1. Seller sets price + license type
       │
       ▼
2. Backend generates EIP-712 typed data with license terms
       │
       ▼
3. Seller's wallet signs
       │
       ▼
4. Signature stored on-chain with listing
```

### Buying (Buyer Signs)

```
1. Buyer reviews listing + license terms
       │
       ▼
2. Backend generates EIP-712 typed data for purchase acceptance
       │
       ▼
3. Buyer's wallet signs
       │
       ▼
4. Transaction submitted with signature + payment
```

## What's Recorded On-Chain

- Seller signature (agreed to sell)
- Buyer signature (accepted license)
- License hash (SHA-256 of the legal terms)
- Timestamp of agreement

## Why This Matters

- Both parties cryptographically committed to the same license terms
- The license hash proves terms weren't altered after signing
- Creates a legally binding bilateral agreement
- Signatures are verifiable forever on blockchain

## EIP-712 Typed Data

EIP-712 is a standard for signing structured data. It shows the user exactly what they're signing in their wallet (not just a hex string).

### Listing Offer (Seller)
```
ListingOffer {
  tokenId: uint256
  price: uint256
  licenseType: uint8
  licenseHash: bytes32
  nonce: uint256
  expiry: uint256
}
```

### Purchase Acceptance (Buyer)
```
PurchaseAcceptance {
  tokenId: uint256
  price: uint256
  licenseType: uint8
  licenseHash: bytes32
  seller: address
  nonce: uint256
}
```

## License Types

| Type | Rights Granted | Seller Retains |
|------|---------------|----------------|
| **Display** | Personal viewing | Copyright + commercial rights |
| **Commercial** | Monetization allowed | Copyright |
| **Transfer** | Full copyright | Display rights only |

## Platform Fee

### How It Works

- 2.5% of every sale goes to the platform wallet
- Fee is calculated and transferred automatically in the `buy()` function

### Payment Flow

```
Buyer pays 1 ETH
       │
       ▼
Calculate fee: 1 ETH × 2.5% = 0.025 ETH
       │
       ├──► 0.025 ETH to platform wallet
       │
       └──► 0.975 ETH to seller
```

### Security: Immutable Platform Wallet

The platform wallet is **immutable** - set once at contract deployment and can never be changed.

```solidity
address public immutable platformWallet;
```

This guarantees:
- Platform wallet cannot be changed by anyone
- 2.5% fee always goes to the original platform
- No one can redirect fees to avoid commission
