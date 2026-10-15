import fs from 'node:fs/promises';
import path from 'node:path';
import {
  fingerprintPhotoContract,sanitizeContractFingerprint,
} from '../web/src/compatibility/contract-fingerprint.js';
import {classifyPhotoContract} from '../web/src/compatibility/contract-classifier.js';
import {
  preflightLegacyCompatibilityExport,sanitizeCompatibilityPreflight,
} from '../web/src/compatibility/recovery-preflight.js';

const args=process.argv.slice(2);
const sanitized=args.includes('--sanitized'),includePreflight=args.includes('--preflight');
const files=args.filter(value=>value!=='--sanitized'&&value!=='--preflight');
if(!files.length){
  console.error('Usage: node tools/inspect-photo-contract.mjs [--sanitized] [--preflight] <photo.heic> [...]');
  process.exitCode=2;
}else{
  const reports=[];
  for(let index=0;index<files.length;index++){
    const file=files[index];
    try{
      const data=new Uint8Array(await fs.readFile(file));
      const fingerprint=fingerprintPhotoContract(data);
      const classification=classifyPhotoContract(data,fingerprint);
      reports.push({
        ...(sanitized?{source:index+1}:{file:path.basename(file)}),
        bytes:data.length,
        status:classification.status,
        sourceContractId:classification.sourceContractId,
        sourceSignature:classification.sourceSignature,
        contractIdentity:classification.contractIdentity,
        reasons:classification.reasons,
        unknownCriticalResources:classification.unknownCriticalResources,
        targetCandidates:classification.targetCandidates,
        warnings:classification.warnings,
        recovery:classification.recovery,
        safeOperations:classification.safeOperations,
        ...(includePreflight?{preflight:sanitized
          ?sanitizeCompatibilityPreflight(preflightLegacyCompatibilityExport(data,{classification}))
          :preflightLegacyCompatibilityExport(data,{classification})}:{}),
        fingerprint:sanitized?sanitizeContractFingerprint(fingerprint):fingerprint,
      });
    }catch(error){
      reports.push(sanitized?{source:index+1,error:String(error?.message||error)}
        :{file:path.basename(file),error:String(error?.message||error)});
    }
  }
  console.log(JSON.stringify(reports.length===1?reports[0]:reports,null,2));
}
