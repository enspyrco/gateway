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

## Architecture

**NFTmarketNFT.sol** - ERC-721 NFT contract with integrated marketplace for AI art.

Key features:
- **License Types**: Display (personal use), Commercial (monetization), Transfer (full copyright)
- **Duplicate Prevention**: `imageHashExists` mapping prevents re-minting same image
- **Integrated Marketplace**: `list()`, `delist()`, `buy()` functions
- **Royalties**: 2.5% to creator on secondary sales (EIP-2981)
- **Platform Fee**: 2.5% on marketplace sales to `platformWallet`
- **Auto-delist**: Tokens automatically delist when transferred outside marketplace

Inherits from OpenZeppelin v5.0:
- ERC721, ERC721URIStorage, ERC721Royalty, Ownable, ReentrancyGuard

## Contract Data Structures

```solidity
struct TokenData {
    address creator;
    LicenseType licenseType;
    bytes32 imageHash;        // SHA-256 of original image
    bytes32 licenseHash;      // SHA-256 of signed license
    uint256 mintedAt;
    string encryptedBlobUri;  // IPFS URI of encrypted original
}
```

## Environment Variables

Copy `.env.example` to `.env`:
- `PRIVATE_KEY` - Deployment wallet (without 0x prefix)
- `MUMBAI_RPC_URL` / `POLYGON_RPC_URL` - Network endpoints
- `POLYGONSCAN_API_KEY` - For contract verification
- `PLATFORM_WALLET` - Fee recipient (defaults to deployer)

## Important Notes

- Uses custom errors (e.g., `ImageAlreadyRegistered()`) instead of require strings
- Deploy script uses fully qualified name: `contracts/NFTmarketNFT.sol:NFTmarketNFT`
- Solidity 0.8.20 with viaIR optimizer enabled
