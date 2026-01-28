"use client";

import { useState, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { NFT_LICENSING_ABI, NFT_LICENSING_ADDRESS } from "@/lib/contracts";
import { uploadImageToPinata, uploadMetadataToPinata } from "@/lib/ipfs";

export default function MintPage() {
  const { isConnected } = useAccount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMint = async () => {
    if (!title || !imageFile) {
      setError("Please provide a title and image");
      return;
    }

    setError("");
    setIsUploading(true);

    try {
      // Upload image to IPFS
      setUploadStatus("Uploading image to IPFS...");
      const imageUri = await uploadImageToPinata(imageFile);

      // Create and upload metadata
      setUploadStatus("Uploading metadata to IPFS...");
      const metadata = {
        name: title,
        description: description || `Artwork: ${title}`,
        image: imageUri,
      };
      const metadataUri = await uploadMetadataToPinata(metadata);

      setUploadStatus("Creating artwork on-chain...");

      // Call the contract - only pass metadataURI (title is in the metadata)
      writeContract({
        address: NFT_LICENSING_ADDRESS,
        abi: NFT_LICENSING_ABI,
        functionName: "createArtwork",
        args: [metadataUri],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadStatus("");
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold mb-4">Mint Artwork</h1>
        <p className="text-gray-400">Please connect your wallet to mint</p>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-6xl mb-6">&#127881;</div>
        <h1 className="text-3xl font-bold mb-4">Artwork Minted!</h1>
        <p className="text-gray-400 mb-6">
          Your artwork has been successfully minted. You now own the copyright
          token.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={resetForm}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            Mint Another
          </button>
          <a
            href="/gallery"
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition"
          >
            View Gallery
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Mint Artwork</h1>
        <p className="text-gray-400">
          Create a new artwork and receive the copyright token. The title and
          your wallet address will be permanently watermarked.
        </p>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 space-y-6">
        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium mb-2">Artwork Image</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              imagePreview
                ? "border-purple-500"
                : "border-gray-600 hover:border-gray-500"
            }`}
          >
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-64 mx-auto rounded-lg"
              />
            ) : (
              <div className="text-gray-400">
                <div className="text-4xl mb-2">+</div>
                <p>Click to upload image</p>
                <p className="text-sm">PNG, JPG, GIF up to 10MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter artwork title"
            className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
          />
          <p className="text-xs text-gray-400 mt-1">
            This will be permanently watermarked on the artwork
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your artwork..."
            rows={3}
            className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none resize-none"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* Status Message */}
        {(uploadStatus || isConfirming) && (
          <div className="p-4 bg-purple-900/50 border border-purple-500 rounded-lg text-purple-300 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-purple-400"></div>
            {uploadStatus || "Confirming transaction..."}
          </div>
        )}

        {/* Mint Button */}
        <button
          onClick={handleMint}
          disabled={isUploading || isPending || isConfirming || !title || !imageFile}
          className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading || isPending || isConfirming ? "Processing..." : "Mint Artwork"}
        </button>

        {/* Info Box */}
        <div className="p-4 bg-gray-700/50 rounded-lg">
          <h3 className="font-medium mb-2">What happens when you mint?</h3>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>1. Your image is uploaded to IPFS (decentralized storage)</li>
            <li>2. A copyright token is minted to your wallet</li>
            <li>3. Your wallet address + title are permanently watermarked</li>
            <li>4. You can mint Commercial and Display licenses</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
