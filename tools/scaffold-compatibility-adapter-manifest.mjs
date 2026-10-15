import fs from 'node:fs/promises';
import {classifyPhotoContract} from '../web/src/compatibility/contract-classifier.js';
import {LEGACY_BASELINE_CONTRACT_ID} from '../web/src/compatibility/contract-registry.js';
import {
  COMPATIBILITY_ENGINE_VERSION,CONTRACT_FINGERPRINT_VERSION,TARGET_REGISTRY_VERSION,
} from '../web/src/compatibility/versions.js';
import {validateCompatibilityAdapterDescriptor} from '../web/src/compatibility/adapters/index.js';

const args=process.argv.slice(2);
const evidenceArg=args.find(value=>value.startsWith('--evidence='));
const [sourcePath]=args.filter(value=>!value.startsWith('--evidence='));
const evidence=evidenceArg?.slice('--evidence='.length);
if(!sourcePath||!evidence){
  console.error('Usage: node tools/scaffold-compatibility-adapter-manifest.mjs <future-photo.heic> --evidence=neutral-research-id');
  process.exitCode=2;
}else{
  if(!/^[A-Za-z0-9._:-]{1,80}$/.test(evidence)||/\.hei[cf]$/i.test(evidence)||/^IMG_/i.test(evidence))
    throw Error('Evidence must be a neutral research identifier, not a filename/path');
  const data=new Uint8Array(await fs.readFile(sourcePath));
  const classification=classifyPhotoContract(data);
  if(classification.status!=='unknown-apple-contract')
    throw Error('Adapter scaffolding requires a positively unknown Apple contract');
  const id='adapter-'+classification.sourceSignature;
  const manifest={
    version:1,
    engineVersion:COMPATIBILITY_ENGINE_VERSION,
    fingerprintVersion:CONTRACT_FINGERPRINT_VERSION,
    targetRegistryVersion:TARGET_REGISTRY_VERSION,
    id,
    enabled:false,
    matchMode:'signature',
    sourceSignatures:[classification.sourceSignature],
    targets:[LEGACY_BASELINE_CONTRACT_ID],
    evidence:[evidence],
    capabilities:{styles:'research-pending',texture:'research-pending',hdr:'preserve-pending',depth:'preserve-pending'},
    allowedMutations:{editingLayerOnly:true,makernoteTags:[],photographicPayloads:false},
    informationLoss:['RESEARCH REQUIRED — replace this placeholder only after semantic A/B mapping'],
    qualification:{
      state:'research-pending',
      physicalApplePhotos:false,
      normalUserAvailable:false,
    },
    observedReasons:[...classification.reasons],
    note:'Scaffold only. Implement extract()/semantic mapping in code and complete physical Apple Photos validation before enabling.',
  };
  validateCompatibilityAdapterDescriptor(manifest);
  console.log(JSON.stringify(manifest,null,2));
}
