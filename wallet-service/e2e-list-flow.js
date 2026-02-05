/**
 * Complete E2E Test: List for Sale Flow
 *
 * This simulates exactly what happens when a user clicks "List for Sale" in Flutter:
 * 1. Connect wallet (select account)
 * 2. Get auth token for backend
 * 3. Call backend to prepare listing (get typed data)
 * 4. Sign typed data with wallet service
 * 5. Send transaction via wallet service
 * 6. Verify final on-chain and API state
 */

const { ethers } = require('ethers');

const WALLET_SERVICE = 'http://localhost:3001';
const BACKEND_API = 'http://localhost:3000';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
const RPC_URL = 'http://localhost:8545';

// Test account (Alice)
const ALICE = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

// Function selectors (verified correct)
const SELECTORS = {
  list: '0x69c6945f',   // list(uint256,uint256,uint8,bytes32,uint256,bytes)
  delist: '0x964bc33f', // delist(uint256)
  buy: '0x82189551'     // buy(uint256,bytes)
};

// ABI encode helpers
function encodeDelistCall(tokenId) {
  const tokenIdHex = BigInt(tokenId).toString(16).padStart(64, '0');
  return SELECTORS.delist + tokenIdHex;
}

function encodeListCall(tokenId, price, licenseType, licenseHash, expiry, signature) {
  const tokenIdHex = BigInt(tokenId).toString(16).padStart(64, '0');
  const priceHex = BigInt(price).toString(16).padStart(64, '0');
  const licenseTypeHex = licenseType.toString(16).padStart(64, '0');
  const licenseHashHex = licenseHash.replace('0x', '').padStart(64, '0');
  const expiryHex = BigInt(expiry).toString(16).padStart(64, '0');
  const signatureOffset = 'c0'.padStart(64, '0');

  const sigHex = signature.replace('0x', '');
  const signatureLength = (sigHex.length / 2).toString(16).padStart(64, '0');
  const paddedLength = Math.ceil(sigHex.length / 64) * 64;
  const signatureData = sigHex.padEnd(paddedLength, '0');

  return SELECTORS.list + tokenIdHex + priceHex + licenseTypeHex + licenseHashHex +
         expiryHex + signatureOffset + signatureLength + signatureData;
}

async function runE2ETest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          E2E TEST: Flutter "List for Sale" Flow             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const tokenId = 0;
  const priceEth = '0.75';

  // Setup: Get contract instance for verification
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ABI = [
    'function getListing(uint256) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)',
    'function ownerOf(uint256) view returns (address)'
  ];
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Connect Wallet (WalletProvider.connectTestAccount)
  // ═══════════════════════════════════════════════════════════════════
  console.log('STEP 1: Connect Wallet');
  console.log('───────────────────────────────────────────────────────────────');

  const selectRes = await fetch(WALLET_SERVICE + '/api/accounts/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: ALICE })
  });
  const { sessionId } = await selectRes.json();
  console.log('  → POST /api/accounts/select');
  console.log('  ← sessionId:', sessionId.slice(0, 8) + '...');
  console.log('  ✓ Wallet connected as Alice\n');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Get Auth Token (WalletProvider._createAuthToken)
  // ═══════════════════════════════════════════════════════════════════
  console.log('STEP 2: Get Auth Token (SIWE)');
  console.log('───────────────────────────────────────────────────────────────');

  const authRes = await fetch(WALLET_SERVICE + '/api/auth/token', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId }
  });
  const { token: authToken } = await authRes.json();
  console.log('  → POST /api/auth/token');
  console.log('  ← token:', authToken.slice(0, 30) + '...');
  console.log('  ✓ SIWE auth token obtained\n');

  // ═══════════════════════════════════════════════════════════════════
  // PRE-CHECK: Current listing state
  // ═══════════════════════════════════════════════════════════════════
  console.log('PRE-CHECK: Current On-Chain State');
  console.log('───────────────────────────────────────────────────────────────');

  let listing = await contract.getListing(tokenId);
  console.log('  Token', tokenId, 'listing:');
  console.log('    active:', listing.active);
  if (listing.active) {
    console.log('    price:', ethers.formatEther(listing.price), 'ETH');
  }

  // If already listed, delist first
  if (listing.active) {
    console.log('\n  ⚠ Token is already listed, delisting first...');
    const delistData = encodeDelistCall(tokenId);
    const delistRes = await fetch(WALLET_SERVICE + '/api/transaction/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
      body: JSON.stringify({ to: CONTRACT_ADDRESS, data: delistData, value: '0' })
    });
    const delistResult = await delistRes.json();
    if (delistResult.success) {
      console.log('  ✓ Delisted successfully');
    } else {
      console.log('  ✗ Delist failed:', delistResult.error);
      return;
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Prepare Listing (ApiService.prepareListing)
  // ═══════════════════════════════════════════════════════════════════
  console.log('STEP 3: Prepare Listing (Backend API)');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  → POST /api/marketplace/list');
  console.log('    body: { tokenId:', tokenId, ', priceEth:', priceEth, ', licenseType: "display" }');

  const prepareRes = await fetch(BACKEND_API + '/api/marketplace/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authToken
    },
    body: JSON.stringify({
      tokenId: tokenId,
      priceEth: priceEth,
      licenseType: 'display'
    })
  });
  const prepareResult = await prepareRes.json();

  if (!prepareRes.ok) {
    console.log('  ✗ Failed:', prepareResult.error);
    return;
  }

  const { typedData, contractCall } = prepareResult;
  console.log('  ← typedData.domain.verifyingContract:', typedData.domain.verifyingContract.slice(0, 12) + '...');
  console.log('  ← contractCall.params.price:', contractCall.params.price, 'wei');
  console.log('  ← contractCall.params.expiry:', new Date(contractCall.params.expiry * 1000).toISOString());
  console.log('  ✓ Listing prepared\n');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Sign Typed Data (WalletService.signTypedData)
  // ═══════════════════════════════════════════════════════════════════
  console.log('STEP 4: Sign EIP-712 Typed Data');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  → POST /api/sign/typed-data');

  const signRes = await fetch(WALLET_SERVICE + '/api/sign/typed-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify(typedData)
  });
  const signData = await signRes.json();

  if (!signData.success) {
    console.log('  ✗ Signing failed:', signData.error);
    return;
  }

  const signature = signData.signature;
  console.log('  ← signature:', signature.slice(0, 20) + '...' + signature.slice(-8));
  console.log('  ✓ Typed data signed\n');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Send Transaction (WalletService.sendTransaction)
  // ═══════════════════════════════════════════════════════════════════
  console.log('STEP 5: Send List Transaction');
  console.log('───────────────────────────────────────────────────────────────');

  const txData = encodeListCall(
    contractCall.params.tokenId,
    contractCall.params.price,
    contractCall.params.licenseType,
    contractCall.params.licenseHash,
    contractCall.params.expiry,
    signature
  );

  console.log('  → POST /api/transaction/send');
  console.log('    to:', CONTRACT_ADDRESS);
  console.log('    data:', txData.slice(0, 20) + '...' + txData.slice(-8), '(' + txData.length/2 + ' bytes)');

  const txRes = await fetch(WALLET_SERVICE + '/api/transaction/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({ to: CONTRACT_ADDRESS, data: txData, value: '0' })
  });
  const txResult = await txRes.json();

  if (!txResult.success) {
    console.log('  ✗ Transaction FAILED:', txResult.error);
    return;
  }

  console.log('  ← hash:', txResult.hash);
  console.log('  ← block:', txResult.blockNumber);
  console.log('  ← gasUsed:', txResult.gasUsed);
  console.log('  ✓ Transaction confirmed\n');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: Verify Final State
  // ═══════════════════════════════════════════════════════════════════
  console.log('STEP 6: Verify Final State');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 6a. On-chain state
  console.log('  A) ON-CHAIN STATE (Smart Contract)');
  console.log('  ─────────────────────────────────────');

  listing = await contract.getListing(tokenId);
  const owner = await contract.ownerOf(tokenId);

  console.log('     getListing(' + tokenId + '):');
  console.log('       active:      ', listing.active);
  console.log('       seller:      ', listing.seller);
  console.log('       price:       ', ethers.formatEther(listing.price), 'ETH');
  console.log('       licenseType: ', listing.licenseType, '(0=Display)');
  console.log('       expiry:      ', new Date(Number(listing.expiry) * 1000).toISOString());
  console.log('     ownerOf(' + tokenId + '):', owner);
  console.log('');

  // 6b. Backend API state
  console.log('  B) BACKEND API STATE');
  console.log('  ─────────────────────────────────────');

  const apiListingRes = await fetch(BACKEND_API + '/api/marketplace/' + tokenId, {
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  const apiListing = await apiListingRes.json();

  console.log('     GET /api/marketplace/' + tokenId + ':');
  console.log('       listed:      ', apiListing.listed);
  console.log('       priceEth:    ', apiListing.priceEth);
  console.log('       licenseType: ', apiListing.licenseType);
  console.log('       seller:      ', apiListing.seller?.slice(0, 12) + '...');
  console.log('');

  // 6c. Flutter UI state
  console.log('  C) FLUTTER UI STATE (what user sees)');
  console.log('  ─────────────────────────────────────');

  if (apiListing.listed) {
    console.log('     ┌─────────────────────────────────────┐');
    console.log('     │  ✓ Listed for ' + apiListing.priceEth + ' ETH'.padEnd(23) + '│');
    console.log('     │    License: Display Only            │');
    console.log('     │                                     │');
    console.log('     │  ┌─────────────────────────────┐    │');
    console.log('     │  │     Remove Listing          │    │');
    console.log('     │  └─────────────────────────────┘    │');
    console.log('     └─────────────────────────────────────┘');
  }

  // Final verdict
  console.log('\n═══════════════════════════════════════════════════════════════');
  if (listing.active &&
      listing.seller.toLowerCase() === ALICE.toLowerCase() &&
      ethers.formatEther(listing.price) === priceEth &&
      apiListing.listed === true) {
    console.log('  ✅ E2E TEST PASSED: Token successfully listed!');
  } else {
    console.log('  ❌ E2E TEST FAILED: State mismatch');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runE2ETest().catch(err => {
  console.error('E2E Test Error:', err);
  process.exit(1);
});
