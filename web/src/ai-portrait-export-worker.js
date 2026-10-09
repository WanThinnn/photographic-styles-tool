import {buildAiPortrait} from './ai-portrait-export.js';
let source,depth,template;
self.onmessage=({data})=>{
  if(data.source){({source,depth,template}=data);return;}
  try{const result=buildAiPortrait(source,depth,template,data.settings);self.postMessage({id:data.id,result},[result.data.buffer]);}
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
