#!/usr/bin/env bash
# Build the watermark engine image for THIS host's architecture.
#
# The engine source lives in a separate repo (enspyrco/watermarking). That repo
# ships its own build.sh which SYNCS sources before building: it copies
# mark.cpp/detect.cpp from watermarking-docker/ and refreshes the
# watermarking-functions/ submodule copy into watermarking-api/. Skipping that
# sync builds a stale tree (updated mark.cpp calling a loadArray() that the old
# functions copy lacks). So we delegate to the repo's build.sh and only layer on
# the arch fix: its Dockerfile hard-codes the amd64 OpenCV lib path
# (-L/usr/lib/x86_64-linux-gnu); on aarch64 that must be /usr/lib/aarch64-linux-gnu.
set -euo pipefail

REPO_URL="${WATERMARK_REPO_URL:-git@github.com:enspyrco/watermarking.git}"
SRC_DIR="${WATERMARK_SRC_DIR:-/tmp/watermarking}"
API_DIR="$SRC_DIR/watermarking-api"
IMAGE_TAG="${WATERMARK_IMAGE:-watermark-engine:local}"

if [ ! -d "$SRC_DIR" ]; then
  echo "[watermark] cloning $REPO_URL -> $SRC_DIR"
  git clone --depth 1 "$REPO_URL" "$SRC_DIR"
fi

# Patch the hard-coded amd64 lib path so g++ links against the local arch.
MULTIARCH="$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null || echo "$(uname -m)-linux-gnu")"
echo "[watermark] target multiarch dir: $MULTIARCH"
if grep -q 'x86_64-linux-gnu' "$API_DIR/Dockerfile" && [ "$MULTIARCH" != "x86_64-linux-gnu" ]; then
  echo "[watermark] patching Dockerfile lib path for $MULTIARCH"
  sed -i.bak "s|x86_64-linux-gnu|$MULTIARCH|g" "$API_DIR/Dockerfile"
fi

# Delegate to the repo's build.sh (does the source-sync + docker build -t watermarking-api).
echo "[watermark] running repo build.sh (source-sync + build)"
bash "$API_DIR/build.sh"

# Re-tag to the name docker-compose expects.
echo "[watermark] tagging watermarking-api -> $IMAGE_TAG"
docker tag watermarking-api "$IMAGE_TAG"
echo "[watermark] done: $IMAGE_TAG"
