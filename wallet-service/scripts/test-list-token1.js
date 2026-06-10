const fs = require('fs');
const { ethers } = require('ethers');

async function listToken() {
  console.log('STEP 1: Connect wallet as Alice');
  console.log('─'.repeat(50));

  const selectRes = await fetch('http://localhost:3001/api/accounts/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' })
  });
  const { sessionId } = await selectRes.json();
  console.log('Session ID:', sessionId);

  const authRes = await fetch('http://localhost:3001/api/auth/token', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId }
  });
  const { token } = await authRes.json();
  console.log('Auth token obtained');
  console.log('');

  console.log('STEP 2: Prepare listing (backend)');
  console.log('─'.repeat(50));

  const prepRes = await fetch('http://localhost:3000/api/marketplace/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      tokenId: 1,
      priceEth: '0.75',
      licenseType: 'commercial'
    })
  });

  const prepResult = await prepRes.json();
  console.log('Status:', prepRes.status);

  if (prepRes.status !== 200) {
    console.log('Error:', prepResult.error);
    return;
  }

  console.log('typedData.domain:', JSON.stringify(prepResult.typedData.domain, null, 2));
  console.log('typedData.message:', JSON.stringify(prepResult.typedData.message, null, 2));
  console.log('contractCall.params:', JSON.stringify(prepResult.contractCall.params, null, 2));
  console.log('');

  console.log('STEP 3: Sign typed data (wallet service)');
  console.log('─'.repeat(50));

  const signRes = await fetch('http://localhost:3001/api/sign/typed-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify(prepResult.typedData)
  });
  const signResult = await signRes.json();
  console.log('Signature:', signResult.signature.slice(0, 30) + '...');
  console.log('');

  console.log('STEP 4: Encode transaction');
  console.log('─'.repeat(50));

  const { contractCall } = prepResult;
  const selector = '0x69c6945f';
  const tokenIdHex = BigInt(contractCall.params.tokenId).toString(16).padStart(64, '0');
  const priceHex = BigInt(contractCall.params.price).toString(16).padStart(64, '0');
  const licenseTypeHex = contractCall.params.licenseType.toString(16).padStart(64, '0');
  const licenseHashHex = contractCall.params.licenseHash.replace('0x', '').padStart(64, '0');
  const expiryHex = BigInt(contractCall.params.expiry).toString(16).padStart(64, '0');
  const signatureOffset = 'c0'.padStart(64, '0');
  const sigHex = signResult.signature.replace('0x', '');
  const signatureLength = (sigHex.length / 2).toString(16).padStart(64, '0');
  const paddedLength = Math.ceil(sigHex.length / 64) * 64;
  const signatureData = sigHex.padEnd(paddedLength, '0');

  const txData = selector + tokenIdHex + priceHex + licenseTypeHex + licenseHashHex + expiryHex + signatureOffset + signatureLength + signatureData;

  console.log('Function: list(uint256,uint256,uint8,bytes32,uint256,bytes)');
  console.log('Selector:', selector);
  console.log('Data length:', txData.length / 2, 'bytes');
  console.log('');

  console.log('STEP 5: Send transaction (wallet service)');
  console.log('─'.repeat(50));

  const deployment = JSON.parse(fs.readFileSync('../contracts/deployment.json'));
  console.log('Contract:', deployment.address);

  const txRes = await fetch('http://localhost:3001/api/transaction/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({ to: deployment.address, data: txData, value: '0' })
  });

  const txResult = await txRes.json();
  console.log('Status:', txRes.status);

  if (!txResult.success) {
    console.log('Error:', txResult.error);
    return;
  }

  console.log('TX Hash:', txResult.hash);
  console.log('Block:', txResult.blockNumber);
  console.log('Gas Used:', txResult.gasUsed);
  console.log('');

  console.log('STEP 6: Verify on-chain state');
  console.log('─'.repeat(50));

  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  const contract = new ethers.Contract(deployment.address, [
    'function getListing(uint256) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)'
  ], provider);

  const listing = await contract.getListing(1);
  console.log('Token #1 Listing:');
  console.log('  active:', listing.active);
  console.log('  seller:', listing.seller);
  console.log('  price:', ethers.formatEther(listing.price), 'ETH');
  console.log('  licenseType:', ['Display', 'Commercial', 'Transfer'][listing.licenseType]);
  console.log('');

  if (listing.active) {
    console.log('✅ SUCCESS: Token #1 is now listed for sale!');
  } else {
    console.log('❌ FAILED: Token #1 is not listed');
  }
}

listToken().catch(e => console.error('Error:', e));
