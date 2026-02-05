const { ethers } = require('ethers');

const WALLET_SERVICE = 'http://localhost:3001';
const BACKEND_API = 'http://localhost:3000';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
const RPC_URL = 'http://localhost:8545';

const ABI = [
  'function getListing(uint256 tokenId) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function nonces(address) view returns (uint256)'
];

async function main() {
  console.log('=== Verifying Final State After Listing ===\n');

  // 1. Check on-chain state
  console.log('1. ON-CHAIN STATE (Smart Contract)');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  const listing = await contract.getListing(0);
  console.log('   listings[0]:');
  console.log('     seller:', listing.seller);
  console.log('     price:', ethers.formatEther(listing.price), 'ETH');
  console.log('     licenseType:', listing.licenseType, '(0=Display, 1=Commercial, 2=Transfer)');
  console.log('     licenseHash:', listing.licenseHash);
  console.log('     nonce:', listing.nonce.toString());
  console.log('     expiry:', listing.expiry.toString());
  console.log('     active:', listing.active);

  const aliceNonce = await contract.nonces('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
  console.log('\n   nonces[Alice]:', aliceNonce.toString());

  const owner = await contract.ownerOf(0);
  console.log('   ownerOf(0):', owner);

  // 2. Check backend API view
  console.log('\n2. BACKEND API VIEW');

  // Get session and auth token
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

  // Get listing from backend
  const listingRes = await fetch(BACKEND_API + '/api/marketplace/0', {
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  const backendListing = await listingRes.json();
  console.log('   GET /api/marketplace/0:');
  console.log('    ', JSON.stringify(backendListing, null, 2).split('\n').join('\n     '));

  // Get all active listings
  const allListingsRes = await fetch(BACKEND_API + '/api/marketplace');
  const allListings = await allListingsRes.json();
  console.log('\n   GET /api/marketplace (all active):');
  console.log('    ', JSON.stringify(allListings, null, 2).split('\n').join('\n     '));

  // 3. What Flutter would see
  console.log('\n3. FLUTTER APP VIEW');
  console.log('   After _loadToken() refresh, _listing would be:');
  console.log('   {');
  console.log('     listed:', backendListing.listed);
  console.log('     priceEth:', backendListing.priceEth);
  console.log('     licenseType:', backendListing.licenseType);
  console.log('     seller:', backendListing.seller);
  console.log('   }');

  console.log('\n   UI would show:');
  if (backendListing.listed) {
    console.log('   ✓ Green card: "Listed for ' + backendListing.priceEth + ' ETH"');
    console.log('   ✓ Button: "Remove Listing" (red outline)');
    console.log('   ✓ Info card shows: "License Offered: Display Only"');
  } else {
    console.log('   ✗ Button: "List for Sale" (green)');
  }

  console.log('\n=== State Verification Complete ===');
}

main().catch(console.error);
