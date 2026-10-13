import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {discoverHeic,auxUriForItem,dimensionsForItem,URI_HDR_GAIN,DEPTH_URI,extractItemData} from '../web/src/raster/heif.js';
import {exifCameraModel,extractAppleMakerNoteTag,getMakerNoteBlob} from '../web/src/core/exif.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const full=process.argv.includes('--full');
for(const file of process.argv.slice(2).filter(arg=>arg!=='--full')) {
  const bytes=new Uint8Array(fs.readFileSync(file)),d=discoverHeic(bytes);
  const hdr=new Set([...d.infos].filter(([id,info])=>info.type==='tmap'||auxUriForItem(d.props,id)===URI_HDR_GAIN).map(([id])=>id));
  const members=new Set(hdr);
  for(const r of d.refs)if(r.type==='dimg'&&hdr.has(r.from))for(const id of r.to)members.add(id);
  const exif=d.exifItem==null?null:extractItemData(bytes,d,d.exifItem);
  let camera=null,little;
  try{camera=exifCameraModel(exif);little=getMakerNoteBlob(exif)[12]===73;}catch{}
  const makerTags=Object.fromEntries([0x14,0x1f,0x21,0x30,0x54].map(id=>{
    try{const tag=extractAppleMakerNoteTag(exif,id),v=new DataView(tag.payload.buffer,tag.payload.byteOffset,tag.payload.length);
      return [id.toString(16),{type:tag.type,...(full?{bytes:[...tag.payload]}:{}),value:tag.type===10?v.getInt32(0,little)/v.getInt32(4,little):tag.payload.length===4?v.getUint32(0,little):hash(tag.payload)}];
    }catch{return [id.toString(16),null];}
  }));
  console.log(JSON.stringify({file,primary:d.primary,camera,makerTags,
    primaryHash:hash(Buffer.concat((d.primaryTiles.length?d.primaryTiles:[d.primary]).map(id=>extractItemData(bytes,d,id)))),
    gainHash:hash(Buffer.concat((d.hdrTiles.length?d.hdrTiles:d.hdrGrid===null?[]:[d.hdrGrid]).map(id=>extractItemData(bytes,d,id)))),
    depth:[...d.infos.keys()].filter(id=>auxUriForItem(d.props,id)===DEPTH_URI).map(id=>({id,dims:dimensionsForItem(d.props,id),hash:hash(extractItemData(bytes,d,id))})),
    xmp:[...d.infos].filter(([,info])=>info.type==='mime').map(([id])=>{
      const xml=new TextDecoder().decode(extractItemData(bytes,d,id));
      const values=Object.fromEntries(['HDRGainMapVersion','HDRGainMapHeadroom','FloatMinValue','FloatMaxValue','SimulatedAperture','CreateDate'].map(key=>[key,new RegExp(`<[^:>]+:${key}>([^<]+)<`).exec(xml)?.[1]??null]));
      const renderer=/<depthBlurEffect:RenderingParameters>([^<]+)</.exec(xml)?.[1];
      return {id,refs:d.refs.filter(r=>r.from===id),...(full?{xml}:{values,renderer:renderer?hash(Buffer.from(renderer,'base64')):null})};
    }),
    hdrItems:[...members].map(id=>({id,info:d.infos.get(id),uri:auxUriForItem(d.props,id),dims:dimensionsForItem(d.props,id)})),
    refs:d.refs.filter(r=>members.has(r.from)||r.to.some(id=>members.has(id)))}));
}
