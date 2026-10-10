import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {discoverHeic,extractItem,auxUriForItem,dimensionsForItem} from '../web/src/core/heif.js';
import {parseBplist} from '../web/src/core/bplist.js';
import {URI_TEXTURE_STYLES,MATTE_2026_URIS} from '../web/src/styles/texture.js';

const files=process.argv.slice(2);
const hash=b=>createHash('sha256').update(b).digest('hex');
const scalar=v=>v instanceof Map?Object.fromEntries([...v].map(([k,x])=>[k,scalar(x)])):
  v instanceof Uint8Array?{bytes:v.length,sha256:hash(v)}:
  Array.isArray(v)?v.map(scalar):v;
function plistSummary(bytes){
  const p=parseBplist(bytes,{preserveReals:true});
  return Object.fromEntries([...p].map(([k,v])=>[k,scalar(v)]));
}
for(const file of files){
 const data=new Uint8Array(await fs.readFile(file)),d=discoverHeic(data);
 const uris=[...d.infos].filter(([,i])=>i.type==='uri ').map(([id,i])=>({id,uri:i.uri,bytes:d.iloc.items.get(id)?.extents?.reduce((a,e)=>a+e.length,0)}));
 const texturePair=[...d.infos].find(([,i])=>i.uri===URI_TEXTURE_STYLES);
 const texture=texturePair?plistSummary(extractItem(data,d.iloc,texturePair[0])):null;
 const styles=d.stylesItem!=null?plistSummary(extractItem(data,d.iloc,d.stylesItem)):null;
 const mattes=[];
 for(const [id] of d.infos){
   const uri=auxUriForItem(d.props,id);
   if(MATTE_2026_URIS.includes(uri)){const b=extractItem(data,d.iloc,id); mattes.push({id,uri:uri.split(':').at(-1),dim:dimensionsForItem(d.props,id),bytes:b.length,sha256:hash(b)});}
 }
 const textureRefs=texturePair?d.refs.filter(r=>r.from===texturePair[0]||r.to.includes(texturePair[0])):[];
 console.log(JSON.stringify({file,bytes:data.length,primary:d.primary,stylesItem:d.stylesItem,exifItem:d.exifItem,hdrGrid:d.hdrGrid,linearThumb:d.linearThumb,deltaGrid:d.deltaGrid,textureItem:texturePair?.[0]??null,texture,styles,textureRefs,matteCount:mattes.length,mattes,uris},null,2));
}