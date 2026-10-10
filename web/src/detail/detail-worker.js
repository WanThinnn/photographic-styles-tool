import {detailModel,validateDetailAsset} from './detail-models.js';
const ASSETS=new URL('../../vendor/ai-portrait/',import.meta.url);
const {min,max}=Math;
const clamp=n=>max(0,min(255,Math.round(n)));
self.onmessage=async({data})=>{
 let session,ort,inputs,outputs;
 try{
   const {modelId,provider,width,height,rgba,assetRoot}=data;
   const model=detailModel(modelId);
   const root=new URL(assetRoot);
   const response=await fetch(new URL('assets.json',root),{cache:'no-store'});
   if(!response.ok)throw Error('AI detail model assets are not installed; run the model packaging tool');
   const manifest=await response.json(),entry=validateDetailAsset(manifest.models?.[modelId]);
   if(manifest.schema!==1||entry.family!==({lite:'span',standard:'rplksr',pro:'fatality-deblur'})[modelId])
     throw Error('AI detail model selection does not match pinned weights');
   const url=new URL(entry.file,root);
   self.postMessage({stage:'download'});
   const res=await fetch(url);
   if(!res.ok)throw Error('AI detail weights unavailable');
   const bytes=new Uint8Array(await res.arrayBuffer());
   if(bytes.length!==entry.bytes)throw Error('AI detail model size mismatch');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   if(digest!==entry.sha256)throw Error('AI detail model SHA-256 mismatch');
   ort=await import('../../vendor/ai-portrait/ort.webgpu.min.mjs');
   ort.env.wasm.wasmPaths=ASSETS.href;ort.env.wasm.numThreads=1;
   if(provider==='webgpu'&&!self.navigator.gpu)throw Error('WebGPU is unavailable');
   self.postMessage({stage:'modelLoading'});
   session=await ort.InferenceSession.create(bytes,{executionProviders:[provider]});
   const tile=model.tile,pad=model.overlap,step=tile-2*pad;
   if(width>8000||height>8000)throw Error('Image is too large for detail inference');
   const result=new Uint8ClampedArray(rgba.length);
   const inputName=session.inputNames[0],outputName=session.outputNames[0];
   const nx=Math.ceil(width/step),ny=Math.ceil(height/step);let done=0;
   for(let yi=0;yi<ny;yi++)for(let xi=0;xi<nx;xi++){
     const left=xi*step-pad,top=yi*step-pad;
     const data=new Float32Array(entry.channels*tile*tile);
     for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
       const sy=max(0,min(height-1,top+y)),sx=max(0,min(width-1,left+x));
       const p=(sy*width+sx)*4,q=y*tile+x;
       for(let c=0;c<3;c++)data[c*tile*tile+q]=rgba[p+c]/255;
     }
     inputs=new ort.Tensor('float32',data,[1,entry.channels,tile,tile]);
     outputs=await session.run({[inputName]:inputs});
     const out=outputs[outputName];
     if(!out||out.dims.length!==4||out.dims[1]!==3||out.dims[2]!==tile||out.dims[3]!==tile)
       throw Error('Unexpected AI detail output shape');
     const rgb=await out.getData();
     for(let y=pad;y<tile-pad;y++)for(let x=pad;x<tile-pad;x++){
       const sy=top+y,sx=left+x;
       if(sy<0||sx<0||sy>=height||sx>=width)continue;
       const p=sy*width+sx,q=y*tile+x;
       // Inner tile regions do not overlap. The discarded rim provides context.
       for(let c=0;c<3;c++){
         const prediction=rgb[c*tile*tile+q];
         result[p*4+c]=clamp(255*prediction);
       }
       result[p*4+3]=rgba[p*4+3];
     }
     for(const output of Object.values(outputs))output.dispose?.();
     outputs=null;inputs.dispose?.();inputs=null;
     self.postMessage({stage:'inference',progress:{done:++done,total:nx*ny}});
   }
   await session.release();session=null;
   self.postMessage({result:{data:result,width,height}},[result.buffer]);
 }catch(error){self.postMessage({error:String(error?.message||error)});}
 finally{
   inputs?.dispose?.();if(outputs)for(const output of Object.values(outputs))output.dispose?.();
   if(session)await session.release();
 }
};
