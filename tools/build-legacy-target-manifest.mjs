import fs from 'node:fs/promises';
import {
  fingerprintPhotoContract,sanitizeContractFingerprint,
} from '../web/src/compatibility/contract-fingerprint.js';
import {classifyPhotoContract} from '../web/src/compatibility/contract-classifier.js';
import {contractIdentity} from '../web/src/compatibility/contract-signature.js';
import {LEGACY_BASELINE_CONTRACT_ID} from '../web/src/compatibility/contract-registry.js';
import {legacyTarget,publicTargetSummary} from '../web/src/compatibility/target-registry.js';
import {
  COMPATIBILITY_ENGINE_VERSION,CONTRACT_FINGERPRINT_VERSION,TARGET_REGISTRY_VERSION,
} from '../web/src/compatibility/versions.js';

const PRIVATE_KEYS=new Set([
  'filename','filePath','sourcePath','gps','latitude','longitude','captureTimestamp',
  'contentIdentifier','payload','rawData','base64','imageBytes','thumbnailBytes',
]);
function assertPrivacySafe(value,path='manifest'){
  if(value instanceof Uint8Array||value instanceof ArrayBuffer)
    throw Error('Target manifest must not embed binary payloads at '+path);
  if(Array.isArray(value)){value.forEach((entry,index)=>assertPrivacySafe(entry,path+'['+index+']'));return;}
  if(!value||typeof value!=='object')return;
  for(const [key,entry] of Object.entries(value)){
    if(PRIVATE_KEYS.has(key))throw Error('Target manifest contains private/identifying field '+path+'.'+key);
    assertPrivacySafe(entry,path+'.'+key);
  }
}
function validateEvidence(value){
  if(!/^[A-Za-z0-9._:-]{1,80}$/.test(value)||/\.hei[cf]$/i.test(value)||/^IMG_/i.test(value))
    throw Error('Evidence must be a neutral identifier, not a filename/path');
}

const args=process.argv.slice(2);
const evidenceArg=args.find(value=>value.startsWith('--evidence='));
const positional=args.filter(value=>!value.startsWith('--evidence='));
const [sourcePath,outputPath]=positional;
const evidence=evidenceArg?.slice('--evidence='.length)||'local-baseline-fixture';
validateEvidence(evidence);
if(!sourcePath){
  console.error('Usage: node tools/build-legacy-target-manifest.mjs <validated-baseline.heic> [output.json] [--evidence=neutral-id]');
  process.exitCode=2;
}else{
  const data=new Uint8Array(await fs.readFile(sourcePath));
  const raw=fingerprintPhotoContract(data);
  const classification=classifyPhotoContract(data,raw);
  if(classification.status!=='known-compatible')
    throw Error('Target evidence must classify as a known-compatible Apple photo contract');
  const target=legacyTarget(LEGACY_BASELINE_CONTRACT_ID),identity=contractIdentity(raw);
  const manifest={
    version:2,
    engineVersion:COMPATIBILITY_ENGINE_VERSION,
    fingerprintVersion:CONTRACT_FINGERPRINT_VERSION,
    targetRegistryVersion:TARGET_REGISTRY_VERSION,
    contractId:LEGACY_BASELINE_CONTRACT_ID,
    contractSignature:identity.signature,
    evidence,
    sourceBytes:data.length,
    target:publicTargetSummary(target),
    fingerprint:sanitizeContractFingerprint(raw),
    qualification:{
      structural:true,
      mutationBudget:true,
      automatedRegression:true,
      applePhotosImport:false,
      stylesEditSaveReopen:false,
      textureEditSaveReopen:false,
      portraitLighting:false,
      hdrVisual:false,
      normalUserAvailable:false,
      note:'Physical Apple Photos qualification must be recorded separately before production release.',
    },
    privacyAudit:{privatePayloads:false,identifyingFields:false,sanitizedFingerprint:true,imageHashes:false},
  };
  assertPrivacySafe(manifest);
  const json=JSON.stringify(manifest,null,2)+'\n';
  if(outputPath){
    try{await fs.writeFile(outputPath,json,{flag:'wx'});}
    catch(error){if(error?.code==='EEXIST')throw Error('Refusing to overwrite existing manifest: '+outputPath);throw error;}
  }else process.stdout.write(json);
}
