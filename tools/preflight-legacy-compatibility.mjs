import fs from 'node:fs/promises';
import path from 'node:path';
import {classifyPhotoContract} from '../web/src/compatibility/contract-classifier.js';
import {
  preflightLegacyCompatibilityExport,sanitizeCompatibilityPreflight,
} from '../web/src/compatibility/recovery-preflight.js';

const args=process.argv.slice(2),sanitized=args.includes('--sanitized');
const files=args.filter(value=>value!=='--sanitized');
if(!files.length){
  console.error('Usage: node tools/preflight-legacy-compatibility.mjs [--sanitized] <photo.heic> [...]');
  process.exitCode=2;
}else{
  const reports=[];
  for(let index=0;index<files.length;index++){
    const file=files[index];
    try{
      const data=new Uint8Array(await fs.readFile(file));
      const classification=classifyPhotoContract(data);
      const preflight=preflightLegacyCompatibilityExport(data,{classification});
      const report={
        source:sanitized?index+1:path.basename(file),
        sourceContractId:classification.sourceContractId,
        sourceSignature:classification.sourceSignature,
        status:classification.status,
        reasons:classification.reasons,
        targetCandidates:classification.targetCandidates,
        preflight,
      };
      if(sanitized){
        delete report.sourceContractId;
        report.source='fixture-'+String(index+1);
        // Item IDs are useful locally but are not needed in shareable reports.
        report.preflight=sanitizeCompatibilityPreflight(preflight);
      }
      reports.push(report);
    }catch(error){
      reports.push({source:sanitized?'fixture-'+String(index+1):path.basename(file),
        error:String(error?.message||error),code:error?.code??null});
    }
  }
  console.log(JSON.stringify(reports.length===1?reports[0]:reports,null,2));
}
