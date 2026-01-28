import { NextRequest, NextResponse } from "next/server";

// Server-side only - these keys are NOT exposed to the client
const PINATA_API_KEY = process.env.PINATA_API_KEY || "";
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY || "";

// Rate limiting: simple in-memory store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10; // Max uploads per window
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window

// File validation
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

function getClientIdentifier(request: NextRequest): string {
  // Use wallet address if provided, otherwise fall back to IP
  const walletAddress = request.headers.get("x-wallet-address");
  if (walletAddress) {
    return `wallet:${walletAddress.toLowerCase()}`;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `ip:${ip}`;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientIdentifier(request);
    if (!checkRateLimit(clientId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Handle image upload
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
          { status: 400 }
        );
      }

      // Validate file type
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}` },
          { status: 400 }
        );
      }

      const pinataFormData = new FormData();
      pinataFormData.append("file", file);

      const response = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
          method: "POST",
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_KEY,
          },
          body: pinataFormData,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return NextResponse.json(
          { error: "Failed to upload to IPFS", details: error },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json({ ipfsHash: data.IpfsHash });
    } else {
      // Handle JSON metadata upload
      const metadata = await request.json();

      // Basic metadata validation
      if (!metadata || typeof metadata !== "object") {
        return NextResponse.json(
          { error: "Invalid metadata format" },
          { status: 400 }
        );
      }

      const response = await fetch(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_KEY,
          },
          body: JSON.stringify(metadata),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return NextResponse.json(
          { error: "Failed to upload metadata to IPFS", details: error },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json({ ipfsHash: data.IpfsHash });
    }
  } catch (error) {
    console.error("IPFS upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
