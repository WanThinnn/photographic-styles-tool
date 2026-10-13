import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {discoverHeic,extractItem} from '../web/src/core/heif.js';
import {exifCameraModel,extractAppleMakerNoteTag,getMakerNoteBlob} from '../web/src/core/exif.js';
import {parseBplist} from '../web/src/core/bplist.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const u=(d,p,n,l)=>{let v=0;if(l){for(let i=n-1;i>=0;i--)v=v*256+d[p+i]}else for(let i=0;i<n;i++)v=v*256+d[p+i];return v};
for(const file of process.argv.slice(2)){
 const data=new Uint8Array(await fs.readFile(file)),d=discoverHeic(data);
 const exif=d.exifItem==null?null:extractItem(data,d.iloc,d.exifItem);
 const out={file,camera:exifCameraModel(exif),exifItem:d.exifItem,exifBytes:exif?.length??0};
 if(exif){
  try{const t=extractAppleMakerNoteTag(exif,0x54);out.mn54={type:t.type,bytes:t.payload.length,sha256:hash(t.payload)};try{out.mn54.plist=Object.fromEntries(parseBplist(t.payload));}catch{}}catch(e){out.mn54Error=e.message}
  try{const mn=getMakerNoteBlob(exif),little=String.fromCharCode(mn[12],mn[13])==='II',n=u(mn,14,2,little),tags=[];for(let i=0;i<n;i++){const p=16+i*12,tag=u(mn,p,2,little),type=u(mn,p+2,2,little),count=u(mn,p+4,4,little);tags.push({tag:'0x'+tag.toString(16),type,count});}out.makerTags=tags;}catch(e){out.makerError=e.message}
 }
 console.log(JSON.stringify(out,null,2));
}