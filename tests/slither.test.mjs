import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/slither/engine.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const { SlitherEngine, createSnake, RULES } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function setup(n = 2) {
  let seed = 17;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const snakes = new Map(Array.from({ length: n }, (_, i) => [String(i), createSnake({ id: String(i), name: `P${i}`, color: '#66f5c1', joinedAt: 0 })]));
  const game = new SlitherEngine(snakes, random); game.reset(); game.phase = 'playing';
  return { game, snakes: [...snakes.values()] };
}
function place(s, x, y, angle = 0) {
  s.angle = s.targetAngle = angle; s.shield = 0;
  s.segments = Array.from({ length: 26 }, (_, i) => ({ x: x - Math.cos(angle) * i * 5, y: y - Math.sin(angle) * i * 5 }));
}
test('compact for 2–4, expanded for 8; full food and bodies at start', () => {
  for (const n of [2, 4, 8]) {
    const { game, snakes } = setup(n);
    assert.equal(game.width, n <= 4 ? 1200 : 1600);
    assert.ok(game.food.length >= 180);
    for (const s of snakes) { assert.equal(s.segments.length, 26); assert.ok(s.shield > 0); }
  }
});
test('movement is time based and self crossing is safe', () => {
  const { game, snakes: [s] } = setup(1); place(s, 300, 300); game.food = [];
  for (let i = 0; i < 60; i++) game.step(1 / 60);
  assert.ok(Math.abs(s.segments[0].x - 412) < 0.001); assert.equal(s.isDead, false);
});
test('food grows body and banks points; boost burns length but never points', () => {
  const { game, snakes: [s] } = setup(1); place(s, 300, 300);
  game.food = [{ x: 302, y: 300, value: 5, color: '#fff', phase: 0 }]; game.step(1 / 60);
  assert.equal(s.bank, 25); assert.equal(s.targetLength, 31);
  game.food = []; s.isBoosting = true; const before = s.segments[0].x; game.step(1 / 60);
  assert.ok(s.targetLength < 31); assert.equal(s.bank, 25); assert.ok(s.segments[0].x - before > 3);
});
test('head on collision kills both regardless of insertion order', () => {
  for (const reverse of [false, true]) {
    const { game, snakes: [a, b] } = setup(); place(a, 400, 300); place(b, 416, 300, Math.PI);
    if (reverse) game.snakes = new Map([...game.snakes].reverse());
    game.step(1 / 60); assert.ok(a.isDead && b.isDead); assert.equal(a.kills + b.kills, 0);
  }
});
test('body cutoff awards kill, drops food, and respawn preserves bank', () => {
  const { game, snakes: [a, b] } = setup(); place(a, 400, 300); place(b, 450, 300, -Math.PI / 2);
  // A is hitting the middle of B, whose head is safely far away.
  place(b, 402, 230, -Math.PI / 2); a.bank = 50;
  game.step(1 / 60); assert.ok(a.isDead); assert.equal(b.kills, 1); assert.ok(b.bank >= 100);
  game.respawn(a.player.id); assert.ok(a.isDead);
  game.time += 2; game.respawn(a.player.id); assert.equal(a.isDead, false); assert.equal(a.bank, 50); assert.ok(a.shield > 0);
});
test('walls kill, shield protects, and round ends without further movement', () => {
  const { game, snakes: [s] } = setup(1); place(s, 1190, 300); game.step(1 / 60); assert.ok(s.isDead);
  game.time += 2; game.respawn(s.player.id); place(s, 1190, 300); s.shield = 2;
  game.step(1 / 60); assert.equal(s.isDead, false);
  game.remaining = 0.001; game.step(1 / 60); assert.equal(game.phase, 'finished');
  const x = s.segments[0].x; game.step(1 / 60); assert.equal(s.segments[0].x, x);
  game.reset(); assert.equal(game.phase, 'countdown'); assert.equal(s.bank, 0); assert.equal(game.remaining, RULES.duration);
});
test('eight-player full round stays finite and bounded', () => {
  const { game, snakes } = setup(8);
  for (let frame = 0; frame < 10810; frame++) {
    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i]; if (s.isDead) game.respawn(s.player.id);
      s.targetAngle = frame / 100 + i; s.isBoosting = frame % 180 < 30;
    }
    game.step(1 / 60);
  }
  assert.equal(game.phase, 'finished'); assert.ok(game.food.length <= 650); assert.ok(game.particles.length <= 300);
  for (const s of snakes) { assert.ok(s.segments.length <= 240); assert.ok(s.segments.every(p => Number.isFinite(p.x + p.y))); }
});
