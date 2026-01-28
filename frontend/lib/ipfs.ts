// IPFS upload via server-side API route (keys not exposed to client)

// Configurable IPFS gateway
const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export async function uploadImageToPinata(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/ipfs", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload image to IPFS");
  }

  const data = await response.json();
  return `ipfs://${data.ipfsHash}`;
}

export async function uploadMetadataToPinata(
  metadata: NFTMetadata
): Promise<string> {
  const response = await fetch("/api/ipfs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload metadata to IPFS");
  }

  const data = await response.json();
  return `ipfs://${data.ipfsHash}`;
}

export function ipfsToHttp(ipfsUri: string): string {
  if (ipfsUri.startsWith("ipfs://")) {
    return ipfsUri.replace("ipfs://", IPFS_GATEWAY);
  }
  return ipfsUri;
}
