## REST API (watermarking-api)

Standalone REST API for watermarking images, deployed on Cloud Run.

**Service URL:** `https://watermarking-api-78940960204.us-central1.run.app`

### API Endpoints

#### POST /watermark

Watermark an image with SSE progress streaming.

**Request:**
- Header: `X-API-Key: <api-key>`
- Content-Type: `multipart/form-data`
- Body:
  - `image` (required): PNG or JPG file
  - `message` (required): Text to embed
  - `strength` (optional): 1-100, default 10

**Response (SSE stream):**
```
data: {"progress":"Loading image...","percent":10}
data: {"progress":"Embedding watermark (1/5)","percent":24}
data: {"progress":"Embedding watermark (2/5)","percent":38}
data: {"progress":"Compressing image...","percent":90}
data: {"complete":true,"downloadUrl":"/download/{jobId}"}
```

#### GET /download/{jobId}

Download the watermarked image (available for 5 minutes).

**Request:**
- Header: `X-API-Key: <api-key>`

**Response:** `image/png`

#### GET /health

Health check (no auth required).

**Response:** `{"status":"ok"}`

### Example Usage

```bash
# Watermark an image
curl -N https://watermarking-api-78940960204.us-central1.run.app/watermark \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "image=@photo.png" \
  -F "message=SecretMessage" \
  -F "strength=15"

# Download result
curl https://watermarking-api-78940960204.us-central1.run.app/download/{jobId} \
  -H "X-API-Key: YOUR_API_KEY" \
  -o watermarked.png
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes | - | API key for authentication |
| `PORT` | No | 8080 | Server port |
| `DEFAULT_STRENGTH` | No | 10 | Default watermark strength |
| `RATE_LIMIT_MAX` | No | 10 | Max requests per minute per API key |
| `CORS_ORIGIN` | No | * | Allowed CORS origin |

### Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express server with SSE streaming, auth, rate limiting |
| `Dockerfile` | Multi-stage build (C++ compile + Node.js runtime) |
| `build.sh` | Copies C++ sources and builds Docker image |

### Deployment

```bash
cd watermarking-api
./build.sh
docker build --platform linux/amd64 -t watermarking-api .
# Push to Artifact Registry and deploy to Cloud Run
```
