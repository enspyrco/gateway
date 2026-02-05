const { ethers } = require('ethers');
const RPC_URL = 'http://localhost:8545';
const CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

const ABI = [
  'function getListing(uint256 tokenId) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function nonces(address) view returns (uint256)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  
  console.log('Checking token 0:');
  try {
    const owner = await contract.ownerOf(0);
    console.log('  Owner:', owner);
    
    const listing = await contract.getListing(0);
    console.log('  Listing:');
    console.log('    seller:', listing.seller);
    console.log('    price:', ethers.formatEther(listing.price), 'ETH');
    console.log('    active:', listing.active);
    
    // Check Alice's nonce
    const aliceNonce = await contract.nonces('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
    console.log('  Alice nonce:', aliceNonce.toString());
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

main().catch(console.error);
