let worker, nextId = 0;
const pending = new Map();
export function releaseHeicProcessor() {
  worker?.terminate(); worker = null;
  for (const call of pending.values()) { clearTimeout(call.timer); call.reject(Error('HEIC worker released')); }
  pending.clear();
}
function run(job, decode) {
  if (!worker) {
    worker = new Worker(new URL('./heic-worker.js', import.meta.url), {type: 'module'});
    worker.onerror = () => releaseHeicProcessor();
    worker.onmessage = async ({data: message}) => {
      const call = pending.get(message.id); if (!call) return;
      if (message.decodeId !== undefined) {
        const target = worker;
        try {
          const rgb = await call.decode(message.options);
          if (target === worker) target.postMessage({operation: 'decoded', decodeId: message.decodeId, rgb}, [rgb.buffer]);
        } catch (error) {
          if (target === worker) target.postMessage({operation: 'decoded', decodeId: message.decodeId, error: error.message});
        }
        return;
      }
      pending.delete(message.id); clearTimeout(call.timer);
      if (message.error) call.reject(Error(message.error)); else call.resolve(message.result);
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(releaseHeicProcessor, 180000);
    pending.set(id, {resolve, reject, timer, decode});
    try { worker.postMessage({...job, id}); }
    catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
  });
}
export const readImageFile = file => run({operation: 'read', file});
export const addTextureInWorker = (data, opts) => run({operation: 'texture', data, opts});
export const repairTextureInWorker = (data, opts) => run({operation:'repair-texture',data,opts});
export const describeInWorker = data => run({operation: 'metadata', data});
export const installSoftSkinInWorker = (data,people,opts) => run({operation:'soft-skin',data,people,opts});
export function patchInWorker(data, profile, opts = {}) {
  const {decode, ...settings} = opts;
  return run({operation: 'patch', data, profile, opts: {...settings, decode: Boolean(decode)}},
    decode ? options => decode(data, options) : undefined);
}
