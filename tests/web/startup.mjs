import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBrowser} from '../../web/src/startup.js';
import {downloadModelBytes} from '../../web/src/model-download.js';

test('fresh visit claims the page and reloads before photo selection', async () => {
  const listeners = new Set(); let reloads = 0;
  const serviceWorker = {
    controller: null,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    async register() {
      this.controller = {scriptURL: 'https://example.test/sw.js'};
      for (const listener of listeners) listener();
    },
  };
  const options = {isolated: () => false, secure: true, serviceWorker, reload: () => reloads++};
  assert.equal(await prepareBrowser(options), 'reloading');
  assert.equal(reloads, 1); assert.equal(listeners.size, 0);
  await assert.rejects(prepareBrowser(options), /BROWSER_SETUP_UNAVAILABLE/);
  assert.equal(reloads, 1, 'unsupported isolation cannot loop');
  assert.equal(await prepareBrowser({...options, isolated: () => true}), 'ready');
});

test('failed setup times out, removes listeners and does not reload', async () => {
  const listeners = new Set();
  await assert.rejects(prepareBrowser({isolated: () => false, secure: true, timeoutMs: 10,
    reload: () => assert.fail('must not reload'), serviceWorker: {controller: null,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
      register: async () => {},
    }}), /BROWSER_SETUP_TIMEOUT/);
  assert.equal(listeners.size, 0);
});

test('preparation and conversion share a download; failure permits retry', async () => {
  const oldFetch = globalThis.fetch; let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; await new Promise(resolve => setTimeout(resolve, 5));
      return new Response(new Uint8Array([1, 2, 3]), {headers: {'content-length': '3'}}); };
    const progress = [];
    const [a, b] = await Promise.all([downloadModelBytes('https://test.invalid/runtime'),
      downloadModelBytes('https://test.invalid/runtime', {onProgress: p => progress.push(p)})]);
    assert.deepEqual(a, b); assert.equal(requests, 1); assert.ok(progress.some(p => p.complete));
    globalThis.fetch = async () => { throw Error('network unavailable'); };
    await assert.rejects(downloadModelBytes('https://test.invalid/retry'), /network unavailable/);
    globalThis.fetch = async () => new Response(new Uint8Array([4]), {headers: {'content-length': '1'}});
    assert.deepEqual(await downloadModelBytes('https://test.invalid/retry'), new Uint8Array([4]));
  } finally { globalThis.fetch = oldFetch; }
});
