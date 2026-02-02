const { ethers } = require('ethers');
const RPC_URL = 'http://localhost:8545';
const CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const WALLET_SERVICE = 'http://localhost:3001';
const BACKEND_API = 'http://localhost:3000';

async function main() {
  // Get session for Alice
  const selectRes = await fetch(`${WALLET_SERVICE}/api/accounts/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' })
  });
  const { sessionId } = await selectRes.json();

  // Get auth token
  const authRes = await fetch(`${WALLET_SERVICE}/api/auth/token`, {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId }
  });
  const { token: authToken } = await authRes.json();

  // Prepare listing
  const prepareRes = await fetch(`${BACKEND_API}/api/marketplace/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      tokenId: 0,
      priceEth: '0.5',
      licenseType: 'display'
    })
  });
  const prepareData = await prepareRes.json();
  const typedData = prepareData.typedData;

  console.log('TypedData from backend:');
  console.log('  domain:', JSON.stringify(typedData.domain));
  console.log('  message:', JSON.stringify(typedData.message));

  // Sign via wallet service
  const signRes = await fetch(`${WALLET_SERVICE}/api/sign/typed-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': sessionId
    },
    body: JSON.stringify(typedData)
  });
  const signData = await signRes.json();
  console.log('\nSignature from wallet service:', signData.signature);

  // Now manually verify the signature using ethers
  const types = {
    ListingOffer: typedData.types.ListingOffer
  };
  
  // Recover the signer
  const recoveredAddress = ethers.verifyTypedData(
    typedData.domain,
    types,
    typedData.message,
    signData.signature
  );
  console.log('Recovered signer:', recoveredAddress);
  console.log('Expected signer:', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
  console.log('Match:', recoveredAddress.toLowerCase() === '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'.toLowerCase());

  // Also compute the struct hash manually to compare
  const LISTING_OFFER_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes("ListingOffer(uint256 tokenId,uint256 price,uint8 licenseType,bytes32 licenseHash,uint256 nonce,uint256 expiry)")
  );
  console.log('\nLISTING_OFFER_TYPEHASH:', LISTING_OFFER_TYPEHASH);
}

main().catch(console.error);
