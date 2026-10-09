import fs from 'node:fs';
import crypto from 'node:crypto';
import {discoverHeic,extractItemData} from '../web/src/raster/heif.js';
import {parseBplist} from '../web/src/bplist.js';
import {extractAppleMakerNoteTag} from '../web/src/exif.js';
import {URI_TEXTURE_STYLES} from '../web/src/texture.js';
const simplify=v=>v instanceof Map?Object.fromEntries([...v].map(([k,x])=>[k,simplify(x)])):
  v instanceof Uint8Array?{bytes:v.length,sha256:crypto.createHash('sha256').update(v).digest('hex')}:
  Array.isArray(v)?v.map(simplify):v;
for(const file of process.argv.slice(2)) {
  const bytes=new Uint8Array(fs.readFileSync(file)),d=discoverHeic(bytes);
  const textureId=[...d.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)?.[0];
  const texture=textureId===undefined?null:parseBplist(extractItemData(bytes,d,textureId));
  const people=texture?.get('TextureStylePostProcessedPeopleData');
  const marker=extractAppleMakerNoteTag(extractItemData(bytes,d,d.exifItem));
  const metadata=[...d.infos].filter(([,info])=>info.type==='mime').map(([id])=>({id,
    xml:new TextDecoder().decode(extractItemData(bytes,d,id))}));
  console.log(JSON.stringify({file,mn54:simplify(parseBplist(marker.payload)),
    styles:simplify(parseBplist(extractItemData(bytes,d,d.stylesItem))),
    texture:texture?Object.fromEntries([...texture].filter(([k])=>k!=='TextureStylePostProcessedPeopleData').map(([k,v])=>[k,simplify(v)])):null,
    roughness:people?.map(p=>p.get('imageStats').get('SkinSmoothingStandalone').get('SkinSmoothFaceRoughness')),
    editMetadata:metadata.filter(m=>/Bright|Preset|Adjustment|Applied|SoftSkin|Soft Skin/i.test(m.xml))}));
}
