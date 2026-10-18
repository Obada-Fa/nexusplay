import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/device.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2020 } }).outputText;
const { entryRoute, isControllerRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('phones and tablets join; desktop and touch laptops host without viewport guessing', () => {
  for (const ua of ['iPhone', 'iPad', 'Android', 'iPod']) assert.equal(entryRoute(ua, 1), '/join');
  assert.equal(entryRoute('Mozilla Macintosh Safari', 5), '/join');
  assert.equal(entryRoute('Mozilla Macintosh Safari', 0), '/host');
  assert.equal(entryRoute('Windows NT Chrome', 10), '/host');
  assert.equal(entryRoute('X11 Linux Chrome', 0), '/host');
});
test('server only redirects requests it can tell are phones or tablets', () => {
  const pixel = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';
  const galaxyTab = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
  const ipadOs = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15';
  for (const ua of [pixel, iphone, galaxyTab]) assert.equal(isControllerRequest(ua, null), true);
  assert.equal(isControllerRequest(windows, '?1'), true);
  assert.equal(isControllerRequest(windows, '?0'), false);
  assert.equal(isControllerRequest(ipadOs, null), false); // left to the client, which sees touch points
  assert.equal(isControllerRequest(null, null), false);
  assert.equal(entryRoute(ipadOs, 5), '/join');
});
