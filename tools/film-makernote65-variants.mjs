import fs from 'node:fs/promises';
import path from 'node:path';
import {discoverHeic,extractItem} from '../web/src/core/heif.js';
import {extractAppleMakerNoteTag,injectAppleMakerNoteTag} from '../web/src/core/exif.js';
import {topBox} from '../web/src/core/box.js';
import {rebuildHeic} from '../web/src/styles/graft.js';

const sourcePath=process.argv[2]||'tests/private-fixtures/Film_Halation_V1/IMG_7864_Texture_iPhone19,2.HEIC';
const neutralPath=process.argv[3]||'tests/private-fixtures/Film_Halation_V1/IMG_0243.HEIC';
const activePath=process.argv[4]||'tests/private-fixtures/Film_Halation_V1/IMG_0240.HEIC';
const outDir=process.argv[5]||'tests/private-fixtures/Film_Halation_V1/IMG_7864_65';
await fs.mkdir(outDir,{recursive:true});
const read=async p=>new Uint8Array(await fs.readFile(p));
const source=await read(sourcePath),d=discoverHeic(source);
if(d.exifItem==null)throw Error('source has no Exif');
const sourceExif=extractItem(source,d.iloc,d.exifItem);
const donor65=async p=>{const b=await read(p),x=discoverHeic(b),e=extractItem(b,x.iloc,x.exifItem);return extractAppleMakerNoteTag(e,0x65).payload.slice();};
const neutral65=await donor65(neutralPath),active65=await donor65(activePath);
const ft=topBox(source,'ftyp'),ftyp=source.slice(ft.off,ft.off+ft.size),meta=source.slice(d.meta.off,d.meta.off+d.meta.size);
function make(payload){const exif=injectAppleMakerNoteTag(sourceExif,payload,0x65,7);return rebuildHeic(source,d,ftyp,meta,new Map([[d.exifItem,exif]]));}
const variants=[['A_Control_No65.HEIC',source],['B_Neutral65_From0243.HEIC',make(neutral65)],['C_Active65_From0240.HEIC',make(active65)]];
const report=[];
for(const [name,bytes] of variants){await fs.writeFile(path.join(outDir,name),bytes);const q=discoverHeic(bytes),e=extractItem(bytes,q.iloc,q.exifItem);let tag=null;try{tag=extractAppleMakerNoteTag(e,0x65).payload.length}catch{}report.push({file:name,bytes:bytes.length,tag65Bytes:tag});}
await fs.writeFile(path.join(outDir,'report.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(outDir,'HUONG_DAN.txt'),'A = control, no MakerNote 0x65\nB = only neutral iPhone 18 Pro 0x65 from IMG_0243\nC = only iPhone 18 Pro 0x65 from IMG_0240\n\nFor each: Film preview at 90/96/97/100, then Done and reopen. Compare red halation strength.\nAll non-Exif external HEIC payloads are preserved by rebuild self-check.\n');
console.log(JSON.stringify(report,null,2));