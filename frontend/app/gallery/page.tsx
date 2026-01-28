"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { NFTCard } from "@/components/NFTCard";
import { NFT_LICENSING_ABI, NFT_LICENSING_ADDRESS, decodeTokenId } from "@/lib/contracts";

export default function GalleryPage() {
  const { address, isConnected } = useAccount();
  const [listingTokenId, setListingTokenId] = useState<bigint | null>(null);
  const [askingPrice, setAskingPrice] = useState("");

  const { data: ownedTokens, isLoading, refetch } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getOwnedTokens",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract: listForSale, data: listHash } = useWriteContract();
  const { writeContract: cancelListing, data: cancelHash } = useWriteContract();

  const { isLoading: isListing } = useWaitForTransactionReceipt({
    hash: listHash,
  });

  const { isLoading: isCancelling } = useWaitForTransactionReceipt({
    hash: cancelHash,
  });

  const handleList = (tokenId: bigint) => {
    setListingTokenId(tokenId);
  };

  const confirmList = () => {
    if (!listingTokenId || !askingPrice) return;

    listForSale({
      address: NFT_LICENSING_ADDRESS,
      abi: NFT_LICENSING_ABI,
      functionName: "listForSale",
      args: [listingTokenId, parseEther(askingPrice)],
    }, {
      onSuccess: () => {
        setListingTokenId(null);
        setAskingPrice("");
        refetch();
      },
    });
  };

  const handleCancel = (tokenId: bigint) => {
    cancelListing({
      address: NFT_LICENSING_ADDRESS,
      abi: NFT_LICENSING_ABI,
      functionName: "cancelListing",
      args: [tokenId],
    }, {
      onSuccess: () => refetch(),
    });
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold mb-4">My Gallery</h1>
        <p className="text-gray-400">Please connect your wallet to view your NFTs</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Gallery</h1>
        <p className="text-gray-400">Manage your NFT licenses and list them for sale</p>
      </div>

      {/* Listing Modal */}
      {listingTokenId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">List for Sale</h2>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">
                Asking Price (MATIC)
              </label>
              <input
                type="number"
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="0.1"
                step="0.01"
                className="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setListingTokenId(null);
                  setAskingPrice("");
                }}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmList}
                disabled={isListing || !askingPrice}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition disabled:opacity-50"
              >
                {isListing ? "Listing..." : "List"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
      ) : !ownedTokens || ownedTokens.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">You don&apos;t own any NFTs yet</p>
          <a
            href="/mint"
            className="inline-block mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition"
          >
            Mint your first artwork
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {ownedTokens.map((tokenId) => (
            <GalleryCard
              key={tokenId.toString()}
              tokenId={tokenId}
              onList={() => handleList(tokenId)}
              onCancel={() => handleCancel(tokenId)}
              isProcessing={isListing || isCancelling}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryCard({
  tokenId,
  onList,
  onCancel,
  isProcessing,
}: {
  tokenId: bigint;
  onList: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const { artworkId } = decodeTokenId(tokenId);

  const { data: artwork } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getArtwork",
    args: [artworkId],
  });

  const { data: listing } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getListing",
    args: [tokenId],
  });

  if (!artwork) {
    return <div className="bg-gray-800 rounded-xl h-96 animate-pulse"></div>;
  }

  return (
    <NFTCard
      tokenId={tokenId}
      artwork={{
        originalMinter: artwork.originalMinter,
        metadataURI: artwork.metadataURI,
      }}
      listing={listing}
      showListButton={!isProcessing}
      onList={onList}
      onCancel={onCancel}
    />
  );
}
