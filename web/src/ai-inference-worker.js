const ASSETS = new URL('../vendor/ai-portrait/', import.meta.url);
self.onmessage = async ({data: {rgb, input}}) => {
  let session, outputs;
  try {
    if (!self.navigator.gpu || !await self.navigator.gpu.requestAdapter({powerPreference:'high-performance'})) throw Error('WEBGPU');
    const ort = await import('../vendor/ai-portrait/ort.webgpu.min.mjs');
    ort.env.webgpu.powerPreference = 'high-performance';
    ort.env.wasm.wasmPaths = ASSETS.href; ort.env.wasm.numThreads = 1;
    session = await ort.InferenceSession.create(new URL('model.onnx', ASSETS).href, {executionProviders:['webgpu']});
    const count = input.width * input.height, tensor = new Float32Array(3 * count);
    const mean = [.485,.456,.406], std = [.229,.224,.225];
    for(let p=0;p<count;p++)for(let c=0;c<3;c++)tensor[c*count+p]=(rgb[p*3+c]/255-mean[c])/std[c];
    self.postMessage({stage:'inference'});
    outputs = await session.run({[session.inputNames[0]]:new ort.Tensor('float32',tensor,[1,3,input.height,input.width])});
    const output = outputs[session.outputNames[0]], values = new Float32Array(await output.getData());
    self.postMessage({result:{values,mh:output.dims.at(-2),mw:output.dims.at(-1)}}, [values.buffer]);
  } catch(error) { self.postMessage({error:error.message}); }
  finally { if(outputs)for(const value of Object.values(outputs))value.dispose();if(session)await session.release(); }
};
