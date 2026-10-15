import fs from 'node:fs/promises';
import {LEGACY_BASELINE_CONTRACT_ID} from '../web/src/compatibility/contract-registry.js';
import {
  COMPATIBILITY_ENGINE_VERSION,CONTRACT_FINGERPRINT_VERSION,TARGET_REGISTRY_VERSION,
} from '../web/src/compatibility/versions.js';
import {contractSignatureFromSanitized} from '../web/src/compatibility/contract-signature.js';

const [file]=process.argv.slice(2);
if(!file){
  console.error('Usage: node tools/validate-legacy-target-manifest.mjs <manifest.json>');
  process.exitCode=2;
}else{
  const manifest=JSON.parse(await fs.readFile(file,'utf8'));
  const fail=message=>{throw Error('Invalid legacy target manifest: '+message);};
  if(manifest.version!==2)fail('version must be 2');
  if(manifest.engineVersion!==COMPATIBILITY_ENGINE_VERSION)fail('engineVersion mismatch');
  if(manifest.fingerprintVersion!==CONTRACT_FINGERPRINT_VERSION)fail('fingerprintVersion mismatch');
  if(manifest.targetRegistryVersion!==TARGET_REGISTRY_VERSION)fail('targetRegistryVersion mismatch');
  if(manifest.contractId!==LEGACY_BASELINE_CONTRACT_ID)fail('unexpected contractId');
  const signaturePattern=new RegExp(
    '^c'+CONTRACT_FINGERPRINT_VERSION+'-[0-9a-f]{32}$','i'
  );
  if(!signaturePattern.test(manifest.contractSignature||''))fail('invalid contractSignature');
  if(!manifest.fingerprint||manifest.fingerprint.version!==CONTRACT_FINGERPRINT_VERSION)
    fail('missing sanitized fingerprint');
  if(contractSignatureFromSanitized(manifest.fingerprint)!==manifest.contractSignature)
    fail('contractSignature does not match sanitized fingerprint');
  if(!manifest.privacyAudit?.sanitizedFingerprint||manifest.privacyAudit?.imageHashes!==false)
    fail('privacy audit not satisfied');
  if(manifest.qualification?.normalUserAvailable
    &&!(manifest.qualification.applePhotosImport&&manifest.qualification.stylesEditSaveReopen))
    fail('normal-user availability requires physical Apple Photos qualification');
  console.log(JSON.stringify({
    valid:true,
    contractId:manifest.contractId,
    contractSignature:manifest.contractSignature,
    qualification:manifest.qualification,
  },null,2));
}
