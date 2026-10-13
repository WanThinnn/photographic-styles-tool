import {buildBplist,BplistReal,parseBplist} from '../core/bplist.js';

export const STYLE_PARAMETER_BOUNDS=Object.freeze({
  tone:Object.freeze({min:-1,max:1}),
  color:Object.freeze({min:-1,max:1}),
  palette:Object.freeze({min:0,max:1}),
});

const entries=[
  [1,'Standard',0,0,1],
  [4,'Amber',.2,.2,1],
  [14,'Gold',.2,.1,.85],
  [3,'Rose Gold',-.2,-.2,.75],
  [16,'Bright',-.5,.5,1],
  [2,'Neutral',.4,-.1,.8],
  [5,'Cool Rose',.35,-.1,.75],
  [8,'Vibrant',-.3,.33,1],
  [6,'Natural',-.7,-.15,1],
  [12,'Luminous',.35,.3,1],
  [11,'Dramatic',-.76,.19,1],
  [7,'Quiet',.5,.45,1],
  [9,'Cozy',-.75,-.2,1],
  [10,'Ethereal',.68,-.15,1],
  [15,'Muted B&W',.4,0,.5],
  [13,'Stark B&W',-1,0,.5],
];

export const STYLE_SELECTIONS=Object.freeze(Object.fromEntries(entries.map(([id,name,tone,color,palette])=>[
  id,Object.freeze({id,name,tone,color,palette}),
])));
export const STYLE_IDS=Object.freeze(entries.map(([id])=>id));

export function styleSelection(id){
  const value=STYLE_SELECTIONS[id];
  if(!value)throw new RangeError('Unsupported Photographic Style');
  return value;
}

function finiteInRange(value,{min,max},name){
  if(!Number.isFinite(value)||value<min||value>max)throw new RangeError(`Invalid Style ${name}`);
  return value;
}

export function validateStyleRecommendation(value){
  if(!value||typeof value!=='object')throw new TypeError('Style recommendation required');
  const selection=styleSelection(Number(value.styleId));
  const tone=finiteInRange(Number(value.tone),STYLE_PARAMETER_BOUNDS.tone,'tone');
  const color=finiteInRange(Number(value.color),STYLE_PARAMETER_BOUNDS.color,'color');
  const palette=finiteInRange(Number(value.palette),STYLE_PARAMETER_BOUNDS.palette,'palette');
  const level=value.level??'standard';
  if(!['lite','standard','pro'].includes(level))throw new RangeError('Unsupported AI level');
  const confidence=value.confidence===undefined?0:Number(value.confidence);
  if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw new RangeError('Invalid recommendation confidence');
  return Object.freeze({
    styleId:selection.id,
    styleName:selection.name,
    tone,color,palette,
    confidence,
    fallback:Boolean(value.fallback),
    level,
  });
}

export function buildStyleMarker(value,template=null){
  const recommendation=validateStyleRecommendation(value);
  let marker;
  if(template instanceof Uint8Array)marker=parseBplist(template);
  else if(template instanceof Map)marker=new Map(template);
  else marker=new Map([['0',1],['1',new BplistReal(0)],['2',new BplistReal(0)],['3',new BplistReal(1)],['4',1],['5',1],['6',4],['7',0]]);
  if(!(marker instanceof Map)||marker.get('0')!==1)throw new Error('Invalid Style marker template');
  marker.set('1',new BplistReal(recommendation.tone));
  marker.set('2',new BplistReal(recommendation.color));
  marker.set('3',new BplistReal(recommendation.palette));
  marker.set('4',recommendation.styleId);
  marker.set('5',1);marker.set('6',4);marker.set('7',0);
  return buildBplist(marker);
}
