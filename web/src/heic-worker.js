import {discoverHeic} from './heif.js';
import {imageFormat} from './image-format.js';
import {addTexture,repairTextureCurve} from './texture.js';
import {patch} from './port.js';
import {describeHeic} from './result-metadata.js';

export async function executeJob(job, decode) {
  if (job.operation === 'read') {
    const bytes = new Uint8Array(await job.file.arrayBuffer());
    const format = imageFormat(bytes);
    return {bytes, format, discovery: format === 'heic' ? discoverHeic(bytes) : null};
  }
  if (job.operation === 'texture') return addTexture(job.data);
  if (job.operation === 'repair-texture') return repairTextureCurve(job.data);
  if (job.operation === 'metadata') return describeHeic(job.data);
  if (job.operation === 'patch') {
    const opts = {...job.opts};
    if (opts.decode) opts.decode = (_data, options) => decode(options);
    return patch(job.data, job.profile, opts);
  }
  throw Error('Unknown HEIC operation');
}

// The DOM-based decoder remains in the page. Only sampled RGB is returned to
// the worker; metadata, statistics, graph rebuilding and self-checks run here.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  let decodeId = 0;
  const decodes = new Map();
  self.onmessage = async ({data: message}) => {
    if (message.operation === 'decoded') {
      const call = decodes.get(message.decodeId);
      if (!call) return;
      decodes.delete(message.decodeId);
      if (message.error) call.reject(Error(message.error)); else call.resolve(message.rgb);
      return;
    }
    const decode = options => new Promise((resolve, reject) => {
      const key = ++decodeId; decodes.set(key, {resolve, reject});
      self.postMessage({id: message.id, decodeId: key, options});
    });
    try {
      const result = await executeJob(message, decode);
      const bytes = result.data || result.bytes;
      self.postMessage({id: message.id, result}, bytes instanceof Uint8Array ? [bytes.buffer] : []);
    } catch (error) {
      self.postMessage({id: message.id, error: error.message});
    }
  };
}
