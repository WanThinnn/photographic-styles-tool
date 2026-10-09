// Local build input only. Publish metadata, never source photo/image payloads.
import fs from 'node:fs';
import {discoverHeic,extractItemData,parseIloc,DEPTH_URI,auxUriForItem} from '../web/src/raster/heif.js';
import {getMakerNoteBlob} from '../web/src/exif.js';
import {parseBplist,buildBplist,BplistReal} from '../web/src/bplist.js';
import {topBox} from '../web/src/box.js';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Pass a local native Portrait HEIC and output JSON');
const bytes=new Uint8Array(fs.readFileSync(input)),d=discoverHeic(bytes);
const b64=b=>Buffer.from(b).toString('base64');
const mn=getMakerNoteBlob(extractItemData(bytes,d,d.exifItem));
const v=new DataView(mn.buffer,mn.byteOffset,mn.byteLength),little=String.fromCharCode(mn[12],mn[13])==='II';
const sizes={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8,16:8,17:8,18:8};
const maker=[];
for(let i=0;i<v.getUint16(14,little);i++){
  const p=16+12*i,id=v.getUint16(p,little),type=v.getUint16(p+2,little),count=v.getUint32(p+4,little);
  // UUIDs, capture time and ASCII attribution do not belong in a public template.
  if([3,0x17,0x20,0x25,0x2b].includes(id)||type===2)continue;
  const size=sizes[type]*count;if(!size)throw Error('Unknown MakerNote type');
  const off=size<=4?p+8:v.getUint32(p+8,little);let payload=mn.slice(off,off+size);
  if(id===0x54){const marker=parseBplist(payload,{preserveReals:true});
    marker.set('1',new BplistReal(0));marker.set('2',new BplistReal(0));marker.set('4',1);payload=buildBplist(marker);}
  maker.push({id,type,count:payload.length/sizes[type],payload:b64(payload)});
}
const depth=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI);
const side=d.refs.find(r=>r.type==='cdsc'&&r.to.includes(depth)).from;
let xmp=new TextDecoder().decode(extractItemData(bytes,d,side));
for(const [key,value]of[['FloatMinValue',0],['FloatMaxValue',1]])
  xmp=xmp.replace(new RegExp(`(<[\\w]+:${key}>)[^<]+(</[\\w]+:${key}>)`,'g'),`$1${value}$2`);
const meta=bytes.slice(d.meta.off,d.meta.off+d.meta.size),iloc=parseIloc(meta,{...d.meta,off:0});
for(const item of iloc.items.values())if(item.constructionMethod===0)
  for(const e of item.extents){meta.fill(0,e.offsetPos,e.offsetPos+iloc.offsetSize);meta.fill(0,e.lengthPos,e.lengthPos+iloc.lengthSize);}
const ft=topBox(bytes,'ftyp');
const template={version:1,description:'Experimental capture structure/calibration. No photographic bitstreams, dates, GPS or identifiers.',
  ftyp:b64(bytes.slice(ft.off,ft.off+ft.size)),
  meta:b64(meta),styles:b64(extractItemData(bytes,d,d.stylesItem)),depthXmp:xmp,
  makerLittle:little,maker};
fs.writeFileSync(output,JSON.stringify(template)+'\n');
console.log(`Metadata-only Portrait template: ${fs.statSync(output).size} bytes`);
