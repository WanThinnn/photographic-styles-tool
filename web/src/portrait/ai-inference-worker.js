const ASSETS = new URL('../../vendor/ai-portrait/', import.meta.url);
import {downloadModelBytes,MODEL_CACHE_NAME} from '../core/model-download.js';
import {refineDepth} from './ai-depth-refinement.js';
import {depthWorkerFailure} from './ai-inference.js';
self.onmessage = async ({data: {rgb, input, guidance}}) => {
  let session, outputs, inputTensor,stage='modelLoading';
  try {
    if (!self.navigator.gpu || !await self.navigator.gpu.requestAdapter({powerPreference:'high-performance'})) throw Error('WEBGPU');
    const ort = await import('../../vendor/ai-portrait/ort.webgpu.min.mjs');
    ort.env.webgpu.powerPreference = 'high-performance';
    ort.env.wasm.wasmPaths = ASSETS.href; ort.env.wasm.numThreads = 1;
    const manifest=await fetch(new URL('assets.json',ASSETS)).then(r=>{if(!r.ok)throw Error('AI assets unavailable');return r.json();});
    const asset=manifest.files['model.onnx'],url=new URL('model.onnx',ASSETS);url.searchParams.set('sha256',asset.sha256);
    stage='download';self.postMessage({stage});
    let model=await downloadModelBytes(url.href,{onProgress:progress=>self.postMessage({stage:'download',progress})});
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',model)),n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==asset.sha256){try{await(await caches.open(MODEL_CACHE_NAME)).delete(url.href);}catch{}throw Error('AI model integrity check failed');}
    stage='modelLoading';self.postMessage({stage});
    session = await ort.InferenceSession.create(model, {executionProviders:['webgpu']});model=null;
    const count = input.width * input.height, tensor = new Float32Array(3 * count);
    const mean = [.485,.456,.406], std = [.229,.224,.225];
    for(let p=0;p<count;p++)for(let c=0;c<3;c++)tensor[c*count+p]=(rgb[p*3+c]/255-mean[c])/std[c];
    stage='inference';self.postMessage({stage});
    inputTensor=new ort.Tensor('float32',tensor,[1,3,input.height,input.width]);
    outputs = await session.run({[session.inputNames[0]]:inputTensor});
    inputTensor.dispose();inputTensor=null;
    const output = outputs[session.outputNames[0]], values = new Float32Array(await output.getData());
    const mh=output.dims.at(-2),mw=output.dims.at(-1);
    for(const value of Object.values(outputs))value.dispose();outputs=null;await session.release();session=null;
    if(guidance){
      stage='refining';self.postMessage({stage});
      const gray=refineDepth(values,mw,mh,guidance.rgb,guidance.width,guidance.height);
      self.postMessage({result:{gray,mh,mw}},[gray.buffer]);
    }else self.postMessage({result:{values,mh,mw}}, [values.buffer]);
  } catch(error) { self.postMessage(depthWorkerFailure(error,stage)); }
  finally { inputTensor?.dispose();if(outputs)for(const value of Object.values(outputs))value.dispose();if(session)await session.release(); }
};
