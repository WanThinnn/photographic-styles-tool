// Experimental relative disparity only; no fabricated camera calibration.
import {topBox, box, concat, be, bytesEqual} from './box.js';
import {discoverHeic, auxUriForItem, DEPTH_URI, extractItem, addItems, parseIloc, ispeBox, propertyBoxBytes} from './heif.js';

export function portraitEligibility(data) {
  const d = discoverHeic(data);
  if (d.stylesItem !== null) return 'native-styles';
  if ([...d.infos.keys()].some(id => auxUriForItem(d.props,id) === DEPTH_URI)) return 'existing-depth';
  return null;
}

export function normalizeDisparity(values) {
  let min=Infinity,max=-Infinity;
  for(const v of values) { if(!Number.isFinite(v)) throw Error('Invalid AI depth'); min=Math.min(min,v);max=Math.max(max,v); }
  if (!(max>min)) throw Error('AI returned a flat depth map');
  // This relative inverse-depth model already puts nearer surfaces at larger values.
  return Uint8Array.from(values,v=>Math.round(255*(v-min)/(max-min)));
}

export function inferenceGeometry(width,height) {
  if(!(width>0&&height>0))throw Error('Invalid source geometry');
  const scale=518/Math.max(width,height);
  return {width:Math.max(14,Math.round(width*scale/14)*14),height:Math.max(14,Math.round(height*scale/14)*14)};
}

export function attachAiDepth(source, depth) {
  const d=discoverHeic(source);
  if ([...d.infos.keys()].some(id=>auxUriForItem(d.props,id)===DEPTH_URI)) throw Error('Existing depth must not be replaced');
  if (!depth.payload?.length || !depth.hvcc || depth.width<2 || depth.height<2) throw Error('Invalid encoded depth');
  const m=topBox(source,'meta'),f=topBox(source,'ftyp');
  let meta=source.slice(m.off,m.off+m.size);
  const payloads=new Map([...d.iloc.items].filter(([,v])=>v.constructionMethod===0&&v.extents.length).map(([id])=>[id,extractItem(source,d.iloc,id)]));
  const transforms=['irot','imir'].map(type=>propertyBoxBytes(source,d.props,d.primary,type)).filter(Boolean);
  let ids;
  [meta,ids]=addItems(meta,[{key:'ai-depth',itemType:'hvc1',uri:DEPTH_URI,
    boxes:[ispeBox(depth.width,depth.height),box('pixi',new Uint8Array([0,0,0,0,1,8])),depth.hvcc,...transforms],
    refTo:[d.primary,...[...d.infos].filter(([,v])=>v.type==='tmap').map(([id])=>id)]}]);
  const id=ids.get('ai-depth');payloads.set(id,depth.payload);
  const xmp=new TextEncoder().encode(`<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:depthData="http://ns.apple.com/depthData/1.0/" xmlns:GDepth="http://ns.google.com/photos/1.0/depthmap/" xmlns:elio="https://wanthinnn.github.io/photographic-styles-tool/ai/" depthData:FloatMin="0" depthData:FloatMax="1" GDepth:Format="RangeInverse" elio:Source="Depth-Anything-V2-Small" elio:Units="relative"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`);
  [meta,ids]=addItems(meta,[{key:'ai-xmp',itemType:'mime',contentType:'application/rdf+xml',refType:'cdsc',refTo:[id]}]);
  payloads.set(ids.get('ai-xmp'),xmp);
  const iloc=parseIloc(meta,topBox(meta,'meta')),chunks=[];
  let cursor=f.size+meta.length+8;
  for(const [iid,item] of iloc.items) {
    if(item.constructionMethod!==0||!item.extents.length)continue;
    if(item.baseOffset!==0||item.extents.length!==1) throw Error('AI export does not support this extent layout');
    const p=payloads.get(iid);if(!p)throw Error('Missing AI export payload');
    meta.set(be(cursor,iloc.offsetSize),item.extents[0].offsetPos);
    meta.set(be(p.length,iloc.lengthSize),item.extents[0].lengthPos);
    cursor+=p.length;chunks.push(p);
  }
  if(cursor>=2**32)throw Error('AI export exceeds 32-bit offsets');
  const out=concat([source.slice(f.off,f.off+f.size),meta,box('mdat',concat(chunks))]);
  const check=discoverHeic(out);
  for(const [iid,p] of payloads)if(!bytesEqual(extractItem(out,check.iloc,iid),p))throw Error('AI export payload preservation failed');
  return out;
}
