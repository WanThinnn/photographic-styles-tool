import {STYLE_MODEL_ID,STYLE_MODEL_REVISION} from './style-model.js';
import {STYLE_EMBEDDING_DIMENSIONS,normalizeQueryEmbedding} from './style-reference-bank.js';

export const SEMANTIC_AXIS_IDS=Object.freeze([
  'dramatic','airy','energetic','warmMood','dreamy','natural','people','colorful',
]);

const ROOT_KEYS=new Set(['schema','model','revision','dimensions','axes']);
const AXIS_KEYS=new Set(['positive','negative','temperature']);
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function exactKeys(value,allowed,label){
  for(const key of Object.keys(value))if(!allowed.has(key))throw Error('Unexpected '+label+' field: '+key);
}
function dot(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum;}

export function validateSemanticAxes(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Semantic axes object required');
  exactKeys(raw,ROOT_KEYS,'semantic axes');
  if(raw.schema!==1||raw.model!==STYLE_MODEL_ID||raw.revision!==STYLE_MODEL_REVISION
    ||raw.dimensions!==STYLE_EMBEDDING_DIMENSIONS)throw Error('Unsupported semantic axes');
  if(!raw.axes||typeof raw.axes!=='object'||Array.isArray(raw.axes))throw Error('Missing semantic axes');
  const keys=Object.keys(raw.axes);
  if(keys.length!==SEMANTIC_AXIS_IDS.length||SEMANTIC_AXIS_IDS.some(id=>!Object.hasOwn(raw.axes,id)))
    throw Error('Semantic axis coverage mismatch');
  for(const key of keys)if(!SEMANTIC_AXIS_IDS.includes(key))throw Error('Unexpected semantic axis: '+key);
  const axes={};
  for(const id of SEMANTIC_AXIS_IDS){
    const value=raw.axes[id];
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid semantic axis: '+id);
    exactKeys(value,AXIS_KEYS,'semantic axis');
    const temperature=Number(value.temperature);
    if(!Number.isFinite(temperature)||temperature<=0||temperature>32)throw Error('Invalid semantic axis temperature: '+id);
    axes[id]=Object.freeze({
      positive:normalizeQueryEmbedding(value.positive,STYLE_EMBEDDING_DIMENSIONS),
      negative:normalizeQueryEmbedding(value.negative,STYLE_EMBEDDING_DIMENSIONS),
      temperature,
    });
  }
  return Object.freeze({schema:1,model:raw.model,revision:raw.revision,dimensions:raw.dimensions,axes:Object.freeze(axes)});
}

export function semanticAxisFeatures(embeddings,manifest){
  const axes=manifest?.axes?manifest:validateSemanticAxes(manifest);
  if(!Array.isArray(embeddings)||!embeddings.length)throw new TypeError('Semantic embeddings required');
  const views=embeddings.map(value=>normalizeQueryEmbedding(value,STYLE_EMBEDDING_DIMENSIONS));
  const perView=views.map(embedding=>{
    const result={};
    for(const id of SEMANTIC_AXIS_IDS){
      const axis=axes.axes[id];
      const difference=dot(embedding,axis.positive)-dot(embedding,axis.negative);
      result[id]=Math.tanh(difference*axis.temperature);
    }
    return Object.freeze(result);
  });
  const values={},dispersion={};
  let dispersionSum=0,maxDispersion=0;
  for(const id of SEMANTIC_AXIS_IDS){
    const series=perView.map(view=>view[id]);
    const mean=series.reduce((sum,value)=>sum+value,0)/series.length;
    const variance=series.reduce((sum,value)=>sum+(value-mean)**2,0)/series.length;
    values[id]=clamp(mean,-1,1);
    dispersion[id]=Math.sqrt(variance);
    dispersionSum+=dispersion[id];
    maxDispersion=Math.max(maxDispersion,dispersion[id]);
  }
  return Object.freeze({
    values:Object.freeze(values),
    dispersion:Object.freeze(dispersion),
    meanDispersion:dispersionSum/SEMANTIC_AXIS_IDS.length,
    maxDispersion,
    perView:Object.freeze(perView),
    views:views.length,
  });
}
