import {
  LEGACY_BASELINE_CONTRACT_ID,KNOWN_STYLES_SCHEMAS,KNOWN_RENDERING_REFERENCE_TYPES,
  KNOWN_RENDERING_PROPERTY_TYPES,
} from './contract-registry.js';
import {COMPATIBILITY_ERROR,compatibilityError} from './errors.js';
import {TARGET_REGISTRY_VERSION} from './versions.js';

const BASELINE=Object.freeze({
  registryVersion:TARGET_REGISTRY_VERSION,
  id:LEGACY_BASELINE_CONTRACT_ID,
  label:'Known Apple Photos Styles/Texture baseline',
  strategy:'reuse-source-photo-graph',
  enabled:true,
  killSwitchReason:null,
  profileSelection:'existing-profileFor',
  sourceScope:Object.freeze({cameraGenerations:Object.freeze([16,17])}),
  capabilities:Object.freeze({
    styles:'rebuild-known',
    texture:'rebuild-2026',
    hdr:'preserve-source',
    depth:'preserve-source',
    portrait:'preserve-source-depth-only',
    livePhotoStill:'preserve-still-identifier',
  }),
  preserves:Object.freeze(['primary','primary-tiles','hdr','hdr-tiles','thumbnail','depth','classic-mattes','capture-exif']),
  rebuilds:Object.freeze(['photographic-styles','style-delta','linear-thumbnail','texture-2026']),
  invariants:Object.freeze({
    stylesSchemas:Object.freeze([...KNOWN_STYLES_SCHEMAS]),
    texturePeopleVersion:3,
    familyMaximums:Object.freeze({styles:1,texture:1,linearThumbnail:1,styleDelta:1}),
    allowedReferenceTypes:Object.freeze([...KNOWN_RENDERING_REFERENCE_TYPES].sort()),
    allowedPropertyTypes:Object.freeze([...KNOWN_RENDERING_PROPERTY_TYPES].sort()),
    requireEditableStyles:true,
    forbidUnknownAppleUris:true,
  }),
  qualification:Object.freeze({
    structural:true,
    mutationBudget:true,
    automatedRegression:true,
    physicalApplePhotos:false,
    state:'structural-only',
    normalUserAvailable:false,
    evidence:Object.freeze(['facts.md#10.40','facts.md#10.75']),
  }),
});

export const LEGACY_TARGETS=Object.freeze({
  [LEGACY_BASELINE_CONTRACT_ID]:BASELINE,
});

export function legacyTarget(id=LEGACY_BASELINE_CONTRACT_ID,{allowDisabled=false}={}){
  const target=LEGACY_TARGETS[id];
  if(!target)throw compatibilityError(COMPATIBILITY_ERROR.TARGET_PROFILE_MISSING,
    'Unknown legacy compatibility target: '+id,{targetId:id});
  if(target.enabled!==true&&!allowDisabled)
    throw compatibilityError(COMPATIBILITY_ERROR.TARGET_DISABLED,
      'Legacy compatibility target is disabled: '+id,{
        targetId:id,killSwitchReason:target.killSwitchReason??'disabled',
      });
  return target;
}

export function targetSupportsClassification(target,classification){
  if(!target||target.enabled!==true||classification?.status!=='unknown-apple-contract'||!classification.recovery?.eligible)return false;
  const generation=classification.fingerprint?.camera?.generation;
  return target.sourceScope.cameraGenerations.includes(generation);
}

export function targetCandidatesFor(classification){
  return Object.values(LEGACY_TARGETS)
    .filter(target=>targetSupportsClassification(target,classification))
    .map(target=>target.id)
    .sort();
}

export function publicTargetSummary(target){
  return {
    registryVersion:target.registryVersion,id:target.id,label:target.label,strategy:target.strategy,
    enabled:target.enabled,killSwitchReason:target.killSwitchReason,
    capabilities:{...target.capabilities},
    qualification:{...target.qualification,evidence:[...target.qualification.evidence]},
  };
}
