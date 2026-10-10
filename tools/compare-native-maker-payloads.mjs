import fs from 'node:fs/promises';
import {discoverHeic,extractItem} from '../web/src/core/heif.js';
import {extractAppleMakerNoteTag} from '../web/src/core/exif.js';
import {parseBplist} from '../web/src/core/bplist.js';
const dec=new TextDecoder();
for(const file of process.argv.slice(2)){
 const data=new Uint8Array(await fs.readFile(file)),d=discoverHeic(data),exif=extractItem(data,d.iloc,d.exifItem);
 const out={file,tags:{}};
 for(const tag of [0x4e,0x4f,0x54,0x5a,0x65]){
  try{const x=extractAppleMakerNoteTag(exif,tag),b=x.payload;const rec={type:x.type,bytes:b.length,hex:Buffer.from(b).toString('hex')};
   try{rec.text=dec.decode(b).replace(/[^\x20-\x7e]/g,'.')}catch{}
   try{rec.plist=Object.fromEntries(parseBplist(b))}catch{}
   out.tags['0x'+tag.toString(16)]=rec;
  }catch(e){out.tags['0x'+tag.toString(16)]={missing:true,error:e.message}}
 }
 console.log(JSON.stringify(out,null,2));
}