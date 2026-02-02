/**
 * Blockchain Service
 * Handles NFT minting on Polygon
 *
 * Set USE_MOCK_BLOCKCHAIN=true for testing without a real blockchain
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

const USE_MOCK = process.env.USE_MOCK_BLOCKCHAIN === 'true';

// Persistent mock storage (only used when USE_MOCK_BLOCKCHAIN=true)
const persistence = require('./mock-persistence');
const mockTokens = USE_MOCK ? persistence.loadMap('blockchain-tokens') : new Map();
let mockTokenCounter = USE_MOCK ? persistence.loadValue('blockchain-counter', 0) : 0;

// License types (matches contract enum)
const LicenseType = {
  Display: 0,
  Commercial: 1,
  Transfer: 2
};

// Contract ABI (updated for bilateral signatures and license tracking)
const NFTMARKET_ABI = [
  'function mint(address to, string uri, bytes32 imageHash, string encryptedBlobUri) returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getTokenData(uint256 tokenId) view returns (address creator, address currentOwner, address copyrightOwner, uint8 ownerLicense, bytes32 imageHash, uint256 mintedAt, string encryptedBlobUri, string uri)',
  'function isImageRegistered(bytes32 imageHash) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'event Minted(uint256 indexed tokenId, address indexed creator, bytes32 imageHash)',
  // License rights view functions
  'function checkDisplayRights(uint256 tokenId, address account) view returns (bool)',
  'function checkCommercialRights(uint256 tokenId, address account) view returns (bool)',
  'function checkCopyrightOwnership(uint256 tokenId, address account) view returns (bool)',
  'function getMaxSellableLicense(uint256 tokenId) view returns (uint8)',
  'function hasDisplayLicense(uint256 tokenId, address account) view returns (bool)',
  // Marketplace functions (updated with signatures)
  'function list(uint256 tokenId, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 expiry, bytes signature)',
  'function delist(uint256 tokenId)',
  'function buy(uint256 tokenId, bytes signature) payable',
  'function getListing(uint256 tokenId) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)',
  'function getListingSignature(uint256 tokenId) view returns (bytes)',
  'function getNonce(address account) view returns (uint256)',
  'function getDomainSeparator() view returns (bytes32)',
  'event Listed(uint256 indexed tokenId, address indexed seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry)',
  'event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 licenseType, bytes32 licenseHash)',
  'event BilateralAgreement(uint256 indexed tokenId, bytes sellerSignature, bytes buyerSignature, uint256 timestamp)',
  'event CopyrightTransferred(uint256 indexed tokenId, address indexed from, address indexed to)',
  'event DisplayRightsRetained(uint256 indexed tokenId, address indexed holder)'
];

// EIP-712 type definitions
const EIP712_TYPES = {
  ListingOffer: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'price', type: 'uint256' },
    { name: 'licenseType', type: 'uint8' },
    { name: 'licenseHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' }
  ],
  PurchaseAcceptance: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'price', type: 'uint256' },
    { name: 'licenseType', type: 'uint8' },
    { name: 'licenseHash', type: 'bytes32' },
    { name: 'seller', type: 'address' },
    { name: 'nonce', type: 'uint256' }
  ]
};

// Persistent mock listings storage
const mockListings = USE_MOCK ? persistence.loadMap('blockchain-listings') : new Map();
const mockNonces = USE_MOCK ? persistence.loadMap('blockchain-nonces') : new Map();
// Track display rights retained from Transfer sales (tokenId => Set of addresses)
const mockDisplayRights = USE_MOCK ? persistence.loadMap('blockchain-displayrights') : new Map();

// Save all mock blockchain state
function saveMockState() {
  if (USE_MOCK) {
    persistence.saveMap('blockchain-tokens', mockTokens);
    persistence.saveValue('blockchain-counter', mockTokenCounter);
    persistence.saveMap('blockchain-listings', mockListings);
    persistence.saveMap('blockchain-nonces', mockNonces);
    persistence.saveMap('blockchain-displayrights', mockDisplayRights);
  }
}

const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const MINTER_PRIVATE_KEY = process.env.MINTER_PRIVATE_KEY;

// Load contract address from env or deployment.json
function loadContractAddress() {
  // First try environment variable
  if (process.env.NFTMARKET_CONTRACT_ADDRESS) {
    return process.env.NFTMARKET_CONTRACT_ADDRESS;
  }

  // Fall back to deployment.json from contracts directory
  const deploymentPath = path.join(__dirname, '..', '..', '..', 'contracts', 'deployment.json');
  try {
    if (fs.existsSync(deploymentPath)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      console.log(`[Blockchain] Loaded contract address from deployment.json: ${deployment.address}`);
      return deployment.address;
    }
  } catch (e) {
    console.warn('[Blockchain] Could not read deployment.json:', e.message);
  }

  return null;
}

const CONTRACT_ADDRESS = loadContractAddress();

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
 * Get the EIP-712 domain for signing
 */
async function getEIP712Domain() {
  if (USE_MOCK) {
    return {
      name: 'NFTmarket',
      version: '1',
      chainId: 31337, // Hardhat
      verifyingContract: CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3'
    };
  }

  const network = await getProvider().getNetwork();
  return {
    name: 'NFTmarket',
    version: '1',
    chainId: Number(network.chainId),
    verifyingContract: CONTRACT_ADDRESS
  };
}

/**
 * Get the current nonce for an address
 */
async function getNonce(address) {
  if (USE_MOCK) {
    return mockNonces.get(address.toLowerCase()) || 0;
  }

  const nftmarket = getContract();
  return Number(await nftmarket.getNonce(address));
}

/**
 * Get typed data for listing (seller signature)
 * Client signs this to create a listing
 */
async function getListingTypedData(tokenId, price, licenseType, licenseHash, expiry, signerAddress) {
  const domain = await getEIP712Domain();
  const nonce = await getNonce(signerAddress);

  const value = {
    tokenId: BigInt(tokenId),
    price: BigInt(price),
    licenseType: licenseType,
    licenseHash: licenseHash,
    nonce: BigInt(nonce),
    expiry: BigInt(expiry || 0)
  };

  return {
    domain,
    types: { ListingOffer: EIP712_TYPES.ListingOffer },
    primaryType: 'ListingOffer',
    message: value,
    // Include raw values for easy consumption
    raw: {
      tokenId: tokenId.toString(),
      price: price.toString(),
      licenseType,
      licenseHash,
      nonce: nonce.toString(),
      expiry: (expiry || 0).toString()
    }
  };
}

/**
 * Get typed data for purchase (buyer signature)
 * Client signs this to accept listing terms and buy
 */
async function getPurchaseTypedData(tokenId) {
  if (USE_MOCK) {
    const listing = mockListings.get(Number(tokenId));
    if (!listing || !listing.active) {
      throw new Error('Token not listed');
    }

    const domain = await getEIP712Domain();

    const value = {
      tokenId: BigInt(tokenId),
      price: BigInt(listing.price),
      licenseType: listing.licenseType,
      licenseHash: listing.licenseHash,
      seller: listing.seller,
      nonce: BigInt(listing.nonce)
    };

    return {
      domain,
      types: { PurchaseAcceptance: EIP712_TYPES.PurchaseAcceptance },
      primaryType: 'PurchaseAcceptance',
      message: value,
      raw: {
        tokenId: tokenId.toString(),
        price: listing.price.toString(),
        licenseType: listing.licenseType,
        licenseHash: listing.licenseHash,
        seller: listing.seller,
        nonce: listing.nonce.toString()
      }
    };
  }

  const nftmarket = getContract();
  const listing = await nftmarket.getListing(tokenId);

  if (!listing.active) {
    throw new Error('Token not listed');
  }

  const domain = await getEIP712Domain();

  const value = {
    tokenId: BigInt(tokenId),
    price: listing.price,
    licenseType: Number(listing.licenseType),
    licenseHash: listing.licenseHash,
    seller: listing.seller,
    nonce: listing.nonce
  };

  return {
    domain,
    types: { PurchaseAcceptance: EIP712_TYPES.PurchaseAcceptance },
    primaryType: 'PurchaseAcceptance',
    message: value,
    raw: {
      tokenId: tokenId.toString(),
      price: listing.price.toString(),
      licenseType: Number(listing.licenseType),
      licenseHash: listing.licenseHash,
      seller: listing.seller,
      nonce: listing.nonce.toString()
    }
  };
}

/**
 * Mint a new NFT
 * @param {string} to - Recipient wallet address
 * @param {string} uri - Token metadata URI (IPFS)
 * @param {number} licenseType - License type (0=Display, 1=Commercial, 2=Transfer)
 * @param {string} imageHash - SHA-256 hash of original image (0x prefixed)
 * @param {string} licenseHash - Hash of signed license agreement
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
  console.log('  License Type:', licenseType);

  // Contract signature: mint(address to, string uri, bytes32 imageHash, string encryptedBlobUri)
  // Note: licenseType/licenseHash are set during listing, not minting
  const gasEstimate = await nftmarket.mint.estimateGas(
    to,
    uri,
    imageHash,
    encryptedBlobUri
  );

  console.log('  Gas estimate:', gasEstimate.toString());

  // Send transaction with 20% gas buffer
  const tx = await nftmarket.mint(
    to,
    uri,
    imageHash,
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
    copyrightOwner: to,           // Creator starts as copyright owner
    licenseType: licenseType !== undefined ? licenseType : LicenseType.Transfer,
    ownerLicense: LicenseType.Transfer, // Creator always has full rights
    licenseHash,
    imageHash,
    mintedAt: new Date(),
    encryptedBlobUri,
    uri
  });
  saveMockState();

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
 * Get token owner
 */
async function ownerOf(tokenId) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) {
      throw new Error('Token does not exist');
    }
    return token.currentOwner;
  }

  const nftmarket = getContract();
  return await nftmarket.ownerOf(tokenId);
}

/**
 * Get token URI
 */
async function tokenURI(tokenId) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) {
      throw new Error('Token does not exist');
    }
    return token.uri;
  }

  const nftmarket = getContract();
  return await nftmarket.tokenURI(tokenId);
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
    copyrightOwner: data.copyrightOwner,
    ownerLicense: Number(data.ownerLicense),
    imageHash: data.imageHash,
    mintedAt: new Date(Number(data.mintedAt) * 1000),
    encryptedBlobUri: data.encryptedBlobUri,
    uri: data.uri
  };
}

/**
 * Check if an address has Display rights for a token
 */
async function checkDisplayRights(tokenId, address) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) return false;

    // Creator always has display rights
    if (token.creator.toLowerCase() === address.toLowerCase()) return true;

    // Current owner always has display rights
    if (token.currentOwner.toLowerCase() === address.toLowerCase()) return true;

    // Check retained display rights from Transfer sales
    const rights = mockDisplayRights.get(Number(tokenId));
    if (rights && rights.has(address.toLowerCase())) return true;

    return false;
  }

  const nftmarket = getContract();
  return nftmarket.checkDisplayRights(tokenId, address);
}

/**
 * Check if an address has Commercial rights for a token
 */
async function checkCommercialRights(tokenId, address) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) return false;

    // Copyright owner has commercial rights
    if (token.copyrightOwner.toLowerCase() === address.toLowerCase()) return true;

    // Current owner has commercial rights if license is Commercial or Transfer
    if (token.currentOwner.toLowerCase() === address.toLowerCase()) {
      return token.ownerLicense >= LicenseType.Commercial;
    }

    return false;
  }

  const nftmarket = getContract();
  return nftmarket.checkCommercialRights(tokenId, address);
}

/**
 * Check if an address owns the copyright for a token
 */
async function checkCopyrightOwnership(tokenId, address) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) return false;
    return token.copyrightOwner.toLowerCase() === address.toLowerCase();
  }

  const nftmarket = getContract();
  return nftmarket.checkCopyrightOwnership(tokenId, address);
}

/**
 * Get the maximum license type the current owner can sell
 */
async function getMaxSellableLicense(tokenId) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) throw new Error('Token does not exist');
    return token.ownerLicense;
  }

  const nftmarket = getContract();
  return Number(await nftmarket.getMaxSellableLicense(tokenId));
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
 * List a token for sale (mock only - real listing done client-side)
 * @param {number} tokenId - Token to list
 * @param {string} price - Price in wei
 * @param {number} licenseType - 0=Display, 1=Commercial, 2=Transfer
 * @param {string} licenseHash - SHA-256 hash of license document (0x prefixed)
 * @param {number} expiry - Expiration timestamp (0 for no expiry)
 * @param {string} signature - Seller's EIP-712 signature
 * @param {string} sellerAddress - Address of the seller (for verification)
 */
async function listToken(tokenId, price, licenseType, licenseHash, expiryOrSeller, signature, sellerAddress) {
  if (USE_MOCK) {
    // Support old calling convention: listToken(tokenId, price, licenseType, licenseHash, sellerAddress)
    let actualSellerAddress = sellerAddress;
    let actualExpiry = 0;
    let actualSignature = signature;

    if (typeof expiryOrSeller === 'string' && expiryOrSeller.startsWith('0x')) {
      // Old 5-param signature: expiryOrSeller is actually sellerAddress
      actualSellerAddress = expiryOrSeller;
      actualExpiry = 0;
      actualSignature = null;
    } else if (typeof expiryOrSeller === 'number') {
      actualExpiry = expiryOrSeller;
    }

    // Convert string license type to number if needed
    const licenseTypeMap = { display: 0, commercial: 1, transfer: 2 };
    const actualLicenseType = typeof licenseType === 'string' ? licenseTypeMap[licenseType] : licenseType;

    const token = mockTokens.get(Number(tokenId));
    if (!token) throw new Error('Token does not exist');
    if (token.currentOwner.toLowerCase() !== actualSellerAddress.toLowerCase()) {
      throw new Error('Not token owner');
    }
    if (mockListings.has(Number(tokenId)) && mockListings.get(Number(tokenId)).active) {
      throw new Error('Already listed');
    }
    // Cannot sell more rights than you have
    if (actualLicenseType > token.ownerLicense) {
      throw new Error('Cannot escalate rights');
    }

    const nonce = mockNonces.get(actualSellerAddress.toLowerCase()) || 0;
    mockNonces.set(actualSellerAddress.toLowerCase(), nonce + 1);

    mockListings.set(Number(tokenId), {
      seller: actualSellerAddress,
      price: price,
      licenseType: actualLicenseType,
      licenseHash: licenseHash,
      nonce: nonce,
      expiry: actualExpiry,
      sellerSignature: actualSignature,
      active: true
    });
    saveMockState();

    console.log(`[MOCK] Listed token ${tokenId} for ${price} wei with license type ${actualLicenseType}`);
    return { tokenId, price, transactionHash: '0x' + crypto.randomBytes(32).toString('hex') };
  }

  // Real blockchain listing is done client-side
  throw new Error('Real blockchain listing must be done from client wallet');
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

    listing.active = false;
    saveMockState();
    console.log(`[MOCK] Delisted token ${tokenId}`);
    return { tokenId };
  }

  // Real blockchain delisting is done client-side
  throw new Error('Real blockchain delisting must be done from client wallet');
}

/**
 * Buy a listed token (mock only - real buying done client-side)
 * @param {number} tokenId - Token to buy
 * @param {string} signature - Buyer's EIP-712 signature
 * @param {string} buyerAddress - Address of the buyer
 */
async function buyToken(tokenId, signatureOrBuyer, buyerAddress) {
  if (USE_MOCK) {
    // Support old calling convention: buyToken(tokenId, buyerAddress)
    let actualBuyerAddress = buyerAddress;
    let actualSignature = signatureOrBuyer;

    if (buyerAddress === undefined && typeof signatureOrBuyer === 'string' && signatureOrBuyer.startsWith('0x')) {
      // Old 2-param signature: signatureOrBuyer is actually buyerAddress
      actualBuyerAddress = signatureOrBuyer;
      actualSignature = null;
    }

    const listing = mockListings.get(Number(tokenId));
    if (!listing || !listing.active) throw new Error('Not listed');
    if (listing.seller.toLowerCase() === actualBuyerAddress.toLowerCase()) {
      throw new Error('Cannot buy own token');
    }

    const token = mockTokens.get(Number(tokenId));
    const previousOwner = token.currentOwner;
    const licenseType = listing.licenseType;

    // Handle license rights transfer
    if (licenseType === LicenseType.Transfer) {
      // Seller retains display rights
      if (!mockDisplayRights.has(Number(tokenId))) {
        mockDisplayRights.set(Number(tokenId), new Set());
      }
      mockDisplayRights.get(Number(tokenId)).add(previousOwner.toLowerCase());

      // Buyer becomes new copyright owner with Transfer rights
      token.copyrightOwner = actualBuyerAddress;
      token.ownerLicense = LicenseType.Transfer;

      console.log(`[MOCK] Copyright transferred to ${actualBuyerAddress}, ${previousOwner} retains display rights`);
    } else {
      // Buyer gets the license they paid for, copyright doesn't change
      token.ownerLicense = licenseType;
    }

    // Transfer NFT ownership
    token.currentOwner = actualBuyerAddress;
    listing.active = false;
    saveMockState();

    console.log(`[MOCK] Token ${tokenId} sold from ${previousOwner} to ${actualBuyerAddress} for ${listing.price} wei`);
    console.log(`[MOCK] Bilateral agreement recorded with seller and buyer signatures`);

    return {
      tokenId,
      seller: previousOwner,
      buyer: actualBuyerAddress,
      price: listing.price,
      licenseType,
      sellerSignature: listing.sellerSignature,
      buyerSignature: actualSignature
    };
  }

  // Real blockchain buying is done client-side
  throw new Error('Real blockchain buying must be done from client wallet');
}

/**
 * Get listing info
 */
async function getListing(tokenId) {
  if (USE_MOCK) {
    const listing = mockListings.get(Number(tokenId));
    if (!listing) {
      return { seller: null, price: '0', licenseType: 0, licenseHash: null, nonce: 0, expiry: 0, active: false };
    }
    return listing;
  }

  const nftmarket = getContract();
  const listing = await nftmarket.getListing(tokenId);
  return {
    seller: listing.seller,
    price: listing.price.toString(),
    licenseType: Number(listing.licenseType),
    licenseHash: listing.licenseHash,
    nonce: Number(listing.nonce),
    expiry: Number(listing.expiry),
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
        licenseType: Number(listing.licenseType),
        nonce: Number(listing.nonce),
        expiry: Number(listing.expiry),
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
  mockNonces.clear();
  mockDisplayRights.clear();
  mockTokenCounter = 0;
  saveMockState();
}

/**
 * Get mock tokens (for testing)
 */
function getMockTokens() {
  return mockTokens;
}

/**
 * Get all tokens from the blockchain
 * Used to sync Firestore with on-chain state
 */
async function getAllTokens() {
  const supply = await totalSupply();
  const tokens = [];

  for (let i = 0; i < supply; i++) {
    try {
      const tokenData = await getTokenData(i);
      tokens.push({
        tokenId: i,
        ...tokenData
      });
    } catch (e) {
      console.warn(`[Blockchain] Could not fetch token ${i}:`, e.message);
    }
  }

  return tokens;
}

module.exports = {
  mint,
  isOwner,
  ownerOf,
  tokenURI,
  getTokenData,
  isImageRegistered,
  totalSupply,
  // License rights checks
  checkDisplayRights,
  checkCommercialRights,
  checkCopyrightOwnership,
  getMaxSellableLicense,
  LicenseType,
  // EIP-712 helpers
  getEIP712Domain,
  getNonce,
  getListingTypedData,
  getPurchaseTypedData,
  // Marketplace
  listToken,
  delistToken,
  buyToken,
  getListing,
  getActiveListings,
  // Test utilities
  resetMock,
  getMockTokens,
  getAllTokens
};
