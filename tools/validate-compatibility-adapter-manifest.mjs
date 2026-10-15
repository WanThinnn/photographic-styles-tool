import fs from 'node:fs/promises';
import {validateCompatibilityAdapterDescriptor} from '../web/src/compatibility/adapters/index.js';

const [file]=process.argv.slice(2);
if(!file){
  console.error('Usage: node tools/validate-compatibility-adapter-manifest.mjs <adapter.json>');
  process.exitCode=2;
}else{
  const manifest=JSON.parse(await fs.readFile(file,'utf8'));
  validateCompatibilityAdapterDescriptor(manifest);
  if(manifest.matchMode==='predicate')
    throw Error('Shareable adapter manifests must use exact signature matching; predicate adapters require code review.');
  console.log(JSON.stringify({
    valid:true,id:manifest.id,enabled:manifest.enabled,matchMode:manifest.matchMode,
    signatures:manifest.sourceSignatures.length,targets:manifest.targets,
    qualification:manifest.qualification,
  },null,2));
}
