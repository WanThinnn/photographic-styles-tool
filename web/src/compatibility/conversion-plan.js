import {LEGACY_BASELINE_CONTRACT_ID} from './contract-registry.js';
import {COMPATIBILITY_ERROR,compatibilityError} from './errors.js';
import {COMPATIBILITY_ENGINE_VERSION,CONVERSION_PLAN_VERSION} from './versions.js';

function sorted(values){
  return [...new Set(values)].sort((a,b)=>
    typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b)));
}

export function buildLegacyConversionPlan(classification,{
  targetId=LEGACY_BASELINE_CONTRACT_ID,
  targetProfileName=null,
  texture=true,
  generatedLinearThumbnail=false,
  preflight=null,
}={}){
  if(classification.status!=='unknown-apple-contract'||!classification.recovery.eligible)
    throw compatibilityError(COMPATIBILITY_ERROR.SEMANTIC_MAPPING_INCOMPLETE,
      'Source has no eligible legacy compatibility conversion');
  if(preflight&&preflight.eligible!==true)
    throw compatibilityError(COMPATIBILITY_ERROR.PREFLIGHT_FAILED,
      'Legacy compatibility preflight did not authorize conversion',{blockers:preflight.blockers});

  const allowedExifChanges=[
    'MakerNote 0x54 only when target Styles construction requires it',
    ...(classification.reasons.includes('future-native-texture-marker')
      ?['remove MakerNote 0x65 so the legacy Texture target does not retain a competing native Texture contract']:[]),
  ];
  const preserve=['primary','primary-tiles','hdr','hdr-tiles','thumbnail','depth','classic-mattes','capture-exif','live-photo-identifier'];
  const rebuild=['photographic-styles','style-delta','linear-thumbnail',...(texture?['texture-2026']:[])];
  const remove=['source Apple editing-layer items','editing sidecars','editing dimg tiles'];
  const propertiesChanged=['editing-layer property associations only'];
  const referencesChanged=['references touching removed/rebuilt editing-layer items only'];
  const resourcesReencoded=generatedLinearThumbnail?['linear-thumbnail']:[];
  const informationLoss=['unmapped future Apple editing metadata is not carried into the compatibility copy'];
  const allowedAddedFamilies=[
    'photographic-styles','style-delta','linear-thumbnail','target-editing-descendants',
    ...(texture?['texture-2026','texture-2026-mattes-and-sidecars']:[]),
  ];
  const allowedRemovedIds=sorted(preflight?.editingItems??[]);
  const allowedMakerNoteTags=[
    '0x54',
    ...(classification.reasons.includes('future-native-texture-marker')?['0x65']:[]),
  ];
  const keyParts=[
    classification.sourceContractId,
    classification.sourceSignature??'-',
    sorted(classification.reasons).join(','),
    targetId,targetProfileName??'-',texture?'texture':'no-texture',
    generatedLinearThumbnail?'generated-linear-thumbnail':'existing-thumbnail-path',
    allowedRemovedIds.join(','),
  ];

  return {
    version:CONVERSION_PLAN_VERSION,
    engineVersion:COMPATIBILITY_ENGINE_VERSION,
    planId:'legacy:'+keyParts.join('|'),
    sourceContractId:classification.sourceContractId,
    sourceSignature:classification.sourceSignature??null,
    sourceStatus:classification.status,
    sourceReasons:sorted(classification.reasons),
    recoveryStrategyId:classification.recovery.strategyId??null,
    cameraModel:classification.fingerprint.camera.model,
    targetId,targetProfileName,
    preserve,
    translate:[],
    rebuild,
    remove,
    allowedRemovedIds,
    allowedAddedFamilies,
    allowedPropertyChanges:[...propertiesChanged],
    allowedReferenceChanges:[...referencesChanged],
    allowedMakerNoteTags,
    propertiesChanged,
    referencesChanged,
    allowedExifChanges,
    resourcesReencoded,
    informationLoss,
    preflight:preflight?{
      version:preflight.version,
      sourceSignature:preflight.sourceSignature,
      decision:preflight.decision,
      counts:{...preflight.counts},
      warnings:preflight.warnings.map(warning=>({...warning})),
    }:null,
    mutationBudget:{
      preserveSourcePhotoPayloads:true,
      preserveProtectedTopology:true,
      preserveUnlistedMakerNoteTags:true,
      forbidUnplannedOutputItems:true,
      allowRemovedEditingItems:true,
      allowRebuiltEditingGraph:true,
      allowedRemovedIds:[...allowedRemovedIds],
      allowedAddedFamilies:[...allowedAddedFamilies],
      allowedMakerNoteTags:[...allowedMakerNoteTags],
      allowedExifChanges:[...allowedExifChanges],
    },
  };
}
