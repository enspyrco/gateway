/**
 * Simulate exactly what Flutter does when clicking "List for Sale"
 * This mimics the _list() method in token_detail_page.dart
 */

const { ethers } = require('ethers');

const WALLET_SERVICE = 'http://localhost:3001';
const BACKEND_API = 'http://localhost:3000';
// Use the same default as Flutter
const FLUTTER_DEFAULT_CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
// Actually deployed contract
const ACTUAL_CONTRACT = process.env.CONTRACT_ADDRESS || '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
const RPC_URL = 'http://localhost:8545';

// Same encoding function as Flutter's _encodeListCall
function encodeListCall(tokenId, price, licenseType, licenseHash, expiry, signature) {
  // Fixed selector: 0x69c6945f
  const selector = '0x69c6945f';

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

  return selector + tokenIdHex + priceHex + licenseTypeHex + licenseHashHex + expiryHex + signatureOffset + signatureLength + signatureData;
}

async function simulateFlutterListForSale() {
  console.log('=== Simulating Flutter "List for Sale" Click ===\n');

  console.log('Contract addresses:');
  console.log('  Flutter default:', FLUTTER_DEFAULT_CONTRACT);
  console.log('  Actually deployed:', ACTUAL_CONTRACT);
  console.log('  MISMATCH:', FLUTTER_DEFAULT_CONTRACT !== ACTUAL_CONTRACT ? 'YES - This would fail!' : 'No');
  console.log('');

  // Simulate using the ACTUAL contract (as if Flutter was configured correctly)
  const contractAddress = ACTUAL_CONTRACT;

  // Step 0: Connect wallet (already done in Flutter via WalletProvider)
  console.log('Step 0: Connecting wallet...');
  const selectRes = await fetch(WALLET_SERVICE + '/api/accounts/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' })
  });
  const { sessionId } = await selectRes.json();

  const authRes = await fetch(WALLET_SERVICE + '/api/auth/token', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId }
  });
  const { token: authToken } = await authRes.json();
  console.log('  ✓ Wallet connected, auth token obtained\n');

  // First mint a new token so we have something to list
  console.log('Step 0.5: Minting a token first...');
  const fs = require('fs');
  const path = require('path');
  const testImagePath = path.join(__dirname, '..', 'backend', 'test', 'fixtures', 'test-image-2.png');
  const imageBuffer = fs.readFileSync(testImagePath);

  const formData = new FormData();
  formData.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'test.png');
  formData.append('name', 'Flutter Simulation Token');
  formData.append('description', 'Testing Flutter flow');

  const mintRes = await fetch(BACKEND_API + '/api/mint', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken },
    body: formData
  });
  const mintData = await mintRes.json();
  if (!mintRes.ok) {
    console.log('  ✗ Mint failed:', mintData.error);
    console.log('  (Using token 0 instead)');
  } else {
    console.log('  ✓ Token minted:', mintData.tokenId);
  }
  const tokenId = mintData.tokenId || 0;
  console.log('');

  // Now simulate _list() method
  console.log('=== _list() method starts ===\n');

  // Step 1: Call backend to prepare listing
  console.log('Step 1: api.prepareListing()');
  const prepareRes = await fetch(BACKEND_API + '/api/marketplace/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authToken
    },
    body: JSON.stringify({
      tokenId: tokenId,
      priceEth: '0.5',
      licenseType: 'display'
    })
  });
  const prepareResult = await prepareRes.json();
  console.log('  ✓ Got typedData and contractCall from backend\n');

  // Step 2: Sign typed data
  console.log('Step 2: wallet.signTypedData(typedData)');
  const typedData = prepareResult.typedData;
  const contractCall = prepareResult.contractCall;

  const signRes = await fetch(WALLET_SERVICE + '/api/sign/typed-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': sessionId
    },
    body: JSON.stringify(typedData)
  });
  const signData = await signRes.json();
  const signature = signData.signature;
  console.log('  ✓ Signature:', signature.substring(0, 20) + '...\n');

  // Step 3: Build transaction data (Flutter's _encodeListCall)
  console.log('Step 3: _encodeListCall()');
  const txData = encodeListCall(
    contractCall.params.tokenId,
    contractCall.params.price,
    contractCall.params.licenseType,
    contractCall.params.licenseHash,
    contractCall.params.expiry,
    signature
  );
  console.log('  ✓ Encoded tx data:', txData.substring(0, 40) + '...\n');

  // Step 4: Send transaction
  console.log('Step 4: wallet.sendTransaction()');
  console.log('  to:', contractAddress);
  const txRes = await fetch(WALLET_SERVICE + '/api/transaction/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': sessionId
    },
    body: JSON.stringify({
      to: contractAddress,
      data: txData,
      value: '0'
    })
  });
  const txResult = await txRes.json();

  if (!txResult.success) {
    console.log('  ✗ Transaction FAILED:', txResult.error);
    return;
  }

  console.log('  ✓ Transaction hash:', txResult.hash);
  console.log('  ✓ Block:', txResult.blockNumber);
  console.log('  ✓ Status:', txResult.status);
  console.log('');

  // Step 5: Verify final state (simulates _loadToken() refresh)
  console.log('Step 5: _loadToken() refresh - checking final state\n');

  const ABI = [
    'function getListing(uint256 tokenId) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)'
  ];
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(contractAddress, ABI, provider);

  const listing = await contract.getListing(tokenId);
  console.log('  On-chain listing state:');
  console.log('    active:', listing.active);
  console.log('    seller:', listing.seller);
  console.log('    price:', ethers.formatEther(listing.price), 'ETH');
  console.log('    licenseType:', listing.licenseType);

  if (listing.active) {
    console.log('\n=== SUCCESS: Token is listed! ===');
    console.log('Flutter UI would show:');
    console.log('  - Green card: "Listed for 0.5 ETH"');
    console.log('  - "Remove Listing" button');
  } else {
    console.log('\n=== FAILED: Token is NOT listed ===');
  }
}

simulateFlutterListForSale().catch(console.error);
