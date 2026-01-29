import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');

// Small favicons - use favicon.svg (optimized for small sizes)
const faviconSizes = {
  'favicon-16x16.png': 16,
  'favicon-32x32.png': 32,
};

// Large icons - use icon.svg (full design with proper padding)
const iconSizes = {
  'icon-192x192.png': 192,
  'icon-512x512.png': 512,
  'apple-touch-icon.png': 180
};

// Generate small favicons from favicon.svg
for (const [filename, size] of Object.entries(faviconSizes)) {
  await sharp(join(publicDir, 'favicon.svg'))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, filename));
  console.log(`Generated ${filename}`);
}

// Generate large icons from icon.svg
for (const [filename, size] of Object.entries(iconSizes)) {
  await sharp(join(publicDir, 'icon.svg'))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, filename));
  console.log(`Generated ${filename}`);
}

console.log('Done!');
