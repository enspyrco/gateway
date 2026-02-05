# E2E Test: List for Sale Flow

This document describes the end-to-end flow when a user clicks "List for Sale" in the Flutter app, and how to verify it works correctly.

## Architecture Overview

```
Flutter App                 Wallet Service (3001)         Backend (3000)           Blockchain (8545)
    │                              │                           │                         │
    │── 1. selectAccount ─────────>│                           │                         │
    │<── sessionId ───────────────│                           │                         │
    │                              │                           │                         │
    │── 2. getAuthToken ──────────>│                           │                         │
    │<── SIWE token ──────────────│                           │                         │
    │                              │                           │                         │
    │── 3. prepareListing ────────────────────────────────────>│                         │
    │<── typedData + contractCall ────────────────────────────│                         │
    │                              │                           │                         │
    │── 4. signTypedData ─────────>│                           │                         │
    │<── signature ───────────────│                           │                         │
    │                              │                           │                         │
    │── 5. sendTransaction ───────>│                           │                         │
    │                              │── list(tokenId,...) ─────────────────────────────────>│
    │                              │<── receipt ──────────────────────────────────────────│
    │<── txHash, blockNumber ─────│                           │                         │
    │                              │                           │                         │
    │── 6. getListing ────────────────────────────────────────>│                         │
    │<── listing state ───────────────────────────────────────│                         │
```

## Step-by-Step Flow

### Step 1: Connect Wallet

**Flutter:** `WalletProvider.connectTestAccount()`
**API:** `POST /api/accounts/select`

```json
// Request
{ "address": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" }

// Response
{ "success": true, "sessionId": "07e053e2-..." }
```

The wallet service creates a session mapping the sessionId to the account's private key (stored only in memory on the wallet service).

### Step 2: Get Auth Token

**Flutter:** `WalletProvider._createAuthToken()`
**API:** `POST /api/auth/token`

```json
// Request headers
{ "X-Session-Id": "07e053e2-..." }

// Response
{ "success": true, "token": "eyJtZXNzYWdlIjoi..." }
```

The wallet service:
1. Creates a SIWE (Sign-In with Ethereum) message
2. Signs it with the account's private key
3. Returns a base64-encoded token containing `{ message, signature }`

This token is used to authenticate with the backend.

### Step 3: Prepare Listing

**Flutter:** `ApiService.prepareListing()`
**API:** `POST /api/marketplace/list`

```json
// Request
{
  "tokenId": 0,
  "priceEth": "0.75",
  "licenseType": "display"
}

// Response
{
  "typedData": {
    "domain": {
      "name": "NFTmarket",
      "version": "1",
      "chainId": 31337,
      "verifyingContract": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
    },
    "types": {
      "Listing": [
        { "name": "tokenId", "type": "uint256" },
        { "name": "price", "type": "uint256" },
        { "name": "licenseType", "type": "uint8" },
        { "name": "licenseHash", "type": "bytes32" },
        { "name": "nonce", "type": "uint256" },
        { "name": "expiry", "type": "uint256" }
      ]
    },
    "primaryType": "Listing",
    "message": { ... }
  },
  "contractCall": {
    "method": "list",
    "params": {
      "tokenId": 0,
      "price": "750000000000000000",
      "licenseType": 0,
      "licenseHash": "0x345c556d...",
      "expiry": 0
    }
  }
}
```

The backend:
1. Validates the caller owns the token
2. Generates EIP-712 typed data for signing
3. Returns both the typed data and contract call parameters

### Step 4: Sign Typed Data

**Flutter:** `WalletService.signTypedData()`
**API:** `POST /api/sign/typed-data`

```json
// Request: the full typedData object from step 3

// Response
{ "success": true, "signature": "0x76f3a735ce700f4c9b..." }
```

The wallet service signs the EIP-712 typed data using `ethers.Wallet.signTypedData()`.

### Step 5: Send Transaction

**Flutter:** `WalletService.sendTransaction()`
**API:** `POST /api/transaction/send`

```json
// Request
{
  "to": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  "data": "0x69c6945f000000000000...",
  "value": "0"
}

// Response
{
  "success": true,
  "hash": "0xba043ac4e4bb015713...",
  "blockNumber": 11,
  "gasUsed": "115879",
  "status": "success"
}
```

The wallet service:
1. Gets the latest nonce for the account
2. Estimates gas
3. Signs and submits the transaction
4. Waits for confirmation
5. Returns the receipt

**Transaction Data Encoding:**

The `data` field is ABI-encoded as:
```
0x69c6945f                               // Function selector: list(uint256,uint256,uint8,bytes32,uint256,bytes)
0000000000000000000000000000000000000000000000000000000000000000  // tokenId
0000000000000000000000000000000000000000000000000a688906bd8b0000  // price (0.75 ETH in wei)
0000000000000000000000000000000000000000000000000000000000000000  // licenseType (0 = Display)
345c556df16b28eedbfab072bdd867b4a1d295fd1e02f88ba7ca25c0699907..  // licenseHash
0000000000000000000000000000000000000000000000000000000000000000  // expiry
00000000000000000000000000000000000000000000000000000000000000c0  // signature offset
0000000000000000000000000000000000000000000000000000000000000041  // signature length (65 bytes)
76f3a735ce700f4c9b707f15411e36b2418b3ad8a5c7785f61c2b84d05a0eb..  // signature data
```

### Step 6: Verify Final State

After the transaction confirms, the state can be verified at three levels:

#### A. On-Chain State

```javascript
const listing = await contract.getListing(tokenId);
// {
//   active: true,
//   seller: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
//   price: 750000000000000000n,
//   licenseType: 0n,
//   licenseHash: "0x345c556d...",
//   nonce: 1n,
//   expiry: 0n
// }
```

#### B. Backend API State

```bash
GET /api/marketplace/0
```
```json
{
  "listed": true,
  "priceEth": "0.7500",
  "seller": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
}
```

#### C. Flutter UI State

The UI displays:
- Green status card: "Listed for 0.75 ETH"
- License info: "Display Only"
- Button: "Remove Listing" (red outline)

## Running the E2E Test

### Prerequisites

1. Start Hardhat node:
   ```bash
   cd contracts && npx hardhat node
   ```

2. Deploy contract:
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```

3. Start wallet service:
   ```bash
   cd wallet-service && npm run dev
   ```

4. Start backend:
   ```bash
   cd backend && ./start-local-blockchain.sh
   ```

### Run the Test

```bash
cd wallet-service
node e2e-list-flow.js
```

### Expected Output

```
╔══════════════════════════════════════════════════════════════╗
║          E2E TEST: Flutter "List for Sale" Flow             ║
╚══════════════════════════════════════════════════════════════╝

STEP 1: Connect Wallet
  ✓ Wallet connected as Alice

STEP 2: Get Auth Token (SIWE)
  ✓ SIWE auth token obtained

STEP 3: Prepare Listing (Backend API)
  ✓ Listing prepared

STEP 4: Sign EIP-712 Typed Data
  ✓ Typed data signed

STEP 5: Send List Transaction
  ✓ Transaction confirmed

STEP 6: Verify Final State
  A) ON-CHAIN STATE: active=true, price=0.75 ETH
  B) BACKEND API STATE: listed=true
  C) FLUTTER UI STATE: "Listed for 0.75 ETH"

═══════════════════════════════════════════════════════════════
  ✅ E2E TEST PASSED: Token successfully listed!
═══════════════════════════════════════════════════════════════
```

## Function Selectors

| Function | Selector | Signature |
|----------|----------|-----------|
| `list` | `0x69c6945f` | `list(uint256,uint256,uint8,bytes32,uint256,bytes)` |
| `delist` | `0x964bc33f` | `delist(uint256)` |
| `buy` | `0x82189551` | `buy(uint256,bytes)` |

## Troubleshooting

### Nonce Error
If you see "Nonce too low" errors, the wallet service now explicitly fetches the latest nonce before each transaction to prevent caching issues.

### Contract Address Mismatch
Flutter now fetches the contract address from the backend at startup via `GET /api/marketplace/eip712/domain`, ensuring it always matches the deployed contract.

### ImageAlreadyRegistered Error
If minting fails with this error, the image hash already exists on-chain. Use a different image or redeploy the contract.
