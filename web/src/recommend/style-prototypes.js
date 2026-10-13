import {STYLE_SELECTIONS} from './style-selection.js';
import {styleModelSpec} from './style-model.js';

const RECOMMENDABLE_STYLE_IDS=Object.freeze(Object.keys(STYLE_SELECTIONS).map(Number).filter(id=>id!==13&&id!==15));
// Zero-shot text labels do not have equal priors. "Bright" matches generic
// daylight photos too easily, so require a material semantic lead before it
// can beat a more specific Style. Strong Bright matches still win.
export const STYLE_SCORE_CALIBRATION=Object.freeze({16:-.35});
const ROOT_KEYS=new Set(['schema','model','revision','dimensions','negativeWeight','styles']);
const STYLE_KEYS=new Set(['name','positive','negative']);

function exactKeys(value,allowed,label){for(const key of Object.keys(value))if(!allowed.has(key))throw Error(`Unexpected ${label} field: ${key}`);}
function normalize(value,dimensions){
  if(!Array.isArray(value)&&!(value instanceof Float32Array))throw Error('Style prototype vector required');
  if(value.length!==dimensions)throw Error('Style prototype dimension mismatch');
  const out=Float32Array.from(value);let norm2=0;
  for(const item of out){if(!Number.isFinite(item))throw Error('Non-finite style prototype');norm2+=item*item;}
  if(!(norm2>1e-12))throw Error('Zero style prototype');
  const inv=1/Math.sqrt(norm2);for(let i=0;i<out.length;i++)out[i]*=inv;return out;
}

export function validateStylePrototypes(raw,level='standard'){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Style prototypes object required');
  exactKeys(raw,ROOT_KEYS,'style prototypes');
  const spec=styleModelSpec(level),dimensions=spec.input.embeddingDimensions;
  if(raw.schema!==1||raw.model!==spec.id||!/^[a-f0-9]{40}$/.test(raw.revision||'')||raw.dimensions!==dimensions)
    throw Error('Unsupported style prototypes');
  const negativeWeight=Number(raw.negativeWeight);
  if(!Number.isFinite(negativeWeight)||negativeWeight<0||negativeWeight>1)throw Error('Invalid style prototype negative weight');
  const ids=Object.keys(raw.styles||{}).map(Number).sort((a,b)=>a-b);
  if(ids.length!==RECOMMENDABLE_STYLE_IDS.length||ids.some((id,index)=>id!==[...RECOMMENDABLE_STYLE_IDS].sort((a,b)=>a-b)[index]))
    throw Error('Style prototype coverage mismatch');
  const styles={};
  for(const id of RECOMMENDABLE_STYLE_IDS){
    const value=raw.styles[id];exactKeys(value,STYLE_KEYS,'style prototype');
    if(value.name!==STYLE_SELECTIONS[id].name)throw Error(`Style prototype name mismatch: ${id}`);
    styles[id]=Object.freeze({id,name:value.name,positive:normalize(value.positive,dimensions),negative:normalize(value.negative,dimensions)});
  }
  return Object.freeze({schema:1,model:raw.model,revision:raw.revision,dimensions,negativeWeight,styles:Object.freeze(styles)});
}

const dot=(a,b)=>{let total=0;for(let i=0;i<a.length;i++)total+=a[i]*b[i];return total;};
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));

function scoresForView(embedding,manifest){
  const image=normalize(embedding,manifest.dimensions),raw=RECOMMENDABLE_STYLE_IDS.map(id=>{
    const style=manifest.styles[id];
    return {styleId:id,styleName:style.name,raw:dot(image,style.positive)-manifest.negativeWeight*dot(image,style.negative)};
  });
  const mean=raw.reduce((sum,item)=>sum+item.raw,0)/raw.length;
  const variance=raw.reduce((sum,item)=>sum+(item.raw-mean)**2,0)/raw.length;
  const scale=Math.max(1e-4,Math.sqrt(variance));
  return raw.map(item=>Object.freeze({...item,
    score:(item.raw-mean)/scale+(STYLE_SCORE_CALIBRATION[item.styleId]||0),
  })).sort((a,b)=>b.score-a.score||a.styleId-b.styleId);
}

export function scoreStylePrototypes({prototypes,embeddings,level='standard',minSupport=.45,minScoreMargin=.13}){
  const manifest=prototypes?.styles?prototypes:validateStylePrototypes(prototypes,level);
  if(!Array.isArray(embeddings)||!embeddings.length)throw Error('Style embeddings required');
  const perView=embeddings.map(embedding=>scoresForView(embedding,manifest));
  const totals=new Map(RECOMMENDABLE_STYLE_IDS.map(id=>[id,0]));let weightSum=0;
  perView.forEach((ranked,index)=>{
    const weight=index===0?2:1;weightSum+=weight;
    for(const item of ranked)totals.set(item.styleId,totals.get(item.styleId)+item.score*weight);
  });
  const scores=RECOMMENDABLE_STYLE_IDS.map(id=>Object.freeze({
    styleId:id,styleName:STYLE_SELECTIONS[id].name,score:totals.get(id)/weightSum,
  })).sort((a,b)=>b.score-a.score||a.styleId-b.styleId);
  const winner=scores[0],runnerUp=scores[1],margin=winner.score-runnerUp.score;
  const support=perView.reduce((count,ranked)=>{
    const candidate=ranked.find(item=>item.styleId===winner.styleId);
    return count+(candidate&&ranked[0].score-candidate.score<=minScoreMargin?1:0);
  },0)/perView.length;
  const topProb=1/(1+Math.exp(-margin*2.4));
  const confidence=clamp((topProb-.5)*1.35+support*.55);
  return Object.freeze({winner,runnerUp,scores:Object.freeze(scores),margin,support,confidence,ambiguous:support<minSupport});
}
