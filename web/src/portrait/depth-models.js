// Curated models only. Labels are intentionally independent of model versions.
export const DEPTH_MODELS=Object.freeze({
  lite:Object.freeze({label:'Lite',files:['lite-model_q4.onnx'],rank:4,kind:'disparity',mb:27}),
  standard:Object.freeze({label:'Standard',files:['model.onnx'],rank:4,kind:'disparity',mb:99}),
  pro:Object.freeze({label:'Pro',files:['pro-model.onnx','pro-model.onnx_data'],rank:5,kind:'depth',mb:105}),
});
export function depthModel(id='standard'){
  if(!Object.hasOwn(DEPTH_MODELS,id))throw Error('Unsupported depth model');
  return DEPTH_MODELS[id];
}
export function asDisparity(values,kind){
  if(kind==='disparity')return values;
  if(kind!=='depth')throw Error('Unsupported depth output');
  return Float32Array.from(values,value=>{
    if(!Number.isFinite(value)||value<=0)throw Error('Invalid AI depth');
    return 1/value;
  });
}
