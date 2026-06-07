/**
 * Real Blockchain Service
 * Handles NFT minting on Polygon using Ethers.js.
 * No mock branches — this file only contains real on-chain code.
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const E = require('../../events/types');
const { dispatch } = require('../../events/dispatch');
const { LicenseType, NFTMARKET_ABI, EIP712_TYPES } = require('./interface');

const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const MINTER_PRIVATE_KEY = process.env.MINTER_PRIVATE_KEY;

// Load contract address from env or deployment.json
function loadContractAddress() {
  if (process.env.NFTMARKET_CONTRACT_ADDRESS) {
    return process.env.NFTMARKET_CONTRACT_ADDRESS;
  }

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
 * @returns {Promise<[{tokenId: number, expiry: number, transactionHash: string}, AppEvent[]]>}
 */
async function reserveTokenId() {
  const nftmarket = getContract();
  const events = [];

  const gasEstimate = await nftmarket.reserveTokenId.estimateGas();

  const tx = await nftmarket.reserveTokenId({
    gasLimit: gasEstimate * 120n / 100n
  });

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

  const result = { tokenId, expiry, transactionHash: tx.hash };
  events.push(E.tokenReserved({ tokenId, expiry, transactionHash: tx.hash, mock: false }));

  return [result, events];
}

/**
 * Mint a new NFT with a reserved token ID
 *
 * Signature matches the on-chain contract: (reservedTokenId, to, uri, imageHash, ipfsUri).
 * Creator always receives Transfer (full) rights.
 *
 * @param {number} reservedTokenId - Token ID from reserveTokenId()
 * @param {string} to - Recipient wallet address
 * @param {string} uri - Token metadata URI (Arweave)
 * @param {string} imageHash - SHA-256 hash of watermarked image (0x prefixed)
 * @param {string} ipfsUri - IPFS URI of watermarked image (public)
 * @returns {Promise<[{tokenId: number, transactionHash: string, blockNumber: number}, AppEvent[]]>}
 */
async function mint(reservedTokenId, to, uri, imageHash, ipfsUri) {
  const nftmarket = getContract();
  const events = [];

  // Contract signature: mint(uint256 reservedTokenId, address to, string uri, bytes32 imageHash, string ipfsUri)
  // Note: encryptedBlobUri removed in V2 - stored in Firestore only
  const gasEstimate = await nftmarket.mint.estimateGas(
    reservedTokenId,
    to,
    uri,
    imageHash,
    ipfsUri
  );

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

  const result = {
    tokenId,
    transactionHash: tx.hash,
    blockNumber: receipt.blockNumber
  };

  events.push(E.tokenMinted({
    tokenId, to, transactionHash: tx.hash, blockNumber: receipt.blockNumber,
    imageHash, ipfsUri, uri, licenseType: LicenseType.Transfer, mock: false
  }));

  return [result, events];
}

/**
 * Check if a wallet owns a specific token
 */
async function isOwner(tokenId, walletAddress) {
  const nftmarket = getContract();
  const owner = await nftmarket.ownerOf(tokenId);
  return owner.toLowerCase() === walletAddress.toLowerCase();
}

/**
 * Get token owner
 */
async function ownerOf(tokenId) {
  const nftmarket = getContract();
  return await nftmarket.ownerOf(tokenId);
}

/**
 * Get token URI
 */
async function tokenURI(tokenId) {
  const nftmarket = getContract();
  return await nftmarket.tokenURI(tokenId);
}

/**
 * Get token data
 */
async function getTokenData(tokenId) {
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
  const nftmarket = getContract();
  const chain = await nftmarket.getProvenanceChain(tokenId);
  return chain.map(id => Number(id));
}

/**
 * Check if an address has Display rights for a token
 */
async function checkDisplayRights(tokenId, address) {
  const nftmarket = getContract();
  return nftmarket.checkDisplayRights(tokenId, address);
}

/**
 * Check if an address has Commercial rights for a token
 */
async function checkCommercialRights(tokenId, address) {
  const nftmarket = getContract();
  return nftmarket.checkCommercialRights(tokenId, address);
}

/**
 * Check if an address owns the copyright for a token
 */
async function checkCopyrightOwnership(tokenId, address) {
  const nftmarket = getContract();
  return nftmarket.checkCopyrightOwnership(tokenId, address);
}

/**
 * Get the maximum license type the current owner can sell
 */
async function getMaxSellableLicense(tokenId) {
  const nftmarket = getContract();
  return Number(await nftmarket.getMaxSellableLicense(tokenId));
}

/**
 * Check if an image hash is already registered
 */
async function isImageRegistered(imageHash) {
  const nftmarket = getContract();
  return nftmarket.isImageRegistered(imageHash);
}

/**
 * Get total supply
 */
async function totalSupply() {
  const nftmarket = getContract();
  return Number(await nftmarket.totalSupply());
}

/**
 * List a token for sale — real blockchain listing must be done from client wallet
 */
async function listToken(tokenId, price, licenseType, licenseHash, expiry, signature, sellerAddress) {
  throw new Error('Real blockchain listing must be done from client wallet');
}

/**
 * Delist a specific license type listing — real blockchain delisting must be done from client wallet
 */
async function delistToken(tokenId, licenseType, sellerAddress) {
  throw new Error('Real blockchain delisting must be done from client wallet');
}

/**
 * Delist all license types for a token — real blockchain delisting must be done from client wallet
 */
async function delistAllToken(tokenId, sellerAddress) {
  throw new Error('Real blockchain delisting must be done from client wallet');
}

/**
 * Buy a listed token — real blockchain buying must be done from client wallet
 */
async function buyToken(tokenId, licenseType, signature, buyerAddress) {
  throw new Error('Real blockchain buying must be done from client wallet');
}

/**
 * Get listing info for a specific license type
 * @param {number} tokenId - Token to query
 * @param {number} licenseType - Which license type listing to get (0=Display, 1=Commercial, 2=Transfer)
 */
async function getListing(tokenId, licenseType) {
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
  // NOTE: For production scale, consider using an event indexer (e.g., The Graph) instead.
  const nftmarket = getContract();
  const supply = Number(await nftmarket.totalSupply()); // ethers v6 returns BigInt; Math.min needs Number
  const listings = [];
  const BATCH_SIZE = 10;

  for (let start = 0; start < supply; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, supply);
    const batch = [];
    for (let i = start; i < end; i++) {
      batch.push(
        (async () => {
          const allListings = await nftmarket.getAllListings(i);
          const tokenListings = [];

          if (allListings.displayActive) {
            const listing = await nftmarket.getListing(i, LicenseType.Display);
            tokenListings.push({
              tokenId: i, seller: listing.seller, price: allListings.displayPrice.toString(),
              licenseType: LicenseType.Display, licenseHash: listing.licenseHash,
              nonce: Number(listing.nonce), expiry: Number(listing.expiry), active: true
            });
          }
          if (allListings.commercialActive) {
            const listing = await nftmarket.getListing(i, LicenseType.Commercial);
            tokenListings.push({
              tokenId: i, seller: listing.seller, price: allListings.commercialPrice.toString(),
              licenseType: LicenseType.Commercial, licenseHash: listing.licenseHash,
              nonce: Number(listing.nonce), expiry: Number(listing.expiry), active: true
            });
          }
          if (allListings.transferActive) {
            const listing = await nftmarket.getListing(i, LicenseType.Transfer);
            tokenListings.push({
              tokenId: i, seller: listing.seller, price: allListings.transferPrice.toString(),
              licenseType: LicenseType.Transfer, licenseHash: listing.licenseHash,
              nonce: Number(listing.nonce), expiry: Number(listing.expiry), active: true
            });
          }
          return tokenListings;
        })().catch(() => [])
      );
    }
    const results = await Promise.all(batch);
    for (const tokenListings of results) {
      listings.push(...tokenListings);
    }
  }

  return listings;
}

/**
 * Start listening for blockchain events
 * Calls the provided callback when relevant events occur
 * Returns a function to stop listening
 */
function startEventListener(callbacks = {}) {
  try {
    const nftmarket = getContract();

    // Listen for Minted events (new tokens)
    if (callbacks.onMinted) {
      nftmarket.on('Minted', async (tokenId, creator, imageHash, event) => {
        dispatch([E.tokenMinted({
          tokenId: Number(tokenId), to: creator, imageHash,
          transactionHash: event.log?.transactionHash, blockNumber: event.log?.blockNumber,
          ipfsUri: '', uri: '', licenseType: 0, mock: false
        })]);
        try {
          await callbacks.onMinted({
            tokenId: Number(tokenId), creator, imageHash,
            transactionHash: event.log?.transactionHash
          });
        } catch (e) {
          console.error('[Blockchain Event] Error handling Minted:', e.message);
        }
      });
    }

    // Listen for Sold events (ownership transfers via marketplace)
    if (callbacks.onSold) {
      nftmarket.on('Sold', async (tokenId, seller, buyer, price, licenseType, licenseHash, event) => {
        dispatch([E.tokenSold({
          tokenId: Number(tokenId), seller, buyer,
          price: price.toString(), licenseType: Number(licenseType), mock: false
        })]);
        try {
          await callbacks.onSold({
            tokenId: Number(tokenId), seller, buyer,
            price: price.toString(), licenseType: Number(licenseType),
            transactionHash: event.log?.transactionHash
          });
        } catch (e) {
          console.error('[Blockchain Event] Error handling Sold:', e.message);
        }
      });
    }

    // Listen for Listed events
    if (callbacks.onListed) {
      nftmarket.on('Listed', async (tokenId, seller, price, licenseType, licenseHash, nonce, expiry, event) => {
        dispatch([E.tokenListed({
          tokenId: Number(tokenId), price: price.toString(),
          licenseType: Number(licenseType), transactionHash: '', mock: false
        })]);
        try {
          await callbacks.onListed({
            tokenId: Number(tokenId), seller,
            price: price.toString(), licenseType: Number(licenseType),
            licenseHash, nonce: Number(nonce), expiry: Number(expiry)
          });
        } catch (e) {
          console.error('[Blockchain Event] Error handling Listed:', e.message);
        }
      });
    }

    // Listen for LicenseGranted events (new license tokens minted)
    if (callbacks.onLicenseGranted) {
      nftmarket.on('LicenseGranted', async (newTokenId, parentTokenId, originalTokenId, licensor, licensee, licenseType, licenseHash, event) => {
        dispatch([E.licenseGranted({
          newTokenId: Number(newTokenId), parentTokenId: Number(parentTokenId),
          buyer: licensee, licenseType: Number(licenseType), mock: false
        })]);
        try {
          await callbacks.onLicenseGranted({
            newTokenId: Number(newTokenId), parentTokenId: Number(parentTokenId),
            originalTokenId: Number(originalTokenId), licensor, licensee,
            licenseType: Number(licenseType), licenseHash,
            transactionHash: event.log?.transactionHash
          });
        } catch (e) {
          console.error('[Blockchain Event] Error handling LicenseGranted:', e.message);
        }
      });
    }

    // Return cleanup function
    return () => {
      nftmarket.removeAllListeners();
    };
  } catch (e) {
    console.warn('[Blockchain] Could not start event listener:', e.message);
    return () => {};
  }
}

/**
 * Get all tokens from the blockchain
 * Used to sync Firestore with on-chain state
 */
async function getAllTokens() {
  const supply = await totalSupply();
  const tokens = [];
  const BATCH_SIZE = 10;

  for (let start = 0; start < supply; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, supply);
    const batch = [];
    for (let i = start; i < end; i++) {
      batch.push(
        getTokenData(i)
          .then(data => ({ tokenId: i, ...data }))
          .catch(e => {
            console.warn(`[Blockchain] Could not fetch token ${i}:`, e.message);
            return null;
          })
      );
    }
    const results = await Promise.all(batch);
    tokens.push(...results.filter(Boolean));
  }

  return tokens;
}

/**
 * Get the highest license level a buyer already owns for a given original image
 *
 * @param {string} buyerAddress - The potential buyer's address
 * @param {number} originalTokenId - The original token ID (the image being licensed)
 * @returns {Promise<number|null>}
 */
async function getBuyerExistingLicenseLevel(buyerAddress, originalTokenId) {
  const normalizedBuyer = buyerAddress.toLowerCase();
  const nftmarket = getContract();
  // Use the totalSupply() wrapper, which coerces ethers v6's BigInt to Number —
  // otherwise Math.min(start + BATCH_SIZE, supply) below mixes Number + BigInt
  // and throws "Cannot convert a BigInt value to a number".
  const supply = await totalSupply();
  const BATCH_SIZE = 10;
  let highestLevel = null;

  for (let start = 0; start < supply; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, supply);
    const batch = [];
    for (let i = start; i < end; i++) {
      batch.push(
        (async () => {
          const owner = await nftmarket.ownerOf(i);
          if (owner.toLowerCase() !== normalizedBuyer) return null;
          const tokenData = await nftmarket.getTokenData(i);
          const tokenOriginal = tokenData.isOriginal ? i : Number(tokenData.originalToken);
          if (tokenOriginal !== originalTokenId) return null;
          return Number(tokenData.ownerLicense);
        })().catch(() => null)
      );
    }
    const results = await Promise.all(batch);
    for (const level of results) {
      if (level !== null && (highestLevel === null || level > highestLevel)) {
        highestLevel = level;
      }
    }
  }

  return highestLevel;
}

// Test utilities — no-ops in real service
function resetMock() {}
function getMockTokens() { return new Map(); }

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
  checkDisplayRights,
  checkCommercialRights,
  checkCopyrightOwnership,
  getMaxSellableLicense,
  getBuyerExistingLicenseLevel,
  getEIP712Domain,
  getNonce,
  getListingTypedData,
  getPurchaseTypedData,
  listToken,
  delistToken,
  delistAllToken,
  buyToken,
  getListing,
  getAllListingsForToken,
  getActiveListings,
  startEventListener,
  getAllTokens,
  resetMock,
  getMockTokens,
};
