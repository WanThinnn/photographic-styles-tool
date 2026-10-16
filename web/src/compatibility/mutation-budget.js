import {
  discoverHeic,extractItem,idatItemBytes,auxUriForItem,DEPTH_URI,MATTE_URI_SET,
  URI_STYLES,URI_LINEAR_THUMB,URI_STYLE_DELTA,
} from '../core/heif.js';
import {listAppleMakerNoteTags,listExifMetadataEntries} from '../core/exif.js';
import {URI_TEXTURE_STYLES} from '../styles/texture.js';
import {COMPATIBILITY_ERROR,compatibilityError} from './errors.js';
import {isKnownAppleTagUri} from './contract-registry.js';
import {
  protectedSemanticItemIds,editingClosureItemIds,isKnownSafeEditingBoundaryReference,
} from './graph-policy.js';

function payload(bytes,d,id){
  const item=d.iloc.items.get(id);
  if(!item)throw Error('Missing item '+id);
  if(item.constructionMethod===0)return extractItem(bytes,d.iloc,id);
  if(item.constructionMethod===1)return idatItemBytes(bytes,id,d.meta);
  throw Error('Unsupported construction method for preserved item '+id);
}
function equal(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}

export function preservedCoreItemIds(data,d=discoverHeic(data)){
  const ids=protectedSemanticItemIds(d);
  ids.delete(d.exifItem);
  return [...ids].filter(id=>id!==null&&id!==undefined).sort((a,b)=>a-b);
}

export function verifyCorePayloadPreservation(source,output){
  const before=discoverHeic(source),after=discoverHeic(output),checked=[];
  for(const id of preservedCoreItemIds(source,before)){
    if(!after.iloc.items.has(id))throw Error('Legacy compatibility removed preserved source item '+id);
    const a=payload(source,before,id),b=payload(output,after,id);
    if(!a||!b||!equal(a,b))throw Error('Legacy compatibility changed preserved source item '+id);
    checked.push(id);
  }
  return {checked};
}

function propertyAssociations(bytes,d,id){
  return (d.props.associations.get(id)||[]).map(association=>{
    const property=d.props.properties[association.index-1];
    if(!property?.box)throw Error('Missing associated property '+association.index+' for item '+id);
    return {essential:Boolean(association.essential),
      bytes:bytes.slice(property.box.off,property.box.off+property.box.size)};
  });
}
function sameAssociations(a,b){
  return a.length===b.length&&a.every((entry,index)=>
    entry.essential===b[index].essential&&equal(entry.bytes,b[index].bytes));
}
function refKey(ref){return ref.type+':'+ref.from+':'+ref.to.join(',');}

function makerTagMap(exif){
  const map=new Map();
  for(const entry of listAppleMakerNoteTags(exif)){
    if(map.has(entry.tag))throw Error('Duplicate Apple MakerNote tag 0x'+entry.tag.toString(16));
    map.set(entry.tag,entry);
  }
  return map;
}
function parseMakerTag(value){
  if(Number.isInteger(value)&&value>=0)return value;
  if(typeof value==='string'&&/^0x[0-9a-f]+$/i.test(value))return Number.parseInt(value.slice(2),16);
  return null;
}
function sameExifEntry(a,b){
  if(!a||!b||a.ifd!==b.ifd||a.tag!==b.tag||a.type!==b.type||a.count!==b.count
    ||a.pointer!==b.pointer)return false;
  if(a.payload===undefined||b.payload===undefined)return a.payload===b.payload;
  return equal(a.payload,b.payload);
}
function addedFamily(d,id,editingIds){
  const info=d.infos.get(id),aux=auxUriForItem(d.props,id);
  if(info?.uri===URI_STYLES)return 'photographic-styles';
  if(aux===URI_STYLE_DELTA)return 'style-delta';
  if(aux===URI_LINEAR_THUMB)return 'linear-thumbnail';
  if(info?.uri===URI_TEXTURE_STYLES)return 'texture-2026';
  if((info?.uri?.startsWith('tag:apple.com,2026:')&&isKnownAppleTagUri(info.uri))
    ||(aux?.startsWith('tag:apple.com,2026:')&&isKnownAppleTagUri(aux)))
    return 'texture-2026-mattes-and-sidecars';
  if(editingIds.has(id)&&['hvc1','grid','mime'].includes(info?.type))return 'target-editing-descendants';
  return null;
}

/** Enforce the declared Legacy Compatibility mutation budget in both directions.
 *
 * Existing source resources may only disappear when explicitly removed by the
 * plan. New output resources must belong to the rebuilt target editing graph.
 * Protected photo/HDR/depth/matte payloads, properties and references remain
 * exact, and all unlisted MakerNote entries remain byte-identical.
 */
export function verifyLegacyMutationBudget(source,output,{
  removedIds=[],removedMakerTags=[],plan=null,
}={}){
  const fail=(message,details=null)=>{throw compatibilityError(
    COMPATIBILITY_ERROR.MUTATION_BUDGET_VIOLATION,message,details);};
  let before,after;
  try{before=discoverHeic(source);after=discoverHeic(output);}
  catch(error){fail('Legacy compatibility mutation verification could not parse the source/output graph',{
    message:String(error?.message||error),
  });}
  const declaredRemoved=plan?.allowedRemovedIds??removedIds;
  const removed=new Set(declaredRemoved);
  const actualRemoved=new Set(removedIds);
  const declaredMaker=plan?.allowedMakerNoteTags??[0x54,...removedMakerTags];
  const allowedMaker=new Set(declaredMaker.map(parseMakerTag).filter(tag=>tag!==null));
  const actualRemovedMaker=new Set(removedMakerTags.map(parseMakerTag).filter(tag=>tag!==null));
  const payloads=[],properties=[],references=[];

  if(plan){
    const planned=new Set(plan.allowedRemovedIds??[]);
    if(planned.size!==actualRemoved.size||[...planned].some(id=>!actualRemoved.has(id)))
      fail('Compatibility sanitizer removed a different editing set than the approved plan',{
        planned:[...planned].sort((a,b)=>a-b),actual:[...actualRemoved].sort((a,b)=>a-b),
      });
    for(const tag of actualRemovedMaker)if(!allowedMaker.has(tag))
      fail('Compatibility sanitizer removed an undeclared Apple MakerNote tag 0x'+tag.toString(16));
  }

  for(const [id] of before.iloc.items){
    if(removed.has(id))continue;
    if(!after.iloc.items.has(id))fail('Legacy compatibility removed undeclared source item '+id);
    if(id!==before.exifItem){
      const a=payload(source,before,id),b=payload(output,after,id);
      if(!a||!b||!equal(a,b))fail('Legacy compatibility changed undeclared source item '+id);
      payloads.push(id);
    }
    const a=propertyAssociations(source,before,id),b=propertyAssociations(output,after,id);
    if(!sameAssociations(a,b))fail('Legacy compatibility changed properties of source item '+id);
    properties.push(id);
  }

  const afterRefs=new Set(after.refs.map(refKey));
  for(const ref of before.refs){
    if(removed.has(ref.from)||ref.to.some(id=>removed.has(id)))continue;
    const key=refKey(ref);
    if(!afterRefs.has(key))fail('Legacy compatibility changed undeclared source reference '+key);
    references.push(key);
  }

  let makerTags=[],exifFields=0;
  if(before.exifItem!==null&&after.exifItem!==null){
    const beforeExif=payload(source,before,before.exifItem);
    const afterExif=payload(output,after,after.exifItem);
    let beforeFields,afterFields,a,b;
    try{
      beforeFields=listExifMetadataEntries(beforeExif);
      afterFields=listExifMetadataEntries(afterExif);
      a=makerTagMap(beforeExif);
      b=makerTagMap(afterExif);
    }catch(error){
      fail('Legacy compatibility could not verify capture Exif/MakerNote preservation',{
        message:String(error?.message||error),
      });
    }
    if(beforeFields.length!==afterFields.length
      ||beforeFields.some((entry,index)=>!sameExifEntry(entry,afterFields[index])))
      fail('Legacy compatibility changed capture Exif metadata outside Apple MakerNote',{
        beforeEntries:beforeFields.length,afterEntries:afterFields.length,
      });
    exifFields=beforeFields.length;
    for(const [tag,entry] of a){
      if(allowedMaker.has(tag))continue;
      const next=b.get(tag);
      if(!next||next.type!==entry.type||!equal(next.payload,entry.payload))
        fail('Legacy compatibility changed Apple MakerNote tag 0x'+tag.toString(16));
      makerTags.push('0x'+tag.toString(16));
    }
    for(const tag of b.keys()){
      if(!a.has(tag)&&!allowedMaker.has(tag))
        fail('Legacy compatibility introduced undeclared Apple MakerNote tag 0x'+tag.toString(16));
    }
  }

  const targetProtected=protectedSemanticItemIds(after);
  const targetEditing=editingClosureItemIds(after,targetProtected);
  const allowedFamilies=new Set(plan?.allowedAddedFamilies??[
    'photographic-styles','style-delta','linear-thumbnail','texture-2026',
    'texture-2026-mattes-and-sidecars','target-editing-descendants',
  ]);
  const addedItems=[];
  for(const [id] of after.iloc.items){
    if(before.iloc.items.has(id)&&!removed.has(id))continue;
    if(id===after.exifItem)continue;
    const family=addedFamily(after,id,targetEditing);
    if(!family||!allowedFamilies.has(family))
      fail('Legacy compatibility introduced an undeclared output item',{id,family});
    addedItems.push({id,family});
  }

  const beforeRefKeys=new Set(before.refs.map(refKey));
  const addedReferences=[];
  for(const ref of after.refs){
    const key=refKey(ref);
    if(beforeRefKeys.has(key))continue;
    const touchesEditing=targetEditing.has(ref.from)||ref.to.some(id=>targetEditing.has(id));
    if(!touchesEditing)fail('Legacy compatibility introduced a reference outside the target editing graph',key);
    if(!isKnownSafeEditingBoundaryReference(after,ref,targetEditing,targetProtected))
      fail('Legacy compatibility introduced an unsafe editing/photo boundary reference',key);
    addedReferences.push(key);
  }

  let core;
  try{core=verifyCorePayloadPreservation(source,output);}
  catch(error){fail('Legacy compatibility failed protected core payload verification',{
    message:String(error?.message||error),
  });}
  return {
    core:core.checked,payloads,properties,references,makerTags,exifFields,
    addedItems,addedReferences,
  };
}
