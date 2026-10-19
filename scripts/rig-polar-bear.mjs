import sharp from 'sharp';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Bake the puppet weight maps that sit beside the atlas, cell for cell:
//   R  scarf recolour weight (cyan scarf pixels, not the navy saddle)
//   G  scarf flutter weight (blurred scarf, strongest on the tails away from the knot)
//   B  signed leg weight, 128 = still, >128 front/right legs, <128 back/left legs
const atlasPath = fileURLToPath(new URL('../public/games/polar/bear-atlas-v1.webp', import.meta.url));
const target = fileURLToPath(new URL('../public/games/polar/bear-rig-v1.png', import.meta.url));
const debug = process.argv.includes('--debug');
const spriteSource = ts.transpileModule(readFileSync(new URL('../src/lib/polar/bear-sprite.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2020 },
}).outputText;
const { BEAR_RIG } = await import(`data:text/javascript;base64,${Buffer.from(spriteSource).toString('base64')}`);

const { data, info } = await sharp(atlasPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = 256;
const out = Buffer.alloc(W * H * 3);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx / 255];
};
// Two box passes approximate a gaussian; enough to let the tails grow past their edge.
const blur = (src, radius) => {
  let a = src;
  for (let pass = 0; pass < 2; pass++) for (const horizontal of [true, false]) {
    const b = new Float32Array(C * C);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      let sum = 0, n = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= C || yy >= C) continue;
        sum += a[yy * C + xx]; n++;
      }
      b[y * C + x] = sum / n;
    }
    a = b;
  }
  return a;
};
const legLength = [56, 56, 56, 40, 54, 52];

for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
  const [hx, hy, hr] = BEAR_RIG[row * 6 + col];
  const scarf = new Float32Array(C * C);
  let floor = 0;
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const i = ((row * C + y) * W + col * C + x) * 4;
    if (data[i + 3] < 8) continue;
    if (data[i + 3] > 128) floor = Math.max(floor, y);
    const [h, s, v] = hsv(data[i], data[i + 1], data[i + 2]);
    scarf[y * C + x] = smooth(182, 192, h) * (1 - smooth(214, 222, h)) * smooth(0.18, 0.42, s)
      * Math.max(smooth(0.38, 0.52, v), smooth(0.84, 0.93, s));
  }
  // Leg split: centre of the paws decides which side of the body swings forward.
  let sx = 0, n = 0;
  for (let y = floor - 30; y <= floor; y++) for (let x = 0; x < C; x++) {
    if (data[((row * C + y) * W + col * C + x) * 4 + 3] > 128) { sx += x; n++; }
  }
  const cx = sx / n, legTop = floor - legLength[col];
  const flutter = blur(scarf, 4);
  const knot = [hx, hy + hr * 0.85];
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const o = ((row * C + y) * W + col * C + x) * 3;
    const away = smooth(hr * 0.45, hr * 1.5, Math.hypot(x - knot[0], y - knot[1]));
    const leg = smooth(legTop, legTop + 26, y) * Math.max(-1, Math.min(1, (x - cx) / 22));
    out[o] = Math.round(scarf[y * C + x] * 255);
    out[o + 1] = Math.round(Math.min(1, flutter[y * C + x] * 1.7) * away * 255);
    out[o + 2] = Math.round(128 + leg * 127);
  }
}

await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toFile(target);
console.log(`Baked rig maps: ${target}`);

if (debug) {
  // Atlas tinted by the maps, with head circles and eye marks, for checking anchors.
  const view = Buffer.alloc(W * H * 3);
  for (let i = 0, j = 0; i < W * H * 4; i += 4, j += 3) {
    const a = data[i + 3] / 255, g = (data[i] * 0.3 + data[i + 1] * 0.5 + data[i + 2] * 0.2) * a + 40 * (1 - a);
    view[j] = Math.min(255, g * 0.6 + out[j] * 0.7);
    view[j + 1] = Math.min(255, g * 0.6 + out[j + 1] * 0.7);
    view[j + 2] = Math.min(255, g * 0.6 + Math.abs(out[j + 2] - 128) * 1.4);
  }
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  BEAR_RIG.forEach((r, k) => {
    const ox = (k % 6) * C, oy = Math.floor(k / 6) * C;
    svg += `<circle cx="${ox + r[0]}" cy="${oy + r[1]}" r="${r[2]}" fill="none" stroke="#ff0" stroke-width="1.5"/>`;
    for (let e = 3; e + 1 < r.length; e += 2) svg += `<circle cx="${ox + r[e]}" cy="${oy + r[e + 1]}" r="5.5" fill="none" stroke="#f0f" stroke-width="1.5"/>`;
  });
  svg += '</svg>';
  const file = process.argv[process.argv.indexOf('--debug') + 1] ?? 'rig-debug.png';
  await sharp(view, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toFile(file);
  console.log(`Debug view: ${file}`);
}
