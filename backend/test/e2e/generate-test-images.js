/**
 * Generate unique test images for marketplace simulation
 * Creates 100 unique images with different colors/patterns
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTPUT_DIR = process.env.HOME + '/Desktop/Photos/nfts';
const NUM_IMAGES = 100;

async function generateImage(index) {
  // Create unique color based on index
  const hue = (index * 37) % 360;  // Golden angle for good distribution
  const saturation = 60 + (index % 40);
  const lightness = 40 + (index % 30);

  // Add random noise to ensure uniqueness
  const noise = crypto.randomBytes(4).toString('hex');

  // Create SVG with unique pattern
  const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad${index}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:hsl(${hue},${saturation}%,${lightness}%)" />
          <stop offset="100%" style="stop-color:hsl(${(hue + 60) % 360},${saturation}%,${lightness + 20}%)" />
        </linearGradient>
        <pattern id="pattern${index}" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="${10 + (index % 10)}" fill="rgba(255,255,255,0.1)"/>
        </pattern>
      </defs>
      <rect width="800" height="800" fill="url(#grad${index})"/>
      <rect width="800" height="800" fill="url(#pattern${index})"/>
      <text x="400" y="380" text-anchor="middle" font-family="Arial" font-size="48" fill="white" opacity="0.8">Test NFT</text>
      <text x="400" y="440" text-anchor="middle" font-family="monospace" font-size="32" fill="white" opacity="0.6">#${String(index).padStart(3, '0')}</text>
      <text x="400" y="500" text-anchor="middle" font-family="monospace" font-size="16" fill="white" opacity="0.4">${noise}</text>
    </svg>
  `;

  const filename = `test-${String(index).padStart(3, '0')}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);

  await sharp(Buffer.from(svg))
    .png()
    .toFile(filepath);

  return filename;
}

async function main() {
  console.log(`Generating ${NUM_IMAGES} test images in ${OUTPUT_DIR}...`);

  // Ensure directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (let i = 0; i < NUM_IMAGES; i++) {
    const filename = await generateImage(i);
    if ((i + 1) % 10 === 0) {
      console.log(`  Generated ${i + 1}/${NUM_IMAGES}`);
    }
  }

  console.log(`Done! Generated ${NUM_IMAGES} unique test images.`);

  // Count total images now
  const total = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png') || f.endsWith('.jpg')).length;
  console.log(`Total images in folder: ${total}`);
}

main().catch(console.error);
