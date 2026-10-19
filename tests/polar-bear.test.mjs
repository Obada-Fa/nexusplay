import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/polar/bear-sprite.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2020 },
}).outputText;
const { bearSpriteFrame, drawBearSprite, BEAR_RIG, scarfTint, recolorScarf } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const pose = { face: 0, speed: 0, gait: 0, dash: 0, stun: 0, fall: 0, celebrate: false, power: false, color: '#4db8ff', slot: 0, t: 0 };

test('movement headings select front, side and rear art, mirroring only left views', () => {
  const directions = [[0, 2, false], [45, 1, false], [90, 0, false], [135, 1, true], [180, 2, true], [225, 3, true], [270, 4, false], [315, 3, false]];
  for (const [degrees, row, flip] of directions) {
    for (const turns of [-2, 0, 3]) {
      assert.deepEqual(bearSpriteFrame({ ...pose, face: degrees * Math.PI / 180 + turns * Math.PI * 2 }), { row, column: 0, flip });
    }
  }
});

test('fall and hit interrupt movement; victory and dash have distinct art', () => {
  assert.equal(bearSpriteFrame({ ...pose, speed: 160 }).column, 1);
  assert.equal(bearSpriteFrame({ ...pose, speed: 160, gait: Math.PI }).column, 2);
  assert.equal(bearSpriteFrame({ ...pose, dash: 1 }).column, 3);
  assert.equal(bearSpriteFrame({ ...pose, dash: 1, stun: 1 }).column, 4);
  assert.equal(bearSpriteFrame({ ...pose, celebrate: true }).column, 5);
  assert.equal(bearSpriteFrame({ ...pose, celebrate: true, fall: 0.2 }).column, 4);
});

test('browser image absence preserves the fallback without touching the canvas', () => {
  assert.equal(drawBearSprite(null, 0, 0, 1, pose), false);
});

test('runtime atlas has 30 populated, transparent cells and no content at cell borders', async () => {
  const { data, info } = await sharp(new URL('../public/games/polar/bear-atlas-v1.webp', import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1536);
  assert.equal(info.height, 1280);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
    let count = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const alpha = data[((row * 256 + y) * info.width + col * 256 + x) * 4 + 3];
      if (alpha > 128) count++;
      if (x === 0 || x === 255 || y === 0 || y === 255) assert.ok(alpha < 16, `Clipped cell ${row},${col} at ${x},${y}`);
    }
    assert.ok(count > 5000, `Empty cell ${row},${col}`);
    assert.ok(count < 50000, `Opaque background in ${row},${col}`);
  }
});

test('scarf recolour moves cyan onto each team hue and leaves unmasked pixels alone', () => {
  const cyan = [0.12, 0.55, 0.95];
  const hue = ([r, g, b]) => {
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    return (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  };
  for (const [color, expected] of [['#ff5d5d', 0], ['#ffd23f', 47], ['#5ee07a', 133], ['#4db8ff', 202]]) {
    const out = recolorScarf(cyan, 1, scarfTint(color));
    assert.ok(Math.abs(((hue(out) - expected + 540) % 360) - 180) < 4, `${color} -> ${out}`);
  }
  assert.deepEqual(recolorScarf(cyan, 0, scarfTint('#ff5d5d')), cyan);
  const half = recolorScarf(cyan, 0.5, scarfTint('#ff5d5d'));
  assert.ok(half[0] > cyan[0] && half[2] < cyan[2]);
});

test('puppet anchors keep heads and blinking eyes inside their cells', () => {
  assert.equal(BEAR_RIG.length, 30);
  for (const [k, [hx, hy, hr, ...eyes]] of BEAR_RIG.entries()) {
    assert.ok(hr >= 20 && hx - hr > 0 && hx + hr < 256 && hy - hr > 0 && hy + hr < 256, `head ${k}`);
    assert.equal(eyes.length % 2, 0);
    for (let e = 0; e < eyes.length; e += 2) assert.ok(Math.hypot(eyes[e] - hx, eyes[e + 1] - hy) < hr, `eye ${k}`);
  }
});

test('rig maps match the atlas: scarf in every pose, saddle excluded, legs neutral up top', async () => {
  const rig = await sharp(new URL('../public/games/polar/bear-rig-v1.png', import.meta.url).pathname).raw().toBuffer({ resolveWithObject: true });
  const atlas = await sharp(new URL('../public/games/polar/bear-atlas-v1.webp', import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(rig.info.width, 1536);
  assert.equal(rig.info.height, 1280);
  const ch = rig.info.channels;
  for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
    let scarf = 0, navy = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (row * 256 + y) * 1536 + col * 256 + x;
      const [r, g, b] = [atlas.data[i * 4], atlas.data[i * 4 + 1], atlas.data[i * 4 + 2]];
      if (rig.data[i * ch] > 200) scarf++;
      // The navy saddle is a dark, muted blue (scarf folds are dark but fully saturated).
      const mx = Math.max(r, g, b), sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
      if (atlas.data[i * 4 + 3] > 200 && b > r + 30 && mx < 95 && sat < 0.8 && rig.data[i * ch] > 64) navy++;
      if (y < 120) assert.equal(rig.data[i * ch + 2], 128, `leg weight above legs in ${row},${col}`);
    }
    assert.ok(scarf > 800, `scarf ${row},${col}: ${scarf}`);
    assert.ok(navy < 20, `saddle tinted in ${row},${col}: ${navy}`);
  }
});
