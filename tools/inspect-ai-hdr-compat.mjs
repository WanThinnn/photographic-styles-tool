import {readFile} from 'node:fs/promises';
import {discoverHeic,propertyBoxBytes,dimensionsForItem,extractItem} from '../web/src/core/heif.js';
import {topBox,metaChildren,findChild,concat} from '../web/src/core/box.js';
import {hevcSpsColor} from '../web/src/raster/hevc-color.js';
import {parseTmapMetadata} from '../web/src/raster/jpeg-hdr.js';

function itemData(data,d,iid){
 const item=d.iloc.items.get(iid);
 if(item.constructionMethod===0)return extractItem(data,d.iloc,iid);
 if(item.constructionMethod!==1)throw Error('unsupported construction method');
 const idat=findChild(metaChildren(data,d.meta),'idat');
 return concat(item.extents.map(e=>data.slice(idat.off+idat.hdr+item.baseOffset+e.offset,idat.off+idat.hdr+item.baseOffset+e.offset+e.length)));
}
function record(data,d,iid){
 const box=propertyBoxBytes(data,d.props,iid,'hvcC');if(!box)throw Error('no hvcC '+iid);
 const b=topBox(box,'hvcC');return box.subarray(b.off+b.hdr,b.off+b.size);
}
for(const path of process.argv.slice(2)){
 try{
  const data=new Uint8Array(await readFile(path)),d=discoverHeic(data);
  const tmaps=[...d.infos].filter(([,info])=>info.type==='tmap').map(([id])=>id);
  const tmap=tmaps.find(id=>{const r=d.refs.find(x=>x.type==='dimg'&&x.from===id)?.to;return r?.[0]===d.primary&&r?.[1]===d.hdrGrid;});
  const p=d.primaryTiles[0],g=d.hdrTiles[0];
  console.log(JSON.stringify({path,bytes:data.length,primary:dimensionsForItem(d.props,d.primary),primaryTiles:d.primaryTiles.length,
    hdrGrid:d.hdrGrid,hdr: d.hdrGrid!==null?dimensionsForItem(d.props,d.hdrGrid):null,hdrTiles:d.hdrTiles.length,
    styles:d.stylesItem!==null,depth:[...d.infos.keys()].some(id=>String(id)&&d.refs.some(r=>r.type==='auxl'&&r.from===id)),
    primarySps:p?hevcSpsColor(record(data,d,p)):null,gainSps:g?hevcSpsColor(record(data,d,g)):null,
    tmap:tmap!==undefined?parseTmapMetadata(itemData(data,d,tmap)):null},null,2));
 }catch(error){console.log(JSON.stringify({path,error:error.message},null,2));}
}
