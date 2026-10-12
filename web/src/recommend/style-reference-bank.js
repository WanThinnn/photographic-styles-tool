import {STYLE_IDS,validateStyleRecommendation} from './style-selection.js';
import {STYLE_MODEL_ID,STYLE_MODEL_REVISION} from './style-model.js';

export const STYLE_BANK_VERSION=1;
export const STYLE_BANK_MODEL=STYLE_MODEL_ID;
export const STYLE_BANK_REVISION=STYLE_MODEL_REVISION;
export const STYLE_EMBEDDING_DIMENSIONS=512;
const MAX_RECORDS=4096,MAX_EMBEDDING_BYTES=4*1024*1024;
const ALLOWED_ROOT=new Set(['version','model','revision','dimensions','records']);
const ALLOWED_RECORD=new Set(['embedding','styleId','tone','color','palette','sourceClass']);

function exactKeys(value,allowed,label){
  for(const key of Object.keys(value))if(!allowed.has(key))throw new Error(`Unexpected ${label} field: ${key}`);
}
function normalizedEmbedding(input,dimensions){
  if(!Array.isArray(input)&&!(input instanceof Float32Array))throw new TypeError('Embedding array required');
  if(input.length!==dimensions)throw new RangeError('Invalid embedding dimensions');
  let norm2=0;
  const out=new Float32Array(dimensions);
  for(let i=0;i<dimensions;i++){
    const value=Number(input[i]);
    if(!Number.isFinite(value))throw new RangeError('Non-finite embedding');
    out[i]=value;norm2+=value*value;
  }
  if(!(norm2>1e-12))throw new RangeError('Zero embedding');
  const inv=1/Math.sqrt(norm2);
  for(let i=0;i<out.length;i++)out[i]*=inv;
  return out;
}

export function validateReferenceBank(raw,{requireComplete=true}={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Reference bank object required');
  exactKeys(raw,ALLOWED_ROOT,'bank');
  if(raw.version!==STYLE_BANK_VERSION||raw.model!==STYLE_BANK_MODEL||raw.revision!==STYLE_BANK_REVISION||raw.dimensions!==STYLE_EMBEDDING_DIMENSIONS)
    throw new Error('Unsupported reference bank');
  if(!Array.isArray(raw.records)||raw.records.length<1||raw.records.length>MAX_RECORDS)throw new RangeError('Invalid reference bank size');
  if(raw.records.length*raw.dimensions*Float32Array.BYTES_PER_ELEMENT>MAX_EMBEDDING_BYTES)throw new RangeError('Reference bank embedding budget exceeded');
  const seen=new Set();
  const records=raw.records.map((record,index)=>{
    if(!record||typeof record!=='object'||Array.isArray(record))throw new TypeError('Invalid reference record');
    exactKeys(record,ALLOWED_RECORD,'reference');
    if(!['native-complete','native-capture'].includes(record.sourceClass))throw new Error('Unsupported reference source');
    const recommendation=validateStyleRecommendation({...record,confidence:1,level:'standard'});
    const embedding=normalizedEmbedding(record.embedding,raw.dimensions);
    seen.add(recommendation.styleId);
    return Object.freeze({...recommendation,embedding,index,sourceClass:record.sourceClass});
  });
  if(requireComplete)for(const id of STYLE_IDS)if(!seen.has(id))throw new Error(`Reference bank missing Style ${id}`);
  return Object.freeze({version:raw.version,model:raw.model,revision:raw.revision,dimensions:raw.dimensions,records:Object.freeze(records)});
}

export function normalizeQueryEmbedding(input,dimensions=STYLE_EMBEDDING_DIMENSIONS){
  return normalizedEmbedding(input,dimensions);
}
function cosine(a,b){
  let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum;
}
function weightedMedian(values){
  const sorted=[...values].sort((a,b)=>a.value-b.value||a.index-b.index);
  const total=sorted.reduce((sum,item)=>sum+item.weight,0);
  let running=0;
  for(const item of sorted){running+=item.weight;if(running>=total/2)return item.value;}
  return sorted.at(-1)?.value??0;
}

export function queryReferenceBank(bank,query,{k=7}={}){
  if(!bank?.records||!Number.isInteger(k)||k<1)throw new TypeError('Validated bank and positive k required');
  const embedding=normalizeQueryEmbedding(query,bank.dimensions);
  const ranked=bank.records.map(record=>({record,similarity:cosine(embedding,record.embedding)}))
    .sort((a,b)=>b.similarity-a.similarity||a.record.index-b.record.index)
    .slice(0,Math.min(k,bank.records.length));
  const styleWeights=new Map();
  for(const item of ranked){
    const weight=Math.max(1e-6,Math.pow(Math.max(0,(item.similarity+1)/2),4));
    item.weight=weight;
    styleWeights.set(item.record.styleId,(styleWeights.get(item.record.styleId)||0)+weight);
  }
  const styles=[...styleWeights.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
  const [winnerId,winnerWeight]=styles[0];
  const total=styles.reduce((sum,[,weight])=>sum+weight,0);
  const secondWeight=styles[1]?.[1]??0;
  const winner=ranked.filter(item=>item.record.styleId===winnerId);
  const parameter=name=>weightedMedian(winner.map(item=>({value:item.record[name],weight:item.weight,index:item.record.index})));
  return Object.freeze({
    styleId:winnerId,
    tone:parameter('tone'),
    color:parameter('color'),
    palette:parameter('palette'),
    support:total?winnerWeight/total:0,
    margin:total?(winnerWeight-secondWeight)/total:0,
    topSimilarity:ranked[0]?.similarity??-1,
    neighbors:Object.freeze(ranked.map(item=>Object.freeze({styleId:item.record.styleId,similarity:item.similarity,weight:item.weight}))),
  });
}
