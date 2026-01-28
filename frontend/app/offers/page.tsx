"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
import Link from "next/link";
import {
  NFT_LICENSING_ABI,
  NFT_LICENSING_ADDRESS,
  decodeTokenId,
  LICENSE_TYPE_NAMES,
  LicenseType,
} from "@/lib/contracts";
import { ipfsToHttp } from "@/lib/ipfs";

export default function OffersPage() {
  const { address, isConnected } = useAccount();

  const { data: pendingWithdrawals, refetch: refetchWithdrawals } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getPendingWithdrawals",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: ownedTokens } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getOwnedTokens",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract: withdraw, data: withdrawHash } = useWriteContract();
  const { isLoading: isWithdrawing } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  const handleWithdraw = () => {
    withdraw(
      {
        address: NFT_LICENSING_ADDRESS,
        abi: NFT_LICENSING_ABI,
        functionName: "withdraw",
      },
      {
        onSuccess: () => refetchWithdrawals(),
      }
    );
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold mb-4">Offers Management</h1>
        <p className="text-gray-400">Please connect your wallet to manage offers</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Offers Management</h1>
        <p className="text-gray-400">
          View incoming offers on your NFTs and withdraw refunded funds
        </p>
      </div>

      {/* Pending Withdrawals */}
      {pendingWithdrawals && pendingWithdrawals > 0n && (
        <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 border border-purple-500 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-1">Pending Withdrawals</h2>
              <p className="text-gray-400">
                Funds from rejected or outbid offers
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-purple-400">
                {formatEther(pendingWithdrawals)} MATIC
              </p>
              <button
                onClick={handleWithdraw}
                disabled={isWithdrawing}
                className="mt-2 px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition disabled:opacity-50"
              >
                {isWithdrawing ? "Withdrawing..." : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owned Tokens with Offers */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold">Incoming Offers</h2>
        {ownedTokens && ownedTokens.length > 0 ? (
          <div className="space-y-4">
            {ownedTokens.map((tokenId) => (
              <TokenOffersCard key={tokenId.toString()} tokenId={tokenId} />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-gray-800 rounded-xl">
            <p className="text-gray-400">You don&apos;t own any NFTs</p>
            <Link
              href="/mint"
              className="inline-block mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition"
            >
              Mint your first artwork
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function TokenOffersCard({ tokenId }: { tokenId: bigint }) {
  const { artworkId, licenseType, instanceId } = decodeTokenId(tokenId);
  const [metadata, setMetadata] = useState<{ name?: string } | null>(null);

  const { data: artwork } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getArtwork",
    args: [artworkId],
  });

  const { data: offers, refetch: refetchOffers } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getOffers",
    args: [tokenId],
  });

  const { data: listing } = useReadContract({
    address: NFT_LICENSING_ADDRESS,
    abi: NFT_LICENSING_ABI,
    functionName: "getListing",
    args: [tokenId],
  });

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

  const { writeContract: acceptOffer, data: acceptHash } = useWriteContract();
  const { writeContract: rejectOffer, data: rejectHash } = useWriteContract();

  const { isLoading: isAccepting } = useWaitForTransactionReceipt({ hash: acceptHash });
  const { isLoading: isRejecting } = useWaitForTransactionReceipt({ hash: rejectHash });

  const activeOffers = offers?.filter((o) => o.isActive) || [];

  if (activeOffers.length === 0) return null;

  const handleAccept = (offerIndex: number) => {
    acceptOffer(
      {
        address: NFT_LICENSING_ADDRESS,
        abi: NFT_LICENSING_ABI,
        functionName: "acceptOffer",
        args: [tokenId, BigInt(offerIndex)],
      },
      {
        onSuccess: () => refetchOffers(),
      }
    );
  };

  const handleReject = (offerIndex: number) => {
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

  const isProcessing = isAccepting || isRejecting;

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                licenseType === LicenseType.Copyright
                  ? "bg-purple-500"
                  : licenseType === LicenseType.Commercial
                    ? "bg-blue-500"
                    : "bg-green-500"
              }`}
            >
              {LICENSE_TYPE_NAMES[licenseType as LicenseType]}
            </span>
            <h3 className="font-bold">{title}</h3>
          </div>
          <p className="text-sm text-gray-400">
            {licenseType === LicenseType.Copyright
              ? "Copyright Token"
              : `License #${instanceId.toString()}`}
          </p>
        </div>
        {listing?.isActive && (
          <div className="text-right">
            <p className="text-xs text-gray-400">Asking</p>
            <p className="font-bold text-purple-400">
              {formatEther(listing.askingPrice)} MATIC
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {offers?.map((offer, index) => {
          if (!offer.isActive) return null;
          return (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-gray-700 rounded-lg"
            >
              <div>
                <p className="font-mono text-sm text-gray-400">
                  {offer.offerer.slice(0, 6)}...{offer.offerer.slice(-4)}
                </p>
                <p className="text-lg font-bold text-purple-400">
                  {formatEther(offer.amount)} MATIC
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(index)}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {isAccepting ? "..." : "Accept"}
                </button>
                <button
                  onClick={() => handleReject(index)}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {isRejecting ? "..." : "Reject"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href={`/token/${tokenId.toString()}`}
        className="block mt-4 text-center text-purple-400 hover:text-purple-300 text-sm"
      >
        View Token Details
      </Link>
    </div>
  );
}
