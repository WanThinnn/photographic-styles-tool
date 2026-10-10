import {discoverHeic} from '../core/heif.js';
import {imageFormat} from './image-format.js';
import {addTexture,repairTextureCurve} from '../styles/texture.js';
import {patch} from '../styles/port.js';
import {describeHeic} from '../ui/result-metadata.js';
import {installSoftSkin} from '../styles/soft-skin-container.js';
import {registerTmapHdr} from '../styles/hdr-compatibility.js';

function keepEditableHdr(output,source,{headroom=false}={}){
  const fixed=registerTmapHdr(output.data||source,{headroom});
  if(fixed){output.data=fixed;output.report={...output.report,hdrCompatibility:'registered-existing-tmap'};}
  return output;
}

export async function executeJob(job, decode) {
  if (job.operation === 'read') {
    const bytes = new Uint8Array(await job.file.arrayBuffer());
    const format = imageFormat(bytes);
    return {bytes, format, discovery: format === 'heic' ? discoverHeic(bytes) : null};
  }
  if (job.operation === 'texture') return keepEditableHdr(addTexture(job.data,job.opts),job.data);
  if (job.operation === 'repair-texture') return keepEditableHdr(repairTextureCurve(job.data,job.opts),job.data);
  if (job.operation === 'metadata') return describeHeic(job.data);
  if (job.operation === 'soft-skin') return {data:installSoftSkin(job.data,job.people,job.opts)};
  if (job.operation === 'native-portrait') {
    const {restoreNativePortrait}=await import('../portrait/ai-portrait-export.js');
    const {nativePortraitBaseState}=await import('../portrait/ai-portrait-container.js');
    // Manual diagnostic confirmation or measured, separated sharp background
    // detail permits the adapter. Otherwise retain the legacy Photo+depth rule;
    // Photos feature flags never establish Portrait On/Off.
    const evidence=job.opts?.sharpBackgroundEvidence;
    const measuredSharp=evidence?.method==='native-background-detail-v1'
      &&Number.isInteger(evidence.detailedTiles)&&evidence.detailedTiles>=3
      &&Number.isInteger(evidence.farTiles)&&evidence.farTiles>=evidence.detailedTiles;
    if(job.opts?.portraitOffConfirmed!==true&&!measuredSharp&&nativePortraitBaseState(job.data)!=='legacy-photo-base')return {data:null};
    return keepEditableHdr(await restoreNativePortrait(job.data,job.opts?.template,{unblurredBase:true})||{data:null},job.data);
  }
  if (job.operation === 'patch') {
    const opts = {...job.opts};
    if (opts.decode) opts.decode = (_data, options) => decode(options);
    const output=await patch(job.data, job.profile, opts);
    // Preserve native Portrait resources. An incomplete exported capture may
    // already contain blurred pixels; adding reference rendering metadata
    // exposes controls that apply a second blur and cannot turn the first off.
    return keepEditableHdr(output,job.data,{headroom:['bright-palette70','portrait-standard'].includes(output.report.styleSelectionCompatibility)});
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
