#!/usr/bin/env node
/**
 * Populate Script
 *
 * Mints all test images, lists some for sale, and executes trades
 * to create a realistic marketplace state.
 *
 * Usage: node populate.js
 */

const { ethers } = require('ethers');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WALLET_SERVICE = 'http://localhost:3001';
const BACKEND = 'http://localhost:3000';
const IMAGE_DIR = process.env.IMAGE_DIR || __dirname + '/test-images';

// Get contract address from deployment
let CONTRACT;
try {
  const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, 'contracts/deployment.json'), 'utf8'));
  CONTRACT = deployment.address;
  console.log('Contract address:', CONTRACT);
} catch (e) {
  console.error('Could not read contract address from contracts/deployment.json:', e.message);
  process.exit(1);
}

// Test accounts
const accounts = {
  alice: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  bob: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  sam: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  joe: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  mary: '0x976EA74026E726554dB657fA54763abd0C3a0aa9'
};

const accountNames = Object.keys(accounts);
const licenseTypes = ['display', 'commercial', 'transfer'];

// Track minted tokens
const mintedTokens = [];

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  return res.json();
}

async function getSession(address) {
  const sessionRes = await fetchJson(WALLET_SERVICE + '/api/accounts/select', {
    method: 'POST',
    body: JSON.stringify({ address })
  });
  if (!sessionRes.success) throw new Error('Session failed: ' + sessionRes.error);

  const authRes = await fetchJson(WALLET_SERVICE + '/api/auth/token', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionRes.sessionId }
  });
  if (!authRes.success) throw new Error('Auth failed: ' + authRes.error);

  return { sessionId: sessionRes.sessionId, authToken: authRes.token };
}

async function mintToken(ownerName, imagePath, name) {
  const address = accounts[ownerName];
  const { authToken } = await getSession(address);

  const cmd = 'curl -s -X POST ' + BACKEND + '/api/mint ' +
    "-H 'Authorization: Bearer " + authToken + "' " +
    "-F 'image=@" + imagePath + "' " +
    "-F 'name=" + name + "' " +
    "-F 'description=Minted by " + ownerName + "' " +
    "-F 'licenseType=transfer'";

  const result = JSON.parse(execSync(cmd, { timeout: 120000 }).toString());
  if (!result.success) throw new Error(result.error);

  return result.tokenId;
}

async function listToken(ownerName, tokenId, licenseType, priceEth) {
  const address = accounts[ownerName];
  const { sessionId, authToken } = await getSession(address);

  // Get listing data from backend
  const listRes = await fetchJson(BACKEND + '/api/marketplace/list', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ tokenId, priceEth, licenseType })
  });
  if (listRes.error) throw new Error('List prep failed: ' + listRes.error);

  const { typedData, contractCall } = listRes;

  // Sign the typed data
  const signRes = await fetchJson(WALLET_SERVICE + '/api/sign/typed-data', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId },
    body: JSON.stringify({
      domain: typedData.domain,
      types: { ListingOffer: typedData.types.ListingOffer },
      primaryType: typedData.primaryType,
      message: typedData.message
    })
  });
  if (!signRes.success) throw new Error('Sign failed: ' + signRes.error);

  // Encode and send transaction
  const iface = new ethers.Interface([
    'function list(uint256 tokenId, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 expiry, bytes signature)'
  ]);
  const txData = iface.encodeFunctionData('list', [
    contractCall.params.tokenId,
    contractCall.params.price,
    contractCall.params.licenseType,
    contractCall.params.licenseHash,
    contractCall.params.expiry,
    signRes.signature
  ]);

  const txRes = await fetchJson(WALLET_SERVICE + '/api/transaction/send', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId },
    body: JSON.stringify({ to: CONTRACT, data: txData })
  });
  if (!txRes.success) throw new Error('Transaction failed: ' + txRes.error);

  return txRes.hash;
}

async function buyToken(buyerName, tokenId, licenseType) {
  const address = accounts[buyerName];
  const { sessionId, authToken } = await getSession(address);

  // Get buy data from backend
  const buyRes = await fetchJson(BACKEND + '/api/marketplace/buy', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ tokenId, licenseType })
  });
  if (buyRes.error) throw new Error('Buy prep failed: ' + buyRes.error);

  const { typedData, contractCall } = buyRes;

  // Sign the typed data
  const signRes = await fetchJson(WALLET_SERVICE + '/api/sign/typed-data', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId },
    body: JSON.stringify({
      domain: typedData.domain,
      types: { PurchaseAcceptance: typedData.types.PurchaseAcceptance },
      primaryType: typedData.primaryType,
      message: typedData.message
    })
  });
  if (!signRes.success) throw new Error('Sign failed: ' + signRes.error);

  // Encode and send transaction with payment
  const iface = new ethers.Interface([
    'function buy(uint256 tokenId, uint8 licenseType, bytes signature) payable'
  ]);
  const txData = iface.encodeFunctionData('buy', [
    tokenId,
    contractCall.params.licenseType,
    signRes.signature
  ]);

  const txRes = await fetchJson(WALLET_SERVICE + '/api/transaction/send', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId },
    body: JSON.stringify({ to: CONTRACT, data: txData, value: contractCall.value })
  });
  if (!txRes.success) throw new Error('Transaction failed: ' + txRes.error);

  return txRes.hash;
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║            NFTmarket Populate Script                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Get all test images
  const images = fs.readdirSync(IMAGE_DIR)
    .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
    .map(f => path.join(IMAGE_DIR, f));

  console.log('Found ' + images.length + ' test images\n');

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Mint all images (distribute across accounts)
  // ═══════════════════════════════════════════════════════════════════
  console.log('PHASE 1: Minting all images');
  console.log('───────────────────────────────────────────────────────────────');

  for (let i = 0; i < images.length; i++) {
    const ownerName = accountNames[i % accountNames.length];
    const imagePath = images[i];
    const imageName = path.basename(imagePath, path.extname(imagePath));

    try {
      const tokenId = await mintToken(ownerName, imagePath, 'Artwork #' + imageName);
      mintedTokens.push({ tokenId, owner: ownerName, imageName });
      console.log('  ✓ ' + ownerName.padEnd(6) + ' minted token #' + tokenId + ' (' + imageName + ')');
    } catch (e) {
      console.log('  ✗ ' + ownerName.padEnd(6) + ' failed: ' + e.message.slice(0, 50));
    }
  }

  console.log('\nMinted ' + mintedTokens.length + ' tokens\n');

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: List half of tokens for sale (various license types)
  // ═══════════════════════════════════════════════════════════════════
  console.log('PHASE 2: Listing tokens for sale');
  console.log('───────────────────────────────────────────────────────────────');

  const tokensToList = mintedTokens
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.ceil(mintedTokens.length * 0.6)); // List 60%

  const listings = [];
  for (const token of tokensToList) {
    const licenseType = licenseTypes[Math.floor(Math.random() * licenseTypes.length)];
    const price = (Math.random() * 2 + 0.1).toFixed(2);

    try {
      await listToken(token.owner, token.tokenId, licenseType, price);
      listings.push({ ...token, licenseType, price });
      console.log('  ✓ ' + token.owner.padEnd(6) + ' listed #' + token.tokenId + ' for ' + price + ' ETH (' + licenseType + ')');
    } catch (e) {
      console.log('  ✗ ' + token.owner.padEnd(6) + ' list failed: ' + e.message.slice(0, 50));
    }
  }

  console.log('\nListed ' + listings.length + ' tokens\n');

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: Execute some purchases
  // ═══════════════════════════════════════════════════════════════════
  console.log('PHASE 3: Executing purchases');
  console.log('───────────────────────────────────────────────────────────────');

  // Buy about half of the listings
  const listingsToBuy = listings
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.ceil(listings.length * 0.5));

  let purchases = 0;
  for (const listing of listingsToBuy) {
    // Pick a buyer that isn't the owner
    const possibleBuyers = accountNames.filter(n => n !== listing.owner);
    const buyerName = possibleBuyers[Math.floor(Math.random() * possibleBuyers.length)];

    try {
      await buyToken(buyerName, listing.tokenId, listing.licenseType);
      purchases++;
      console.log('  ✓ ' + buyerName.padEnd(6) + ' bought #' + listing.tokenId + ' from ' + listing.owner + ' (' + listing.licenseType + ')');
    } catch (e) {
      console.log('  ✗ ' + buyerName.padEnd(6) + ' buy failed: ' + e.message.slice(0, 50));
    }
  }

  console.log('\nCompleted ' + purchases + ' purchases\n');

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  Images:     ' + images.length);
  console.log('  Minted:     ' + mintedTokens.length);
  console.log('  Listed:     ' + listings.length);
  console.log('  Purchased:  ' + purchases);
  console.log('  Still listed: ~' + (listings.length - purchases));
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Show final state
  console.log('Fetching final state from API...\n');

  const galleryRes = await fetchJson(BACKEND + '/api/gallery');
  console.log('Galleries:');
  for (const gallery of galleryRes.galleries) {
    const name = accountNames.find(n => accounts[n].toLowerCase() === gallery.address.toLowerCase()) || 'unknown';
    console.log('  ' + name.padEnd(6) + ': ' + gallery.tokenCount + ' tokens');
  }

  console.log('');
  const marketRes = await fetchJson(BACKEND + '/api/marketplace');
  console.log('Active listings: ' + marketRes.listings.length);
  for (const listing of marketRes.listings.slice(0, 5)) {
    console.log('  #' + listing.tokenId + ': ' + listing.priceEth + ' ETH (' + listing.licenseType + ')');
  }
  if (marketRes.listings.length > 5) {
    console.log('  ... and ' + (marketRes.listings.length - 5) + ' more');
  }

  console.log('\n✅ Population complete!');
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
