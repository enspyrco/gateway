const fs = require('fs');
const { ethers } = require('ethers');

async function buyToken() {
  const TOKEN_ID = 1;  // The token to buy (Test Artwork @ 0.75 ETH)

  console.log('=== Buy Token Test ===\n');

  // Step 1: Connect as Bob (buyer)
  console.log('STEP 1: Connect wallet as Bob (buyer)');
  console.log('─'.repeat(50));

  const selectRes = await fetch('http://localhost:3001/api/accounts/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' })  // Bob
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

  // Step 2: Prepare purchase (backend)
  console.log('STEP 2: Prepare purchase (backend)');
  console.log('─'.repeat(50));

  const prepRes = await fetch('http://localhost:3000/api/marketplace/buy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ tokenId: TOKEN_ID })
  });

  const prepResult = await prepRes.json();
  console.log('Status:', prepRes.status);

  if (prepRes.status !== 200) {
    console.log('Error:', prepResult.error);
    return;
  }

  console.log('typedData.domain:', JSON.stringify(prepResult.typedData.domain, null, 2));
  console.log('typedData.message:', JSON.stringify(prepResult.typedData.message, null, 2));
  console.log('summary:', JSON.stringify(prepResult.summary, null, 2));
  console.log('');

  // Step 3: Sign typed data (wallet service)
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

  // Step 4: Encode transaction
  console.log('STEP 4: Encode transaction');
  console.log('─'.repeat(50));

  const { contractCall } = prepResult;
  // buy(uint256 tokenId, bytes signature)
  const selector = '0xd96a094a';  // buy(uint256)

  // Need to encode: buy(uint256 tokenId, bytes signature)
  // Function selector for buy(uint256,bytes)
  const iface = new ethers.Interface([
    'function buy(uint256 tokenId, bytes signature)'
  ]);

  const txData = iface.encodeFunctionData('buy', [
    TOKEN_ID,
    signResult.signature
  ]);

  console.log('Function: buy(uint256,bytes)');
  console.log('Data length:', txData.length / 2, 'bytes');
  console.log('Value:', prepResult.summary.priceEth, 'ETH');
  console.log('');

  // Step 5: Send transaction (wallet service)
  console.log('STEP 5: Send transaction (wallet service)');
  console.log('─'.repeat(50));

  const deployment = JSON.parse(fs.readFileSync('../contracts/deployment.json'));
  console.log('Contract:', deployment.address);

  const txRes = await fetch('http://localhost:3001/api/transaction/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({
      to: deployment.address,
      data: txData,
      value: contractCall.value  // Price in wei
    })
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

  // Step 6: Verify on-chain state
  console.log('STEP 6: Verify on-chain state');
  console.log('─'.repeat(50));

  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  const contract = new ethers.Contract(deployment.address, [
    'function ownerOf(uint256) view returns (address)',
    'function getListing(uint256) view returns (address seller, uint256 price, uint8 licenseType, bytes32 licenseHash, uint256 nonce, uint256 expiry, bool active)'
  ], provider);

  const newOwner = await contract.ownerOf(TOKEN_ID);
  const listing = await contract.getListing(TOKEN_ID);

  console.log(`Token #${TOKEN_ID}:`);
  console.log('  New owner:', newOwner);
  console.log('  Listing active:', listing.active);
  console.log('');

  if (newOwner.toLowerCase() === '0x90F79bf6EB2c4f870365E785982E1f101E93b906'.toLowerCase()) {
    console.log('✅ SUCCESS: Bob now owns the token!');
  } else {
    console.log('❌ FAILED: Ownership did not transfer');
  }

  if (!listing.active) {
    console.log('✅ SUCCESS: Listing is now inactive');
  } else {
    console.log('❌ FAILED: Listing is still active');
  }
}

buyToken().catch(e => console.error('Error:', e));
