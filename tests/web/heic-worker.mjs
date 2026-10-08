import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import {addTexture} from '../../web/src/texture.js';
import {patch} from '../../web/src/port.js';
import {loadProfile} from '../../web/src/zip.js';
import {discoverHeic, extractItem, propertyBoxBytes} from '../../web/src/heif.js';
const directory = 'C:/Users/WanThinnn/Downloads/iCloud Photos/iCloud Photos/';
const moduleUrl = new URL('../../web/src/heic-worker.js', import.meta.url).href;
function job(payload) {
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');
    parentPort.on('message',async job=>{try{const {executeJob}=await import(${JSON.stringify(moduleUrl)});
      const result=await executeJob(job,async req=>new Uint8Array(req.width*req.height*3).fill(128));
      parentPort.postMessage({result},[result.data.buffer]);}catch(error){parentPort.postMessage({error:error.message});}});`, {eval: true});
  return new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('message', message => message.error ? reject(Error(message.error)) : resolve(message.result));
    worker.postMessage(payload);
  }).finally(() => worker.terminate());
}
test('worker preserves the native Texture output byte for byte', {skip: !fs.existsSync(directory+'IMG_0714.HEIC')}, async () => {
  const data = new Uint8Array(fs.readFileSync(directory+'IMG_0714.HEIC'));
  assert.deepEqual((await job({operation: 'texture', data})).data, addTexture(data).data);
});
const original = 'C:/Users/WanThinnn/Downloads/IMG_0548.HEIC';
test('worker rebuild matches the existing patch, including scene analysis', {skip: !fs.existsSync(original) || !fs.existsSync(directory+'IMG_0714.HEIC')}, async () => {
  const data = new Uint8Array(fs.readFileSync(original));
  const profile = await loadProfile(new Uint8Array(fs.readFileSync(new URL('../../web/profiles/48-12.zip', import.meta.url))));
  // Supply a valid encoded thumbnail fixture to compare graph writers, not encoders.
  const native = new Uint8Array(fs.readFileSync(directory+'IMG_0714.HEIC'));
  const d = discoverHeic(native), id = d.linearThumb;
  const linearThumb = {sample: extractItem(native, d.iloc, id),
    ...Object.fromEntries(['hvcC','ispe','pixi'].map(type => [type, propertyBoxBytes(native, d.props, id, type)]))};
  const opts = {experimental: true, sceneStats: 'target', lightMaps: 'target', decode: true, linearThumb};
  const result = await job({operation: 'patch', data, profile, opts});
  assert.equal(result.report.decoded, true);
  const direct = await patch(data, profile, {...opts, decode: async (_data, req) => new Uint8Array(req.width*req.height*3).fill(128)});
  assert.deepEqual(result.data, direct.data);
});
