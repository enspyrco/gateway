"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatEther, parseEther } from "viem";
import {
  NFT_LICENSING_ABI,
  NFT_LICENSING_ADDRESS,
  decodeTokenId,
  LicenseType,
  LICENSE_TYPE_NAMES,
} from "@/lib/contracts";
import { ipfsToHttp } from "@/lib/ipfs";

export default function TokenDetailPage() {
  const params = useParams();
  const tokenId = BigInt(params.id as string);
  const { artworkId, licenseType, instanceId } = decodeTokenId(tokenId);
  const { address, isConnected } = useAccount();

  const [offerAmount, setOfferAmount] = useState("");
  const [metadata, setMetadata] = useState<{ name?: string; image?: string; description?: string } | null>(null);

  const { data: artwork } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getArtwork",
    args: [artworkId],
  });

  const { data: listing, refetch: refetchListing } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getListing",
    args: [tokenId],
  });

  const { data: offers, refetch: refetchOffers } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getOffers",
    args: [tokenId],
  });

  const { data: owner } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "ownerOf",
    args: [tokenId],
  });

  const { data: canTransfer } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "canTransfer",
    args: [tokenId],
  });

  const { writeContract: makeOffer, data: offerHash } = useWriteContract();
  const { writeContract: acceptOffer, data: acceptHash } = useWriteContract();
  const { writeContract: rejectOffer, data: rejectHash } = useWriteContract();
  const { writeContract: withdrawOffer, data: withdrawHash } = useWriteContract();

  const { isLoading: isOffering } = useWaitForTransactionReceipt({ hash: offerHash });
  const { isLoading: isAccepting } = useWaitForTransactionReceipt({ hash: acceptHash });
  const { isLoading: isRejecting } = useWaitForTransactionReceipt({ hash: rejectHash });
  const { isLoading: isWithdrawing } = useWaitForTransactionReceipt({ hash: withdrawHash });

  const isOwner = owner && address && owner.toLowerCase() === address.toLowerCase();
  const isProcessing = isOffering || isAccepting || isRejecting || isWithdrawing;

  // Fetch metadata from IPFS
  useEffect(() => {
    if (artwork?.metadataURI) {
      fetch(ipfsToHttp(artwork.metadataURI))
        .then((res) => res.json())
        .then(setMetadata)
        .catch(() => setMetadata(null));
    }
  }, [artwork?.metadataURI]);

  const title = metadata?.name || `Artwork #${artworkId}`;
  const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;

  const handleMakeOffer = () => {
    if (!offerAmount) return;
    makeOffer(
      {
        address: NFT_LICENSING_ADDRESS,
        abi: NFT_LICENSING_ABI,
        functionName: "makeOffer",
        args: [tokenId],
        value: parseEther(offerAmount),
      },
      {
        onSuccess: () => {
          setOfferAmount("");
          refetchOffers();
        },
      }
    );
  };

  const handleAcceptOffer = (offerIndex: number) => {
    acceptOffer(
      {
        address: NFT_LICENSING_ADDRESS,
        abi: NFT_LICENSING_ABI,
        functionName: "acceptOffer",
        args: [tokenId, BigInt(offerIndex)],
      },
      {
        onSuccess: () => {
          refetchListing();
          refetchOffers();
        },
      }
    );
  };

  const handleRejectOffer = (offerIndex: number) => {
    rejectOffer(
      {
        address: NFT_LICENSING_ADDRESS,
        abi: NFT_LICENSING_ABI,
        functionName: "rejectOffer",
        args: [tokenId, BigInt(offerIndex)],
      },
      {
        onSuccess: () => refetchOffers(),
      }
    );
  };

  const handleWithdrawOffer = (offerIndex: number) => {
    withdrawOffer(
      {
        address: NFT_LICENSING_ADDRESS,
        abi: NFT_LICENSING_ABI,
        functionName: "withdrawOffer",
        args: [tokenId, BigInt(offerIndex)],
      },
      {
        onSuccess: () => refetchOffers(),
      }
    );
  };

  if (!artwork) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  const shortOwner = owner
    ? `${owner.slice(0, 6)}...${owner.slice(-4)}`
    : "Unknown";
  const shortMinter = `${artwork.originalMinter.slice(0, 6)}...${artwork.originalMinter.slice(-4)}`;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Image */}
        <div>
          <div className="aspect-square bg-gray-800 rounded-xl overflow-hidden relative">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23374151' width='400' height='400'/%3E%3Ctext fill='%239CA3AF' font-family='system-ui' font-size='24' text-anchor='middle' x='200' y='200'%3ENo Image%3C/text%3E%3C/svg%3E";
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                {metadata === null && artwork?.metadataURI ? "Loading..." : "No Image"}
              </div>
            )}
            {/* Watermark - just the wallet address */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
              <p className="text-sm text-gray-300 font-mono">
                Minter: {artwork.originalMinter}
              </p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`px-3 py-1 text-sm font-medium rounded-full ${
                  licenseType === LicenseType.Copyright
                    ? "bg-purple-500"
                    : licenseType === LicenseType.Commercial
                      ? "bg-blue-500"
                      : "bg-green-500"
                }`}
              >
                {LICENSE_TYPE_NAMES[licenseType as LicenseType]}
              </span>
              {!canTransfer && (
                <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-500">
                  Transfer Restricted
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-gray-400 mt-1">
              {licenseType === LicenseType.Copyright
                ? "Copyright Token"
                : `${LICENSE_TYPE_NAMES[licenseType as LicenseType]} License #${instanceId.toString()}`}
            </p>
          </div>

          {/* Owner & Minter Info */}
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Current Owner</span>
              <span className="font-mono">{shortOwner}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Original Minter</span>
              <span className="font-mono">{shortMinter}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Artwork ID</span>
              <span className="font-mono">{artworkId.toString()}</span>
            </div>
          </div>

          {/* Listing Info & Make Offer */}
          {listing?.isActive && (
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-400">Asking Price</span>
                <span className="text-2xl font-bold text-purple-400">
                  {formatEther(listing.askingPrice)} MATIC
                </span>
              </div>

              {!isOwner && isConnected && (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="number"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                      placeholder="Your offer (MATIC)"
                      step="0.01"
                      className="flex-1 px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                    />
                    <button
                      onClick={handleMakeOffer}
                      disabled={isProcessing || !offerAmount}
                      className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition disabled:opacity-50"
                    >
                      {isOffering ? "Sending..." : "Make Offer"}
                    </button>
                  </div>
                </div>
              )}

              {!isConnected && (
                <p className="text-gray-400 text-center">
                  Connect your wallet to make an offer
                </p>
              )}
            </div>
          )}

          {/* Offers List */}
          {offers && offers.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4">
                Offers ({offers.filter((o) => o.isActive).length})
              </h2>
              <div className="space-y-3">
                {offers.map((offer, index) => {
                  if (!offer.isActive) return null;
                  const isMyOffer =
                    address &&
                    offer.offerer.toLowerCase() === address.toLowerCase();

                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-700 rounded-lg"
                    >
                      <div>
                        <p className="font-mono text-sm">
                          {offer.offerer.slice(0, 6)}...{offer.offerer.slice(-4)}
                        </p>
                        <p className="text-lg font-bold text-purple-400">
                          {formatEther(offer.amount)} MATIC
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {isOwner && (
                          <>
                            <button
                              onClick={() => handleAcceptOffer(index)}
                              disabled={isProcessing}
                              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition disabled:opacity-50"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleRejectOffer(index)}
                              disabled={isProcessing}
                              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm transition disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {isMyOffer && (
                          <button
                            onClick={() => handleWithdrawOffer(index)}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm transition disabled:opacity-50"
                          >
                            Withdraw
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
