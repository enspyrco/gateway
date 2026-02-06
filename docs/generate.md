# AI Image Generation

NFTmarket includes AI image generation powered by Stability AI. Users can generate images from text prompts, pick their favorite, and mint it as an NFT in a single flow.

---

## How It Works

```
1. User enters a text prompt (up to 1000 characters)
2. User selects a style preset (default: photographic)
3. Backend generates 4 images in parallel via Stability AI
4. User previews all 4 and selects their favorite
5. Selected image enters the standard mint flow:
   watermark → encrypt → IPFS → blockchain
```

The generation and minting steps are decoupled. Generated images are stored temporarily (1 hour) and the user can mint any of the 4 images within that window.

---

## Style Presets

10 style presets are available, passed as `style_preset` to Stability AI:

| ID | Name |
|----|------|
| `photographic` | Photographic (default) |
| `digital-art` | Digital Art |
| `anime` | Anime |
| `cinematic` | Cinematic |
| `3d-model` | 3D Model |
| `fantasy-art` | Fantasy Art |
| `neon-punk` | Neon Punk |
| `origami` | Origami |
| `pixel-art` | Pixel Art |
| `line-art` | Line Art |

---

## API Endpoints

### GET /api/generate/styles (public)

Returns available style presets.

```json
{
  "styles": [
    { "id": "photographic", "name": "Photographic" },
    { "id": "digital-art", "name": "Digital Art" },
    ...
  ]
}
```

### POST /api/generate (auth required, rate limited)

Generate images from a text prompt.

**Request body:**
```json
{
  "prompt": "A serene mountain lake at sunset",
  "style": "photographic",
  "count": 4
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Text description (max 1000 chars) |
| `style` | string | No | Style preset ID (default: `photographic`) |
| `count` | number | No | Number of images: 1 or 4 (default: 4) |

**Response (201):**
```json
{
  "success": true,
  "generationId": "uuid",
  "prompt": "A serene mountain lake at sunset",
  "style": "photographic",
  "images": [
    { "id": "uuid-0", "seed": 1234567, "url": "/api/generate/{id}/image/0" },
    { "id": "uuid-1", "seed": 7654321, "url": "/api/generate/{id}/image/1" },
    ...
  ]
}
```

**Error codes:**
- `MISSING_PROMPT` (400) — prompt is empty or not a string
- `PROMPT_TOO_LONG` (400) — prompt exceeds 1000 characters
- `RATE_LIMITED` (429) — exceeded 10 generations per hour

### GET /api/generate/:id (auth required)

Retrieve generation details by ID.

```json
{
  "generationId": "uuid",
  "prompt": "A serene mountain lake at sunset",
  "style": "photographic",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "images": [
    { "id": "uuid-0", "seed": 1234567, "url": "/api/generate/uuid/image/0" }
  ]
}
```

Returns `NOT_FOUND` (404) if the generation has expired or doesn't exist.

### GET /api/generate/:id/image/:index (auth required)

Returns the generated image as `image/png`. The `:index` is 0-based (0 to 3 for a 4-image generation).

Returns `NOT_FOUND` (404) if the generation or image index doesn't exist.

---

## Rate Limiting

- **10 requests per hour** per wallet address
- Uses `express-rate-limit` with in-memory store
- Key: wallet address from auth token (anonymous if unauthenticated)
- Returns `429` with `{ error: "Too many generation requests...", code: "RATE_LIMITED" }`
- Standard rate limit headers (`RateLimit-*`) included in responses

---

## Image Storage

Generated images are stored **in-memory** on the backend:

- Each generation stores base64-encoded PNG data for all images
- **1-hour TTL** — generations expire after 60 minutes
- **Cleanup runs every 10 minutes** — expired generations are purged automatically
- Images are not persisted to disk or any external storage

This means:
- Backend restart clears all pending generations
- Users must mint within 1 hour of generation
- No long-term storage cost for unselected images

---

## From Generation to Mint

The Flutter app manages the handoff from generation to minting:

1. User generates images via `POST /api/generate`
2. User previews all returned images in a selection grid
3. User taps their favorite image
4. App retrieves the full image via `GET /api/generate/:id/image/:index`
5. Image enters the standard mint flow (same as manual upload):
   - Watermark embedded with `wallet:tokenId`
   - Original encrypted and stored in Firebase Storage
   - Watermarked preview uploaded to IPFS
   - Metadata uploaded to Arweave
   - NFT minted on Polygon

The generation metadata (prompt, style, seed) is included in the token's Arweave metadata for provenance.

---

## Mock Mode

Set `USE_MOCK_AI=true` to skip Stability AI calls:

- Returns 1x1 blue placeholder PNGs instead of real images
- Same response format — no client changes needed
- Useful for development, testing, and CI
- No `STABILITY_API_KEY` required in mock mode

---

## Stability AI Integration

| Setting | Value |
|---------|-------|
| Endpoint | `https://api.stability.ai/v2beta/stable-image/generate/ultra` |
| Auth | `Bearer {STABILITY_API_KEY}` |
| Output format | PNG |
| Parallelism | All images generated concurrently via `Promise.all()` |
| Seed | Random per image (returned in response for reproducibility) |

Each generation makes `count` separate API calls to Stability AI (default 4). Calls run in parallel for speed. Each call gets a unique random seed, which is returned to the client for reproducibility.

**Environment variable:** `STABILITY_API_KEY` (required unless `USE_MOCK_AI=true`)

---

*Part of the NFTmarket documentation. See also: [How Tokens Are Minted](how-tokens-are-minted.md), [Services](services.md)*
