import {parseBplist, buildBplist} from '../core/bplist.js';

// Device-tested on legacy iOS 18.2 native Styles: a missing tone curve makes
// Glow/Film render black and Soft Skin ineffective. Add only the neutral curve;
// retain the native version, flags, coefficients, maps and scene statistics.
export function ensureLegacyTextureToneCurve(blob) {
  const styles = parseBplist(blob, {preserveReals:true});
  if (styles.get('0') !== 14 || styles.has('3')) return {data:blob, added:false};
  const curve = new Uint8Array(516);
  curve.set([1,1,0,0]);
  const view = new DataView(curve.buffer);
  for (let i=0;i<256;i++) view.setUint16(4+i*2, i*257, true);
  styles.set('3',curve);
  const data = buildBplist(styles);
  // The compatibility change must not silently alter another native field.
  const before = parseBplist(blob), after = parseBplist(data);
  after.delete('3');
  const same = (a,b) => {
    if(a instanceof Uint8Array)return b instanceof Uint8Array && a.length===b.length && a.every((v,i)=>v===b[i]);
    if(a instanceof Map)return b instanceof Map && a.size===b.size && [...a].every(([k,v])=>b.has(k)&&same(v,b.get(k)));
    if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
    return Object.is(a,b);
  };
  if(!same(before,after))throw Error('Texture tone curve self-check failed');
  return {data,added:true};
}
