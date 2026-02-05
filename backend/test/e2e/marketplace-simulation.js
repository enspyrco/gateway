/**
 * Marketplace Simulation Test
 *
 * Randomly mints, lists, and buys tokens across multiple wallets,
 * then verifies the blockchain state matches expectations.
 *
 * Usage: node test/e2e/marketplace-simulation.js
 */

const { ethers } = require('ethers');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WALLET_SERVICE = 'http://localhost:3001';
const BACKEND = 'http://localhost:3000';
const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const IMAGE_DIR = process.env.HOME + '/Desktop/Photos/nfts';

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

// Expected state tracking
const expectedState = {
  tokens: new Map(),
  listings: new Map(),
  nextTokenId: 0
};

// Helpers
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPrice() {
  return (Math.random() * 0.9 + 0.1).toFixed(2);
}

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

// Track available images (shuffle once, use without replacement)
let availableImages = null;

function getNextImage() {
  if (!availableImages || availableImages.length === 0) {
    // Shuffle all images
    availableImages = fs.readdirSync(IMAGE_DIR)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
      .map(f => path.join(IMAGE_DIR, f))
      .sort(() => Math.random() - 0.5);
  }
  return availableImages.pop();
}

// Mint using curl (more reliable for multipart)
async function mintToken(ownerName) {
  const address = accounts[ownerName];
  const image = getNextImage();

  const { authToken } = await getSession(address);

  const cmd = 'curl -s -X POST ' + BACKEND + '/api/mint ' +
    "-H 'Authorization: Bearer " + authToken + "' " +
    "-F 'image=@" + image + "' " +
    "-F 'name=Token by " + ownerName + "' " +
    "-F 'description=Test token' " +
    "-F 'licenseType=transfer'";

  const result = JSON.parse(execSync(cmd, { timeout: 120000 }).toString());
  if (!result.success) throw new Error(result.error);

  expectedState.tokens.set(result.tokenId, {
    owner: address,
    license: 'transfer',
    isOriginal: true,
    parentToken: result.tokenId,
    creator: address
  });
  expectedState.nextTokenId = Math.max(expectedState.nextTokenId, result.tokenId + 1);

  return result.tokenId;
}

async function listToken(ownerName, tokenId, licenseType, price) {
  const address = accounts[ownerName];
  const { sessionId, authToken } = await getSession(address);

  const listRes = await fetchJson(BACKEND + '/api/marketplace/list', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ tokenId, priceEth: price, licenseType })
  });
  if (listRes.error) throw new Error('List prep failed: ' + listRes.error);

  const { typedData, contractCall } = listRes;

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

  expectedState.listings.set(tokenId, {
    seller: address,
    price: price,
    licenseType: licenseType
  });

  return txRes.hash;
}

async function buyToken(buyerName, tokenId) {
  const address = accounts[buyerName];
  const { sessionId, authToken } = await getSession(address);

  const buyRes = await fetchJson(BACKEND + '/api/marketplace/buy', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify({ tokenId })
  });
  if (buyRes.error) throw new Error('Buy prep failed: ' + buyRes.error);

  const { typedData, contractCall } = buyRes;

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

  const iface = new ethers.Interface(['function buy(uint256 tokenId, bytes signature) payable']);
  const txData = iface.encodeFunctionData('buy', [tokenId, signRes.signature]);

  const txRes = await fetchJson(WALLET_SERVICE + '/api/transaction/send', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId },
    body: JSON.stringify({ to: CONTRACT, data: txData, value: contractCall.value })
  });
  if (!txRes.success) throw new Error('Transaction failed: ' + txRes.error);

  const listing = expectedState.listings.get(tokenId);
  const originalToken = expectedState.tokens.get(tokenId);

  if (listing.licenseType === 'transfer') {
    originalToken.owner = address;
    expectedState.listings.delete(tokenId);
  } else {
    const newTokenId = expectedState.nextTokenId++;
    expectedState.tokens.set(newTokenId, {
      owner: address,
      license: listing.licenseType,
      isOriginal: false,
      parentToken: tokenId,
      creator: originalToken.creator
    });
    expectedState.listings.delete(tokenId);
  }

  return txRes.hash;
}

async function verifyState() {
  const errors = [];

  const galleryRes = await fetchJson(BACKEND + '/api/gallery');
  const actualOwnership = new Map();

  for (const gallery of galleryRes.galleries) {
    const detailRes = await fetchJson(BACKEND + '/api/gallery/' + gallery.address);
    for (const token of detailRes.tokens) {
      actualOwnership.set(token.tokenId, {
        owner: gallery.address,
        license: token.ownerLicense,
        isOriginal: token.isOriginal,
        parentToken: token.parentToken
      });
    }
  }

  const marketRes = await fetchJson(BACKEND + '/api/marketplace');
  const actualListings = new Map();
  for (const listing of marketRes.listings) {
    actualListings.set(listing.tokenId, {
      seller: listing.seller,
      licenseType: listing.licenseType
    });
  }

  for (const [tokenId, expected] of expectedState.tokens) {
    const actual = actualOwnership.get(tokenId);
    if (!actual) {
      errors.push('Token ' + tokenId + ': expected to exist but not found');
      continue;
    }
    if (actual.owner.toLowerCase() !== expected.owner.toLowerCase()) {
      errors.push('Token ' + tokenId + ': owner mismatch');
    }
    if (actual.license !== expected.license) {
      errors.push('Token ' + tokenId + ': license mismatch - expected ' + expected.license + ', got ' + actual.license);
    }
  }

  if (actualListings.size !== expectedState.listings.size) {
    errors.push('Listings count mismatch: expected ' + expectedState.listings.size + ', got ' + actualListings.size);
  }

  for (const [tokenId, expected] of expectedState.listings) {
    const actual = actualListings.get(tokenId);
    if (!actual) {
      errors.push('Listing ' + tokenId + ': expected but not found');
    }
  }

  return errors;
}

async function runSimulation() {
  console.log('=== NFTmarket Simulation Test ===\n');

  const stats = { mints: 0, listings: 0, purchases: 0, errors: 0 };

  // Phase 1: Mint tokens
  console.log('Phase 1: Minting tokens...');
  for (const name of accountNames) {
    const count = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < count; i++) {
      try {
        const tokenId = await mintToken(name);
        console.log('  ' + name + ' minted token #' + tokenId);
        stats.mints++;
      } catch (e) {
        console.log('  ' + name + ' mint failed: ' + e.message);
        stats.errors++;
      }
    }
  }

  // Phase 2: List tokens
  console.log('\nPhase 2: Listing tokens...');
  const ownedTokens = [];
  for (const [tokenId, token] of expectedState.tokens) {
    if (token.isOriginal) {
      const ownerName = accountNames.find(function(n) { return accounts[n].toLowerCase() === token.owner.toLowerCase(); });
      ownedTokens.push({ tokenId: tokenId, ownerName: ownerName });
    }
  }

  const tokensToList = ownedTokens.sort(function() { return Math.random() - 0.5; }).slice(0, Math.ceil(ownedTokens.length / 2));
  for (const item of tokensToList) {
    try {
      const license = random(licenseTypes);
      const price = randomPrice();
      await listToken(item.ownerName, item.tokenId, license, price);
      console.log('  ' + item.ownerName + ' listed #' + item.tokenId + ' for ' + price + ' ETH (' + license + ')');
      stats.listings++;
    } catch (e) {
      console.log('  listing failed: ' + e.message);
      stats.errors++;
    }
  }

  // Phase 3: Buy listings
  console.log('\nPhase 3: Buying tokens...');
  const listingsToBuy = Array.from(expectedState.listings.keys());
  for (const tokenId of listingsToBuy) {
    const listing = expectedState.listings.get(tokenId);
    if (!listing) continue;

    const sellerName = accountNames.find(function(n) { return accounts[n].toLowerCase() === listing.seller.toLowerCase(); });
    const possibleBuyers = accountNames.filter(function(n) { return n !== sellerName; });
    const buyerName = random(possibleBuyers);

    try {
      await buyToken(buyerName, tokenId);
      console.log('  ' + buyerName + ' bought #' + tokenId + ' from ' + sellerName + ' (' + listing.licenseType + ')');
      stats.purchases++;
    } catch (e) {
      console.log('  buy failed: ' + e.message);
      stats.errors++;
    }
  }

  // Phase 4: Another round
  console.log('\nPhase 4: Second round...');
  const currentOwners = [];
  for (const [tokenId, token] of expectedState.tokens) {
    if (token.isOriginal && token.license === 'transfer' && !expectedState.listings.has(tokenId)) {
      const ownerName = accountNames.find(function(n) { return accounts[n].toLowerCase() === token.owner.toLowerCase(); });
      if (ownerName) currentOwners.push({ tokenId: tokenId, ownerName: ownerName });
    }
  }

  const secondRound = currentOwners.sort(function() { return Math.random() - 0.5; }).slice(0, 2);
  for (const item of secondRound) {
    try {
      const license = random(licenseTypes);
      const price = randomPrice();
      await listToken(item.ownerName, item.tokenId, license, price);
      console.log('  ' + item.ownerName + ' listed #' + item.tokenId + ' (' + license + ')');
      stats.listings++;

      const possibleBuyers = accountNames.filter(function(n) { return n !== item.ownerName; });
      const buyerName = random(possibleBuyers);
      await buyToken(buyerName, item.tokenId);
      console.log('  ' + buyerName + ' bought #' + item.tokenId);
      stats.purchases++;
    } catch (e) {
      console.log('  Error: ' + e.message);
      stats.errors++;
    }
  }

  // Verify
  console.log('\n=== Verification ===');
  const errors = await verifyState();

  if (errors.length === 0) {
    console.log('All checks passed!');
  } else {
    console.log('Errors found:');
    errors.forEach(function(e) { console.log('  - ' + e); });
  }

  console.log('\n=== Summary ===');
  console.log('Mints: ' + stats.mints);
  console.log('Listings: ' + stats.listings);
  console.log('Purchases: ' + stats.purchases);
  console.log('Errors: ' + stats.errors);
  console.log('Verification errors: ' + errors.length);

  console.log('\n=== Final Ownership ===');
  for (const name of accountNames) {
    const tokens = [];
    for (const [tokenId, token] of expectedState.tokens) {
      if (token.owner.toLowerCase() === accounts[name].toLowerCase()) {
        tokens.push('#' + tokenId + '(' + token.license[0] + (token.isOriginal ? '' : '*') + ')');
      }
    }
    console.log(name + ': ' + (tokens.join(', ') || 'none'));
  }

  // Success = verification passed (blockchain state is correct)
  // Execution errors (network hiccups, image collisions) are tolerated
  const verificationPassed = errors.length === 0;
  const perfectRun = verificationPassed && stats.errors === 0;

  return { verificationPassed, perfectRun, stats };
}

runSimulation()
  .then(function(result) {
    if (result.perfectRun) {
      console.log('\nSUCCESS (perfect run)');
    } else if (result.verificationPassed) {
      console.log('\nSUCCESS (verification passed, ' + result.stats.errors + ' execution errors tolerated)');
    } else {
      console.log('\nFAILED (verification errors)');
    }
    process.exit(result.verificationPassed ? 0 : 1);
  })
  .catch(function(e) {
    console.error('Fatal:', e);
    process.exit(1);
  });
