// Opt-in native-compatible capture graph. All imagery/HDR comes from this photo.
import {topBox,boxes,box,concat,be,bytesEqual} from '../raster/box.js';
import {discoverHeic,extractItemData,parseIloc,replaceIdatItem,removeItems,setItemReference,
  appendIpcoProperty,setItemPropertyAssociations,addItems,propertyBoxBytes,auxUriForItem,
  dimensionsForItem,DEPTH_URI,MATTE_URIS,compactItemProperties} from '../raster/heif.js';
import {buildAppleStyleExif,preserveRasterExif,readExifOrientation} from '../raster/exif.js';
import {getMakerNoteBlob,extractAppleMakerNoteTag} from '../core/exif.js';
import {parseBplist} from '../core/bplist.js';
import {appleDepthAuxc} from './apple-depth-metadata.js';
import {portraitAssembler} from './ai-portrait-assembler.js';
import {styleCapabilities} from '../styles/style-capabilities.js';
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const xml=s=>new TextEncoder().encode(s);
let templatePromise;
async function loadTemplate(){
  templatePromise??=fetch(new URL('./portrait-template.json',import.meta.url)).then(async r=>{
    if(!r.ok)throw Error('Portrait metadata unavailable');return r.json();
  }).catch(e=>{templatePromise=null;throw e;});
  return templatePromise;
}
function makerBlob(template,sourceMarker,sourceExif){
  const little=template.makerLittle,write=(n,size)=>little?be(n,size).reverse():be(n,size);
  const entries=[],values=[];let cursor=20+12*template.maker.length;
  for(const tag of template.maker){
    let payload=decode(tag.payload),type=tag.type,count=tag.count;
    if(tag.id===0x54){
      // The completed input owns its selected preset and Tone/Colour pad. The
      // capture template's neutral marker is only for newly generated Styles.
      payload=sourceMarker.payload.slice();type=sourceMarker.type;count=payload.length;
    }
    // Source HDR headroom is independent of the capture template.
    if([0x21,0x30].includes(tag.id)){
      try{
        const own=extractAppleMakerNoteTag(sourceExif,tag.id),mn=getMakerNoteBlob(sourceExif);
        if(![5,10].includes(own.type)||own.payload.length!==8)throw Error('Invalid HDR rational');
        payload=own.payload.slice();type=own.type;count=1;
        if((String.fromCharCode(mn[12],mn[13])==='II')!==little)
          payload=concat([payload.slice(0,4).reverse(),payload.slice(4,8).reverse()]);
      }catch{payload=concat([write(1,4),write(1,4)]);count=1;}
    }
    if(tag.id===0x1f){payload=write(1,4);count=1;} // User explicitly enabled AI Portrait.
    entries.push(concat([write(tag.id,2),write(type,2),write(count,4),
      payload.length<=4?concat([payload,new Uint8Array(4-payload.length)]):write(cursor,4)]));
    if(payload.length>4){values.push(payload);cursor+=payload.length;}
  }
  return concat([xml('Apple iOS'),new Uint8Array([0,0,1]),xml(little?'II':'MM'),write(entries.length,2),
    ...entries,write(0,4),...values]);
}
// Replace the outer MakerNote while retaining source camera/date/GPS TIFF offsets.
function replaceMaker(exif,maker){
  const start=new DataView(exif.buffer,exif.byteOffset,4).getUint32(0)+4,t=exif.subarray(start);
  const little=String.fromCharCode(t[0],t[1])==='II',v=new DataView(t.buffer,t.byteOffset,t.byteLength);
  const root=v.getUint32(4,little);let sub;
  for(let i=0;i<v.getUint16(root,little);i++){const p=root+2+12*i;if(v.getUint16(p,little)===0x8769)sub=v.getUint32(p+8,little);}
  if(sub===undefined)throw Error('Portrait Exif missing sub-IFD');
  const out=concat([exif,maker]),view=new DataView(out.buffer);
  for(let i=0;i<v.getUint16(sub,little);i++){const p=sub+2+12*i;if(v.getUint16(p,little)!==0x927c)continue;
    view.setUint16(start+p+2,7,little);view.setUint32(start+p+4,maker.length,little);view.setUint32(start+p+8,t.length,little);return out;}
  throw Error('Portrait Exif missing MakerNote');
}
function assemble(meta,payloads,ftyp){
  const iloc=parseIloc(meta,topBox(meta,'meta'));let cursor=ftyp.length+meta.length+8;const chunks=[];
  for(const[id,item]of iloc.items){
    if(item.constructionMethod===1)continue;
    if(item.constructionMethod!==0||item.baseOffset!==0||item.extents.length!==1)throw Error('Unsupported Portrait item layout');
    const p=payloads.get(id);if(!p?.length)throw Error(`Missing Portrait resource ${id}`);
    const e=item.extents[0];meta.set(be(cursor,iloc.offsetSize),e.offsetPos);meta.set(be(p.length,iloc.lengthSize),e.lengthPos);
    cursor+=p.length;chunks.push(p);
  }
  if(cursor>=2**32)throw Error('Portrait output exceeds size limit');
  return concat([ftyp,meta,box('mdat',concat(chunks))]);
}
/** Pure assembly seam, also used by regression tests. No decode/re-encode. */
export function buildAiPortrait(source,depth,template,{focusX=.5,focusY=.5,aperture=4.5}={}){
  if(!styleCapabilities(source).editable)throw Error('Unsupported Styles schema for Portrait');
  const d=discoverHeic(source);
  if([...d.infos.keys()].some(id=>auxUriForItem(d.props,id)===DEPTH_URI))throw Error('Existing depth must not be replaced');
  if(!d.stylesItem||!d.deltaGrid||!d.linearThumb)throw Error('Portrait requires the completed Styles graph');
  let meta=decode(template.meta),reference=discoverHeic(meta);
  const payloads=new Map(),mapping=new Map(),copied=new Map(),removed=new Set();
  const depthId=[...reference.infos.keys()].find(id=>auxUriForItem(reference.props,id)===DEPTH_URI);
  const depthSide=reference.refs.find(r=>r.type==='cdsc'&&r.to.includes(depthId)).from;
  const focusSide=reference.refs.find(r=>r.type==='cdsc'&&r.to.includes(reference.primary)
    &&reference.infos.get(r.from)?.type==='mime')?.from;
  function properties(from,to){
    const ass=[];
    for(const a of d.props.associations.get(from)||[]){
      const p=d.props.properties[a.index-1];let index;
      [meta,index]=appendIpcoProperty(meta,source.slice(p.box.off,p.box.off+p.box.size));ass.push([index,a.essential]);
    }
    meta=setItemPropertyAssociations(meta,to,ass);
  }
  function copy(from,to){
    if(from===undefined||from===null||to===undefined||to===null)throw Error('Missing Portrait graph role');
    mapping.set(from,to);properties(from,to);
    const p=extractItemData(source,d,from);copied.set(to,p);
    if(reference.iloc.items.get(to)?.constructionMethod===1)meta=replaceIdatItem(meta,to,p);
    else payloads.set(to,p);
  }
  function grid(from,to,slots){
    if(from===null||from===undefined){removed.add(to);slots.forEach(id=>removed.add(id));return;}
    const tiles=d.refs.find(r=>r.type==='dimg'&&r.from===from)?.to;
    if(!tiles?.length&&d.infos.get(from)?.type==='hvc1'){
      // Older phones often store gain maps as one image, rather than a grid.
      let ids;[meta,ids]=addItems(meta,[{key:from,itemType:'hvc1'}]);copy(from,ids.get(from));
      removed.add(to);slots.forEach(id=>removed.add(id));return;
    }
    if(!tiles?.length)throw Error('Portrait image has no tiles');
    // Native 24 MP captures have 48 delta / 15 HDR tiles. The reference's
    // smaller grids describe relationships, not a limit on this photo's data.
    if(tiles.length>slots.length){
      let ids;const extra=tiles.slice(slots.length);
      [meta,ids]=addItems(meta,extra.map(id=>({key:id,itemType:d.infos.get(id).type})));
      slots=[...slots,...extra.map(id=>ids.get(id))];
    }
    copy(from,to);tiles.forEach((id,i)=>copy(id,slots[i]));
    slots.slice(tiles.length).forEach(id=>removed.add(id));meta=setItemReference(meta,'dimg',to,slots.slice(0,tiles.length));
  }
  grid(d.primary,reference.primary,reference.primaryTiles);
  const hdrTiles=reference.refs.find(r=>r.type==='dimg'&&r.from===reference.hdrGrid).to;
  grid(d.hdrGrid,reference.hdrGrid,hdrTiles);
  grid(d.deltaGrid,reference.deltaGrid,reference.deltaTiles);
  // Edited exports may omit the ordinary thumbnail while retaining Styles
  // and its linear thumbnail. Do not borrow the template's unrelated image.
  if(d.thumbnail!==null&&d.thumbnail!==undefined)copy(d.thumbnail,reference.thumbnail);
  else removed.add(reference.thumbnail);
  copy(d.linearThumb,reference.linearThumb);
  copy(d.stylesItem,reference.stylesItem);copy(d.exifItem,reference.exifItem);
  const tmap=[...d.infos].find(([,i])=>i.type==='tmap')?.[0];
  const refTmap=[...reference.infos].find(([,i])=>i.type==='tmap')?.[0];
  if(tmap!==undefined)copy(tmap,refTmap);else removed.add(refTmap);
  // Carry the source's actual HDR sidecar; never borrow another photo's gain map.
  const refHdrSide=reference.refs.find(r=>r.type==='cdsc'&&r.to.includes(reference.hdrGrid))?.from;
  const hdrSide=d.refs.find(r=>r.type==='cdsc'&&r.to.includes(d.hdrGrid))?.from;
  if(hdrSide!==undefined)copy(hdrSide,refHdrSide);else removed.add(refHdrSide);
  const sky=[...reference.infos.keys()].find(id=>auxUriForItem(reference.props,id)===MATTE_URIS.semanticskymatte);
  const ownSky=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===MATTE_URIS.semanticskymatte);
  if(ownSky!==undefined)copy(ownSky,sky);else {
    const empty=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)?.endsWith(':semanticnosematte'));
    if(empty!==undefined){
      copy(empty,sky);mapping.delete(empty);
      const p=propertyBoxBytes(decode(template.meta),reference.props,sky,'auxC');let index;
      [meta,index]=appendIpcoProperty(meta,p);
      const props=discoverHeic(meta).props,kept=props.associations.get(sky).filter(a=>props.properties[a.index-1].type!=='auxC');
      meta=setItemPropertyAssociations(meta,sky,[...kept.map(a=>[a.index,a.essential]),[index,true]]);
    }else removed.add(sky);
  }
  // Source Texture/people resources get their own fresh IDs and exact properties.
  for(const[id,info]of d.infos){
    if(mapping.has(id))continue;
    let assigned;[meta,assigned]=addItems(meta,[{key:id,itemType:info.type,contentType:info.uri||info.contentType,
      itemName:info.itemName||''}]);copy(id,assigned.get(id));
  }
  // Unused reference sidecars include capture dates and a reference focus region.
  for(const id of reference.infos.keys())
    if(!payloads.has(id)&&!copied.has(id)&&![depthId,depthSide,focusSide].includes(id))removed.add(id);
  meta=removeItems(meta,removed);
  for(const ref of d.refs)meta=setItemReference(meta,ref.type,mapping.get(ref.from),ref.to.map(id=>mapping.get(id)));
  const targets=[reference.primary,...(tmap!==undefined?[refTmap]:[])];
  meta=setItemReference(meta,'auxl',depthId,targets);
  meta=setItemReference(meta,'cdsc',depthSide,[depthId]);
  // Replace the alternative group too: its source order determines HDR display.
  const rm=topBox(meta,'meta'),sm=topBox(source,'meta');
  const sourceGroups=[...boxes(source,sm.off+sm.hdr+4,sm.off+sm.size)].filter(b=>b.type==='grpl');
  const groups=sourceGroups.map(b=>{
    const out=source.slice(b.off,b.off+b.size);
    for(const group of boxes(out,8,out.length)){
      if(group.type!=='altr')throw Error('Unsupported HDR alternative group');
      const view=new DataView(out.buffer),n=view.getUint32(group.off+16);
      for(let i=0;i<n;i++){const at=group.off+20+4*i,id=view.getUint32(at);if(!mapping.has(id))throw Error('Unknown HDR alternative');view.setUint32(at,mapping.get(id));}
    }return out;
  });
  meta=box('meta',concat([meta.slice(rm.off+rm.hdr,rm.off+rm.hdr+4),
    ...[...boxes(meta,rm.off+rm.hdr+4,rm.off+rm.size)].filter(b=>b.type!=='grpl').map(b=>meta.slice(b.off,b.off+b.size)),...groups]));
  const depthProps=[box('ispe',concat([new Uint8Array(4),be(depth.width,4),be(depth.height,4)])),
    box('pixi',new Uint8Array([0,0,0,0,1,8])),depth.hvcc,appleDepthAuxc(),
    ...(d.props.associations.get(d.primary)||[]).map(a=>d.props.properties[a.index-1])
      .filter(p=>['irot','imir'].includes(p.type)).map(p=>source.slice(p.box.off,p.box.off+p.box.size))];
  const associations=[];for(const p of depthProps){let index;[meta,index]=appendIpcoProperty(meta,p);associations.push([index,!['ispe','pixi'].includes(String.fromCharCode(...p.slice(4,8)))]);}
  meta=setItemPropertyAssociations(meta,depthId,associations);
  if(![focusX,focusY,aperture].every(Number.isFinite)||focusX<0||focusX>1||focusY<0||focusY>1||aperture<1||aperture>22)
    throw Error('Invalid Portrait focus/aperture');
  payloads.set(depthId,depth.payload);
  payloads.set(depthSide,xml(template.depthXmp.replace(/(<depthBlurEffect:SimulatedAperture>)[^<]+(<\/depthBlurEffect:SimulatedAperture>)/,
    (_,a,b)=>a+aperture.toFixed(6)+b)));
  const ownExif=extractItemData(source,d,d.exifItem),[w,h]=dimensionsForItem(d.props,d.primary);
  payloads.set(focusSide,xml(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:mwg-rs="http://www.metadataworkinggroup.com/schemas/regions/" xmlns:stDim="http://ns.adobe.com/xap/1.0/sType/Dimensions#" xmlns:stArea="http://ns.adobe.com/xmp/sType/Area#"><mwg-rs:Regions rdf:parseType="Resource"><mwg-rs:AppliedToDimensions stDim:w="${w}" stDim:h="${h}" stDim:unit="pixel"/><mwg-rs:RegionList><rdf:Bag><rdf:li rdf:parseType="Resource"><mwg-rs:Type>Focus</mwg-rs:Type><mwg-rs:Area stArea:x="${focusX}" stArea:y="${focusY}" stArea:w="0.1" stArea:h="0.1" stArea:unit="normalized"/></rdf:li></rdf:Bag></mwg-rs:RegionList></mwg-rs:Regions></rdf:Description></rdf:RDF></x:xmpmeta>`));
  meta=setItemReference(meta,'cdsc',focusSide,targets);
  const sourceMarker=extractAppleMakerNoteTag(ownExif);
  if(![1,7].includes(sourceMarker.type))throw Error('Unsupported Styles marker type');
  parseBplist(sourceMarker.payload);
  const minimal=buildAppleStyleExif(sourceMarker.payload,sourceMarker.type,readExifOrientation(ownExif)||1);
  const exif=preserveRasterExif(ownExif,minimal,{width:w,height:h,orientation:readExifOrientation(ownExif)||1});
  payloads.set(reference.exifItem,replaceMaker(exif,makerBlob(template,sourceMarker,ownExif)));
  // The completed Styles stage owns its entire colour/people calibration,
  // whether captured by the camera or generated by this app. Replacing it with
  // the Portrait template made one-step processing differ from re-uploading
  // that same Styles result, and separated face masks from their statistics.
  // Drop unused reference codecs/profiles and deduplicate imported properties.
  meta=compactItemProperties(meta).meta;
  // Compatible capture brands travel with the accepted Portrait structure.
  const data=assemble(meta,payloads,decode(template.ftyp));
  const after=discoverHeic(data);
  const finalMarker=extractAppleMakerNoteTag(extractItemData(data,after,after.exifItem));
  parseBplist(finalMarker.payload);
  if(finalMarker.type!==sourceMarker.type||!bytesEqual(finalMarker.payload,sourceMarker.payload))throw Error('Selected Styles changed');
  for(const[id,p]of copied)if(![reference.exifItem,reference.stylesItem].includes(id)&&!bytesEqual(extractItemData(data,after,id),p))throw Error('Portrait source preservation failed');
  if(!bytesEqual(extractItemData(data,after,reference.stylesItem),extractItemData(source,d,d.stylesItem)))throw Error('Completed Styles changed');
  return {data,report:{mode:'editable-ai-portrait',relative:true,bakedBlur:false,referenceCalibration:true}};
}
export async function exportAiPortrait(result,onProgress=()=>{},{signal}={}){
  signal?.throwIfAborted();const template=await loadTemplate();signal?.throwIfAborted();
  const {encodeHevcPixels,releaseHevcEncoder}=await import('../raster/ffmpeg-hevc.js');
  const abort=()=>releaseHevcEncoder();signal?.addEventListener('abort',abort,{once:true});
  try{
    const encoded=await encodeHevcPixels(result.gray,{width:result.width,height:result.height,pixelFormat:'gray',fullRange:true,lossless:true},onProgress);
    signal?.throwIfAborted();
    const depth={...encoded,width:result.width,height:result.height};
    const assembler=portraitAssembler(result.sourceData,depth,template,{signal});
    try{return {...await assembler.build(),withSettings:assembler.build,dispose:assembler.dispose};}
    catch(error){assembler.dispose();throw error;}
  }catch(error){if(signal?.aborted)throw signal.reason;throw error;}
  finally{signal?.removeEventListener('abort',abort);releaseHevcEncoder();}
}
