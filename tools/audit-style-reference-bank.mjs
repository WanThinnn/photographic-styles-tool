import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateReferenceBank} from '../web/src/recommend/style-reference-bank.js';
import {STYLE_IDS,STYLE_SELECTIONS} from '../web/src/recommend/style-selection.js';

const path=process.argv[2];
if(!path){
  console.error('Usage: node tools/audit-style-reference-bank.mjs path/to/reference-bank.json');
  process.exitCode=2;
}else{
  try{
    const raw=JSON.parse(await readFile(resolve(path),'utf8'));
    const bank=validateReferenceBank(raw);
    const counts=new Map(STYLE_IDS.map(id=>[id,0]));
    for(const record of bank.records)counts.set(record.styleId,counts.get(record.styleId)+1);
    console.log(JSON.stringify({
      valid:true,version:bank.version,model:bank.model,revision:bank.revision,dimensions:bank.dimensions,records:bank.records.length,
      styles:STYLE_IDS.map(id=>({id,name:STYLE_SELECTIONS[id].name,count:counts.get(id)})),
    },null,2));
  }catch(error){
    console.error(JSON.stringify({valid:false,error:String(error?.message||error)},null,2));
    process.exitCode=1;
  }
}
