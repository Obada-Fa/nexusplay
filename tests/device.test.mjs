import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/device.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2020 } }).outputText;
const { entryRoute } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('phones and tablets join; desktop and touch laptops host without viewport guessing', () => {
  for (const ua of ['iPhone', 'iPad', 'Android', 'iPod']) assert.equal(entryRoute(ua, 1), '/join');
  assert.equal(entryRoute('Mozilla Macintosh Safari', 5), '/join');
  assert.equal(entryRoute('Mozilla Macintosh Safari', 0), '/host');
  assert.equal(entryRoute('Windows NT Chrome', 10), '/host');
  assert.equal(entryRoute('X11 Linux Chrome', 0), '/host');
});
