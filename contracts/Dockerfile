# Local blockchain — Hardhat node + auto-deploy of NFTmarketNFT + minter setup.
#
# This is the self-contained chain for the OCI deployment: it boots a Hardhat
# node, deploys the contract, registers the backend's minter, and publishes the
# proxy address to a shared volume for the backend to read.
FROM node:20-bookworm-slim

# curl: entrypoint polls the JSON-RPC endpoint until the node is ready.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Pre-compile so the first deploy doesn't pay solc download/compile at runtime.
RUN npx hardhat compile

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8545

ENTRYPOINT ["docker-entrypoint.sh"]
