import {discoverHeic,auxUriForItem} from '../core/heif.js';
import {metaChildren,findChild} from '../core/box.js';
import {classifyPhotoContract} from './contract-classifier.js';
import {
  protectedSemanticItemIds,editingClosureItemIds,editingGraphCycles,
  referenceBoundary,isKnownSafeEditingBoundaryReference,semanticRolesForItem,
} from './graph-policy.js';
import {COMPATIBILITY_LIMITS,COMPATIBILITY_ENGINE_VERSION,RECOVERY_PREFLIGHT_VERSION} from './versions.js';
import {LEGACY_BASELINE_CONTRACT_ID,KNOWN_RENDERING_REFERENCE_TYPES} from './contract-registry.js';

const DISCARDABLE_PREFIXES=[
  'styles-schema:','styles-unreadable','styles-key:','texture-people-version:','texture-unreadable',
  'texture-key:','style-selection-contract','style-selection-key:','future-native-texture-marker',
  'unknown-edit-reference:','unknown-tag:','duplicate-editing-family:','unknown-nonessential-property:',
];
const PHOTOGRAPHIC_PREFIXES=['unknown-urn:'];
const CONTAINER_PREFIXES=['container-contract','unknown-essential-property:'];

function starts(reason,prefixes){return prefixes.some(prefix=>reason===prefix||reason.startsWith(prefix));}
export function classifyCompatibilityReason(reason){
  if(starts(reason,CONTAINER_PREFIXES))return 'container-change';
  if(starts(reason,PHOTOGRAPHIC_PREFIXES))return 'photographic-semantic-change';
  if(reason.startsWith('unknown-tag:')){
    const uri=reason.slice('unknown-tag:'.length);
    if(uri.includes(':photo:metadata:'))return 'discardable-editing-change';
    // Unknown Apple auxiliary resources may become depth/HDR/matte inputs to
    // Photos. Never discard them merely because they use the tag namespace.
    if(uri.includes(':photo:aux:'))return 'photographic-semantic-change';
    return 'ambiguous-dependency';
  }
  if(starts(reason,DISCARDABLE_PREFIXES))return 'discardable-editing-change';
  return 'ambiguous-dependency';
}

function limitFailure(kind,actual,limit){return {code:'resource-limit-exceeded',kind,actual,limit};}
function preflightFailure(code,detail){return {code,detail};}

function sanitizeDiagnosticValue(value,key=''){
  if(['id','from','to','editingItems'].includes(key))return undefined;
  if(Array.isArray(value))return value.map(entry=>sanitizeDiagnosticValue(entry)).filter(entry=>entry!==undefined);
  if(value&&typeof value==='object'){
    const out={};
    for(const [childKey,entry] of Object.entries(value)){
      const safe=sanitizeDiagnosticValue(entry,childKey);
      if(safe!==undefined)out[childKey]=safe;
    }
    return out;
  }
  return value;
}

export function sanitizeCompatibilityPreflight(preflight){
  const safe=sanitizeDiagnosticValue(preflight);
  safe.editingItems=[];
  safe.protectedRoles=[...(preflight.protectedRoles||[])];
  return safe;
}

export function preflightLegacyCompatibilityExport(source,{
  classification=null,
  discovery=null,
  limits=COMPATIBILITY_LIMITS,
  targetId=LEGACY_BASELINE_CONTRACT_ID,
}={}){
  if(source.length>limits.maxSourceBytes&&!classification){
    return {
      version:RECOVERY_PREFLIGHT_VERSION,
      engineVersion:COMPATIBILITY_ENGINE_VERSION,
      sourceContractId:null,
      sourceSignature:null,
      targetId,
      decision:'preserve-only',
      eligible:false,
      reasonClasses:{},
      blockers:[limitFailure('source-bytes',source.length,limits.maxSourceBytes)],
      warnings:[],
      counts:{},
      protectedRoles:[],
      editingItems:[],
    };
  }
  const sourceClassification=classification||classifyPhotoContract(source);
  const result={
    version:RECOVERY_PREFLIGHT_VERSION,
    engineVersion:COMPATIBILITY_ENGINE_VERSION,
    sourceContractId:sourceClassification.sourceContractId,
    sourceSignature:sourceClassification.sourceSignature??null,
    targetId,
    decision:'preserve-only',
    eligible:false,
    reasonClasses:Object.fromEntries(sourceClassification.reasons.map(reason=>[reason,classifyCompatibilityReason(reason)])),
    blockers:[],
    warnings:[],
    counts:{},
    protectedRoles:[],
    editingItems:[],
  };

  if(sourceClassification.status!=='unknown-apple-contract'){
    result.decision='noop';
    result.blockers.push(preflightFailure('source-not-unknown',sourceClassification.status));
    return result;
  }
  if(!sourceClassification.recovery?.eligible){
    result.blockers.push(preflightFailure('classifier-blocked',sourceClassification.recovery?.reason??'not eligible'));
    return result;
  }
  if(source.length>limits.maxSourceBytes){
    result.blockers.push(limitFailure('source-bytes',source.length,limits.maxSourceBytes));
    return result;
  }

  let d;
  try{d=discovery||discoverHeic(source);}
  catch(error){
    result.blockers.push(preflightFailure('parser-failed',String(error?.message||error)));
    return result;
  }
  const protectedIds=protectedSemanticItemIds(d);
  const editingIds=editingClosureItemIds(d,protectedIds);
  const associationCount=[...d.props.associations.values()].reduce((sum,list)=>sum+list.length,0);
  const totalExtents=[...d.iloc.items.values()].reduce((sum,item)=>sum+item.extents.length,0);
  result.counts={
    items:d.infos.size,references:d.refs.length,properties:d.props.properties.length,
    propertyAssociations:associationCount,totalExtents,editingItems:editingIds.size,protectedItems:protectedIds.size,
  };
  for(const [kind,actual,limit] of [
    ['items',d.infos.size,limits.maxItems],
    ['references',d.refs.length,limits.maxReferences],
    ['properties',d.props.properties.length,limits.maxProperties],
    ['property-associations',associationCount,limits.maxPropertyAssociations],
    ['extents',totalExtents,limits.maxTotalExtents],
    ['editing-items',editingIds.size,limits.maxEditingItems],
    ['unknown-properties',sourceClassification.fingerprint.container.unknownProperties?.length??0,limits.maxUnknownProperties],
  ])if(actual>limit)result.blockers.push(limitFailure(kind,actual,limit));

  const outgoingTargets=new Map();
  for(const ref of d.refs)outgoingTargets.set(ref.from,(outgoingTargets.get(ref.from)||0)+ref.to.length);
  for(const [id,info] of d.infos){
    const itemUri=info.uri??'',auxUri=auxUriForItem(d.props,id)??'';
    if(itemUri.length>limits.maxUriLength)
      result.blockers.push(limitFailure('item-uri-length',itemUri.length,limits.maxUriLength));
    if(auxUri.length>limits.maxUriLength)
      result.blockers.push(limitFailure('aux-uri-length',auxUri.length,limits.maxUriLength));
    const outgoing=outgoingTargets.get(id)||0;
    if(outgoing>limits.maxReferencesPerItem)
      result.blockers.push(limitFailure('references-per-item',outgoing,limits.maxReferencesPerItem));
    const associations=d.props.associations.get(id)?.length??0;
    if(associations>limits.maxPropertyAssociationsPerItem)
      result.blockers.push(limitFailure('property-associations-per-item',associations,limits.maxPropertyAssociationsPerItem));
  }

  // Validate idat-relative extents against the containing box, without copying
  // payloads or reparsing iloc for every item. Typed-array slices clamp invalid
  // ranges, so successful extraction alone cannot establish bounds.
  let idat=null;
  if([...d.iloc.items.values()].some(item=>item.constructionMethod===1)){
    try{idat=findChild(metaChildren(source,d.meta),'idat');}catch{}
  }
  for(const [id,item] of d.iloc.items){
    if(item.extents.length>limits.maxExtentsPerItem)
      result.blockers.push(limitFailure('extents-per-item:'+id,item.extents.length,limits.maxExtentsPerItem));
    const itemBytes=item.extents.reduce((sum,extent)=>sum+extent.length,0);
    if(editingIds.has(id)&&itemBytes>limits.maxMetadataPayloadBytes)
      result.blockers.push(limitFailure('editing-item-bytes',itemBytes,limits.maxMetadataPayloadBytes));
    if(!d.infos.has(id))result.blockers.push(preflightFailure('iloc-without-info',id));
    if(item.constructionMethod===0){
      for(const extent of item.extents){
        const start=item.baseOffset+extent.offset,end=start+extent.length;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>source.length)
          result.blockers.push(preflightFailure('extent-out-of-bounds',{id,start,end,bytes:source.length}));
      }
    }else if(item.constructionMethod===1){
      if(!idat||item.extents.length!==1){
        result.blockers.push(preflightFailure('unsupported-idat-layout',id));
        continue;
      }
      const bytes=idat.size-idat.hdr;
      for(const extent of item.extents){
        const start=item.baseOffset+extent.offset,end=start+extent.length;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>bytes)
          result.blockers.push(preflightFailure('idat-out-of-bounds',{id,start,end,bytes}));
      }
    }else result.blockers.push(preflightFailure('unsupported-construction-method',{id,method:item.constructionMethod}));
  }

  for(const [id] of d.infos)if(!d.iloc.items.has(id))
    result.blockers.push(preflightFailure('info-without-iloc',id));

  for(const ref of d.refs){
    if(!d.infos.has(ref.from))result.blockers.push(preflightFailure('dangling-reference-source',{type:ref.type,id:ref.from}));
    for(const id of ref.to)if(!d.infos.has(id))
      result.blockers.push(preflightFailure('dangling-reference-target',{type:ref.type,id}));
    if(!KNOWN_RENDERING_REFERENCE_TYPES.has(ref.type)
      &&(protectedIds.has(ref.from)||ref.to.some(id=>protectedIds.has(id))))
      result.blockers.push(preflightFailure('unknown-reference-on-protected-resource',{
        type:ref.type,fromRoles:semanticRolesForItem(d,ref.from),
        toRoles:ref.to.map(id=>semanticRolesForItem(d,id)),
      }));
    const boundary=referenceBoundary(d,ref,editingIds,protectedIds);
    if(boundary.crosses&&!isKnownSafeEditingBoundaryReference(d,ref,editingIds,protectedIds)){
      result.blockers.push(preflightFailure('cross-boundary-dependency',{
        type:ref.type,fromRoles:semanticRolesForItem(d,ref.from),
        toRoles:ref.to.map(id=>semanticRolesForItem(d,id)),
      }));
    }
  }

  for(const [id,associations] of d.props.associations){
    if(!d.infos.has(id))result.blockers.push(preflightFailure('properties-for-missing-item',id));
    for(const association of associations){
      if(association.index<1||association.index>d.props.properties.length)
        result.blockers.push(preflightFailure('invalid-property-association',{id,index:association.index}));
    }
  }

  for(const property of sourceClassification.fingerprint.container.unknownProperties??[]){
    if(protectedIds.has(property.id)){
      result.blockers.push(preflightFailure('unknown-property-on-protected-resource',{
        type:property.type,essential:property.essential,roles:semanticRolesForItem(d,property.id),
      }));
    }else if(!editingIds.has(property.id)){
      result.blockers.push(preflightFailure('unknown-property-on-preserved-resource',{
        type:property.type,essential:property.essential,roles:semanticRolesForItem(d,property.id),
      }));
    }else result.warnings.push({code:'discarding-unknown-editing-property',type:property.type,essential:property.essential});
  }

  const cycles=editingGraphCycles(d,editingIds);
  if(cycles.length)result.blockers.push(preflightFailure('editing-graph-cycle',{count:cycles.length}));

  for(const reason of sourceClassification.reasons){
    const risk=classifyCompatibilityReason(reason);
    if(risk!=='discardable-editing-change')
      result.blockers.push(preflightFailure('non-editing-contract-change',{reason,risk}));
  }

  result.protectedRoles=[...protectedIds].map(id=>semanticRolesForItem(d,id).join('+')).sort();
  result.editingItems=[...editingIds].sort((a,b)=>a-b);
  if(!result.blockers.length){
    result.eligible=true;
    result.decision='legacy-rebuild';
  }
  return result;
}
