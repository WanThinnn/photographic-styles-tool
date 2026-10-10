import {topBox, bytesEqual} from '../raster/box.js';
import {discoverHeic, extractItemData, auxUriForItem, parseIpcoIpma, appendIpcoProperty,
  setItemPropertyAssociations, addItems, ispeBox, auxcBox, MATTE_URIS,
  findItemsByType, compactItemProperties} from '../raster/heif.js';
import {MATTE_2026_URIS, URI_PERSON_INSTANCES, URI_TEXTURE_STYLES} from '../raster/texture.js';
import {parseBplist, buildBplist, BplistReal} from '../core/bplist.js';
import {applyPersonMetadata, setPersonMasksValid} from '../raster/styles.js';
import {rebuildHeic} from './graft.js';
import {preserveNativeStyles} from './style-preservation.js';
import {registerGeneratedPortraitMatte} from '../raster/portrait-matte.js';

const xml = text => new TextEncoder().encode('<x:xmpmeta xmlns:x="adobe:ns:meta/">'
  + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
  + '<rdf:Description xmlns:fsincMattes="http://ns.apple.com/fsinc/1.0/">'
  + text + '<fsincMattes:FSINCMatteVersion>0</fsincMattes:FSINCMatteVersion>'
  + '</rdf:Description></rdf:RDF></x:xmpmeta>');
const itemFor = (d,uri) => [...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===uri);
function peoplePlist(value,key='') {
  if(typeof value==='number') return ['faceID','faceLandmarkType','faceUnitOfAngle'].includes(key)?value:new BplistReal(value);
  if(value instanceof Map) return new Map([...value].map(([k,v])=>[k,peoplePlist(v,k)]));
  if(Array.isArray(value)) return value.map(v=>peoplePlist(v,key));
  return value;
}

export function hasSoftSkinData(bytes) {
  const d=discoverHeic(bytes);
  const texture=[...d.infos].find(([,i])=>i.uri===URI_TEXTURE_STYLES)?.[0];
  if (texture===undefined) return false;
  const people=parseBplist(extractItemData(bytes,d,texture)).get('TextureStylePostProcessedPeopleData');
  return Boolean(people?.length && [MATTE_2026_URIS[1],MATTE_2026_URIS[5],MATTE_2026_URIS[11],URI_PERSON_INSTANCES]
    .every(uri=>itemFor(d,uri)!==undefined));
}

// Enrich a converted file, preserving the primary, HDR, depth, original metadata
// and native Styles. No schema upgrade, thumbnail replacement or pixel edit occurs.
export function installSoftSkin(bytes, result, {nativeStyles=false, sourceBytes=null}={}) {
  if (hasSoftSkinData(bytes) || result.state!=='generated' || !result.faces) return bytes;
  const d=discoverHeic(bytes), source=sourceBytes?discoverHeic(sourceBytes):null;
  // An exported iPhone 16+ photo may have lost its Styles auxiliary graph while
  // its RGB still carries the captured/edited Style. Missing auxiliaries do not
  // authorize applying our generated person/skin colour statistics to it again.
  const keepStyleMetadata=nativeStyles||Boolean(source&&preserveNativeStyles(sourceBytes,source));
  const texture=[...d.infos].find(([,i])=>i.uri===URI_TEXTURE_STYLES)?.[0];
  if (texture===undefined) throw Error('Soft Skin requires Texture metadata');
  let meta=bytes.slice(d.meta.off,d.meta.off+d.meta.size);
  const payloads=new Map(), targets=[d.primary,...findItemsByType(d.infos,'tmap').slice(0,1)];
  // Partially populated external Texture files may already own these keys.
  // Keep their resources intact and assign new people unique references.
  const usedKeys=new Set();
  for(const [id,info] of d.infos) if(info.type==='mime'){
    const text=new TextDecoder().decode(extractItemData(bytes,d,id));
    for(const match of text.matchAll(/FSINCInstanceMask\d+/g)) usedKeys.add(match[0]);
  }
  const references=new Map();
  for(const instance of result.overrides.get(URI_PERSON_INSTANCES)?.instances||[]){
    let key=instance.referenceKey,number=9;
    while(usedKeys.has(key)) key=`FSINCInstanceMask${number++}`;
    usedKeys.add(key);references.set(instance.referenceKey,key);
  }
  const orientation=(d.props.associations.get(d.primary)||[]).filter(a=>
    ['irot','imir'].includes(d.props.properties[a.index-1].type)).map(a=>[a.index,a.essential]);
  const property = blob => {
    const p=parseIpcoIpma(meta,topBox(meta,'meta'));
    const found=p.properties.find(p=>bytesEqual(meta.subarray(p.box.off,p.box.off+p.box.size),blob));
    if(found) return found.index;
    let index; [meta,index]=appendIpcoProperty(meta,blob); return index;
  };
  const add = (uri, encoded, instance=false) => {
    if (!encoded.payload?.length || !encoded.hvcc || !encoded.pixi) throw Error('Incomplete Soft Skin matte');
    // Original skin/Portrait resources always take precedence over generated masks.
    if(!instance && source && itemFor(source,uri)!==undefined && itemFor(d,uri)!==undefined) return;
    let id=instance?undefined:itemFor(d,uri);
    if(id===undefined){let assigned;[meta,assigned]=addItems(meta,[{key:'matte',refType:'auxl',refTo:targets}]);id=assigned.get('matte');}
    const assoc=[[property(ispeBox(encoded.width,encoded.height)),false],
      [property(encoded.pixi),false],[property(auxcBox(uri)),true],[property(encoded.hvcc),true],...orientation];
    meta=setItemPropertyAssociations(meta,id,assoc);payloads.set(id,encoded.payload);
    if(uri===MATTE_URIS.portraiteffectsmatte){meta=registerGeneratedPortraitMatte(meta,payloads,id);return;}
    if(instance || !d.infos.has(id)) {
      let sidecar;[meta,sidecar]=addItems(meta,[{key:'xmp',itemType:'mime',contentType:'application/rdf+xml',refType:'cdsc',refTo:[id]}]);
      const key=encoded.referenceKey;
      if(key && !/^FSINCInstanceMask\d+$/.test(key)) throw Error('Invalid Soft Skin instance reference');
      payloads.set(sidecar.get('xmp'),xml(key?`<fsincMattes:InstanceMaskReferenceKey>${key}</fsincMattes:InstanceMaskReferenceKey>`:''));
    }
  };
  for(const [uri,encoded] of result.overrides){
    if(uri===URI_PERSON_INSTANCES) for(const instance of encoded.instances)
      add(uri,{...instance,referenceKey:references.get(instance.referenceKey)},true);
    else if(MATTE_2026_URIS.includes(uri)) add(uri,encoded);
  }
  const skin=result.overrides.get(MATTE_2026_URIS[1]);
  // Generated fallbacks may replace empty profile slots, never source-native masks.
  if(skin) add(MATTE_URIS.semanticskinmatte,skin);
  const person=result.overrides.get(MATTE_URIS.portraiteffectsmatte);
  if(person) add(MATTE_URIS.portraiteffectsmatte,person);
  const texturePlist=parseBplist(extractItemData(bytes,d,texture),{preserveReals:true});
  const people=result.texturePeopleData.map((entry,index)=>{
    entry=new Map(entry);entry.set('faceID',index);
    entry.set('instanceMaskReferenceKey',references.get(entry.get('instanceMaskReferenceKey')) || entry.get('instanceMaskReferenceKey'));
    const stats=new Map([...entry.get('imageStats')].map(([key,block])=>[key,new Map(block).set('faceID',index)]));
    entry.set('imageStats',stats);return peoplePlist(entry);
  });
  texturePlist.set('TextureStylePostProcessedPeopleData',people);
  payloads.set(texture,buildBplist(texturePlist));
  if(!keepStyleMetadata && result.personMetadata && d.stylesItem!==null){
    let styles=extractItemData(bytes,d,d.stylesItem);
    [styles]=applyPersonMetadata(styles,result.personMetadata);
    [styles]=setPersonMasksValid(styles);
    payloads.set(d.stylesItem,styles);
  }
  meta=compactItemProperties(meta).meta;
  return rebuildHeic(bytes,d,bytes.subarray(0,topBox(bytes,'ftyp').size),meta,payloads);
}
