import {parseBplist, buildBplist} from '../core/bplist.js';

// The legacy v14 missing-curve fix was device-tested on iOS 18.2. The reported
// v13 telephoto capture has the same missing field when Texture is added.
// Add only the neutral curve; retain native version, flags, coefficients, maps
// and statistics. v13 is the sole exception to native byte-preservation here;
// do not widen that exception to other contracts without device evidence.
export function ensureLegacyTextureToneCurve(blob, {preserveStyles = false} = {}) {
  let styles, version;
  try {
    styles = parseBplist(blob, {preserveReals:true});
    version = styles.get('0');
  } catch (error) {
    // The old native route did not parse Styles here. An unreadable/opaque
    // contract does not authorize a repair or a new processing rejection.
    if (!preserveStyles) throw error;
    return {data:blob, added:false};
  }
  if ((version !== 13 && version !== 14) || styles.has('3')
      || (preserveStyles && version !== 13)) return {data:blob, added:false};
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
