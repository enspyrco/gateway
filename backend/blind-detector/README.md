# Blind watermark detector

Decodes the embedded `wallet:tokenId` watermark from a marked image **without
the original** — the literal proof behind the platform's invisible-provenance
thesis, used by `GET /api/detect/token/:tokenId` and `POST /api/detect/blind`.

## How it works

The engine (`mark-image`) embeds shifted Legendre arrays additively into the
DFT coefficients of the HSV V-channel; each array family's cyclic shift encodes
one base-(p²) digit of the message. The non-blind detector recovers them by
subtracting the original image first. Blind detection can't do that — and the
image's own spectrum is orders of magnitude larger than the mark, so naive
correlation drowns (peak/RMS ~4 vs ~120-260 non-blind).

`detect_blind3` whitens the extracted DFT coefficients before correlating
(sign-only or local-mean normalization). That equalizes every coefficient's
vote: with p² ≈ 270k coefficients, the mark-dominated ones carry the Legendre
correlation peak far above the noise floor. Verified on the live gallery:
decodes both fresh mints and the original populate-era tokens.

## Provenance

`WatermarkDetection.{cpp,hpp}`, `Utilities.{cpp,hpp}`, `json.hpp` are vendored
from the watermarking repo (same lineage as the engine — byte-identical
algorithms, so embed/detect stay in lockstep). `detect_blind3.cpp` is the
whitening detector. If the engine's embedding ever changes, re-vendor.

## Build

Built automatically in the backend Dockerfile (multi-stage). By hand:

```bash
g++ -O2 detect_blind3.cpp WatermarkDetection.cpp Utilities.cpp \
    -o detect_blind3 $(pkg-config --cflags --libs opencv4)
```

Needs `libopencv-dev` and `libboost-dev` (header-only use).

## Interface (consumed by `src/routes/detect.js` — keep stable)

```
detect_blind3 <image> [threshold=10.0] [sign|local|none] [window=15]
```

stdout lines parsed by the backend: `Message: "<decoded>"`,
`Sequences decoded: <n>`, `Minimum confidence: <x.xx>`.
Exit code 0 = detected, 1 = not found.
