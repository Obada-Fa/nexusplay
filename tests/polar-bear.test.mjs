import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/polar/bear-sprite.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2020 },
}).outputText;
const { bearSpriteFrame, drawBearSprite } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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
