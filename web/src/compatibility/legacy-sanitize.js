import {topBox,be,concat} from '../core/box.js';
import {discoverHeic,extractItem,parseIloc} from '../core/heif.js';
import {removeAppleMakerNoteTag} from '../core/exif.js';
import {removeItems} from '../raster/heif.js';
import {rebuildHeic} from '../styles/graft.js';
import {protectedSemanticItemIds,editingClosureItemIds} from './graph-policy.js';

export function compatibilityEditingIds(d){
  return editingClosureItemIds(d,protectedSemanticItemIds(d));
}

function rebuildAfterRemoval(data,before,meta){
  const ft=topBox(data,'ftyp'),mo=before.meta.off,ms=before.meta.size;
  if(ft.off!==0||mo<ft.size)throw Error('Expected ftyp first and meta after it');
  const shift=meta.length-ms;
  const head=data.subarray(0,mo),tail=data.subarray(mo+ms),m=meta.slice();
  const iloc=parseIloc(m,topBox(m,'meta'));
  if(iloc.offsetSize!==4||iloc.lengthSize!==4)throw Error('unsupported iloc layout');
  for(const [id,item] of iloc.items){
    if(item.constructionMethod!==0||!item.extents.length)continue;
    const old=before.iloc.items.get(id);
    if(!old||old.extents.length!==item.extents.length)throw Error('Compatibility sanitizer extent mismatch for item '+id);
    item.extents.forEach((extent,index)=>m.set(be(old.extents[index].offset+shift,4),extent.offsetPos));
  }
  return concat([head,m,tail]);
}

function removeEditingMakerTags(data,tags){
  if(!tags?.length)return {data,removed:[]};
  const d=discoverHeic(data);
  if(d.exifItem===null)return {data,removed:[]};
  let exif=extractItem(data,d.iloc,d.exifItem),changed=false;
  const removed=[];
  for(const tag of [...new Set(tags)]){
    const next=removeAppleMakerNoteTag(exif,tag);
    if(next!==exif){exif=next;changed=true;removed.push(tag);}
  }
  if(!changed)return {data,removed};
  const ft=topBox(data,'ftyp');
  const meta=data.slice(d.meta.off,d.meta.off+d.meta.size);
  return {data:rebuildHeic(data,d,data.slice(ft.off,ft.off+ft.size),meta,new Map([[d.exifItem,exif]])),removed};
}

export function stripAppleEditingContract(data,{removeMakerTags=[]}={}){
  const before=discoverHeic(data),removed=compatibilityEditingIds(before);
  let output=data;
  if(removed.size){
    const meta0=data.slice(before.meta.off,before.meta.off+before.meta.size);
    const meta=removeItems(meta0,removed);
    output=rebuildAfterRemoval(data,before,meta);
    const after=discoverHeic(output);
    for(const [id,item] of before.iloc.items){
      if(removed.has(id)||item.constructionMethod!==0||!after.iloc.items.has(id))continue;
      const a=extractItem(data,before.iloc,id),b=extractItem(output,after.iloc,id);
      if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('Compatibility sanitizer changed source item '+id);
    }
  }
  const maker=removeEditingMakerTags(output,removeMakerTags);
  return {data:maker.data,report:{mode:'compatibility-sanitize',removedItems:removed.size,
    removedIds:[...removed].sort((a,b)=>a-b),removedMakerTags:maker.removed.map(tag=>'0x'+tag.toString(16))}};
}
