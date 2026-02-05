# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile              # Compile contracts
npm test                     # Run all tests
npm run node                 # Start local Hardhat node
npm run deploy:local         # Deploy to local node (requires node running)
npm run deploy:mumbai        # Deploy to Mumbai testnet
npm run deploy:polygon       # Deploy to Polygon mainnet

# Run single test file
npx hardhat test test/NFTmarketNFT.test.js
```

## Contracts

**NFTmarketNFT.sol** - UUPS-upgradeable ERC-721 NFT contract with integrated marketplace for AI art.

### Architecture: Multi-Authority System

The contract operates as a "platform of platforms" where multiple authorities (watermarking services) can mint tokens:

```
Contract Owner
├── registerAuthority() - Add new watermarking authorities
├── deactivateAuthority() - Disable misbehaving authorities
└── upgradeContract() - UUPS upgrades

Authority Admin (per authority)
├── addMinter() - Add wallets to their authority
├── removeMinter() - Remove wallets from their authority
└── updateAuthorityFee() - Change their fee percentage

Minters (wallets)
├── reserveTokenId() - Reserve token ID atomically
└── mint() - Mint tokens (fees from sales go to them)
```

### Key Features

- **UUPS Proxy Pattern**: Upgradeable without redeployment
- **Multi-Authority**: Third parties can run their own watermarking services
- **Fee to Minter**: The wallet that minted a token receives commission on sales (not a platform wallet)
- **License Types**: Display (personal use), Commercial (monetization), Transfer (full copyright)
- **Duplicate Prevention**: `imageHashExists` mapping prevents re-minting same image
- **Integrated Marketplace**: `list()`, `delist()`, `buy()` functions with EIP-712 signatures
- **Auto-delist**: Tokens automatically delist when transferred outside marketplace

Inherits from OpenZeppelin Upgradeable v5.0: ERC721Upgradeable, ERC721URIStorageUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable

### Data Structures

```solidity
struct Authority {
    address admin;           // Can add/remove minters for this authority
    uint96 feeBps;           // Fee in basis points (250 = 2.5%)
    bool isActive;           // Can be deactivated by contract owner
    uint256 registeredAt;    // Timestamp
}

struct TokenData {
    address creator;         // Who the token was minted TO
    address copyrightOwner;  // Current copyright holder
    LicenseType ownerLicense;
    bytes32 imageHash;       // SHA-256 of watermarked image
    uint256 mintedAt;
    string ipfsUri;          // Public watermarked image on IPFS
    uint256 parentToken;     // For derivative tracking
    uint256 originalToken;
    bool isOriginal;
    uint256 authorityId;     // Which authority minted this token
    address minter;          // Wallet that minted (receives fees)
}

struct Listing {
    uint256 price;
    LicenseType licenseType;
    bytes32 licenseHash;
    uint256 expiry;
    bool active;
}
```

### Key Functions

| Function | Access | Description |
|----------|--------|-------------|
| `initialize(owner, defaultAdmin, feeBps)` | Once | Replace constructor, creates Authority 0 |
| `registerAuthority(admin, feeBps)` | onlyOwner | Add new watermarking authority |
| `deactivateAuthority(authorityId)` | onlyOwner | Disable an authority |
| `addMinter(minter)` | Authority admin | Add minter to admin's authority |
| `removeMinter(minter)` | Authority admin | Remove minter from admin's authority |
| `updateAuthorityFee(authorityId, feeBps)` | Authority admin | Update fee (admin's authority only) |
| `reserveTokenId()` | Minter | Reserve token ID atomically (5 min expiry) |
| `mint(...)` | Minter | Mint with reserved token ID |
| `list(...)` | Token owner | List for sale with EIP-712 signature |
| `buy(...)` | Anyone | Purchase with EIP-712 signature + payment |
| `withdrawFees()` | Minter | Withdraw accumulated fees (pull pattern) |
| `pendingFees(address)` | view | Check pending fees for an address |

### Fee Distribution (Pull Pattern)

When a token is sold on the marketplace:
1. Fee calculated: `price * authority.feeBps / 10000` (max 50% cap enforced)
2. Fee **accrued** to `pendingFees[tokenData[tokenId].minter]` (not transferred immediately)
3. Remainder sent to seller immediately
4. Minter calls `withdrawFees()` to collect accrued fees

This pull pattern:
- Prevents sales from being blocked if minter is a contract that rejects ETH
- Allows platforms to pool minting across multiple wallets while tracking fees per-wallet
- Minters can batch-withdraw accumulated fees

## Deployment

The contract uses UUPS proxy pattern. Deployment creates:
1. Implementation contract (logic)
2. ERC1967Proxy (holds state, delegates to implementation)

```javascript
// Deploy creates both contracts
const contract = await upgrades.deployProxy(
  NFTmarketNFT,
  [owner, defaultAdmin, feeBps],
  { kind: 'uups' }
);

// deployment.json contains both addresses
{
  "proxyAddress": "0x...",
  "implementationAddress": "0x...",
  "defaultAuthorityId": 0,
  "version": "2.0.0"
}
```

## Environment Variables

Copy `.env.example` to `.env`:
- `PRIVATE_KEY` - Deployment wallet (without 0x prefix)
- `MUMBAI_RPC_URL` / `POLYGON_RPC_URL` - Network endpoints
- `POLYGONSCAN_API_KEY` - For contract verification

## Important Notes

- Uses custom errors (e.g., `ImageAlreadyRegistered()`, `NotAuthorityAdmin()`) instead of require strings
- Solidity 0.8.22 with viaIR optimizer enabled
- Proxy address is stable across upgrades; implementation address changes
- Encrypted originals stored off-chain in Firestore (not on blockchain)
- Authority 0 is created during initialization with the deployer as admin
- Storage gaps (`uint256[50] private __gap`) reserved for future upgrades
- `MAX_FEE_BPS = 5000` (50% max fee cap on all authorities)
- Fees use pull pattern (`withdrawFees()`) - not transferred directly on sale
- License tokens (from Display/Commercial sales) cannot be re-listed (no sublicensing)
