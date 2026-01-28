// Contract address - configurable via environment variable
// Default is local Anvil address for development
export const NFT_LICENSING_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3") as `0x${string}`;

// Chain ID - configurable via environment variable
// Default is 31337 (local Anvil) for development
export const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "31337", 10);

export const NFT_LICENSING_ABI = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "acceptOffer",
    inputs: [
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "offerIndex", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canTransfer",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "cancelListing",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createArtwork",
    inputs: [
      { name: "metadataURI", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "artworkId", type: "uint160", internalType: "uint160" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getApproved",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getArtwork",
    inputs: [{ name: "artworkId", type: "uint160", internalType: "uint160" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct INFTLicensing.Artwork",
        components: [
          { name: "originalMinter", type: "address", internalType: "address" },
          { name: "commercialCount", type: "uint88", internalType: "uint88" },
          { name: "displayCount", type: "uint88", internalType: "uint88" },
          {
            name: "copyrightTransferred",
            type: "bool",
            internalType: "bool",
          },
          { name: "metadataURI", type: "string", internalType: "string" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLicenseInfo",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct INFTLicensing.LicenseInfo",
        components: [
          { name: "artworkId", type: "uint160", internalType: "uint160" },
          {
            name: "licenseType",
            type: "uint8",
            internalType: "enum INFTLicensing.LicenseType",
          },
          { name: "isOriginalGrant", type: "bool", internalType: "bool" },
          { name: "instanceId", type: "uint88", internalType: "uint88" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getListing",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct INFTLicensing.Listing",
        components: [
          { name: "askingPrice", type: "uint256", internalType: "uint256" },
          { name: "isActive", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getListings",
    inputs: [],
    outputs: [
      { name: "tokenIds", type: "uint256[]", internalType: "uint256[]" },
      {
        name: "listingData",
        type: "tuple[]",
        internalType: "struct INFTLicensing.Listing[]",
        components: [
          { name: "askingPrice", type: "uint256", internalType: "uint256" },
          { name: "isActive", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOffers",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct INFTLicensing.Offer[]",
        components: [
          { name: "offerer", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "isActive", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOriginalMinter",
    inputs: [{ name: "artworkId", type: "uint160", internalType: "uint160" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOwnedTokens",
    inputs: [{ name: "owner", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPendingWithdrawals",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isApprovedForAll",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "operator", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "listForSale",
    inputs: [
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "askingPrice", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "makeOffer",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "mintLicense",
    inputs: [
      { name: "artworkId", type: "uint160", internalType: "uint160" },
      {
        name: "licenseType",
        type: "uint8",
        internalType: "enum INFTLicensing.LicenseType",
      },
      { name: "to", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rejectOffer",
    inputs: [
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "offerIndex", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      { name: "from", type: "address", internalType: "address" },
      { name: "to", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      { name: "from", type: "address", internalType: "address" },
      { name: "to", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setApprovalForAll",
    inputs: [
      { name: "operator", type: "address", internalType: "address" },
      { name: "approved", type: "bool", internalType: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "supportsInterface",
    inputs: [{ name: "interfaceId", type: "bytes4", internalType: "bytes4" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transferCopyrightWithRetention",
    inputs: [
      { name: "artworkId", type: "uint160", internalType: "uint160" },
      { name: "to", type: "address", internalType: "address" },
      {
        name: "retention",
        type: "uint8",
        internalType: "enum INFTLicensing.RetentionType",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      { name: "from", type: "address", internalType: "address" },
      { name: "to", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawOffer",
    inputs: [
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "offerIndex", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      {
        name: "approved",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ApprovalForAll",
    inputs: [
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      {
        name: "operator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      { name: "approved", type: "bool", indexed: false, internalType: "bool" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ArtworkCreated",
    inputs: [
      {
        name: "artworkId",
        type: "uint160",
        indexed: true,
        internalType: "uint160",
      },
      {
        name: "originalMinter",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "metadataURI",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Listed",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "seller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "askingPrice",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ListingCancelled",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "seller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OfferAccepted",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "seller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      { name: "buyer", type: "address", indexed: true, internalType: "address" },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OfferMade",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "offerer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "offerIndex",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OfferRejected",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "offerer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OfferWithdrawn",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "offerer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true, internalType: "address" },
      { name: "to", type: "address", indexed: true, internalType: "address" },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "AlreadyListed", inputs: [] },
  { type: "error", name: "AlreadyResold", inputs: [] },
  { type: "error", name: "ArtworkDoesNotExist", inputs: [] },
  { type: "error", name: "CopyrightAlreadyTransferred", inputs: [] },
  { type: "error", name: "InsufficientFunds", inputs: [] },
  { type: "error", name: "InvalidLicenseType", inputs: [] },
  { type: "error", name: "InvalidOffer", inputs: [] },
  { type: "error", name: "NoFundsToWithdraw", inputs: [] },
  { type: "error", name: "NotCopyrightOwner", inputs: [] },
  { type: "error", name: "NotListed", inputs: [] },
  { type: "error", name: "NotOfferer", inputs: [] },
  { type: "error", name: "NotTokenOwner", inputs: [] },
  { type: "error", name: "OfferNotActive", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "TransferNotAllowed", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
] as const;

export const contractConfig = {
  address: NFT_LICENSING_ADDRESS,
  abi: NFT_LICENSING_ABI,
  chainId: CHAIN_ID,
} as const;

export enum LicenseType {
  Copyright = 0,
  Commercial = 1,
  Display = 2,
}

export const LICENSE_TYPE_NAMES: Record<LicenseType, string> = {
  [LicenseType.Copyright]: "Copyright",
  [LicenseType.Commercial]: "Commercial",
  [LicenseType.Display]: "Display",
};

// Token ID encoding/decoding utilities (matching TokenIdCodec.sol)
const ARTWORK_ID_SHIFT = 96n;
const LICENSE_TYPE_SHIFT = 88n;
const ARTWORK_ID_MASK = (1n << 160n) - 1n;
const LICENSE_TYPE_MASK = (1n << 8n) - 1n;
const INSTANCE_ID_MASK = (1n << 88n) - 1n;

export function decodeTokenId(tokenId: bigint): {
  artworkId: bigint;
  licenseType: LicenseType;
  instanceId: bigint;
} {
  return {
    artworkId: (tokenId >> ARTWORK_ID_SHIFT) & ARTWORK_ID_MASK,
    licenseType: Number((tokenId >> LICENSE_TYPE_SHIFT) & LICENSE_TYPE_MASK),
    instanceId: tokenId & INSTANCE_ID_MASK,
  };
}

export function copyrightTokenId(artworkId: bigint): bigint {
  return artworkId << ARTWORK_ID_SHIFT;
}
