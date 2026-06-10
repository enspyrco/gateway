# NFTmarket backend — Node API (watermarking orchestration, encryption, minting)
#
# Arch-agnostic: builds natively on aarch64 (Robin's OCI) and amd64 alike.
# `sharp` ships prebuilt glibc binaries for linux-arm64, so debian-slim is the
# safe base (musl/alpine occasionally trips sharp up).

# ── Stage 1: compile the blind watermark detector ───────────────────────────
# C++ blind detector for /api/detect (see blind-detector/README.md).
# Built from source so the binary always matches the container's arch/libs.
FROM debian:bookworm-slim AS detector-build

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       g++ pkg-config libopencv-dev libboost-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY blind-detector/ ./
RUN g++ -O2 detect_blind3.cpp WatermarkDetection.cpp Utilities.cpp \
    -o detect_blind3 $(pkg-config --cflags --libs opencv4)

# ── Stage 2: the Node API ───────────────────────────────────────────────────
FROM node:20-bookworm-slim

# `curl` for the entrypoint's deployment.json wait/health probing.
# OpenCV runtime libs are for the blind detector binary (imgcodecs pulls core).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       curl ca-certificates libopencv-imgcodecs406 libopencv-imgproc406 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
COPY --from=detector-build /build/detect_blind3 /app/blind-detector/detect_blind3
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV BLIND_DETECT_BINARY=/app/blind-detector/detect_blind3

ENTRYPOINT ["docker-entrypoint.sh"]
