import {legacyTarget} from '../target-registry.js';
import {COMPATIBILITY_ERROR,compatibilityError} from '../errors.js';
import {
  COMPATIBILITY_ENGINE_VERSION,CONTRACT_FINGERPRINT_VERSION,TARGET_REGISTRY_VERSION,
} from '../versions.js';

/**
 * Real future-contract adapters are intentionally registered only after
 * fixture-backed reverse engineering and physical Apple Photos qualification.
 * The generic editing-layer recovery path is not an adapter: it is a bounded
 * fallback that discards unknown editing metadata while preserving proven photo
 * roles.
 */
export const COMPATIBILITY_ADAPTERS=Object.freeze([]);

export function validateCompatibilityAdapterDescriptor(adapter){
  if(!adapter||typeof adapter.id!=='string'||!adapter.id)
    throw Error('Compatibility adapter needs an id');
  if(adapter.engineVersion!==COMPATIBILITY_ENGINE_VERSION)
    throw Error('Compatibility adapter '+adapter.id+' engineVersion mismatch');
  if(adapter.fingerprintVersion!==CONTRACT_FINGERPRINT_VERSION)
    throw Error('Compatibility adapter '+adapter.id+' fingerprintVersion mismatch');
  if(adapter.targetRegistryVersion!==TARGET_REGISTRY_VERSION)
    throw Error('Compatibility adapter '+adapter.id+' targetRegistryVersion mismatch');
  if(!['signature','predicate'].includes(adapter.matchMode))
    throw Error('Compatibility adapter '+adapter.id+' needs matchMode=signature|predicate');
  if(adapter.matchMode==='signature'){
    const signaturePattern=new RegExp('^c'+CONTRACT_FINGERPRINT_VERSION+'-[0-9a-f]{32}$','i');
    if(!Array.isArray(adapter.sourceSignatures)||!adapter.sourceSignatures.length
      ||adapter.sourceSignatures.some(signature=>typeof signature!=='string'||!signaturePattern.test(signature)))
      throw Error('Compatibility adapter '+adapter.id+' needs exact current-version canonical sourceSignatures');
  }
  if(!Array.isArray(adapter.targets)||!adapter.targets.length)
    throw Error('Compatibility adapter '+adapter.id+' needs at least one target');
  for(const id of adapter.targets)legacyTarget(id,{allowDisabled:true});
  if(!Array.isArray(adapter.evidence)||!adapter.evidence.length
    ||adapter.evidence.some(value=>typeof value!=='string'||!value))
    throw Error('Compatibility adapter '+adapter.id+' needs fixture/research evidence');
  if(!adapter.capabilities||typeof adapter.capabilities!=='object'||Array.isArray(adapter.capabilities))
    throw Error('Compatibility adapter '+adapter.id+' needs capabilities');
  if(!adapter.allowedMutations||typeof adapter.allowedMutations!=='object'||Array.isArray(adapter.allowedMutations))
    throw Error('Compatibility adapter '+adapter.id+' needs allowedMutations');
  if(!Array.isArray(adapter.informationLoss))
    throw Error('Compatibility adapter '+adapter.id+' needs informationLoss');
  if(!adapter.qualification||typeof adapter.qualification!=='object'
    ||typeof adapter.qualification.state!=='string'
    ||typeof adapter.qualification.physicalApplePhotos!=='boolean'
    ||typeof adapter.qualification.normalUserAvailable!=='boolean')
    throw Error('Compatibility adapter '+adapter.id+' needs explicit qualification');
  if(adapter.qualification.normalUserAvailable&&!adapter.qualification.physicalApplePhotos)
    throw Error('Compatibility adapter '+adapter.id+' cannot be normal-user available before physical Apple Photos qualification');
  if(typeof adapter.enabled!=='boolean')
    throw Error('Compatibility adapter '+adapter.id+' needs an explicit enabled flag');
  return adapter;
}

export function validateCompatibilityAdapter(adapter){
  validateCompatibilityAdapterDescriptor(adapter);
  if(adapter.matchMode==='predicate'&&typeof adapter.match!=='function')
    throw Error('Compatibility adapter '+adapter.id+' needs match() for predicate mode');
  if(typeof adapter.extract!=='function')throw Error('Compatibility adapter '+adapter.id+' needs extract()');
  return adapter;
}

function adapterMatches(adapter,classification,{allowUnqualified=false}={}){
  if(adapter.enabled!==true)return false;
  if(!allowUnqualified
    &&(!adapter.qualification.physicalApplePhotos||!adapter.qualification.normalUserAvailable))return false;
  if(adapter.matchMode==='signature')
    return adapter.sourceSignatures.includes(classification.sourceSignature);
  return adapter.match(classification.fingerprint,classification)===true;
}

export function selectCompatibilityAdapter(
  classification,adapters=COMPATIBILITY_ADAPTERS,{allowUnqualified=false}={}
){
  const matches=[];
  for(const adapter of adapters){
    validateCompatibilityAdapter(adapter);
    if(adapterMatches(adapter,classification,{allowUnqualified}))matches.push(adapter);
  }
  if(matches.length>1){
    const adapterIds=matches.map(adapter=>adapter.id);
    throw compatibilityError(COMPATIBILITY_ERROR.ADAPTER_AMBIGUOUS,
      'Ambiguous compatibility adapters: '+adapterIds.join(', '),{adapterIds});
  }
  return matches[0]??null;
}

export function compatibilityAdapterSummary(adapter){
  if(!adapter)return null;
  return {
    engineVersion:adapter.engineVersion,
    fingerprintVersion:adapter.fingerprintVersion,
    targetRegistryVersion:adapter.targetRegistryVersion,
    id:adapter.id,enabled:adapter.enabled,matchMode:adapter.matchMode,
    sourceSignatures:Array.isArray(adapter.sourceSignatures)?[...adapter.sourceSignatures]:[],
    targets:[...adapter.targets],
    evidence:[...adapter.evidence],
    capabilities:{...adapter.capabilities},
    allowedMutations:{...adapter.allowedMutations},
    informationLoss:[...adapter.informationLoss],
    qualification:{...adapter.qualification},
  };
}
