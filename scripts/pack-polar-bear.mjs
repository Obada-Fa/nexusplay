import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Slice the cleaned 6x5 artwork without changing its colors or alpha.
const source = fileURLToPath(new URL('../assets/polar/bear-source.png', import.meta.url));
const target = fileURLToPath(new URL('../public/games/polar/bear-atlas-v1.webp', import.meta.url));
const rows = [0, 229, 458, 687, 916, 1145];
const columns = Array.from({ length: 5 }, () => [0, 229, 458, 687, 916, 1145, 1374]);
const overlays = [];
for (let row = 0; row < 5; row++) {
  for (let column = 0; column < 6; column++) {
    const left = columns[row][column], top = rows[row];
    const width = columns[row][column + 1] - left, height = rows[row + 1] - top;
    const { data, info } = await sharp(source).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
    let x0 = width, x1 = 0, y0 = height, y1 = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * info.channels + 3] < 128) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 <= x0 || y1 <= y0) throw new Error(`Empty sprite ${row},${column}`);
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
    x1 = Math.min(width - 1, x1 + 2); y1 = Math.min(height - 1, y1 + 2);
    // Fixed baseline and comparable body scale remove the source sheet's jitter.
    const targetHeight = column === 5 ? 214 : column === 3 ? 133 : 166;
    const { data: input, info: resized } = await sharp(source)
      .extract({ left: left + x0, top: top + y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
      .resize({ width: 242, height: targetHeight, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
    overlays.push({ input, left: column * 256 + Math.round((256 - resized.width) / 2), top: row * 256 + 240 - resized.height });
  }
}
await sharp({ create: { width: 1536, height: 1280, channels: 4, background: '#00000000' } })
  .composite(overlays).webp({ quality: 92, alphaQuality: 100 }).toFile(target);
console.log(`Packed 30 sprites: ${target}`);
