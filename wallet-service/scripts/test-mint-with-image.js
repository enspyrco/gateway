const fs = require('fs');
const path = require('path');

async function mintWithImage() {
  console.log('=== Mint Token with Image ===\n');

  // Step 1: Select Alice's account
  console.log('STEP 1: Connect as Alice');
  const selectRes = await fetch('http://localhost:3001/api/accounts/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' })
  });
  const { sessionId } = await selectRes.json();
  console.log('Session:', sessionId);

  // Step 2: Get auth token
  const authRes = await fetch('http://localhost:3001/api/auth/token', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId }
  });
  const { token } = await authRes.json();
  console.log('Auth token obtained\n');

  // Step 3: Create a test PNG image (256x256 gradient)
  console.log('STEP 2: Creating test image (256x256)');
  const sharp = require('sharp');

  // Create a 256x256 gradient image
  const width = 256;
  const height = 256;
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      pixels[idx] = Math.floor(x * 255 / width);     // R gradient
      pixels[idx + 1] = Math.floor(y * 255 / height); // G gradient
      pixels[idx + 2] = 128;                          // B constant
    }
  }

  const imageBuffer = await sharp(pixels, { raw: { width, height, channels } })
    .png()
    .toBuffer();
  console.log(`Image size: ${imageBuffer.length} bytes\n`);

  // Step 4: Mint via backend API
  console.log('STEP 3: Mint via backend API');
  const formData = new FormData();
  formData.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'test-art.png');
  formData.append('name', 'Test Artwork');
  formData.append('description', 'A test NFT with an actual image');

  const mintRes = await fetch('http://localhost:3000/api/mint', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const mintResult = await mintRes.json();
  console.log('Status:', mintRes.status);
  console.log('Result:', JSON.stringify(mintResult, null, 2));

  if (mintResult.success) {
    console.log('\n✅ Token minted successfully!');
    console.log(`   Token ID: ${mintResult.tokenId}`);
    console.log(`   Preview: ${mintResult.previewUrl || 'N/A'}`);
  } else {
    console.log('\n❌ Mint failed:', mintResult.error);
  }
}

mintWithImage().catch(e => console.error('Error:', e));
