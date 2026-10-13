import {buildAiPortrait} from './ai-portrait-export.js';
let source,depth,template,legacyHdrNormalized;
self.onmessage=({data})=>{
  if(data.source){({source,depth,template,legacyHdrNormalized}=data);return;}
  try{const result=buildAiPortrait(source,depth,template,{...data.settings,legacyHdrNormalized});self.postMessage({id:data.id,result},[result.data.buffer]);}
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
