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

// Contract ABI (updated for V2 with authority system, no encryptedBlobUri)
const NFTMARKET_ABI = [
  // Authority management
  'function registerAuthority(address admin, uint96 feeBps) returns (uint256)',
  'function deactivateAuthority(uint256 authorityId)',
  'function updateAuthorityFee(uint256 authorityId, uint96 newFeeBps)',
  'function addMinter(uint256 authorityId, address minter)',
  'function removeMinter(uint256 authorityId, address minter)',
  'function getAuthority(uint256 authorityId) view returns (address admin, uint96 feeBps, bool isActive, uint256 registeredAt)',
  'function getMinterAuthority(address minter) view returns (uint256 authorityId, bool isMinter)',
  'function totalAuthorities() view returns (uint256)',
  'event AuthorityRegistered(uint256 indexed authorityId, address indexed admin, uint96 feeBps)',
  'event MinterAdded(uint256 indexed authorityId, address indexed minter)',
  'event MinterRemoved(uint256 indexed authorityId, address indexed minter)',
  // Token reservation and minting (no encryptedBlobUri)
  'function reserveTokenId() returns (uint256)',
  'function getReservation(uint256 tokenId) view returns (address reserver, uint256 expiry, bool isValid)',
  'function mint(uint256 reservedTokenId, address to, string uri, bytes32 imageHash, string ipfsUri) returns (uint256)',
  'event TokenReserved(uint256 indexed tokenId, address indexed reserver, uint256 expiry)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getTokenData(uint256 tokenId) view returns (address creator, address currentOwner, address copyrightOwner, uint8 ownerLicense, bytes32 imageHash, uint256 mintedAt, string ipfsUri, string uri, uint256 parentToken, uint256 originalToken, bool isOriginal, uint256 authorityId, address minter)',
  'function getProvenanceChain(uint256 tokenId) view returns (uint256[])',
  'function isImageRegistered(bytes32 imageHash) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'event Minted(uint256 indexed tokenId, address indexed creator, bytes32 imageHash, uint256 indexed authorityId, address minter)',
  // License rights view functions
  'function checkDisplayRights(uint256 tokenId, address account) view returns (bool)',
  'function checkCommercialRights(uint256 tokenId, address account) view returns (bool)',
  'function checkCopyrightOwnership(uint256 tokenId, address account) view returns (bool)',
  'function getMaxSellableLicense(uint256 tokenId) view returns (uint8)',
  'function hasDisplayLicense(uint256 tokenId, address account) view returns (bool)',
  // Marketplace functions (multi-license: can list same token at different prices per license type)
  'function list(uint256 tokenId, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 expiry, bytes signature)',
  'function delist(uint256 tokenId, uint8 licenseType)',
  'function delistAll(uint256 tokenId)',
  'function buy(uint256 tokenId, uint8 licenseType, bytes signature) payable',
  'function getListing(uint256 tokenId, uint8 licenseType) view returns (address seller, uint256 price, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)',
  'function getAllListings(uint256 tokenId) view returns (uint256 displayPrice, bool displayActive, uint256 commercialPrice, bool commercialActive, uint256 transferPrice, bool transferActive)',
  'function getListingSignature(uint256 tokenId, uint8 licenseType) view returns (bytes)',
  'function getNonce(address account) view returns (uint256)',
  'function getDomainSeparator() view returns (bytes32)',
  'event Listed(uint256 indexed tokenId, address indexed seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry)',
  'event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 licenseType, bytes32 licenseHash)',
  'event BilateralAgreement(uint256 indexed tokenId, bytes sellerSignature, bytes buyerSignature, uint256 timestamp)',
  'event CopyrightTransferred(uint256 indexed tokenId, address indexed from, address indexed to)',
  'event DisplayRightsRetained(uint256 indexed tokenId, address indexed holder)',
  'event LicenseGranted(uint256 indexed newTokenId, uint256 indexed parentTokenId, uint256 indexed originalTokenId, address licensor, address licensee, uint8 licenseType, bytes32 licenseHash)',
  // Fee withdrawal (pull pattern)
  'function withdrawFees()',
  'function pendingFees(address minter) view returns (uint256)',
  'function MAX_FEE_BPS() view returns (uint256)',
  'event FeeAccrued(address indexed minter, uint256 indexed tokenId, uint256 amount)',
  'event FeeWithdrawn(address indexed minter, uint256 amount)'
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
// Multi-license: mockListings is Map<tokenId, Map<licenseType, Listing>>
const mockListings = USE_MOCK ? persistence.loadMap('blockchain-listings') : new Map();
const mockNonces = USE_MOCK ? persistence.loadMap('blockchain-nonces') : new Map();
// Track display rights retained from Transfer sales (tokenId => Set of addresses)
const mockDisplayRights = USE_MOCK ? persistence.loadMap('blockchain-displayrights') : new Map();

// Helper to get or create listing map for a token
function getTokenListings(tokenId) {
  const id = Number(tokenId);
  if (!mockListings.has(id)) {
    mockListings.set(id, new Map());
  }
  return mockListings.get(id);
}

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
    // Use NonceManager to properly track nonces across sequential transactions
    const baseWallet = new ethers.Wallet(MINTER_PRIVATE_KEY, getProvider());
    wallet = new ethers.NonceManager(baseWallet);
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
 * @param {number} tokenId - Token to buy
 * @param {number} licenseType - Which license type listing to buy (0=Display, 1=Commercial, 2=Transfer)
 */
async function getPurchaseTypedData(tokenId, licenseType) {
  if (USE_MOCK) {
    const tokenListings = getTokenListings(tokenId);
    const listing = tokenListings.get(Number(licenseType));
    if (!listing || !listing.active) {
      throw new Error('Token not listed for this license type');
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
  const listing = await nftmarket.getListing(tokenId, licenseType);

  if (!listing.active) {
    throw new Error('Token not listed for this license type');
  }

  const domain = await getEIP712Domain();

  const value = {
    tokenId: BigInt(tokenId),
    price: listing.price,
    licenseType: Number(licenseType),
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
      licenseType: Number(licenseType),
      licenseHash: listing.licenseHash,
      seller: listing.seller,
      nonce: listing.nonce.toString()
    }
  };
}

/**
 * Reserve the next token ID for watermarking
 * Call this BEFORE watermarking to guarantee the token ID matches
 * @returns {Promise<{tokenId: number, transactionHash: string}>}
 */
async function reserveTokenId() {
  if (USE_MOCK) {
    return mockReserveTokenId();
  }

  const nftmarket = getContract();

  console.log('Reserving token ID...');

  const gasEstimate = await nftmarket.reserveTokenId.estimateGas();
  console.log('  Gas estimate:', gasEstimate.toString());

  const tx = await nftmarket.reserveTokenId({
    gasLimit: gasEstimate * 120n / 100n
  });

  console.log('  Transaction hash:', tx.hash);

  const receipt = await tx.wait();

  // Parse TokenReserved event to get tokenId
  const reservedEvent = receipt.logs
    .map(log => {
      try {
        return nftmarket.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(event => event?.name === 'TokenReserved');

  if (!reservedEvent) {
    throw new Error('TokenReserved event not found in transaction receipt');
  }

  const tokenId = Number(reservedEvent.args.tokenId);
  const expiry = Number(reservedEvent.args.expiry);

  console.log('  Reserved token ID:', tokenId);
  console.log('  Expiry:', new Date(expiry * 1000).toISOString());

  return {
    tokenId,
    expiry,
    transactionHash: tx.hash
  };
}

/**
 * Mock reserve token ID for testing
 */
function mockReserveTokenId() {
  const tokenId = mockTokenCounter++;
  const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  // Store reservation in mock storage
  mockTokens.set(tokenId, {
    reserved: true,
    reserver: 'mock-minter',
    expiry
  });
  saveMockState();

  console.log(`[Mock] Reserved token ID: ${tokenId}`);

  return {
    tokenId,
    expiry,
    transactionHash: '0x' + crypto.randomBytes(32).toString('hex')
  };
}

/**
 * Mint a new NFT with a reserved token ID
 *
 * Note on parameters: The contract only requires (reservedTokenId, to, uri, imageHash, ipfsUri).
 * licenseType and licenseHash are accepted here for mock mode compatibility but are NOT sent
 * to the blockchain - they should be stored in Firestore for marketplace operations.
 *
 * @param {number} reservedTokenId - Token ID from reserveTokenId()
 * @param {string} to - Recipient wallet address
 * @param {string} uri - Token metadata URI (Arweave)
 * @param {number} licenseType - License type (0=Display, 1=Commercial, 2=Transfer) - MOCK ONLY, store in Firestore
 * @param {string} imageHash - SHA-256 hash of watermarked image (0x prefixed)
 * @param {string} licenseHash - Hash of signed license agreement - MOCK ONLY, store in Firestore
 * @param {string} ipfsUri - IPFS URI of watermarked image (public)
 * @returns {Promise<{tokenId: number, transactionHash: string}>}
 */
async function mint(reservedTokenId, to, uri, licenseType, imageHash, licenseHash, ipfsUri) {
  if (USE_MOCK) {
    return mockMint(reservedTokenId, to, uri, licenseType, imageHash, licenseHash, ipfsUri);
  }

  const nftmarket = getContract();

  console.log('Minting NFT...');
  console.log('  Reserved Token ID:', reservedTokenId);
  console.log('  To:', to);
  console.log('  URI:', uri);
  console.log('  License Type:', licenseType);
  console.log('  IPFS URI:', ipfsUri);

  // Contract signature: mint(uint256 reservedTokenId, address to, string uri, bytes32 imageHash, string ipfsUri)
  // Note: encryptedBlobUri removed in V2 - stored in Firestore only
  const gasEstimate = await nftmarket.mint.estimateGas(
    reservedTokenId,
    to,
    uri,
    imageHash,
    ipfsUri
  );

  console.log('  Gas estimate:', gasEstimate.toString());

  // Send transaction with 20% gas buffer
  const tx = await nftmarket.mint(
    reservedTokenId,
    to,
    uri,
    imageHash,
    ipfsUri,
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
async function mockMint(reservedTokenId, to, uri, licenseType, imageHash, licenseHash, ipfsUri) {
  // Verify reservation exists
  const reservation = mockTokens.get(reservedTokenId);
  if (!reservation || !reservation.reserved) {
    throw new Error('No valid reservation for token ID');
  }
  if (reservation.expiry < Math.floor(Date.now() / 1000)) {
    mockTokens.delete(reservedTokenId);
    saveMockState();
    throw new Error('Reservation expired');
  }

  // Check for duplicate image hash
  for (const token of mockTokens.values()) {
    if (token.imageHash === imageHash && !token.reserved) {
      throw new Error('Image already registered');
    }
  }

  const tokenId = reservedTokenId;
  const transactionHash = '0x' + crypto.randomBytes(32).toString('hex');
  const blockNumber = 10000000 + tokenId;

  // Replace reservation with actual token data
  // Note: encryptedBlobUri removed in V2 - stored in Firestore only
  mockTokens.set(tokenId, {
    creator: to,
    currentOwner: to,
    copyrightOwner: to,           // Creator starts as copyright owner
    licenseType: licenseType !== undefined ? licenseType : LicenseType.Transfer,
    ownerLicense: LicenseType.Transfer, // Creator always has full rights
    licenseHash,
    imageHash,
    mintedAt: new Date(),
    ipfsUri,
    uri,
    parentToken: 0,               // No parent - this is original
    originalToken: tokenId,       // Points to itself
    isOriginal: true,
    authorityId: 0,               // Default authority
    minter: 'mock-minter'         // Track who minted (receives fees)
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

  // V2: encryptedBlobUri removed, authorityId and minter added
  return {
    creator: data.creator,
    currentOwner: data.currentOwner,
    copyrightOwner: data.copyrightOwner,
    ownerLicense: Number(data.ownerLicense),
    imageHash: data.imageHash,
    mintedAt: new Date(Number(data.mintedAt) * 1000),
    ipfsUri: data.ipfsUri,
    uri: data.uri,
    parentToken: Number(data.parentToken),
    originalToken: Number(data.originalToken),
    isOriginal: data.isOriginal,
    authorityId: Number(data.authorityId),
    minter: data.minter
  };
}

/**
 * Get provenance chain for a token
 * Returns array of token IDs from current back to original
 */
async function getProvenanceChain(tokenId) {
  if (USE_MOCK) {
    const chain = [];
    let current = Number(tokenId);
    while (true) {
      chain.push(current);
      const token = mockTokens.get(current);
      if (!token || token.isOriginal || token.parentToken === current) {
        break;
      }
      current = token.parentToken;
      if (chain.length > 1000) break; // Safety limit
    }
    return chain;
  }

  const nftmarket = getContract();
  const chain = await nftmarket.getProvenanceChain(tokenId);
  return chain.map(id => Number(id));
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
 * Multi-license: allows listing same token at different prices for Display, Commercial, Transfer
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

    // Multi-license: check if THIS license type is already listed (not any license type)
    const tokenListings = getTokenListings(tokenId);
    if (tokenListings.has(actualLicenseType) && tokenListings.get(actualLicenseType).active) {
      throw new Error('Already listed for this license type');
    }

    // Cannot sell more rights than you have
    if (actualLicenseType > token.ownerLicense) {
      throw new Error('Cannot escalate rights');
    }

    // License tokens (non-original) cannot sub-license
    // They can only be sold via Transfer (which transfers the token itself)
    if (!token.isOriginal && actualLicenseType !== LicenseType.Transfer) {
      throw new Error('License tokens cannot sub-license');
    }

    const nonce = mockNonces.get(actualSellerAddress.toLowerCase()) || 0;
    mockNonces.set(actualSellerAddress.toLowerCase(), nonce + 1);

    // Multi-license: store listing by tokenId AND licenseType
    tokenListings.set(actualLicenseType, {
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
    return { tokenId, price, licenseType: actualLicenseType, transactionHash: '0x' + crypto.randomBytes(32).toString('hex') };
  }

  // Real blockchain listing is done client-side
  throw new Error('Real blockchain listing must be done from client wallet');
}

/**
 * Delist a specific license type listing
 * @param {number} tokenId - Token to delist
 * @param {number} licenseType - Which license type to delist (0=Display, 1=Commercial, 2=Transfer)
 * @param {string} sellerAddress - Address of the seller (for verification)
 */
async function delistToken(tokenId, licenseType, sellerAddress) {
  if (USE_MOCK) {
    const tokenListings = getTokenListings(tokenId);
    const listing = tokenListings.get(Number(licenseType));
    if (!listing || !listing.active) throw new Error('Not listed for this license type');
    if (listing.seller.toLowerCase() !== sellerAddress.toLowerCase()) {
      throw new Error('Not the seller');
    }

    listing.active = false;
    saveMockState();
    console.log(`[MOCK] Delisted token ${tokenId} license type ${licenseType}`);
    return { tokenId, licenseType };
  }

  // Real blockchain delisting is done client-side
  throw new Error('Real blockchain delisting must be done from client wallet');
}

/**
 * Delist all license types for a token
 * @param {number} tokenId - Token to delist completely
 * @param {string} sellerAddress - Address of the seller (for verification)
 */
async function delistAllToken(tokenId, sellerAddress) {
  if (USE_MOCK) {
    const token = mockTokens.get(Number(tokenId));
    if (!token) throw new Error('Token does not exist');
    if (token.currentOwner.toLowerCase() !== sellerAddress.toLowerCase()) {
      throw new Error('Not token owner');
    }

    const tokenListings = getTokenListings(tokenId);
    let anyDelisted = false;
    for (const [licenseType, listing] of tokenListings) {
      if (listing.active) {
        listing.active = false;
        anyDelisted = true;
      }
    }

    if (!anyDelisted) {
      throw new Error('No active listings');
    }

    saveMockState();
    console.log(`[MOCK] Delisted all listings for token ${tokenId}`);
    return { tokenId };
  }

  // Real blockchain delisting is done client-side
  throw new Error('Real blockchain delisting must be done from client wallet');
}

/**
 * Buy a listed token (mock only - real buying done client-side)
 * Multi-license: specify which license type listing to buy
 * @param {number} tokenId - Token to buy
 * @param {number} licenseType - Which license type listing to buy (0=Display, 1=Commercial, 2=Transfer)
 * @param {string} signature - Buyer's EIP-712 signature
 * @param {string} buyerAddress - Address of the buyer
 */
async function buyToken(tokenId, licenseType, signatureOrBuyer, buyerAddress) {
  if (USE_MOCK) {
    // Support old calling convention and flexible params
    let actualBuyerAddress = buyerAddress;
    let actualSignature = signatureOrBuyer;
    let actualLicenseType = licenseType;

    // If licenseType looks like an address, shift params (old calling convention)
    if (typeof licenseType === 'string' && licenseType.startsWith('0x') && licenseType.length === 42) {
      actualBuyerAddress = licenseType;
      actualSignature = signatureOrBuyer;
      actualLicenseType = null; // Will need to find active listing
    } else if (buyerAddress === undefined && typeof signatureOrBuyer === 'string' && signatureOrBuyer.startsWith('0x')) {
      actualBuyerAddress = signatureOrBuyer;
      actualSignature = null;
    }

    const tokenListings = getTokenListings(tokenId);

    // If no license type specified, find any active listing (backwards compatibility)
    let listing;
    if (actualLicenseType === null || actualLicenseType === undefined) {
      for (const [lt, l] of tokenListings) {
        if (l.active) {
          listing = l;
          actualLicenseType = lt;
          break;
        }
      }
    } else {
      listing = tokenListings.get(Number(actualLicenseType));
    }

    if (!listing || !listing.active) throw new Error('Not listed for this license type');
    if (listing.seller.toLowerCase() === actualBuyerAddress.toLowerCase()) {
      throw new Error('Cannot buy own token');
    }

    const token = mockTokens.get(Number(tokenId));
    const previousOwner = token.currentOwner;

    // Clear this specific listing
    listing.active = false;

    // Handle license rights based on license type
    if (actualLicenseType === LicenseType.Transfer || !token.isOriginal) {
      // Transfer sale OR license token sale: actual token transfer
      // Clear ALL listings since ownership is changing
      for (const [lt, l] of tokenListings) {
        l.active = false;
      }

      if (actualLicenseType === LicenseType.Transfer && token.isOriginal) {
        // Original token Transfer sale: transfer with copyright
        // Seller retains display rights
        if (!mockDisplayRights.has(Number(tokenId))) {
          mockDisplayRights.set(Number(tokenId), new Set());
        }
        mockDisplayRights.get(Number(tokenId)).add(previousOwner.toLowerCase());

        // Buyer becomes new copyright owner with Transfer rights
        token.copyrightOwner = actualBuyerAddress;
        token.ownerLicense = LicenseType.Transfer;
      }

      token.currentOwner = actualBuyerAddress;

      console.log(`[MOCK] Token ${tokenId} transferred from ${previousOwner} to ${actualBuyerAddress} for ${listing.price} wei`);

      saveMockState();

      return {
        tokenId,
        seller: previousOwner,
        buyer: actualBuyerAddress,
        price: listing.price,
        licenseType: actualLicenseType,
        sellerSignature: listing.sellerSignature,
        buyerSignature: actualSignature
      };
    } else {
      // Display/Commercial sale from original: mint new license token for buyer
      // Original token stays with seller who keeps copyright
      // OTHER listings remain active (seller can still sell other license types)
      mockTokenCounter++;
      const newTokenId = mockTokenCounter;

      mockTokens.set(newTokenId, {
        creator: token.creator,              // Original creator preserved
        currentOwner: actualBuyerAddress,    // Buyer owns the new license token
        copyrightOwner: token.copyrightOwner, // Copyright stays with original owner
        licenseType: actualLicenseType,
        ownerLicense: actualLicenseType,      // License level purchased
        licenseHash: listing.licenseHash,
        imageHash: token.imageHash,           // Same image
        mintedAt: new Date(),
        ipfsUri: token.ipfsUri,               // Same IPFS image
        uri: token.uri,
        parentToken: Number(tokenId),         // Direct parent in license chain
        originalToken: token.originalToken,   // Root of provenance chain
        isOriginal: false,                    // This is a license, not original
        authorityId: token.authorityId || 0,  // Inherit authority from parent
        minter: token.minter || 'mock-minter' // Inherit minter from parent
      });

      console.log(`[MOCK] License token ${newTokenId} minted for ${actualBuyerAddress} (${actualLicenseType === LicenseType.Display ? 'Display' : 'Commercial'} license)`);
      console.log(`[MOCK] Original token ${tokenId} remains with ${previousOwner}, other listings still active`);

      saveMockState();

      return {
        tokenId: newTokenId,  // Return the new license token ID
        parentTokenId: tokenId,
        seller: previousOwner,
        buyer: actualBuyerAddress,
        price: listing.price,
        licenseType: actualLicenseType,
        sellerSignature: listing.sellerSignature,
        buyerSignature: actualSignature,
        isLicenseGrant: true
      };
    }
  }

  // Real blockchain buying is done client-side
  throw new Error('Real blockchain buying must be done from client wallet');
}

/**
 * Get listing info for a specific license type
 * @param {number} tokenId - Token to query
 * @param {number} licenseType - Which license type listing to get (0=Display, 1=Commercial, 2=Transfer)
 */
async function getListing(tokenId, licenseType) {
  if (USE_MOCK) {
    const tokenListings = getTokenListings(tokenId);
    const listing = tokenListings.get(Number(licenseType));
    if (!listing) {
      return { seller: null, price: '0', licenseType: licenseType, licenseHash: null, nonce: 0, expiry: 0, active: false };
    }
    return listing;
  }

  const nftmarket = getContract();
  const listing = await nftmarket.getListing(tokenId, licenseType);
  return {
    seller: listing.seller,
    price: listing.price.toString(),
    licenseType: Number(licenseType),
    licenseHash: listing.licenseHash,
    nonce: Number(listing.nonce),
    expiry: Number(listing.expiry),
    active: listing.active
  };
}

/**
 * Get all listings for a token (all license types)
 * @param {number} tokenId - Token to query
 * @returns {Object} Object with display, commercial, transfer listings
 */
async function getAllListingsForToken(tokenId) {
  if (USE_MOCK) {
    const tokenListings = getTokenListings(tokenId);
    const result = {
      display: { price: '0', active: false },
      commercial: { price: '0', active: false },
      transfer: { price: '0', active: false }
    };

    const displayListing = tokenListings.get(LicenseType.Display);
    if (displayListing) {
      result.display = { ...displayListing };
    }

    const commercialListing = tokenListings.get(LicenseType.Commercial);
    if (commercialListing) {
      result.commercial = { ...commercialListing };
    }

    const transferListing = tokenListings.get(LicenseType.Transfer);
    if (transferListing) {
      result.transfer = { ...transferListing };
    }

    return result;
  }

  const nftmarket = getContract();
  const result = await nftmarket.getAllListings(tokenId);

  // Fetch full listing details for active listings (seller, nonce, expiry, licenseHash)
  const fullResult = {
    display: {
      price: result.displayPrice.toString(),
      active: result.displayActive,
      licenseType: LicenseType.Display
    },
    commercial: {
      price: result.commercialPrice.toString(),
      active: result.commercialActive,
      licenseType: LicenseType.Commercial
    },
    transfer: {
      price: result.transferPrice.toString(),
      active: result.transferActive,
      licenseType: LicenseType.Transfer
    }
  };

  // Enrich with full details for active listings
  if (result.displayActive) {
    const listing = await nftmarket.getListing(tokenId, LicenseType.Display);
    fullResult.display.seller = listing.seller;
    fullResult.display.nonce = Number(listing.nonce);
    fullResult.display.expiry = Number(listing.expiry);
    fullResult.display.licenseHash = listing.licenseHash;
  }
  if (result.commercialActive) {
    const listing = await nftmarket.getListing(tokenId, LicenseType.Commercial);
    fullResult.commercial.seller = listing.seller;
    fullResult.commercial.nonce = Number(listing.nonce);
    fullResult.commercial.expiry = Number(listing.expiry);
    fullResult.commercial.licenseHash = listing.licenseHash;
  }
  if (result.transferActive) {
    const listing = await nftmarket.getListing(tokenId, LicenseType.Transfer);
    fullResult.transfer.seller = listing.seller;
    fullResult.transfer.nonce = Number(listing.nonce);
    fullResult.transfer.expiry = Number(listing.expiry);
    fullResult.transfer.licenseHash = listing.licenseHash;
  }

  return fullResult;
}

/**
 * Get all active listings (multi-license: may have multiple listings per token)
 * Each listing is returned as a separate entry with tokenId and licenseType
 */
async function getActiveListings() {
  if (USE_MOCK) {
    const listings = [];
    for (const [tokenId, tokenListings] of mockListings) {
      const token = mockTokens.get(tokenId);
      for (const [licenseType, listing] of tokenListings) {
        if (listing.active) {
          listings.push({
            tokenId,
            licenseType,
            ...listing,
            ...token
          });
        }
      }
    }
    return listings;
  }

  // For real blockchain, iterate through tokens and check all license types
  // NOTE: This approach uses getAllListings() to check active status (1 call per token),
  // then getListing() only for active listings to get full details (seller, nonce, etc.).
  // For production scale, consider using an event indexer (e.g., The Graph) instead.
  const nftmarket = getContract();
  const supply = await nftmarket.totalSupply();
  const listings = [];

  for (let i = 0; i < supply; i++) {
    // Check all three license types for each token
    const allListings = await nftmarket.getAllListings(i);

    if (allListings.displayActive) {
      const displayListing = await nftmarket.getListing(i, LicenseType.Display);
      listings.push({
        tokenId: i,
        seller: displayListing.seller,
        price: allListings.displayPrice.toString(),
        licenseType: LicenseType.Display,
        licenseHash: displayListing.licenseHash,
        nonce: Number(displayListing.nonce),
        expiry: Number(displayListing.expiry),
        active: true
      });
    }

    if (allListings.commercialActive) {
      const commercialListing = await nftmarket.getListing(i, LicenseType.Commercial);
      listings.push({
        tokenId: i,
        seller: commercialListing.seller,
        price: allListings.commercialPrice.toString(),
        licenseType: LicenseType.Commercial,
        licenseHash: commercialListing.licenseHash,
        nonce: Number(commercialListing.nonce),
        expiry: Number(commercialListing.expiry),
        active: true
      });
    }

    if (allListings.transferActive) {
      const transferListing = await nftmarket.getListing(i, LicenseType.Transfer);
      listings.push({
        tokenId: i,
        seller: transferListing.seller,
        price: allListings.transferPrice.toString(),
        licenseType: LicenseType.Transfer,
        licenseHash: transferListing.licenseHash,
        nonce: Number(transferListing.nonce),
        expiry: Number(transferListing.expiry),
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

/**
 * Start listening for blockchain events
 * Calls the provided callback when relevant events occur
 * Returns a function to stop listening
 */
function startEventListener(callbacks = {}) {
  if (USE_MOCK) {
    console.log('[Blockchain] Event listener not available in mock mode');
    return () => {};
  }

  try {
    const nftmarket = getContract();

    // Listen for Minted events (new tokens)
    if (callbacks.onMinted) {
      nftmarket.on('Minted', async (tokenId, creator, imageHash, event) => {
        console.log(`[Blockchain Event] Minted: Token ${tokenId} by ${creator}`);
        try {
          await callbacks.onMinted({
            tokenId: Number(tokenId),
            creator,
            imageHash,
            transactionHash: event.log?.transactionHash
          });
        } catch (e) {
          console.error('[Blockchain Event] Error handling Minted:', e.message);
        }
      });
      console.log('[Blockchain] Listening for Minted events');
    }

    // Listen for Sold events (ownership transfers via marketplace)
    if (callbacks.onSold) {
      nftmarket.on('Sold', async (tokenId, seller, buyer, price, licenseType, licenseHash, event) => {
        console.log(`[Blockchain Event] Sold: Token ${tokenId} from ${seller} to ${buyer}`);
        try {
          await callbacks.onSold({
            tokenId: Number(tokenId),
            seller,
            buyer,
            price: price.toString(),
            licenseType: Number(licenseType),
            transactionHash: event.log?.transactionHash
          });
        } catch (e) {
          console.error('[Blockchain Event] Error handling Sold:', e.message);
        }
      });
      console.log('[Blockchain] Listening for Sold events');
    }

    // Listen for Listed events
    if (callbacks.onListed) {
      nftmarket.on('Listed', async (tokenId, seller, price, licenseType, licenseHash, nonce, expiry, event) => {
        console.log(`[Blockchain Event] Listed: Token ${tokenId} by ${seller} for ${ethers.formatEther(price)} ETH`);
        try {
          await callbacks.onListed({
            tokenId: Number(tokenId),
            seller,
            price: price.toString(),
            licenseType: Number(licenseType),
            licenseHash,
            nonce: Number(nonce),
            expiry: Number(expiry)
          });
        } catch (e) {
          console.error('[Blockchain Event] Error handling Listed:', e.message);
        }
      });
      console.log('[Blockchain] Listening for Listed events');
    }

    // Listen for LicenseGranted events (new license tokens minted)
    if (callbacks.onLicenseGranted) {
      nftmarket.on('LicenseGranted', async (newTokenId, parentTokenId, originalTokenId, licensor, licensee, licenseType, licenseHash, event) => {
        const licenseNames = ['Display', 'Commercial', 'Transfer'];
        console.log(`[Blockchain Event] LicenseGranted: Token ${newTokenId} (${licenseNames[licenseType]} license from ${parentTokenId}) to ${licensee}`);
        try {
          await callbacks.onLicenseGranted({
            newTokenId: Number(newTokenId),
            parentTokenId: Number(parentTokenId),
            originalTokenId: Number(originalTokenId),
            licensor,
            licensee,
            licenseType: Number(licenseType),
            licenseHash,
            transactionHash: event.log?.transactionHash
          });
        } catch (e) {
          console.error('[Blockchain Event] Error handling LicenseGranted:', e.message);
        }
      });
      console.log('[Blockchain] Listening for LicenseGranted events');
    }

    // Return cleanup function
    return () => {
      nftmarket.removeAllListeners();
      console.log('[Blockchain] Stopped event listeners');
    };
  } catch (e) {
    console.warn('[Blockchain] Could not start event listener:', e.message);
    return () => {};
  }
}

module.exports = {
  reserveTokenId,
  mint,
  isOwner,
  ownerOf,
  tokenURI,
  getTokenData,
  getProvenanceChain,
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
  // Marketplace (multi-license support)
  listToken,
  delistToken,
  delistAllToken,
  buyToken,
  getListing,
  getAllListingsForToken,
  getActiveListings,
  // Event listener
  startEventListener,
  // Test utilities
  resetMock,
  getMockTokens,
  getAllTokens
};
