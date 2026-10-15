import {discoverHeic,extractItem,idatItemBytes,auxUriForItem} from '../core/heif.js';
import {protectedSemanticItemIds,semanticRolesForItem} from './graph-policy.js';
import {COMPATIBILITY_ERROR,compatibilityError} from './errors.js';

function bytesFor(data,d,id){
  const item=d.iloc.items.get(id);
  if(!item)throw Error('Missing item '+id);
  if(item.constructionMethod===0)return extractItem(data,d.iloc,id);
  if(item.constructionMethod===1){
    const bytes=idatItemBytes(data,id,d.meta);
    if(bytes)return bytes;
  }
  throw Error('Unsupported protected item payload '+id);
}
function hashBytes(bytes){
  let hash=0x811c9dc5;
  for(const value of bytes){hash^=value;hash=Math.imul(hash,0x01000193)>>>0;}
  return bytes.length+':'+hash.toString(16).padStart(8,'0');
}
function protectedRoleMap(d,protectedIds){
  const map=new Map();
  for(const id of protectedIds){
    const direct=semanticRolesForItem(d,id).filter(role=>role!=='other'&&role!=='apple-editing');
    map.set(id,new Set(direct));
  }
  const propagatedRole=role=>{
    if(role==='primary'||role==='primary-tile'||role==='primary-descendant')return 'primary-descendant';
    if(role==='hdr-grid'||role==='hdr-tile'||role==='hdr-descendant')return 'hdr-descendant';
    if(role==='depth'||role==='depth-descendant')return 'depth-descendant';
    if(role==='photographic-aux'||role==='photographic-aux-descendant')return 'photographic-aux-descendant';
    if(role==='thumbnail'||role==='thumbnail-descendant')return 'thumbnail-descendant';
    return null;
  };
  let changed=true;
  while(changed){
    changed=false;
    for(const ref of d.refs){
      if(ref.type!=='dimg'||!protectedIds.has(ref.from))continue;
      const parentRoles=map.get(ref.from)||new Set();
      for(const id of ref.to){
        if(!protectedIds.has(id))continue;
        const child=map.get(id)||new Set();
        for(const parentRole of parentRoles){
          const role=propagatedRole(parentRole);
          if(role&&!child.has(role)){child.add(role);changed=true;}
        }
        map.set(id,child);
      }
    }
  }
  for(const id of protectedIds){
    const roles=map.get(id)||new Set();
    if(!roles.size)roles.add('protected-resource');
    map.set(id,roles);
  }
  return map;
}
function rolesFor(roleMap,id){
  return [...(roleMap.get(id)||[])].sort();
}
function roleInventory(data){
  const d=discoverHeic(data),protectedIds=protectedSemanticItemIds(d);
  const roleMap=protectedRoleMap(d,protectedIds),roles=new Map();
  for(const id of protectedIds){
    for(const role of rolesFor(roleMap,id)){
      // Exif can legitimately change inside the explicitly budgeted Apple
      // MakerNote. Capture Exif outside MakerNote is verified separately by
      // mutation-budget.js.
      if(role==='exif')continue;
      if(!roles.has(role))roles.set(role,[]);
      roles.get(role).push(hashBytes(bytesFor(data,d,id)));
    }
  }
  return Object.fromEntries([...roles]
    .map(([role,values])=>[role,values.sort()])
    .sort(([a],[b])=>a.localeCompare(b)));
}
function protectedTopology(data){
  const d=discoverHeic(data),protectedIds=protectedSemanticItemIds(d);
  const roleMap=protectedRoleMap(d,protectedIds),items=[],references=[];
  for(const id of protectedIds){
    const info=d.infos.get(id);
    if(!info)continue;
    const properties=(d.props.associations.get(id)||[]).map(association=>({
      type:d.props.properties[association.index-1]?.type??'missing-property',
      essential:Boolean(association.essential),
    })).sort((a,b)=>a.type.localeCompare(b.type)||Number(a.essential)-Number(b.essential));
    items.push({
      roles:rolesFor(roleMap,id),
      type:info.type??null,
      uri:info.uri??null,
      auxUri:auxUriForItem(d.props,id)??null,
      properties,
    });
  }
  for(const ref of d.refs){
    if(!protectedIds.has(ref.from)||!ref.to.length||ref.to.some(id=>!protectedIds.has(id)))continue;
    references.push({
      type:ref.type,
      fromRoles:rolesFor(roleMap,ref.from),
      toRoles:ref.to.map(id=>rolesFor(roleMap,id)),
    });
  }
  const sortJson=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
  items.sort(sortJson);references.sort(sortJson);
  return {items,references};
}

export function semanticPreservationDiff(source,output){
  const before=roleInventory(source),after=roleInventory(output);
  const roles=[...new Set([...Object.keys(before),...Object.keys(after)])].sort();
  const payloadChanged=[];
  for(const role of roles){
    const a=before[role]??[],b=after[role]??[];
    if(JSON.stringify(a)!==JSON.stringify(b))payloadChanged.push({kind:'payload',role,before:a,after:b});
  }
  const topologyBefore=protectedTopology(source),topologyAfter=protectedTopology(output);
  const topologyChanged=[];
  if(JSON.stringify(topologyBefore.items)!==JSON.stringify(topologyAfter.items))
    topologyChanged.push({kind:'topology',section:'items',before:topologyBefore.items,after:topologyAfter.items});
  if(JSON.stringify(topologyBefore.references)!==JSON.stringify(topologyAfter.references))
    topologyChanged.push({kind:'topology',section:'references',
      before:topologyBefore.references,after:topologyAfter.references});
  return {
    before,after,topologyBefore,topologyAfter,
    payloadChanged,topologyChanged,
    changed:[...payloadChanged,...topologyChanged],
  };
}

export function verifySemanticPreservation(source,output){
  const diff=semanticPreservationDiff(source,output);
  if(diff.changed.length)throw compatibilityError(COMPATIBILITY_ERROR.PAYLOAD_PRESERVATION_FAILED,
    'Legacy compatibility changed protected semantic photo resources or topology',{changed:diff.changed});
  return {
    roles:Object.keys(diff.before).sort(),
    payloadChanged:[],
    topologyChanged:[],
    changed:[],
  };
}
