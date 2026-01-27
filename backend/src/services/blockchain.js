/**
 * Blockchain Service
 * Handles NFT minting on Polygon
 *
 * Set USE_MOCK_BLOCKCHAIN=true for testing without a real blockchain
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

const USE_MOCK = process.env.USE_MOCK_BLOCKCHAIN === 'true';

// Mock storage for testing
const mockTokens = new Map();
let mockTokenCounter = 0;

// Contract ABI (minimal, just what we need)
const NFTMARKET_ABI = [
  'function mint(address to, string uri, uint8 licenseType, bytes32 imageHash, bytes32 licenseHash, string encryptedBlobUri) returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getTokenData(uint256 tokenId) view returns (address creator, address currentOwner, uint8 licenseType, bytes32 imageHash, bytes32 licenseHash, uint256 mintedAt, string encryptedBlobUri, string uri)',
  'function isImageRegistered(bytes32 imageHash) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'event Minted(uint256 indexed tokenId, address indexed creator, uint8 licenseType, bytes32 imageHash)',
  // Marketplace functions
  'function list(uint256 tokenId, uint256 price)',
  'function delist(uint256 tokenId)',
  'function buy(uint256 tokenId) payable',
  'function getListing(uint256 tokenId) view returns (address seller, uint256 price, bool active)',
  'event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)',
  'event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price)'
];

// Mock listings storage
const mockListings = new Map();

const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const CONTRACT_ADDRESS = process.env.NFTMARKET_CONTRACT_ADDRESS;
const MINTER_PRIVATE_KEY = process.env.MINTER_PRIVATE_KEY;

let provider = null;
let wallet = null;
let contract = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return provider;
}

function getWallet() {
  if (!wallet) {
    if (!MINTER_PRIVATE_KEY) {
      throw new Error('MINTER_PRIVATE_KEY environment variable required');
    }
    wallet = new ethers.Wallet(MINTER_PRIVATE_KEY, getProvider());
  }
  return wallet;
}

function getContract() {
  if (!contract) {
    if (!CONTRACT_ADDRESS) {
      throw new Error('NFTMARKET_CONTRACT_ADDRESS environment variable required');
    }
    contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMARKET_ABI, getWallet());
  }
  return contract;
}

/**
 * Mint a new NFT
 * @param {string} to - Recipient wallet address
 * @param {string} uri - Token metadata URI (IPFS)
 * @param {number} licenseType - 0=Display, 1=Commercial, 2=Transfer
 * @param {string} imageHash - SHA-256 hash of original image (0x prefixed)
 * @param {string} licenseHash - SHA-256 hash of license document (0x prefixed)
 * @param {string} encryptedBlobUri - IPFS URI of encrypted original
 * @returns {Promise<{tokenId: number, transactionHash: string}>}
 */
async function mint(to, uri, licenseType, imageHash, licenseHash, encryptedBlobUri) {
  if (USE_MOCK) {
    return mockMint(to, uri, licenseType, imageHash, licenseHash, encryptedBlobUri);
  }

  const nftmarket = getContract();

  console.log('Minting NFT...');
  console.log('  To:', to);
  console.log('  URI:', uri);
  console.log('  License:', licenseType);

  // Estimate gas first
  const gasEstimate = await nftmarket.mint.estimateGas(
    to,
    uri,
    licenseType,
    imageHash,
    licenseHash,
    encryptedBlobUri
  );

  console.log('  Gas estimate:', gasEstimate.toString());

  // Send transaction with 20% gas buffer
  const tx = await nftmarket.mint(
    to,
    uri,
    licenseType,
    imageHash,
    licenseHash,
    encryptedBlobUri,
    {
      gasLimit: gasEstimate * 120n / 100n
    }
  );

  console.log('  Transaction hash:', tx.hash);

  // Wait for confirmation
  const receipt = await tx.wait();

  // Parse Minted event to get tokenId
  const mintedEvent = receipt.logs
    .map(log => {
      try {
        return nftmarket.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(event => event?.name === 'Minted');

  if (!mintedEvent) {
    throw new Error('Minted event not found in transaction receipt');
  }

  const tokenId = Number(mintedEvent.args.tokenId);

  console.log('  Token ID:', tokenId);
  console.log('  Block:', receipt.blockNumber);

  return {
    tokenId,
    transactionHash: tx.hash,
    blockNumber: receipt.blockNumber
  };
}

/**
 * Mock mint for testing
 */
async function mockMint(to, uri, licenseType, imageHash, licenseHash, encryptedBlobUri) {
  // Check for duplicate image hash
  for (const token of mockTokens.values()) {
    if (token.imageHash === imageHash) {
      throw new Error('Image already registered');
    }
  }

  mockTokenCounter++;
  const tokenId = mockTokenCounter;
  const transactionHash = '0x' + crypto.randomBytes(32).toString('hex');
  const blockNumber = 10000000 + tokenId;

  mockTokens.set(tokenId, {
    creator: to,
    currentOwner: to,
    licenseType,
    imageHash,
    licenseHash,
    mintedAt: new Date(),
    encryptedBlobUri,
    uri
  });

  console.log('[MOCK] Minted NFT');
  console.log('  Token ID:', tokenId);
  console.log('  To:', to);
  console.log('  Transaction:', transactionHash);

  return {
    tokenId,
    transactionHash,
    blockNumber
  };
}

/**
 * Check if a wallet owns a specific token
 */
async function isOwner(tokenId, walletAddress) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) return false;
    return token.currentOwner.toLowerCase() === walletAddress.toLowerCase();
  }

  const nftmarket = getContract();
  const owner = await nftmarket.ownerOf(tokenId);
  return owner.toLowerCase() === walletAddress.toLowerCase();
}

/**
 * Get token data
 */
async function getTokenData(tokenId) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) {
      throw new Error('Token does not exist');
    }
    return { ...token };
  }

  const nftmarket = getContract();
  const data = await nftmarket.getTokenData(tokenId);

  return {
    creator: data.creator,
    currentOwner: data.currentOwner,
    licenseType: Number(data.licenseType),
    imageHash: data.imageHash,
    licenseHash: data.licenseHash,
    mintedAt: new Date(Number(data.mintedAt) * 1000),
    encryptedBlobUri: data.encryptedBlobUri,
    uri: data.uri
  };
}

/**
 * Check if an image hash is already registered
 */
async function isImageRegistered(imageHash) {
  if (USE_MOCK) {
    for (const token of mockTokens.values()) {
      if (token.imageHash === imageHash) {
        return true;
      }
    }
    return false;
  }

  const nftmarket = getContract();
  return nftmarket.isImageRegistered(imageHash);
}

/**
 * Get total supply
 */
async function totalSupply() {
  if (USE_MOCK) {
    return mockTokens.size;
  }

  const nftmarket = getContract();
  return Number(await nftmarket.totalSupply());
}

/**
 * List a token for sale
 * @param {number} tokenId - Token to list
 * @param {string} price - Price in wei
 * @param {string} sellerAddress - Address of the seller (for verification)
 */
async function listToken(tokenId, price, sellerAddress) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) throw new Error('Token does not exist');
    if (token.currentOwner.toLowerCase() !== sellerAddress.toLowerCase()) {
      throw new Error('Not token owner');
    }
    if (mockListings.has(Number(tokenId))) {
      throw new Error('Already listed');
    }

    mockListings.set(Number(tokenId), {
      seller: sellerAddress,
      price: price,
      active: true
    });

    console.log(`[MOCK] Listed token ${tokenId} for ${price} wei`);
    return { tokenId, price };
  }

  const nftmarket = getContract();
  const tx = await nftmarket.list(tokenId, price);
  await tx.wait();
  return { tokenId, price, transactionHash: tx.hash };
}

/**
 * Delist a token
 */
async function delistToken(tokenId, sellerAddress) {
  if (USE_MOCK) {
    const listing = mockListings.get(Number(tokenId));
    if (!listing || !listing.active) throw new Error('Not listed');
    if (listing.seller.toLowerCase() !== sellerAddress.toLowerCase()) {
      throw new Error('Not the seller');
    }

    mockListings.delete(Number(tokenId));
    console.log(`[MOCK] Delisted token ${tokenId}`);
    return { tokenId };
  }

  const nftmarket = getContract();
  const tx = await nftmarket.delist(tokenId);
  await tx.wait();
  return { tokenId, transactionHash: tx.hash };
}

/**
 * Buy a listed token
 * @param {number} tokenId - Token to buy
 * @param {string} buyerAddress - Address of the buyer
 */
async function buyToken(tokenId, buyerAddress) {
  if (USE_MOCK) {
    const listing = mockListings.get(Number(tokenId));
    if (!listing || !listing.active) throw new Error('Not listed');
    if (listing.seller.toLowerCase() === buyerAddress.toLowerCase()) {
      throw new Error('Cannot buy own token');
    }

    const token = mockTokens.get(Number(tokenId));
    const previousOwner = token.currentOwner;

    // Transfer ownership
    token.currentOwner = buyerAddress;
    mockListings.delete(Number(tokenId));

    console.log(`[MOCK] Token ${tokenId} sold from ${previousOwner} to ${buyerAddress} for ${listing.price} wei`);
    return {
      tokenId,
      seller: previousOwner,
      buyer: buyerAddress,
      price: listing.price
    };
  }

  const nftmarket = getContract();
  const listing = await nftmarket.getListing(tokenId);
  const tx = await nftmarket.buy(tokenId, { value: listing.price });
  const receipt = await tx.wait();
  return {
    tokenId,
    transactionHash: tx.hash,
    price: listing.price.toString()
  };
}

/**
 * Get listing info
 */
async function getListing(tokenId) {
  if (USE_MOCK) {
    const listing = mockListings.get(Number(tokenId));
    if (!listing) {
      return { seller: null, price: '0', active: false };
    }
    return listing;
  }

  const nftmarket = getContract();
  const listing = await nftmarket.getListing(tokenId);
  return {
    seller: listing.seller,
    price: listing.price.toString(),
    active: listing.active
  };
}

/**
 * Get all active listings
 */
async function getActiveListings() {
  if (USE_MOCK) {
    const listings = [];
    for (const [tokenId, listing] of mockListings) {
      if (listing.active) {
        const token = mockTokens.get(tokenId);
        listings.push({
          tokenId,
          ...listing,
          ...token
        });
      }
    }
    return listings;
  }

  // For real blockchain, we'd need to query events or maintain an index
  // For now, iterate through tokens (not efficient for production)
  const nftmarket = getContract();
  const supply = await nftmarket.totalSupply();
  const listings = [];

  for (let i = 0; i < supply; i++) {
    const listing = await nftmarket.getListing(i);
    if (listing.active) {
      listings.push({
        tokenId: i,
        seller: listing.seller,
        price: listing.price.toString(),
        active: true
      });
    }
  }

  return listings;
}

/**
 * Reset mock state (for testing)
 */
function resetMock() {
  mockTokens.clear();
  mockListings.clear();
  mockTokenCounter = 0;
}

/**
 * Get mock tokens (for testing)
 */
function getMockTokens() {
  return mockTokens;
}

module.exports = {
  mint,
  isOwner,
  getTokenData,
  isImageRegistered,
  totalSupply,
  // Marketplace
  listToken,
  delistToken,
  buyToken,
  getListing,
  getActiveListings,
  // Test utilities
  resetMock,
  getMockTokens
};
