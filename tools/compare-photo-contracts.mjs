import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  fingerprintPhotoContract,sanitizeContractFingerprint,
} from '../web/src/compatibility/contract-fingerprint.js';
import {classifyPhotoContract} from '../web/src/compatibility/contract-classifier.js';
import {
  discoverHeic,extractItem,idatItemBytes,auxUriForItem,DEPTH_URI,MATTE_URI_SET,
} from '../web/src/core/heif.js';
import {listAppleMakerNoteTags} from '../web/src/core/exif.js';
import {
  protectedSemanticItemIds,editingClosureItemIds,referenceBoundary,semanticRolesForItem,
} from '../web/src/compatibility/graph-policy.js';
import {preflightLegacyCompatibilityExport} from '../web/src/compatibility/recovery-preflight.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function itemBytes(data,d,id){
  const item=d.iloc.items.get(id);
  if(!item)throw Error('Missing item '+id);
  if(item.constructionMethod===0)return extractItem(data,d.iloc,id);
  if(item.constructionMethod===1){
    const bytes=idatItemBytes(data,id,d.meta);
    if(bytes)return bytes;
  }
  throw Error('Unsupported item payload layout '+id);
}
function rolesFor(d,id){
  const roles=[];
  if(id===d.primary)roles.push('primary');
  const primaryTile=d.primaryTiles.indexOf(id);if(primaryTile>=0)roles.push('primary-tile:'+primaryTile);
  if(id===d.hdrGrid)roles.push('hdr-grid');
  const hdrTile=d.hdrTiles.indexOf(id);if(hdrTile>=0)roles.push('hdr-tile:'+hdrTile);
  if(id===d.thumbnail)roles.push('thumbnail');
  if(id===d.linearThumb)roles.push('linear-thumbnail');
  if(id===d.deltaGrid)roles.push('style-delta-grid');
  const deltaTile=d.deltaTiles.indexOf(id);if(deltaTile>=0)roles.push('style-delta-tile:'+deltaTile);
  if(id===d.stylesItem)roles.push('styles');
  if(id===d.exifItem)roles.push('exif');
  const aux=auxUriForItem(d.props,id);
  if(aux===DEPTH_URI)roles.push('depth');
  else if(MATTE_URI_SET.has(aux))roles.push('matte:'+aux);
  const uri=d.infos.get(id)?.uri;if(uri)roles.push('item-uri:'+uri);
  return roles.sort();
}
function propertySummary(data,d,id,sanitized){
  return (d.props.associations.get(id)||[]).map(association=>{
    const property=d.props.properties[association.index-1];
    if(!property)return {essential:Boolean(association.essential),type:'missing-property'};
    const result={essential:Boolean(association.essential),type:property.type};
    if(!sanitized)result.sha256=hash(data.subarray(property.box.off,property.box.off+property.box.size));
    return result;
  });
}
function refSummary(d){
  return d.refs.map(ref=>({type:ref.type,from:ref.from,to:[...ref.to]}));
}
function makerSummary(data,d,sanitized){
  if(d.exifItem===null)return [];
  try{
    const exif=itemBytes(data,d,d.exifItem);
    return listAppleMakerNoteTags(exif).map(entry=>({
      tag:'0x'+entry.tag.toString(16),type:entry.type,bytes:entry.payload.length,
      ...(!sanitized?{sha256:hash(entry.payload)}:{}),
    })).sort((a,b)=>a.tag.localeCompare(b.tag));
  }catch{return [];}
}
function boundarySummary(d,sanitized){
  const protectedIds=protectedSemanticItemIds(d),editingIds=editingClosureItemIds(d,protectedIds);
  return d.refs.flatMap(ref=>{
    const boundary=referenceBoundary(d,ref,editingIds,protectedIds);
    if(!boundary.crosses)return [];
    return [{
      type:ref.type,
      fromRoles:semanticRolesForItem(d,ref.from),
      toRoles:ref.to.map(id=>semanticRolesForItem(d,id)),
      ...(!sanitized?{from:ref.from,to:[...ref.to]}:{}),
    }];
  });
}
function snapshot(data,sanitized){
  const d=discoverHeic(data),raw=fingerprintPhotoContract(data,d),classification=classifyPhotoContract(data,raw);
  const items=[];
  const roleHashes=new Map();
  const semanticCounts=new Map();
  for(const [id,info] of d.infos){
    const bytes=itemBytes(data,d,id),roles=rolesFor(d,id),auxUri=auxUriForItem(d.props,id);
    const digest=hash(bytes),signature=JSON.stringify({type:info.type,uri:info.uri??null,auxUri:auxUri??null,roles});
    semanticCounts.set(signature,(semanticCounts.get(signature)||0)+1);
    for(const role of roles){
      if(!roleHashes.has(role))roleHashes.set(role,[]);
      roleHashes.get(role).push(digest);
    }
    if(!sanitized)items.push({
      id,type:info.type,uri:info.uri??null,auxUri:auxUri??null,roles,bytes:bytes.length,sha256:digest,
      properties:propertySummary(data,d,id,false),
    });
  }
  const roleHashObject=Object.fromEntries([...roleHashes].map(([role,values])=>[role,values.sort()]));
  const semanticCountObject=Object.fromEntries([...semanticCounts].sort(([a],[b])=>a.localeCompare(b)));
  return {
    rawFingerprint:raw,
    fingerprint:sanitized?sanitizeContractFingerprint(raw):raw,
    classification,
    preflight:preflightLegacyCompatibilityExport(data,{classification}),
    graph:{
      semanticCounts:semanticCountObject,
      roleHashes:sanitized?Object.fromEntries(Object.keys(roleHashObject).map(role=>[role,roleHashObject[role].length])):roleHashObject,
      references:sanitized?d.refs.map(ref=>ref.type).sort():refSummary(d),
      items,
      maker:makerSummary(data,d,sanitized),
      crossBoundaryDependencies:boundarySummary(d,sanitized),
    },
  };
}
function walk(a,b,prefix='',changes=[]){
  if(Object.is(a,b))return changes;
  if(Array.isArray(a)&&Array.isArray(b)){
    if(JSON.stringify(a)!==JSON.stringify(b))changes.push({path:prefix,before:a,after:b});
    return changes;
  }
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
    for(const key of keys)walk(a[key],b[key],prefix?prefix+'.'+key:key,changes);
    return changes;
  }
  changes.push({path:prefix,before:a??null,after:b??null});
  return changes;
}
function countDiff(before,after){
  const added=[],removed=[];
  const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].sort();
  for(const key of keys){
    const a=before[key]||0,b=after[key]||0;
    if(b>a)added.push({signature:JSON.parse(key),count:b-a});
    if(a>b)removed.push({signature:JSON.parse(key),count:a-b});
  }
  return {added,removed};
}
function setDiff(before,after){
  const a=new Set(before.map(JSON.stringify)),b=new Set(after.map(JSON.stringify));
  return {
    added:[...b].filter(value=>!a.has(value)).map(value=>JSON.parse(value)),
    removed:[...a].filter(value=>!b.has(value)).map(value=>JSON.parse(value)),
  };
}
function rolePreservation(left,right,sanitized){
  const roles=['primary','hdr-grid','depth'];
  const result={};
  for(const role of roles){
    const a=left.graph.roleHashes[role]??[],b=right.graph.roleHashes[role]??[];
    result[role]={presentBefore:Boolean(Array.isArray(a)?a.length:a),presentAfter:Boolean(Array.isArray(b)?b.length:b),
      byteIdentical:sanitized?null:JSON.stringify(a)===JSON.stringify(b)};
  }
  const comparePrefix=prefix=>{
    const keys=[...new Set([...Object.keys(left.graph.roleHashes),...Object.keys(right.graph.roleHashes)])]
      .filter(key=>key.startsWith(prefix)).sort();
    return keys.every(key=>JSON.stringify(left.graph.roleHashes[key]??[])===JSON.stringify(right.graph.roleHashes[key]??[]));
  };
  result.primaryTilesByteIdentical=sanitized?null:comparePrefix('primary-tile:');
  result.hdrTilesByteIdentical=sanitized?null:comparePrefix('hdr-tile:');
  return result;
}

const args=process.argv.slice(2),sanitized=args.includes('--sanitized');
const files=args.filter(value=>value!=='--sanitized');
const [leftPath,rightPath]=files;
if(!leftPath||!rightPath){
  console.error('Usage: node tools/compare-photo-contracts.mjs [--sanitized] <before.heic> <after.heic>');
  process.exitCode=2;
}else{
  const read=async(file,index)=>{
    const data=new Uint8Array(await fs.readFile(file)),snap=snapshot(data,sanitized);
    return {source:sanitized?index:path.basename(file),bytes:data.length,...snap};
  };
  const [left,right]=await Promise.all([read(leftPath,1),read(rightPath,2)]);
  const semanticItems=countDiff(left.graph.semanticCounts,right.graph.semanticCounts);
  const references=sanitized?null:setDiff(left.graph.references,right.graph.references);
  const maker=sanitized?walk(left.graph.maker,right.graph.maker,'maker')
    :setDiff(left.graph.maker,right.graph.maker);
  const itemPayloadChanges=sanitized?[]:left.graph.items.flatMap(item=>{
    const next=right.graph.items.find(candidate=>candidate.id===item.id);
    return next&&item.sha256!==next.sha256?[{id:item.id,roles:item.roles,before:item.sha256,after:next.sha256}]:[];
  });
  const propertyChanges=sanitized?[]:left.graph.items.flatMap(item=>{
    const next=right.graph.items.find(candidate=>candidate.id===item.id);
    return next&&JSON.stringify(item.properties)!==JSON.stringify(next.properties)
      ?[{id:item.id,roles:item.roles,before:item.properties,after:next.properties}]:[];
  });
  console.log(JSON.stringify({
    before:{source:left.source,bytes:left.bytes,status:left.classification.status,
      sourceContractId:left.classification.sourceContractId,sourceSignature:left.classification.sourceSignature,
      preflightDecision:left.preflight.decision,reasons:left.classification.reasons},
    after:{source:right.source,bytes:right.bytes,status:right.classification.status,
      sourceContractId:right.classification.sourceContractId,sourceSignature:right.classification.sourceSignature,
      preflightDecision:right.preflight.decision,reasons:right.classification.reasons},
    fingerprintChanges:walk(left.fingerprint,right.fingerprint),
    semanticItems,
    references,
    makerNoteChanges:maker,
    itemPayloadChanges,
    propertyChanges,
    crossBoundaryDependencies:{
      before:left.graph.crossBoundaryDependencies,
      after:right.graph.crossBoundaryDependencies,
    },
    preservedRoles:rolePreservation(left,right,sanitized),
  },null,2));
}
