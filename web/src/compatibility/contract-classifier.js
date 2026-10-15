import {fingerprintPhotoContract} from './contract-fingerprint.js';
import {CONTRACT_IDS,GENERIC_RECOVERY_STRATEGY_ID} from './contract-registry.js';
import {targetCandidatesFor} from './target-registry.js';
import {contractIdentity} from './contract-signature.js';

function baseContainerContractSupported(fp){
  const i=fp.container.iloc;
  return fp.container.metaVersion===0
    &&i.version===1&&i.offsetSize===4&&i.lengthSize===4&&i.baseOffsetSize===0&&i.indexSize===0
    &&fp.container.irefVersion===0
    &&[0,1].includes(fp.container.ipma.version)&&(fp.container.ipma.flags&1)===0
    &&fp.container.constructionMethods.every(method=>method===0||method===1)
    &&fp.roles.primaryType==='grid'
    &&fp.roles.primaryTileTypes.length===1&&fp.roles.primaryTileTypes[0]==='hvc1'
    &&fp.roles.hdrTileTypes.every(type=>type==='hvc1')
    &&fp.roles.primary!==null&&fp.roles.primaryTiles>0&&fp.roles.exif!==null;
}
function recoveryLayoutSupported(fp){
  return baseContainerContractSupported(fp)&&fp.container.unknownEssentialProperties.length===0;
}

export function classifyPhotoContract(data,fingerprint=null){
  const fp=fingerprint||fingerprintPhotoContract(data);
  const identity=contractIdentity(fp);
  const native1617=fp.camera.generation===16||fp.camera.generation===17;
  const unknownStyles=fp.styles.present&&(!fp.styles.readable||!fp.styles.known);
  const unknownStyleKeys=native1617&&fp.styles.present&&fp.styles.readable&&fp.styles.unknownKeys.length>0;
  const unknownTexture=fp.texture.present&&(!fp.texture.readable||!fp.texture.known);
  const unknownTextureKeys=native1617&&fp.texture.present&&fp.texture.readable&&fp.texture.unknownKeys.length>0;
  const unknownTag=fp.apple.unknownTagUris.length>0;
  const unknownUrn=fp.apple.unknownUrnUris.length>0;
  const unknownReference=fp.apple.unknownReferenceTypes.length>0;
  const unknownNonEssential=native1617&&(fp.container.unknownNonEssentialProperties?.length??0)>0;
  const familyCounts=fp.container.familyCounts??{styles:fp.styles.present?1:0,texture:fp.texture.present?1:0,
    linearThumbnail:fp.roles.linearThumb!==null?1:0,styleDelta:fp.roles.deltaGrid!==null?1:0};
  const duplicateEditingFamily=native1617&&Object.values(familyCounts).some(count=>count>1);
  // A future Camera release can change only the HEIF/container contract while
  // keeping familiar Styles/Texture payloads. Detect that before the mature
  // native path sees the file. Scope this to 16/17 so older/non-native and the
  // established iPhone 18+ preservation routes keep their current behavior.
  const unknownContainer=native1617&&!baseContainerContractSupported(fp);
  const unknownEssential=native1617&&fp.container.unknownEssentialProperties.length>0;
  // 0x65 is currently a validated native Texture capture record only on 18+.
  // Any appearance on 16/17 is future-contract evidence, even if its payload
  // type changes or a legacy 2026 Texture item is also present.
  const futureNativeTextureMarker=native1617&&fp.maker.nativeTexturePresent;
  // A future 16/17 release may keep the same Styles item while changing only
  // MakerNote 0x54. That must not slip into the proven native route merely
  // because the Styles plist schema is still familiar.
  const unknownStyleSelection=native1617&&(
    (fp.maker.styleSelectionPresent&&!fp.maker.styleSelection)
    ||fp.maker.styleSelectionUnknownKeys.length>0);
  const duplicateMakerTags=native1617&&(fp.maker.duplicateTags?.length??0)>0;
  const unknownMaker=(native1617&&!fp.maker.readable)||unknownStyleSelection||duplicateMakerTags;
  const unknown=unknownStyles||unknownStyleKeys||unknownTexture||unknownTextureKeys
    ||unknownTag||unknownUrn||unknownReference||futureNativeTextureMarker
    ||unknownMaker||unknownContainer||unknownEssential||unknownNonEssential||duplicateEditingFamily;
  const nativeEvidence=fp.styles.present||fp.maker.styleSelection||fp.maker.nativeTexture;
  const reasons=[];
  if(unknownStyles)reasons.push(fp.styles.readable?'styles-schema:'+String(fp.styles.schema):'styles-unreadable');
  for(const key of fp.styles.unknownKeys)if(native1617)reasons.push('styles-key:'+key);
  if(unknownTexture)reasons.push(fp.texture.readable?'texture-people-version:'+String(fp.texture.peopleVersion):'texture-unreadable');
  for(const key of fp.texture.unknownKeys)if(native1617)reasons.push('texture-key:'+key);
  if(!fp.maker.readable&&native1617)reasons.push('makernote-unreadable');
  else if(unknownStyleSelection)reasons.push('style-selection-contract');
  for(const key of fp.maker.styleSelectionUnknownKeys)if(native1617)reasons.push('style-selection-key:'+key);
  for(const tag of fp.maker.duplicateTags??[])if(native1617)
    reasons.push('duplicate-makernote-tag:0x'+tag.toString(16));
  if(futureNativeTextureMarker)reasons.push('future-native-texture-marker');
  if(unknownContainer)reasons.push('container-contract');
  for(const property of fp.container.unknownEssentialProperties)
    reasons.push('unknown-essential-property:'+property.type);
  for(const property of fp.container.unknownNonEssentialProperties??[])
    reasons.push('unknown-nonessential-property:'+property.type);
  for(const [family,count] of Object.entries(familyCounts))
    if(count>1)reasons.push('duplicate-editing-family:'+family+':'+count);
  for(const type of fp.apple.unknownReferenceTypes)reasons.push('unknown-edit-reference:'+type);
  for(const uri of fp.apple.unknownTagUris)reasons.push('unknown-tag:'+uri);
  for(const uri of fp.apple.unknownUrnUris)reasons.push('unknown-urn:'+uri);

  if(unknown){
    const eligible=native1617&&fp.maker.readable&&!unknownUrn&&!unknownContainer&&!unknownEssential
      &&recoveryLayoutSupported(fp);
    const result={
      status:'unknown-apple-contract',
      sourceContractId:CONTRACT_IDS.unknownApple,
      sourceSignature:identity.signature,
      contractIdentity:identity,
      fingerprint:fp,
      reasons,
      unknownCriticalResources:[...reasons],
      warnings:[eligible?'future-editing-contract-recovery':'future-contract-preserved'],
      recovery:{eligible,mode:eligible?'legacy-rebuild':'preserve-only',
        strategyId:eligible?GENERIC_RECOVERY_STRATEGY_ID:null,
        reason:eligible?'future iPhone 16/17 editing contract can be rebuilt from preserved photographic roles'
          :unknownUrn?'unknown Apple photographic auxiliary requires an explicit adapter'
          :unknownContainer||unknownEssential?'future HEIF/property contract requires an explicit adapter'
          :!native1617?'automatic legacy rebuild is scoped to iPhone 16/17'
          :'container layout is not safe for the known rebuild path'},
      targetCandidates:[],
      safeOperations:{
        preserveSource:true,normalNativePipeline:false,addTexture:false,repairTexture:false,
        softSkin:false,aiPortrait:false,rebuildStyles:false,restorePortrait:false,normalizeHdr:false,
        legacyCompatibilityExport:eligible,
        mayPreserveNative:true,mayAddTexture:false,mayRepairTexture:false,mayAddSoftSkin:false,
        mayRebuildStyles:false,mayAddAiPortrait:false,mayRestorePortrait:false,mayNormalizeHdr:false,
        mayLegacyExport:eligible,
      },
    };
    result.targetCandidates=targetCandidatesFor(result);
    return result;
  }
  const knownNative=nativeEvidence||fp.styles.present;
  const status=knownNative?'known-compatible':'non-native';
  return {
    status,
    sourceContractId:knownNative?CONTRACT_IDS.knownNative:CONTRACT_IDS.nonNative,
    sourceSignature:identity.signature,
    contractIdentity:identity,
    targetCandidates:[],
    unknownCriticalResources:[],
    warnings:[],
    fingerprint:fp,reasons:[],
    recovery:{eligible:false,mode:'none',strategyId:null,reason:'no unknown Apple contract detected'},
    safeOperations:{
      preserveSource:true,normalNativePipeline:knownNative,addTexture:true,repairTexture:true,
      softSkin:true,aiPortrait:true,rebuildStyles:true,restorePortrait:true,normalizeHdr:true,legacyCompatibilityExport:false,
      mayPreserveNative:true,mayAddTexture:true,mayRepairTexture:true,mayAddSoftSkin:true,
      mayRebuildStyles:true,mayAddAiPortrait:true,mayRestorePortrait:true,mayNormalizeHdr:true,mayLegacyExport:false,
    },
  };
}
