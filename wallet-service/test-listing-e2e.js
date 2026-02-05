#!/usr/bin/env node
/**
 * E2E Test: Complete List for Sale Flow
 *
 * Tests the actual marketplace listing flow:
 * 1. Connect wallet (get session + auth token)
 * 2. Mint a token via backend
 * 3. Prepare listing via backend
 * 4. Sign typed data via wallet service
 * 5. Submit list transaction via wallet service
 * 6. Verify listing on chain
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const WALLET_SERVICE = 'http://localhost:3001';
const BACKEND_API = 'http://localhost:3000';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const RPC_URL = 'http://localhost:8545';

// Minimal ABI for checking listing
const ABI = [
  'function getListing(uint256 tokenId) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

// Encode list() function call
function encodeListCall(tokenId, price, licenseType, licenseHash, expiry, signature) {
  // Function selector: list(uint256,uint256,uint8,bytes32,uint256,bytes)
  // keccak256("list(uint256,uint256,uint8,bytes32,uint256,bytes)")[0:4] = 0x69c6945f
  const selector = '0x69c6945f';

  const tokenIdHex = BigInt(tokenId).toString(16).padStart(64, '0');
  const priceHex = BigInt(price).toString(16).padStart(64, '0');
  const licenseTypeHex = licenseType.toString(16).padStart(64, '0');
  const licenseHashHex = licenseHash.replace('0x', '').padStart(64, '0');
  const expiryHex = BigInt(expiry).toString(16).padStart(64, '0');

  // Offset for dynamic bytes parameter (6 * 32 = 192 = 0xc0)
  const signatureOffset = 'c0'.padStart(64, '0');

  // Remove 0x prefix from signature
  const sigHex = signature.replace('0x', '');
  const signatureLength = (sigHex.length / 2).toString(16).padStart(64, '0');

  // Pad signature to 32-byte boundary
  const paddedLength = Math.ceil(sigHex.length / 64) * 64;
  const signatureData = sigHex.padEnd(paddedLength, '0');

  return `${selector}${tokenIdHex}${priceHex}${licenseTypeHex}${licenseHashHex}${expiryHex}${signatureOffset}${signatureLength}${signatureData}`;
}

async function main() {
  console.log('=== E2E Test: Complete Listing Flow ===\n');
  console.log(`Wallet Service: ${WALLET_SERVICE}`);
  console.log(`Backend API: ${BACKEND_API}`);
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`RPC: ${RPC_URL}\n`);

  let sessionId = null;
  let authToken = null;

  try {
    // Step 1: Select account (Alice)
    console.log('1. Selecting account (Alice)...');
    const selectRes = await fetch(`${WALLET_SERVICE}/api/accounts/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' })
    });
    const selectData = await selectRes.json();
    if (!selectData.success) throw new Error(`Failed to select account: ${selectData.error}`);
    sessionId = selectData.sessionId;
    console.log(`   ✓ Session: ${sessionId.substring(0, 8)}...`);

    // Step 2: Get auth token
    console.log('2. Getting SIWE auth token...');
    const authRes = await fetch(`${WALLET_SERVICE}/api/auth/token`, {
      method: 'POST',
      headers: { 'X-Session-Id': sessionId }
    });
    const authData = await authRes.json();
    if (!authData.success) throw new Error(`Failed to get auth token: ${authData.error}`);
    authToken = authData.token;
    console.log(`   ✓ Token received (${authToken.length} chars)`);

    // Step 3: Mint a token
    console.log('3. Minting a new token...');

    // Create a simple test image (100x100 red square PNG - more realistic for watermarking)
    // Use the test fixture if it exists, otherwise create minimal image
    let imageBuffer;
    const testFixturePath = path.join(__dirname, '..', 'backend', 'test', 'fixtures', 'test-image.png');
    if (fs.existsSync(testFixturePath)) {
      imageBuffer = fs.readFileSync(testFixturePath);
      console.log('   Using test fixture image');
    } else {
      // Minimal 1x1 PNG
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      imageBuffer = Buffer.from(testImageBase64, 'base64');
      console.log('   Using minimal 1x1 PNG');
    }

    // Use native fetch with Blob (Node 18+)
    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'test-image.png');
    formData.append('name', 'Test NFT for Listing');
    formData.append('description', 'E2E test token');

    const mintRes = await fetch(`${BACKEND_API}/api/mint`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    if (!mintRes.ok) {
      const errText = await mintRes.text();
      throw new Error(`Mint failed: ${mintRes.status} ${errText}`);
    }

    const mintData = await mintRes.json();
    const tokenId = mintData.tokenId;
    console.log(`   ✓ Token minted: #${tokenId}`);
    console.log(`   ✓ TX: ${mintData.transactionHash?.substring(0, 20)}...`);

    // Step 4: Verify ownership
    console.log('4. Verifying ownership...');
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    const owner = await contract.ownerOf(tokenId);
    console.log(`   ✓ Owner: ${owner}`);
    if (owner.toLowerCase() !== '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'.toLowerCase()) {
      throw new Error(`Unexpected owner: ${owner}`);
    }

    // Step 5: Prepare listing via backend
    console.log('5. Preparing listing via backend...');
    const prepareRes = await fetch(`${BACKEND_API}/api/marketplace/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        tokenId: tokenId,
        priceEth: '0.5',
        licenseType: 'display'
      })
    });

    if (!prepareRes.ok) {
      const errText = await prepareRes.text();
      throw new Error(`Prepare listing failed: ${prepareRes.status} ${errText}`);
    }

    const prepareData = await prepareRes.json();
    console.log(`   ✓ Typed data received`);
    console.log(`   ✓ Price: ${prepareData.summary.priceEth} ETH`);
    console.log(`   ✓ License: ${prepareData.summary.licenseType}`);

    // Step 6: Sign typed data via wallet service
    console.log('6. Signing typed data via wallet service...');
    const signRes = await fetch(`${WALLET_SERVICE}/api/sign/typed-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify(prepareData.typedData)
    });

    const signData = await signRes.json();
    if (!signData.success) throw new Error(`Failed to sign: ${signData.error}`);
    console.log(`   ✓ Signature: ${signData.signature.substring(0, 20)}...`);

    // Step 7: Submit list transaction via wallet service
    console.log('7. Submitting list transaction...');

    const contractCall = prepareData.contractCall;
    const txData = encodeListCall(
      contractCall.params.tokenId,
      contractCall.params.price,
      contractCall.params.licenseType,
      contractCall.params.licenseHash,
      contractCall.params.expiry,
      signData.signature
    );

    const txRes = await fetch(`${WALLET_SERVICE}/api/transaction/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({
        to: CONTRACT_ADDRESS,
        data: txData,
        value: '0'
      })
    });

    const txResult = await txRes.json();
    if (!txResult.success) throw new Error(`Transaction failed: ${txResult.error}`);
    console.log(`   ✓ TX Hash: ${txResult.hash}`);
    console.log(`   ✓ Block: ${txResult.blockNumber}`);
    console.log(`   ✓ Status: ${txResult.status}`);

    // Step 8: Verify listing on chain
    console.log('8. Verifying listing on chain...');
    const listing = await contract.getListing(tokenId);
    console.log(`   ✓ Seller: ${listing.seller}`);
    console.log(`   ✓ Price: ${ethers.formatEther(listing.price)} ETH`);
    console.log(`   ✓ License Type: ${listing.licenseType} (0=Display)`);
    console.log(`   ✓ Active: ${listing.active}`);

    if (!listing.active) {
      throw new Error('Listing is not active!');
    }
    if (listing.seller.toLowerCase() !== '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'.toLowerCase()) {
      throw new Error(`Unexpected seller: ${listing.seller}`);
    }

    console.log('\n=== ALL TESTS PASSED! ===\n');
    console.log('Summary:');
    console.log(`  Token ID: ${tokenId}`);
    console.log(`  Listed for: 0.5 ETH`);
    console.log(`  License: Display`);
    console.log(`  TX: ${txResult.hash}`);
    console.log('\nThe complete listing flow works correctly!');

  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
