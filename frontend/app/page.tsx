"use client";

import { useReadContract } from "wagmi";
import { NFTCard } from "@/components/NFTCard";
import { NFT_LICENSING_ABI, NFT_LICENSING_ADDRESS, decodeTokenId } from "@/lib/contracts";

export default function HomePage() {
  const { data: listingsData, isLoading } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getListings",
  });

  const tokenIds = listingsData?.[0] || [];
  const listings = listingsData?.[1] || [];

  // Fetch artwork data for each token
  const artworkQueries = tokenIds.map((tokenId) => {
    const { artworkId } = decodeTokenId(tokenId);
    return {
      address: NFT_LICENSING_ADDRESS,
      abi: NFT_LICENSING_ABI,
      functionName: "getArtwork",
      args: [artworkId],
    } as const;
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">NFT Licensing Marketplace</h1>
        <p className="text-gray-400">
          Browse and purchase licenses for digital artwork. Each artwork has
          three license types: Copyright, Commercial, and Display.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
      ) : tokenIds.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">No listings yet</p>
          <p className="text-gray-500 mt-2">
            Be the first to mint and list an artwork!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {tokenIds.map((tokenId, index) => (
            <ListingCard
              key={tokenId.toString()}
              tokenId={tokenId}
              listing={listings[index]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingCard({
  tokenId,
  listing,
}: {
  tokenId: bigint;
  listing: { askingPrice: bigint; isActive: boolean };
}) {
  const { artworkId } = decodeTokenId(tokenId);

  const { data: artwork } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getArtwork",
    args: [artworkId],
  });

  if (!artwork) {
    return (
      <div className="bg-gray-800 rounded-xl h-96 animate-pulse"></div>
    );
  }

  return (
    <NFTCard
      tokenId={tokenId}
      artwork={{
        originalMinter: artwork.originalMinter,
        metadataURI: artwork.metadataURI,
      }}
      listing={listing}
    />
  );
}
