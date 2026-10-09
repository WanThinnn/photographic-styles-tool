// Experimental relative disparity only; no fabricated camera calibration.
import {topBox, box, concat, be, bytesEqual} from './box.js';
import {discoverHeic, auxUriForItem, DEPTH_URI, extractItem, addItems, parseIloc, ispeBox, propertyBoxBytes,
  appendIpcoProperty,idatItemBytes} from './heif.js';
import {appleDepthAuxc,appleDepthXmp} from './apple-depth-metadata.js';

export function portraitEligibility(data) {
  const d = discoverHeic(data);
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

export function attachAiDepth(source, depth, {xmp=appleDepthXmp(depth),auxc=appleDepthAuxc(depth)}={}) {
  const d=discoverHeic(source);
  if ([...d.infos.keys()].some(id=>auxUriForItem(d.props,id)===DEPTH_URI)) throw Error('Existing depth must not be replaced');
  if (!depth.payload?.length || !depth.hvcc || depth.width<2 || depth.height<2) throw Error('Invalid encoded depth');
  const codec=topBox(depth.hvcc,'hvcC');
  if(!codec||codec.off!==0||codec.size!==depth.hvcc.length||codec.size-codec.hdr<23||depth.hvcc[codec.hdr]!==1)
    throw Error('Invalid depth HEVC configuration: expected one hvcC box');
  if(d.iloc.version!==1||d.iloc.offsetSize!==4||d.iloc.lengthSize!==4||d.iloc.baseOffsetSize!==0||d.iloc.indexSize!==0)
    throw Error('AI export does not support this extent layout');
  const m=topBox(source,'meta');
  let meta=source.slice(m.off,m.off+m.size);
  const payloads=new Map();
  const transforms=['irot','imir'].map(type=>propertyBoxBytes(source,d.props,d.primary,type)).filter(Boolean);
  const reuse=[];
  // Keep descriptive properties before transformative ones, like native HEIC.
  for(const [property,essential] of [[ispeBox(depth.width,depth.height),false],
    [box('pixi',new Uint8Array([0,0,0,0,1,8])),false],[auxc,true],[depth.hvcc,true],
    ...transforms.map(value=>[value,true])]) {
    let index;[meta,index]=appendIpcoProperty(meta,property);reuse.push([index,essential]);
  }
  let ids;
  [meta,ids]=addItems(meta,[{key:'ai-depth',itemType:'hvc1',reuse,
    refTo:[d.primary,...[...d.infos].filter(([,v])=>v.type==='tmap').map(([id])=>id)]}]);
  const id=ids.get('ai-depth');payloads.set(id,depth.payload);
  [meta,ids]=addItems(meta,[{key:'ai-xmp',itemType:'mime',contentType:'application/rdf+xml',refType:'cdsc',refTo:[id]}]);
  payloads.set(ids.get('ai-xmp'),xmp);
  const iloc=parseIloc(meta,topBox(meta,'meta')),chunks=[],delta=meta.length-m.size;
  const tail=source.subarray(m.off+m.size);
  let cursor=m.off+meta.length+tail.length+8;
  for(const [iid,item] of iloc.items) {
    if(item.constructionMethod!==0||!item.extents.length)continue;
    if(!payloads.has(iid)) {
      for(const extent of item.extents) {
        if(extent.offset<m.off+m.size)throw Error('AI export has payload before metadata');
        meta.set(be(extent.offset+delta,iloc.offsetSize),extent.offsetPos);
      }
      continue;
    }
    if(item.extents.length!==1)throw Error('AI export does not support this extent layout');
    const p=payloads.get(iid);
    meta.set(be(cursor,iloc.offsetSize),item.extents[0].offsetPos);
    meta.set(be(p.length,iloc.lengthSize),item.extents[0].lengthPos);
    cursor+=p.length;chunks.push(p);
  }
  if(cursor>=2**32)throw Error('AI export exceeds 32-bit offsets');
  const out=concat([source.subarray(0,m.off),meta,tail,box('mdat',concat(chunks))]);
  const check=discoverHeic(out);
  for(const [iid,p] of payloads)if(!bytesEqual(extractItem(out,check.iloc,iid),p))throw Error('AI export payload preservation failed');
  for(const [iid,item] of d.iloc.items) {
    const read=(data,graph)=>item.constructionMethod===0?extractItem(data,graph.iloc,iid):idatItemBytes(data,iid,graph.meta);
    if(!bytesEqual(read(source,d),read(out,check)))throw Error('AI export changed an original payload');
  }
  return out;
}
