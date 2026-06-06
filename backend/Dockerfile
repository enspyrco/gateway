# NFTmarket backend — Node API (watermarking orchestration, encryption, minting)
#
# Arch-agnostic: builds natively on aarch64 (Robin's OCI) and amd64 alike.
# `sharp` ships prebuilt glibc binaries for linux-arm64, so debian-slim is the
# safe base (musl/alpine occasionally trips sharp up).
FROM node:20-bookworm-slim

# `curl` for the entrypoint's deployment.json wait/health probing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000

ENTRYPOINT ["docker-entrypoint.sh"]
