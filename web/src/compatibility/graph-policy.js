import {auxUriForItem,DEPTH_URI,MATTE_URI_SET} from '../core/heif.js';
import {isApplePhotoUrn,isAppleTagUri} from './contract-registry.js';

export function protectedSemanticItemIds(d){
  const protectedIds=new Set([
    d.primary,...d.primaryTiles,d.hdrGrid,...d.hdrTiles,d.thumbnail,d.exifItem,
  ].filter(id=>id!==null&&id!==undefined));
  for(const id of d.infos.keys()){
    const aux=auxUriForItem(d.props,id);
    if(aux===DEPTH_URI||MATTE_URI_SET.has(aux)||isApplePhotoUrn(aux))protectedIds.add(id);
  }
  // Auxiliary photo resources are often grids whose HEVC tiles carry no aux
  // URI of their own. Protect the complete dimg closure so depth/matte/future
  // photographic-aux payloads cannot be silently changed or discarded.
  let changed=true;
  while(changed){
    changed=false;
    for(const ref of d.refs){
      if(ref.type!=='dimg'||!protectedIds.has(ref.from))continue;
      for(const id of ref.to)if(!protectedIds.has(id)){
        protectedIds.add(id);changed=true;
      }
    }
  }
  return protectedIds;
}

export function editingSeedItemIds(d,protectedIds=protectedSemanticItemIds(d)){
  const editing=new Set();
  for(const [id,info] of d.infos){
    if(protectedIds.has(id))continue;
    const aux=auxUriForItem(d.props,id);
    if(isAppleTagUri(info.uri)||isAppleTagUri(aux))editing.add(id);
  }
  return editing;
}

export function editingClosureItemIds(d,protectedIds=protectedSemanticItemIds(d)){
  const editing=editingSeedItemIds(d,protectedIds);
  let changed=true;
  while(changed){
    changed=false;
    for(const ref of d.refs){
      if(editing.has(ref.from)&&ref.type==='dimg'){
        for(const id of ref.to){
          if(!protectedIds.has(id)&&!editing.has(id)){editing.add(id);changed=true;}
        }
      }
      if(ref.to.length&&ref.to.every(id=>editing.has(id))){
        const info=d.infos.get(ref.from);
        if(info?.type==='mime'&&!protectedIds.has(ref.from)&&!editing.has(ref.from)){
          editing.add(ref.from);changed=true;
        }
      }
    }
  }
  return editing;
}

export function semanticRolesForItem(d,id){
  const roles=[];
  if(id===d.primary)roles.push('primary');
  if(d.primaryTiles.includes(id))roles.push('primary-tile');
  if(id===d.hdrGrid)roles.push('hdr-grid');
  if(d.hdrTiles.includes(id))roles.push('hdr-tile');
  if(id===d.thumbnail)roles.push('thumbnail');
  if(id===d.exifItem)roles.push('exif');
  if(id===d.linearThumb)roles.push('linear-thumbnail');
  if(id===d.deltaGrid)roles.push('style-delta-grid');
  if(d.deltaTiles.includes(id))roles.push('style-delta-tile');
  if(id===d.stylesItem)roles.push('styles');
  const aux=auxUriForItem(d.props,id);
  if(aux===DEPTH_URI)roles.push('depth');
  else if(MATTE_URI_SET.has(aux)||isApplePhotoUrn(aux))roles.push('photographic-aux');
  const info=d.infos.get(id);
  if(isAppleTagUri(info?.uri)||isAppleTagUri(aux))roles.push('apple-editing');
  if(!roles.length)roles.push('other');
  return roles.sort();
}

export function referenceBoundary(d,ref,editingIds,protectedIds){
  const fromEditing=editingIds.has(ref.from),fromProtected=protectedIds.has(ref.from);
  const editingTargets=ref.to.filter(id=>editingIds.has(id));
  const protectedTargets=ref.to.filter(id=>protectedIds.has(id));
  return {fromEditing,fromProtected,editingTargets,protectedTargets,
    crosses:(fromEditing&&protectedTargets.length>0)||(fromProtected&&editingTargets.length>0)};
}

export function isKnownSafeEditingBoundaryReference(d,ref,editingIds,protectedIds){
  const boundary=referenceBoundary(d,ref,editingIds,protectedIds);
  if(!boundary.crosses)return true;
  if(boundary.fromProtected&&boundary.editingTargets.length)return false;
  if(!boundary.fromEditing)return false;
  const primaryOnly=new Set([d.primary].filter(id=>id!==null&&id!==undefined));
  if(ref.type==='auxl'||ref.type==='thmb')
    return boundary.protectedTargets.every(id=>primaryOnly.has(id));
  if(ref.type!=='cdsc')return false;
  const descriptiveTargets=new Set([d.primary,d.hdrGrid].filter(id=>id!==null&&id!==undefined));
  return boundary.protectedTargets.every(id=>descriptiveTargets.has(id));
}

export function editingGraphCycles(d,editingIds){
  const edges=new Map();
  for(const id of editingIds)edges.set(id,[]);
  for(const ref of d.refs){
    if(!editingIds.has(ref.from)||ref.type!=='dimg')continue;
    const list=edges.get(ref.from);
    for(const id of ref.to)if(editingIds.has(id))list.push(id);
  }
  const visiting=new Set(),visited=new Set(),cycles=[];
  function walk(id,path){
    if(visiting.has(id)){cycles.push([...path,id]);return;}
    if(visited.has(id))return;
    visiting.add(id);
    for(const next of edges.get(id)||[])walk(next,[...path,id]);
    visiting.delete(id);visited.add(id);
  }
  for(const id of editingIds)walk(id,[]);
  return cycles;
}
