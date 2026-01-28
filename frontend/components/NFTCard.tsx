"use client";

import { useState, useEffect } from "react";
import { formatEther } from "viem";
import Link from "next/link";
import { LicenseType, LICENSE_TYPE_NAMES, decodeTokenId } from "@/lib/contracts";
import { ipfsToHttp } from "@/lib/ipfs";

interface NFTCardProps {
  tokenId: bigint;
  artwork: {
    originalMinter: `0x${string}`;
    metadataURI: string;
  };
  listing?: {
    askingPrice: bigint;
    isActive: boolean;
  };
  showListButton?: boolean;
  onList?: () => void;
  onCancel?: () => void;
}

export function NFTCard({
  tokenId,
  artwork,
  listing,
  showListButton,
  onList,
  onCancel,
}: NFTCardProps) {
  const { artworkId, licenseType, instanceId } = decodeTokenId(tokenId);
  const [metadata, setMetadata] = useState<{ name?: string; image?: string } | null>(null);

  useEffect(() => {
    if (artwork.metadataURI) {
      fetch(ipfsToHttp(artwork.metadataURI))
        .then((res) => res.json())
        .then(setMetadata)
        .catch(() => setMetadata(null));
    }
  }, [artwork.metadataURI]);

  const shortMinter = `${artwork.originalMinter.slice(0, 6)}...${artwork.originalMinter.slice(-4)}`;
  const title = metadata?.name || `Artwork #${artworkId}`;
  const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-purple-500 transition group">
      <Link href={`/token/${tokenId.toString()}`}>
        <div className="aspect-square bg-gray-700 relative overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23374151' width='400' height='400'/%3E%3Ctext fill='%239CA3AF' font-family='system-ui' font-size='24' text-anchor='middle' x='200' y='200'%3ENo Image%3C/text%3E%3C/svg%3E";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              {metadata === null ? "Loading..." : "No Image"}
            </div>
          )}
          {/* Watermark overlay - just the wallet address */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            <p className="text-xs text-gray-400 truncate">Minter: {shortMinter}</p>
          </div>
          {/* License type badge */}
          <div className="absolute top-2 right-2">
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                licenseType === LicenseType.Copyright
                  ? "bg-purple-500"
                  : licenseType === LicenseType.Commercial
                    ? "bg-blue-500"
                    : "bg-green-500"
              }`}
            >
              {LICENSE_TYPE_NAMES[licenseType as LicenseType]}
            </span>
          </div>
        </div>
      </Link>
      <div className="p-4">
        <h3 className="font-semibold text-lg truncate">{title}</h3>
        <p className="text-sm text-gray-400">
          {licenseType === LicenseType.Copyright
            ? "Copyright Token"
            : `${LICENSE_TYPE_NAMES[licenseType as LicenseType]} License #${instanceId.toString()}`}
        </p>

        {listing?.isActive && (
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Asking Price</p>
              <p className="text-lg font-bold text-purple-400">
                {formatEther(listing.askingPrice)} MATIC
              </p>
            </div>
            <Link
              href={`/token/${tokenId.toString()}`}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition"
            >
              View
            </Link>
          </div>
        )}

        {showListButton && !listing?.isActive && (
          <button
            onClick={onList}
            className="mt-3 w-full py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition"
          >
            List for Sale
          </button>
        )}

        {showListButton && listing?.isActive && (
          <button
            onClick={onCancel}
            className="mt-3 w-full py-2 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition"
          >
            Cancel Listing
          </button>
        )}
      </div>
    </div>
  );
}
