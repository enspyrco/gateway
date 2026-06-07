# Local blockchain — persistent Anvil chain + auto-deploy of NFTmarketNFT.
#
# This is the self-contained chain for the OCI deployment: it boots an Anvil node
# with a state file (so chain state survives reboots), deploys the contract +
# registers the backend's minter on first boot, and publishes the proxy address
# to a shared volume for the backend to read. Deploy still runs via Hardhat (the
# OpenZeppelin UUPS upgrades plugin); only the running node is Anvil.
FROM node:20-bookworm-slim

# curl: entrypoint polls JSON-RPC until ready + bootstraps Foundry.
# git: foundryup / some toolchain steps expect it present.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# Foundry (anvil) — installs the prebuilt binary for the build platform's arch
# (amd64 or arm64), so this image builds natively on Robin's aarch64 box.
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="/root/.foundry/bin:${PATH}"
RUN foundryup

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
