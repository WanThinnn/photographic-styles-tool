export const STYLE_MODEL_ID='tinyclip-vit-8m-16-image';
export const STYLE_MODEL_REVISION='9463a9c508a344c837ffefe9d724f3827bf2dc79';

export const STYLE_MODEL_INPUT=Object.freeze({
  size:224,
  channels:3,
  layout:'nchw-rgb',
  shape:Object.freeze([1,3,224,224]),
  inputName:'pixel_values',
  outputName:'image_embeds',
  embeddingDimensions:512,
  mean:Object.freeze([0.48145466,0.4578275,0.40821073]),
  std:Object.freeze([0.26862954,0.26130258,0.27577711]),
});

export const STYLE_MODEL_VARIANTS=Object.freeze({
  wasm:Object.freeze({provider:'wasm',precision:'int8'}),
  webgpu:Object.freeze({provider:'webgpu',precision:'fp16'}),
});

const ASSET_KEYS=new Set(['file','bytes','sha256','precision','inputName','inputShape','outputName','embeddingDimensions']);
const ROOT_KEYS=new Set(['schema','model','revision','input','models']);
const INPUT_KEYS=new Set(['size','channels','layout','shape','inputName','outputName','embeddingDimensions','mean','std']);

function exactKeys(value,allowed,label){
  for(const key of Object.keys(value))if(!allowed.has(key))throw Error(`Unexpected Suggested Styles ${label} field: ${key}`);
}
function finiteArray(value,length,label){
  if(!Array.isArray(value)||value.length!==length||value.some(item=>!Number.isFinite(item)))throw Error(`Invalid Suggested Styles ${label}`);
  return value;
}

export function validateStyleModelAsset(config,provider){
  const variant=STYLE_MODEL_VARIANTS[provider];
  if(!variant||!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid Suggested Styles model asset');
  exactKeys(config,ASSET_KEYS,'asset');
  if(!/^[-\w.]+\.onnx$/.test(config.file||'')||!Number.isInteger(config.bytes)||config.bytes<100_000
    ||!/^[a-f0-9]{64}$/.test(config.sha256||'')||config.precision!==variant.precision
    ||config.inputName!==STYLE_MODEL_INPUT.inputName||config.outputName!==STYLE_MODEL_INPUT.outputName
    ||!Array.isArray(config.inputShape)||config.inputShape.length!==4||config.inputShape.some((v,i)=>v!==STYLE_MODEL_INPUT.shape[i])
    ||config.embeddingDimensions!==STYLE_MODEL_INPUT.embeddingDimensions)throw Error('Invalid Suggested Styles model asset');
  return Object.freeze({...config,provider});
}

export function validateStyleModelManifest(manifest){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('Invalid Suggested Styles model manifest');
  exactKeys(manifest,ROOT_KEYS,'manifest');
  if(manifest.schema!==1||manifest.model!==STYLE_MODEL_ID||manifest.revision!==STYLE_MODEL_REVISION)
    throw Error('Unsupported Suggested Styles model manifest');
  const input=manifest.input;
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid Suggested Styles input contract');
  exactKeys(input,INPUT_KEYS,'input');
  finiteArray(input.mean,3,'normalization mean');finiteArray(input.std,3,'normalization std');finiteArray(input.shape,4,'input shape');
  if(input.size!==STYLE_MODEL_INPUT.size||input.channels!==STYLE_MODEL_INPUT.channels||input.layout!==STYLE_MODEL_INPUT.layout
    ||input.shape.some((v,i)=>v!==STYLE_MODEL_INPUT.shape[i])
    ||input.inputName!==STYLE_MODEL_INPUT.inputName||input.outputName!==STYLE_MODEL_INPUT.outputName
    ||input.embeddingDimensions!==STYLE_MODEL_INPUT.embeddingDimensions
    ||input.mean.some((v,i)=>v!==STYLE_MODEL_INPUT.mean[i])||input.std.some((v,i)=>v!==STYLE_MODEL_INPUT.std[i]))
    throw Error('Suggested Styles input contract does not match pinned TinyCLIP preprocessing');
  if(!manifest.models||typeof manifest.models!=='object'||Array.isArray(manifest.models))throw Error('Missing Suggested Styles model variants');
  const models={};
  for(const provider of Object.keys(STYLE_MODEL_VARIANTS))models[provider]=validateStyleModelAsset(manifest.models[provider],provider);
  for(const provider of Object.keys(manifest.models))if(!Object.hasOwn(STYLE_MODEL_VARIANTS,provider))throw Error(`Unexpected Suggested Styles provider: ${provider}`);
  return Object.freeze({schema:1,model:manifest.model,revision:manifest.revision,input:STYLE_MODEL_INPUT,models:Object.freeze(models)});
}

export function styleModel(provider='wasm',manifest){
  if(!Object.hasOwn(STYLE_MODEL_VARIANTS,provider))throw new RangeError('Unsupported Suggested Styles provider');
  if(!manifest)throw Error('Suggested Styles packaged model manifest required');
  const validated=validateStyleModelManifest(manifest);
  return Object.freeze({...validated.models[provider],input:validated.input});
}
