#!/usr/bin/env bash
# Build the watermark engine image for THIS host's architecture.
#
# The engine source lives in a separate repo (enspyrco/watermarking). Its
# Dockerfile hard-codes the amd64 OpenCV lib path (-L/usr/lib/x86_64-linux-gnu);
# on aarch64 (Robin's OCI) that path is /usr/lib/aarch64-linux-gnu. We clone the
# repo (or use an existing checkout) and patch that single path for the local
# arch before building. The OpenCV/Boost packages themselves are multi-arch.
set -euo pipefail

REPO_URL="${WATERMARK_REPO_URL:-git@github.com:enspyrco/watermarking.git}"
SRC_DIR="${WATERMARK_SRC_DIR:-/tmp/watermarking}"
API_SUBDIR="watermarking-api"
IMAGE_TAG="${WATERMARK_IMAGE:-watermark-engine:local}"

if [ ! -d "$SRC_DIR" ]; then
  echo "[watermark] cloning $REPO_URL -> $SRC_DIR"
  git clone --depth 1 "$REPO_URL" "$SRC_DIR"
fi

cd "$SRC_DIR/$API_SUBDIR"

# Multi-arch lib dir for this host (e.g. aarch64-linux-gnu, x86_64-linux-gnu).
MULTIARCH="$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null || echo "$(uname -m)-linux-gnu")"
echo "[watermark] target multiarch dir: $MULTIARCH"

# Patch the hard-coded amd64 lib path so g++ links against the local arch.
if grep -q 'x86_64-linux-gnu' Dockerfile && [ "$MULTIARCH" != "x86_64-linux-gnu" ]; then
  echo "[watermark] patching Dockerfile lib path for $MULTIARCH"
  sed -i.bak "s|x86_64-linux-gnu|$MULTIARCH|g" Dockerfile
fi

echo "[watermark] building $IMAGE_TAG (native arch)"
docker build -t "$IMAGE_TAG" .
echo "[watermark] done: $IMAGE_TAG"
