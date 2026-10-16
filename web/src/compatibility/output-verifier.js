import {
  discoverHeic,auxUriForItem,URI_STYLES,URI_LINEAR_THUMB,URI_STYLE_DELTA,
} from '../core/heif.js';
import {URI_TEXTURE_STYLES} from '../styles/texture.js';
import {styleCapabilities} from '../styles/style-capabilities.js';
import {classifyPhotoContract} from './contract-classifier.js';
import {LEGACY_BASELINE_CONTRACT_ID} from './contract-registry.js';
import {legacyTarget} from './target-registry.js';
import {COMPATIBILITY_ERROR,compatibilityError} from './errors.js';
import {
  protectedSemanticItemIds,editingClosureItemIds,isKnownSafeEditingBoundaryReference,
} from './graph-policy.js';

function countItemUri(d,uri){
  let count=0;
  for(const info of d.infos.values())if(info.uri===uri)count++;
  return count;
}
function countAuxUri(d,uri){
  let count=0;
  for(const id of d.infos.keys())if(auxUriForItem(d.props,id)===uri)count++;
  return count;
}

export function verifyLegacyOutput(data,{targetId=LEGACY_BASELINE_CONTRACT_ID,expectTexture=true}={}){
  const target=legacyTarget(targetId);
  const fail=(message,details=null)=>{throw compatibilityError(COMPATIBILITY_ERROR.TARGET_CLASSIFICATION_FAILED,message,details);};
  let d,classification;
  try{d=discoverHeic(data);classification=classifyPhotoContract(data);}
  catch(error){fail('Legacy compatibility output cannot be parsed/classified as the target contract',{
    message:String(error?.message||error),
  });}
  const fp=classification.fingerprint;
  if(classification.status!=='known-compatible')
    fail('Legacy compatibility output does not match a known Apple contract',{status:classification.status});
  if(target.invariants.requireEditableStyles&&!styleCapabilities(data).editable)
    fail('Legacy compatibility output is not editable in the known Styles model');
  if(!target.invariants.stylesSchemas.includes(fp.styles.schema))
    fail('Legacy compatibility output uses an unexpected Styles schema',{schema:fp.styles.schema});
  if(fp.texture.present&&fp.texture.peopleVersion!==target.invariants.texturePeopleVersion)
    fail('Legacy compatibility output uses an unexpected Texture contract',{peopleVersion:fp.texture.peopleVersion});
  if(target.invariants.forbidUnknownAppleUris
    &&(fp.apple.unknownTagUris.length||fp.apple.unknownUrnUris.length))
    fail('Legacy compatibility output contains unknown Apple resources',{
      tags:fp.apple.unknownTagUris,urns:fp.apple.unknownUrnUris,
    });
  if(fp.container.unknownProperties.length)
    fail('Legacy compatibility output contains unknown property types',{
      properties:fp.container.unknownProperties.map(entry=>entry.type),
    });
  for(const type of fp.container.refTypes)if(!target.invariants.allowedReferenceTypes.includes(type))
    fail('Legacy compatibility output contains an unexpected reference type',{type});
  for(const type of fp.container.propertyTypes)if(!target.invariants.allowedPropertyTypes.includes(type))
    fail('Legacy compatibility output contains an unexpected property type',{type});

  for(const ref of d.refs){
    if(!d.infos.has(ref.from))fail('Legacy compatibility output has dangling reference source '+ref.from);
    for(const id of ref.to)if(!d.infos.has(id))
      fail('Legacy compatibility output has dangling reference target '+id);
  }
  for(const [id,associations] of d.props.associations){
    if(!d.infos.has(id))fail('Legacy compatibility output has properties for missing item '+id);
    for(const association of associations){
      if(association.index<1||association.index>d.props.properties.length)
        fail('Legacy compatibility output has invalid property index '+association.index+' for item '+id);
    }
  }

  const families={
    styles:countItemUri(d,URI_STYLES),
    texture:countItemUri(d,URI_TEXTURE_STYLES),
    linearThumbnail:countAuxUri(d,URI_LINEAR_THUMB),
    styleDelta:countAuxUri(d,URI_STYLE_DELTA),
  };
  if(families.styles!==1)fail('Legacy compatibility output must contain exactly one Styles contract');
  if(expectTexture&&families.texture!==1)
    fail('Legacy compatibility output must contain exactly one Texture contract',{count:families.texture});
  if(!expectTexture&&families.texture!==0)
    fail('Legacy compatibility output unexpectedly contains Texture metadata',{count:families.texture});
  for(const [family,count] of Object.entries(families)){
    const maximum=target.invariants.familyMaximums[family];
    if(maximum!==undefined&&count>maximum)
      fail('Legacy compatibility output contains duplicate editing resources',{family,count,maximum});
  }
  const protectedIds=protectedSemanticItemIds(d),editingIds=editingClosureItemIds(d,protectedIds);
  for(const ref of d.refs){
    if(!isKnownSafeEditingBoundaryReference(d,ref,editingIds,protectedIds))
      fail('Legacy compatibility output contains an unsafe editing/photo boundary reference',{
        type:ref.type,from:ref.from,to:ref.to,
      });
  }

  return {
    targetId:target.id,
    sourceSignature:classification.sourceSignature,
    status:classification.status,
    editable:true,
    references:d.refs.length,
    itemCount:d.infos.size,
    families,
  };
}
