import {readFileSync} from 'node:fs';
import {discoverHeic,auxUriForItem,dimensionsForItem,propertyBoxBytes,extractItem} from '../web/src/heif.js';
for(const path of process.argv.slice(2)){
 const data=new Uint8Array(readFileSync(path)),d=discoverHeic(data);
 const result={path,primary:d.primary,size:dimensionsForItem(d.props,d.primary),styles:d.stylesItem,auxiliaries:[],xmp:[]};
 for(const [id,info] of d.infos){
  const uri=auxUriForItem(d.props,id);
  if(uri){const aux=propertyBoxBytes(data,d.props,id,'auxC');result.auxiliaries.push({id,uri,type:info.type,size:dimensionsForItem(d.props,id),auxC:Buffer.from(aux).toString('hex'),refs:d.refs.filter(r=>r.from===id)});}
  if(info.type==='mime'){
   const xmp=new TextDecoder().decode(extractItem(data,d.iloc,id));
   result.xmp.push({id,bytes:xmp.length,refs:d.refs.filter(r=>r.from===id),fields:[...xmp.matchAll(/(?:FloatMin|FloatMax|DepthDataVersion|SimulatedAperture|FocusPoint|RenderingParameters|DepthFormat)[^<>]{0,110}/g)].map(m=>m[0])});
  }
 }
 console.log(JSON.stringify(result,null,2));
}
