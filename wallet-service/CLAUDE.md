# Wallet Service

Wallet microservice that handles private key management and signing for the NFTmarket platform. This separates sensitive key operations from both the Flutter frontend and the main backend.

## Purpose

- Manages test account sessions for local development
- Signs SIWE authentication tokens
- Signs EIP-712 typed data for marketplace operations
- Submits transactions to the blockchain

## API Endpoints

### Account Management
- `GET /api/accounts` - List available test accounts (no auth required)
- `GET /api/accounts/current` - Get current session's account (requires session)
- `POST /api/accounts/select` - Select account, returns sessionId
- `POST /api/accounts/disconnect` - End session

### Signing
- `POST /api/sign/message` - Sign arbitrary message (EIP-191)
- `POST /api/sign/typed-data` - Sign EIP-712 typed data
- `POST /api/sign/hash` - Sign raw hash

### Authentication
- `POST /api/auth/token` - Generate SIWE auth token for backend API

### Transactions
- `POST /api/transaction/send` - Sign and submit transaction
- `GET /api/transaction/balance` - Get account balance
- `GET /api/transaction/nonce` - Get account nonce

All endpoints except `/api/accounts` require `X-Session-Id` header.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start with nodemon (auto-reload)
npm start            # Start in production mode
./start.sh           # Start with default env vars
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Service port |
| RPC_URL | http://localhost:8545 | Blockchain RPC endpoint |
| CHAIN_ID | 31337 | Chain ID (31337=Hardhat, 137=Polygon) |

## Architecture

```
Flutter App
    │
    ├── selectAccount() ──> /api/accounts/select
    │                            │
    │<── sessionId ──────────────┘
    │
    ├── getAuthToken() ───> /api/auth/token
    │                            │
    │<── SIWE token ─────────────┘
    │
    ├── signTypedData() ──> /api/sign/typed-data
    │                            │
    │<── signature ──────────────┘
    │
    └── sendTransaction() ─> /api/transaction/send
                                 │
                                 ├──> Blockchain
                                 │
         txHash <────────────────┘
```

## Security Notes

- Private keys are stored only in server memory (never sent to clients)
- Sessions expire after 24 hours
- CORS restricted to localhost origins
- For production, replace test accounts with real wallet connections

## Test Accounts

The service provides Hardhat's default test accounts for local development:

| Nickname | Address |
|----------|---------|
| Alice | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC |
| Bob | 0x90F79bf6EB2c4f870365E785982E1f101E93b906 |
| Sam | 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 |
| Joe | 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc |
| Mary | 0x976EA74026E726554dB657fA54763abd0C3a0aa9 |
