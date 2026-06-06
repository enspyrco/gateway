# Gateway deployment — Robin's OCI (aarch64)

Self-contained Docker Compose stack for the NFTmarket gateway, running on
`robins-oci` (VM.Standard.A1.Flex, 4 OCPU / 24 GB, Ubuntu 24.04, ap-melbourne-1).

Public URL: **https://gateway.imagineering.cc** → `207.211.145.30` (Caddy TLS).

## Topology

```
                  ┌─────────── caddy (:80/:443, auto-TLS) ───────────┐
   browser  ──▶   │  /api/*    → backend:3000                        │
                  │  /wallet/* → wallet-service:3001                 │
                  │  /*        → flutter-web:80 (SPA)                │
                  └──────────────────────────────────────────────────┘
   backend ──▶ watermark-engine:8080   (invisible watermarking, C++/Node)
   backend ──▶ hardhat:8545            (local chain)
   hardhat  ──▶ deployment.json ──(shared volume)──▶ backend  (contract address)
```

The **data layer is per-service** (`.env`): mock by default (Firestore, Storage,
Arweave, IPFS, AI), flip individual services to real managed backends as needed.
Blockchain is a **local Hardhat node on the box** — throwaway chain, real EIP-712.

## Containers

| Service | Source | Notes |
|---|---|---|
| `hardhat` | `../contracts` | Boots node, deploys `NFTmarketNFT`, registers minter, publishes address. |
| `wallet-service` | `../wallet-service` | Signs/submits txns. RPC → `hardhat:8545`. |
| `watermark-engine` | `enspyrco/watermarking` | **Built separately** (arm64) — see below. |
| `backend` | `../backend` | Reads contract address from shared volume at startup. |
| `flutter-web` | `../flutter` | `flutter build web` → nginx. `API_URL` baked at build. |
| `caddy` | `caddy:2-alpine` | Edge TLS + routing. |

## First-time setup (on the box)

```bash
# 0. SSH in
ssh ubuntu@207.211.145.30

# 1. Clone the gateway repo (if not already)
git clone <gateway-repo> && cd gateway/deploy

# 2. Configure
cp .env.example .env
#   - set WATERMARK_API_KEY (any strong string)
#   - set DEV_ENCRYPTION_KEY:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   - flip any USE_MOCK_* you want to back with a real service (+ its creds)

# 3. Build the watermark engine for this arch (needs SSH access to enspyrco/watermarking)
./build-watermark.sh

# 4. Bring up the stack
docker compose up -d --build

# 5. Watch the chain deploy + address publish
docker compose logs -f hardhat backend
```

Caddy provisions the TLS cert automatically once `gateway.imagineering.cc`
resolves to this box (already wired in imagineering-infra DNS).

## Why a real domain / HTTPS is mandatory

WalletConnect and SIWE (Sign-In with Ethereum) are **secure-context** browser
features — they don't work over plain HTTP/IP. `gateway.imagineering.cc` is the
unlock for Caddy's Let's Encrypt cert; without it the wallet flow breaks.

## Changing the backend URL

`API_URL` is compiled into the Flutter JS (`String.fromEnvironment`). To change
it, rebuild the web image — a restart won't pick up a new value:

```bash
docker compose build flutter-web && docker compose up -d flutter-web
```

## Resetting the chain

The Hardhat chain is in-memory; `docker compose restart hardhat` redeploys a
fresh contract and republishes the address. Restart the backend afterwards so
it re-reads the new address:

```bash
docker compose restart hardhat && docker compose restart backend
```
