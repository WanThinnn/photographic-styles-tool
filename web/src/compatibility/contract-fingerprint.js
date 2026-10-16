import {topBox,metaChildren,findChild} from '../core/box.js';
import {
  discoverHeic,auxUriForItem,dimensionsForItem,extractItem,DEPTH_URI,MATTE_URI_SET,
  URI_STYLES,URI_LINEAR_THUMB,URI_STYLE_DELTA,
} from '../core/heif.js';
import {parseBplist} from '../core/bplist.js';
import {
  exifCameraModel,extractAppleMakerNoteTag,getMakerNoteBlob,listAppleMakerNoteTags,
} from '../core/exif.js';
import {URI_TEXTURE_STYLES} from '../styles/texture.js';
import {
  isAppleTagUri,isApplePhotoUrn,isKnownAppleTagUri,isKnownApplePhotoUrn,isKnownStylesSchema,
  KNOWN_RENDERING_REFERENCE_TYPES,KNOWN_RENDERING_PROPERTY_TYPES,
  KNOWN_STYLES_KEYS,KNOWN_TEXTURE_KEYS,KNOWN_STYLE_SELECTION_KEYS,
} from './contract-registry.js';
import {protectedSemanticItemIds,semanticRolesForItem} from './graph-policy.js';
import {CONTRACT_FINGERPRINT_VERSION,COMPATIBILITY_LIMITS} from './versions.js';

function readBrands(data){
  const ft=topBox(data,'ftyp'),brands=[];
  for(let p=ft.off+16;p+4<=ft.off+ft.size;p+=4)brands.push(String.fromCharCode(...data.subarray(p,p+4)));
  return brands;
}
function irefVersion(data,d){
  try{const b=findChild(metaChildren(data,d.meta),'iref');return data[b.off+b.hdr];}catch{return null;}
}
function declaredItemBytes(d,id){
  const item=d.iloc.items.get(id);
  if(!item)return null;
  let total=0;
  for(const extent of item.extents){
    if(!Number.isSafeInteger(extent.length)||extent.length<0)return null;
    total+=extent.length;
    if(!Number.isSafeInteger(total))return null;
  }
  return total;
}
function metadataPayloadAllowed(d,id){
  const bytes=declaredItemBytes(d,id);
  return bytes!==null&&bytes<=COMPATIBILITY_LIMITS.maxMetadataPayloadBytes;
}
function makerEvidence(data,d){
  const empty={readable:false,tagInventory:[],duplicateTags:[],
    styleSelection:false,styleSelectionPresent:false,styleSelectionReadable:false,
    styleSelectionType:null,styleSelectionKeys:[],styleSelectionUnknownKeys:[],
    nativeTexture:false,nativeTexturePresent:false};
  if(d.exifItem===null)return empty;
  let exif;
  try{exif=extractItem(data,d.iloc,d.exifItem);}catch{return empty;}
  let readable=false,tagInventory=[];
  try{
    const mn=getMakerNoteBlob(exif);
    const signatureOk=mn.length>=20&&String.fromCharCode(...mn.subarray(0,9))==='Apple iOS';
    if(!signatureOk)throw Error('Unsupported Apple MakerNote');
    if(mn.length>COMPATIBILITY_LIMITS.maxMetadataPayloadBytes)
      throw Error('Apple MakerNote exceeds compatibility metadata budget');
    tagInventory=listAppleMakerNoteTags(exif)
      .map(entry=>({tag:entry.tag,type:entry.type,bytes:entry.payload.length}))
      .sort((a,b)=>a.tag-b.tag||a.type-b.type||a.bytes-b.bytes);
    readable=true;
  }catch{readable=false;tagInventory=[];}
  const tagCounts=new Map();
  for(const entry of tagInventory)tagCounts.set(entry.tag,(tagCounts.get(entry.tag)||0)+1);
  const duplicateTags=[...tagCounts].filter(([,count])=>count>1).map(([tag])=>tag).sort((a,b)=>a-b);
  const styleInventory=tagInventory.find(entry=>entry.tag===0x54);
  let styleSelection=false,styleSelectionPresent=Boolean(styleInventory),styleSelectionReadable=false;
  let styleSelectionType=styleInventory?.type??null,styleSelectionKeys=[],styleSelectionUnknownKeys=[];
  try{
    const tag=extractAppleMakerNoteTag(exif,0x54);
    styleSelectionType=tag.type;
    try{
      if(tag.payload.length>COMPATIBILITY_LIMITS.maxMetadataPayloadBytes)
        throw Error('Style selection metadata exceeds compatibility budget');
      const value=parseBplist(tag.payload);
      styleSelectionReadable=value instanceof Map;
      if(value instanceof Map){
        if(value.size>COMPATIBILITY_LIMITS.maxPlistKeys)
          throw Error('Style selection metadata has too many keys');
        styleSelectionKeys=[...value.keys()].map(String).sort();
        styleSelectionUnknownKeys=styleSelectionKeys.filter(key=>!KNOWN_STYLE_SELECTION_KEYS.has(key));
        styleSelection=[1,7].includes(tag.type)&&value.get('0')===1
          &&Number.isInteger(value.get('4'))&&value.get('4')>=1
          &&['1','2'].every(key=>Number.isFinite(value.get(key)));
      }
    }catch{}
  }catch{}
  let nativeTexture=false;
  const nativeTexturePresent=tagInventory.some(entry=>entry.tag===0x65);
  try{
    const tag=extractAppleMakerNoteTag(exif,0x65);
    nativeTexture=tag.type===7&&tag.payload.length>0;
  }catch{}
  return {readable,tagInventory,duplicateTags,styleSelection,styleSelectionPresent,styleSelectionReadable,styleSelectionType,
    styleSelectionKeys,styleSelectionUnknownKeys,nativeTexture,nativeTexturePresent};
}

function textureEvidence(data,d){
  const found=[...d.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES);
  if(!found)return {present:false,readable:false,known:false,peopleVersion:null,keys:[],unknownKeys:[]};
  const [id]=found;
  try{
    if(!metadataPayloadAllowed(d,id))throw Error('Texture metadata exceeds compatibility budget');
    const value=parseBplist(extractItem(data,d.iloc,id),{preserveReals:true});
    if(!(value instanceof Map))return {present:true,readable:false,known:false,peopleVersion:null,keys:[],unknownKeys:[]};
    if(value.size>COMPATIBILITY_LIMITS.maxPlistKeys)
      throw Error('Texture metadata has too many keys');
    const version=value.get('TextureStylePeopleDataVersion');
    const required=[
      ['Preset','string'],['CaptureType','string'],['CaptureMode','string'],['PortType','string'],
      ['HardwareModel','string'],['TextureStylePeopleDataVersion','number'],['FilmGrainSeed','number'],
    ];
    const shapeOk=required.every(([key,type])=>value.has(key)&&typeof value.get(key)===type);
    const keys=[...value.keys()].map(String).sort();
    return {present:true,readable:true,known:shapeOk&&version===3,peopleVersion:version,
      keys,unknownKeys:keys.filter(key=>!KNOWN_TEXTURE_KEYS.has(key))};
  }catch{return {present:true,readable:false,known:false,peopleVersion:null,keys:[],unknownKeys:[]};}
}

export function sanitizeContractFingerprint(fingerprint){
  const fp=fingerprint;
  return {
    version:fp.version,
    camera:{model:fp.camera.model,generation:fp.camera.generation},
    container:{
      brands:[...fp.container.brands],
      metaVersion:fp.container.metaVersion,
      iloc:{...fp.container.iloc},
      irefVersion:fp.container.irefVersion,
      ipma:{...fp.container.ipma},
      itemCount:fp.container.itemCount,
      referenceCount:fp.container.referenceCount,
      propertyCount:fp.container.propertyCount,
      propertyAssociationCount:fp.container.propertyAssociationCount,
      constructionMethods:[...fp.container.constructionMethods],
      propertyTypes:[...fp.container.propertyTypes],
      unknownEssentialPropertyTypes:[...new Set(fp.container.unknownEssentialProperties.map(entry=>entry.type))].sort(),
      unknownNonEssentialPropertyTypes:[...new Set(fp.container.unknownNonEssentialProperties.map(entry=>entry.type))].sort(),
      propertyTopology:fp.container.propertyTopology.map(entry=>({
        roles:[...entry.roles],properties:entry.properties.map(property=>({...property})),
      })),
      referenceTopology:fp.container.referenceTopology.map(entry=>({
        type:entry.type,fromRoles:[...entry.fromRoles],toRoles:entry.toRoles.map(roles=>[...roles]),
      })),
      familyCounts:{...fp.container.familyCounts},
      refTypes:[...fp.container.refTypes],
    },
    roles:{
      primarySize:[...fp.roles.primarySize],
      primaryType:fp.roles.primaryType,
      primaryTiles:fp.roles.primaryTiles,
      primaryTileTypes:[...fp.roles.primaryTileTypes],
      hdrPresent:fp.roles.hdrGrid!==null,
      hdrGridType:fp.roles.hdrGridType,
      hdrTiles:fp.roles.hdrTiles,
      hdrTileTypes:[...fp.roles.hdrTileTypes],
      depthItems:fp.roles.depthItems.length,
      matteItems:fp.roles.matteItems.length,
      thumbnailPresent:fp.roles.thumbnail!==null,
      linearThumbPresent:fp.roles.linearThumb!==null,
      deltaPresent:fp.roles.deltaGrid!==null,
      deltaTiles:fp.roles.deltaTiles,
      exifPresent:fp.roles.exif!==null,
    },
    styles:{
      present:fp.styles.present,readable:fp.styles.readable,schema:fp.styles.schema,
      known:fp.styles.known,keys:[...fp.styles.keys],unknownKeys:[...fp.styles.unknownKeys],
    },
    texture:{
      present:fp.texture.present,readable:fp.texture.readable,known:fp.texture.known,
      peopleVersion:fp.texture.peopleVersion,keys:[...fp.texture.keys],unknownKeys:[...fp.texture.unknownKeys],
    },
    maker:{
      readable:fp.maker.readable,
      tagInventory:(fp.maker.tagInventory||[]).map(entry=>({...entry})),
      duplicateTags:[...(fp.maker.duplicateTags||[])],
      styleSelection:fp.maker.styleSelection,
      styleSelectionPresent:fp.maker.styleSelectionPresent,
      styleSelectionReadable:fp.maker.styleSelectionReadable,
      styleSelectionType:fp.maker.styleSelectionType,
      styleSelectionKeys:[...fp.maker.styleSelectionKeys],
      styleSelectionUnknownKeys:[...fp.maker.styleSelectionUnknownKeys],
      nativeTexture:fp.maker.nativeTexture,
      nativeTexturePresent:fp.maker.nativeTexturePresent,
    },
    apple:{
      itemUris:fp.apple.itemUris.map(({uri})=>uri).sort(),
      auxUris:fp.apple.auxUris.map(({uri})=>uri).sort(),
      knownTagUris:[...fp.apple.knownTagUris],
      unknownTagUris:[...fp.apple.unknownTagUris],
      unknownUrnUris:[...fp.apple.unknownUrnUris],
      unknownReferenceTypes:[...fp.apple.unknownReferenceTypes],
    },
  };
}

export function fingerprintPhotoContract(data,discovery=discoverHeic(data)){
  const d=discovery;
  let model=null,generation=null;
  if(d.exifItem!==null){
    try{model=exifCameraModel(extractItem(data,d.iloc,d.exifItem));}catch{}
    const match=/^iPhone (\d+)(?:\s|$)/.exec(model||'');
    generation=match?Number(match[1]):null;
  }
  let styles={present:d.stylesItem!==null,readable:false,schema:null,known:false,keys:[],unknownKeys:[]};
  if(d.stylesItem!==null){
    try{
      if(!metadataPayloadAllowed(d,d.stylesItem))throw Error('Styles metadata exceeds compatibility budget');
      const parsed=parseBplist(extractItem(data,d.iloc,d.stylesItem),{preserveReals:true});
      if(parsed instanceof Map){
        if(parsed.size>COMPATIBILITY_LIMITS.maxPlistKeys)throw Error('Styles metadata has too many keys');
        const schema=parsed.get('0'),keys=[...parsed.keys()].map(String).sort();
        styles={present:true,readable:true,schema,known:isKnownStylesSchema(schema),
          keys,unknownKeys:keys.filter(key=>!KNOWN_STYLES_KEYS.has(key))};
      }
    }catch{}
  }
  const itemUris=[],auxUris=[],depthItems=[],matteItems=[];
  for(const [id,info] of d.infos){
    if(info.uri)itemUris.push({id,uri:info.uri});
    const uri=auxUriForItem(d.props,id);
    if(uri)auxUris.push({id,uri});
    if(uri===DEPTH_URI)depthItems.push(id);
    else if(MATTE_URI_SET.has(uri))matteItems.push(id);
  }
  const allApple=[...itemUris,...auxUris].filter(entry=>isAppleTagUri(entry.uri)||isApplePhotoUrn(entry.uri));
  const unknownTagUris=[...new Set(allApple.filter(e=>isAppleTagUri(e.uri)&&!isKnownAppleTagUri(e.uri)).map(e=>e.uri))].sort();
  const unknownUrnUris=[...new Set(allApple.filter(e=>isApplePhotoUrn(e.uri)&&!isKnownApplePhotoUrn(e.uri)).map(e=>e.uri))].sort();
  const knownTagUris=[...new Set(allApple.filter(e=>isAppleTagUri(e.uri)&&isKnownAppleTagUri(e.uri)).map(e=>e.uri))].sort();
  const tagIds=new Set([...itemUris,...auxUris].filter(e=>isAppleTagUri(e.uri)).map(e=>e.id));
  const renderingIds=new Set([...tagIds,...protectedSemanticItemIds(d)]);
  const unknownReferenceTypes=[...new Set(d.refs
    .filter(ref=>!KNOWN_RENDERING_REFERENCE_TYPES.has(ref.type)
      &&(renderingIds.has(ref.from)||ref.to.some(id=>renderingIds.has(id))))
    .map(ref=>ref.type))].sort();
  const unknownProperties=[],propertyTopology=[];
  let propertyAssociationCount=0;
  for(const [id,associations] of d.props.associations){
    propertyAssociationCount+=associations.length;
    const properties=[];
    for(const association of associations){
      const property=d.props.properties[association.index-1];
      const type=property?.type??'missing-property';
      properties.push({type,essential:Boolean(association.essential)});
      if(!KNOWN_RENDERING_PROPERTY_TYPES.has(type))
        unknownProperties.push({id,type,essential:Boolean(association.essential)});
    }
    propertyTopology.push({roles:semanticRolesForItem(d,id),properties});
  }
  propertyTopology.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const unknownEssentialProperties=unknownProperties.filter(entry=>entry.essential);
  const unknownNonEssentialProperties=unknownProperties.filter(entry=>!entry.essential);
  const referenceTopology=d.refs.map(ref=>({
    type:ref.type,
    fromRoles:semanticRolesForItem(d,ref.from),
    toRoles:ref.to.map(id=>semanticRolesForItem(d,id)),
  })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const familyCounts={
    styles:[...d.infos.values()].filter(info=>info.uri===URI_STYLES).length,
    texture:[...d.infos.values()].filter(info=>info.uri===URI_TEXTURE_STYLES).length,
    linearThumbnail:[...d.infos.keys()].filter(id=>auxUriForItem(d.props,id)===URI_LINEAR_THUMB).length,
    styleDelta:[...d.infos.keys()].filter(id=>auxUriForItem(d.props,id)===URI_STYLE_DELTA).length,
  };
  const itemTypes=ids=>[...new Set(ids.map(id=>d.infos.get(id)?.type??null))].sort();
  return {
    version:CONTRACT_FINGERPRINT_VERSION,
    camera:{model,generation},
    container:{
      brands:readBrands(data),
      metaVersion:data[d.meta.off+d.meta.hdr]??null,
      iloc:{version:d.iloc.version,offsetSize:d.iloc.offsetSize,lengthSize:d.iloc.lengthSize,
        baseOffsetSize:d.iloc.baseOffsetSize,indexSize:d.iloc.indexSize},
      irefVersion:irefVersion(data,d),
      ipma:{version:d.props.version,flags:d.props.flags},
      itemCount:d.infos.size,
      referenceCount:d.refs.length,
      propertyCount:d.props.properties.length,
      propertyAssociationCount,
      constructionMethods:[...new Set([...d.iloc.items.values()].map(item=>item.constructionMethod))].sort((a,b)=>a-b),
      propertyTypes:[...new Set(d.props.properties.map(property=>property.type))].sort(),
      unknownProperties,
      unknownEssentialProperties,
      unknownNonEssentialProperties,
      propertyTopology,
      referenceTopology,
      familyCounts,
      refTypes:[...new Set(d.refs.map(r=>r.type))].sort(),
    },
    roles:{
      primary:d.primary,primarySize:dimensionsForItem(d.props,d.primary),primaryType:d.infos.get(d.primary)?.type??null,
      primaryTiles:d.primaryTiles.length,primaryTileTypes:itemTypes(d.primaryTiles),
      hdrGrid:d.hdrGrid,hdrGridType:d.hdrGrid===null?null:(d.infos.get(d.hdrGrid)?.type??null),
      hdrTiles:d.hdrTiles.length,hdrTileTypes:itemTypes(d.hdrTiles),
      depthItems,matteItems,thumbnail:d.thumbnail,linearThumb:d.linearThumb,
      deltaGrid:d.deltaGrid,deltaTiles:d.deltaTiles.length,exif:d.exifItem,
    },
    styles,texture:textureEvidence(data,d),maker:makerEvidence(data,d),
    apple:{
      itemUris:itemUris.filter(e=>isAppleTagUri(e.uri)||isApplePhotoUrn(e.uri)),
      auxUris:auxUris.filter(e=>isAppleTagUri(e.uri)||isApplePhotoUrn(e.uri)),
      knownTagUris,unknownTagUris,unknownUrnUris,unknownReferenceTypes,
    },
  };
}
