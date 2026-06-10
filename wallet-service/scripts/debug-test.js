const WALLET_SERVICE = 'http://localhost:3001';
const BACKEND_API = 'http://localhost:3000';

async function main() {
  // Get session
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

  // Prepare listing for token 0 (already minted)
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

  const data = await prepareRes.json();
  console.log('Backend response:');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
