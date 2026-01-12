# Review Configuration

## Project Context
AI art marketplace with watermark verification, NFT minting, and copyright licensing on Polygon.

## Tech Stack
- **Flutter**: Web frontend with Provider state management
- **Node.js/Express**: Backend API for watermarking, encryption, IPFS
- **Solidity/Hardhat**: ERC-721 smart contract with marketplace

## Review Focus Areas
- Wallet security and signature verification (SIWE)
- Smart contract security (reentrancy, access control)
- Image handling and encryption patterns
- Provider state management in Flutter
- API authentication and authorization

## Code Standards
- Flutter: flutter_lints, `dart format .`
- Backend: ES6+, async/await, Jest tests
- Contracts: OpenZeppelin patterns, custom errors, Hardhat tests

## Required Checks
- CI must pass for changed components
- Flutter: format, analyze, test
- Backend: npm test
- Contracts: compile, test
