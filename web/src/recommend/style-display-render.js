import {styleSelection,validateStyleRecommendation} from './style-selection.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const PROFILES=Object.freeze({
  1:{},
  2:{contrast:-.04,saturation:-.08,fade:.015},
  3:{exposure:.02,contrast:-.05,saturation:-.02,warmth:.06,tint:.07,fade:.025},
  4:{exposure:.01,contrast:.04,saturation:.03,warmth:.13,tint:.015},
  5:{contrast:-.02,saturation:-.04,warmth:-.06,tint:.09,fade:.018},
  6:{contrast:.03,saturation:-.035,warmth:.015},
  7:{exposure:.015,contrast:-.12,saturation:-.13,warmth:.025,fade:.04},
  8:{contrast:.12,saturation:.25,warmth:.015},
  9:{exposure:-.025,contrast:.08,saturation:.04,warmth:.14,tint:.015},
  10:{exposure:.07,contrast:-.14,saturation:-.09,warmth:.025,tint:.035,fade:.085},
  11:{exposure:-.035,contrast:.30,saturation:-.09,warmth:.015},
  12:{exposure:.09,contrast:-.04,saturation:.06,warmth:.025,fade:.018},
  13:{exposure:-.035,contrast:.38,saturation:-1,mono:true},
  14:{exposure:.025,contrast:.06,saturation:.045,warmth:.17,tint:-.015},
  15:{exposure:.025,contrast:-.08,saturation:-1,mono:true,fade:.055},
  16:{exposure:.105,contrast:.08,saturation:.035,fade:.012},
});

export function shouldRenderStyleDisplay(value){
  const recommendation=validateStyleRecommendation(value);
  return !recommendation.fallback&&recommendation.styleId!==1&&recommendation.palette>0.01;
}

export function styleDisplayParameters(value){
  const recommendation=validateStyleRecommendation(value),preset=styleSelection(recommendation.styleId);
  const base=PROFILES[recommendation.styleId]||{};
  const toneDelta=recommendation.tone-preset.tone,colorDelta=recommendation.color-preset.color;
  const paletteBase=Math.max(.25,preset.palette);
  const strength=clamp(.22+.78*clamp(recommendation.palette/paletteBase));
  return Object.freeze({
    strength,
    exposure:(base.exposure||0)+toneDelta*.11,
    contrast:(base.contrast||0)-toneDelta*.06,
    saturation:(base.saturation||0)+colorDelta*.20,
    warmth:(base.warmth||0)+colorDelta*.035,
    tint:base.tint||0,
    fade:base.fade||0,
    mono:Boolean(base.mono),
  });
}

export function applyStyleDisplayRgba(input,value){
  const recommendation=validateStyleRecommendation(value);
  const source=input instanceof Uint8ClampedArray?input:new Uint8ClampedArray(input);
  const output=new Uint8ClampedArray(source);
  if(!shouldRenderStyleDisplay(recommendation))return output;
  const p=styleDisplayParameters(recommendation),gain=2**p.exposure;
  for(let i=0;i<output.length;i+=4){
    const alpha=output[i+3];
    if(alpha===0)continue;
    const original=[output[i]/255,output[i+1]/255,output[i+2]/255];
    // Leave encoder padding black. It is outside the visible grid and changing it
    // can create coloured seams around cropped edge tiles.
    if(original[0]===0&&original[1]===0&&original[2]===0)continue;
    let r=original[0]*gain,g=original[1]*gain,b=original[2]*gain;
    r=(r-.5)*(1+p.contrast)+.5;g=(g-.5)*(1+p.contrast)+.5;b=(b-.5)*(1+p.contrast)+.5;
    const y=.2126*r+.7152*g+.0722*b;
    const saturation=p.mono?0:Math.max(0,1+p.saturation);
    r=y+(r-y)*saturation;g=y+(g-y)*saturation;b=y+(b-y)*saturation;
    r+=p.warmth*.075+p.tint*.035;g-=p.tint*.045;b-=p.warmth*.075-p.tint*.035;
    if(p.fade){r=r*(1-p.fade)+p.fade*.16;g=g*(1-p.fade)+p.fade*.16;b=b*(1-p.fade)+p.fade*.16;}
    output[i]=Math.round(255*clamp(original[0]+(clamp(r)-original[0])*p.strength));
    output[i+1]=Math.round(255*clamp(original[1]+(clamp(g)-original[1])*p.strength));
    output[i+2]=Math.round(255*clamp(original[2]+(clamp(b)-original[2])*p.strength));
  }
  return output;
}
