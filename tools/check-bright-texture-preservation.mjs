import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {discoverHeic,extractItem} from '../web/src/core/heif.js';
import {exifCameraModel,extractAppleMakerNoteTag} from '../web/src/core/exif.js';
import {parseBplist} from '../web/src/core/bplist.js';
import {addTexture,URI_TEXTURE_STYLES} from '../web/src/styles/texture.js';
import {preserveNativeStyles} from '../web/src/styles/style-preservation.js';

const input=process.argv[2]||'tests/private-fixtures/Film_Halation_V1/IMG_7864.HEIC';
const output=process.argv[3]||'tests/private-fixtures/Film_Halation_V1/IMG_7864_Texture_iPhone19,2.HEIC';
const source=new Uint8Array(await fs.readFile(input)),before=discoverHeic(source);
const stylesBefore=extractItem(source,before.iloc,before.stylesItem),exifBefore=extractItem(source,before.iloc,before.exifItem);
const result=addTexture(source,{preserveStyles:true}),after=discoverHeic(result.data);
const stylesAfter=extractItem(result.data,after.iloc,after.stylesItem),exifAfter=extractItem(result.data,after.iloc,after.exifItem);
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const hash=x=>createHash('sha256').update(x).digest('hex');
const tex=[...after.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)?.[0];
const report={input,output,cameraModel:exifCameraModel(exifBefore),preserveNativeStyles:preserveNativeStyles(source,before),
 stylesSchema:parseBplist(stylesBefore).get('0'),stylesByteExact:same(stylesBefore,stylesAfter),stylesSha256:hash(stylesAfter),
 exifByteExact:same(exifBefore,exifAfter),exifSha256:hash(exifAfter),maker54:extractAppleMakerNoteTag(exifAfter,0x54),
 texture:tex==null?null:Object.fromEntries(parseBplist(extractItem(result.data,after.iloc,tex))),report:result.report};
await fs.writeFile(output,result.data);
console.log(JSON.stringify(report,null,2));