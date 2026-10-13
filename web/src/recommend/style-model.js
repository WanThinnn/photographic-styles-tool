const CLIP_INPUT=Object.freeze({
  size:224,channels:3,layout:'nchw-rgb',shape:Object.freeze([1,3,224,224]),
  inputName:'pixel_values',outputName:'image_embeds',embeddingDimensions:512,
  mean:Object.freeze([0.48145466,0.4578275,0.40821073]),
  std:Object.freeze([0.26862954,0.26130258,0.27577711]),
});
const SIGLIP2_INPUT=Object.freeze({
  size:224,channels:3,layout:'nchw-rgb',shape:Object.freeze([1,3,224,224]),
  inputName:'pixel_values',outputName:'image_embeds',embeddingDimensions:768,
  mean:Object.freeze([0.5,0.5,0.5]),std:Object.freeze([0.5,0.5,0.5]),
});

export const STYLE_MODEL_SPECS=Object.freeze({
  lite:Object.freeze({key:'lite',id:'tinyclip-vit-8m-16-image',license:'MIT',input:CLIP_INPUT}),
  standard:Object.freeze({key:'standard',id:'tinyclip-vit-39m-16-image',license:'MIT',input:CLIP_INPUT}),
  pro:Object.freeze({key:'pro',id:'siglip2-base-patch16-224-image',license:'Apache-2.0',input:SIGLIP2_INPUT}),
});
export const STYLE_MODEL_LEVELS=Object.freeze(Object.keys(STYLE_MODEL_SPECS));

// Backwards-compatible aliases for the existing Lite package and build tools.
export const STYLE_MODEL_ID=STYLE_MODEL_SPECS.lite.id;
export const STYLE_MODEL_REVISION='9463a9c508a344c837ffefe9d724f3827bf2dc79';
export const STYLE_MODEL_INPUT=CLIP_INPUT;

export const STYLE_MODEL_VARIANTS=Object.freeze({
  wasm:Object.freeze({provider:'wasm',precisions:Object.freeze(['int8','fp32'])}),
  webgpu:Object.freeze({provider:'webgpu',precisions:Object.freeze(['fp16'])}),
});

const ASSET_KEYS=new Set(['file','bytes','sha256','precision','inputName','inputShape','outputName','embeddingDimensions']);
const ROOT_KEYS=new Set(['schema','models']);
const MODEL_KEYS=new Set(['id','revision','license','input','providers']);
const INPUT_KEYS=new Set(['size','channels','layout','shape','inputName','outputName','embeddingDimensions','mean','std']);

function exactKeys(value,allowed,label){
  for(const key of Object.keys(value))if(!allowed.has(key))throw Error(`Unexpected Suggested Styles ${label} field: ${key}`);
}
function finiteArray(value,length,label){
  if(!Array.isArray(value)||value.length!==length||value.some(item=>!Number.isFinite(item)))throw Error(`Invalid Suggested Styles ${label}`);
  return value;
}
function sameArray(a,b){return a.length===b.length&&a.every((value,index)=>value===b[index]);}

export function styleModelSpec(level='standard'){
  const spec=STYLE_MODEL_SPECS[level];
  if(!spec)throw new RangeError('Unsupported AI level');
  return spec;
}

export function validateStyleModelAsset(config,provider,input=STYLE_MODEL_INPUT){
  const variant=STYLE_MODEL_VARIANTS[provider];
  if(!variant||!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid Suggested Styles model asset');
  exactKeys(config,ASSET_KEYS,'asset');
  if(!/^[-\w.]+\.onnx$/.test(config.file||'')||!Number.isInteger(config.bytes)||config.bytes<100_000
    ||!/^[a-f0-9]{64}$/.test(config.sha256||'')||!variant.precisions.includes(config.precision)
    ||config.inputName!==input.inputName||config.outputName!==input.outputName
    ||!Array.isArray(config.inputShape)||!sameArray(config.inputShape,input.shape)
    ||config.embeddingDimensions!==input.embeddingDimensions)throw Error('Invalid Suggested Styles model asset');
  return Object.freeze({...config,provider});
}

function validateInput(input,expected){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid Suggested Styles input contract');
  exactKeys(input,INPUT_KEYS,'input');
  finiteArray(input.mean,3,'normalization mean');finiteArray(input.std,3,'normalization std');finiteArray(input.shape,4,'input shape');
  if(input.size!==expected.size||input.channels!==expected.channels||input.layout!==expected.layout
    ||!sameArray(input.shape,expected.shape)||input.inputName!==expected.inputName||input.outputName!==expected.outputName
    ||input.embeddingDimensions!==expected.embeddingDimensions||!sameArray(input.mean,expected.mean)||!sameArray(input.std,expected.std))
    throw Error('Suggested Styles input contract does not match the pinned model preprocessing');
}

export function validateStyleModelManifest(manifest){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('Invalid Suggested Styles model manifest');
  exactKeys(manifest,ROOT_KEYS,'manifest');
  if(manifest.schema!==2||!manifest.models||typeof manifest.models!=='object'||Array.isArray(manifest.models))
    throw Error('Unsupported Suggested Styles model manifest');
  const models={};
  for(const [level,spec] of Object.entries(STYLE_MODEL_SPECS)){
    const model=manifest.models[level];
    if(!model||typeof model!=='object'||Array.isArray(model))throw Error(`Missing Suggested Styles ${level} model`);
    exactKeys(model,MODEL_KEYS,'model');
    if(model.id!==spec.id||model.license!==spec.license||!/^[a-f0-9]{40}$/.test(model.revision||''))
      throw Error(`Unsupported Suggested Styles ${level} model`);
    validateInput(model.input,spec.input);
    if(!model.providers||typeof model.providers!=='object'||Array.isArray(model.providers))throw Error(`Missing Suggested Styles ${level} providers`);
    const providers={};
    for(const provider of Object.keys(STYLE_MODEL_VARIANTS))providers[provider]=validateStyleModelAsset(model.providers[provider],provider,spec.input);
    for(const provider of Object.keys(model.providers))if(!Object.hasOwn(STYLE_MODEL_VARIANTS,provider))throw Error(`Unexpected Suggested Styles provider: ${provider}`);
    models[level]=Object.freeze({...model,input:spec.input,providers:Object.freeze(providers)});
  }
  for(const level of Object.keys(manifest.models))if(!Object.hasOwn(STYLE_MODEL_SPECS,level))throw Error(`Unexpected Suggested Styles model: ${level}`);
  return Object.freeze({schema:2,models:Object.freeze(models)});
}

export function styleModel(level='standard',provider='wasm',manifest){
  if(!Object.hasOwn(STYLE_MODEL_VARIANTS,provider))throw new RangeError('Unsupported Suggested Styles provider');
  if(!manifest)throw Error('Suggested Styles packaged model manifest required');
  const model=validateStyleModelManifest(manifest).models[styleModelSpec(level).key];
  return Object.freeze({...model.providers[provider],key:level,id:model.id,revision:model.revision,input:model.input});
}
