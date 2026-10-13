import {STYLE_PARAMETER_BOUNDS,styleSelection,validateStyleRecommendation} from './style-selection.js';
import {scoreStylePrototypes} from './style-prototypes.js';
import {styleQuality} from './style-quality.js';

const clamp=(value,{min,max})=>Math.min(max,Math.max(min,value));
const bounded=(value,limit)=>Math.min(limit,Math.max(-limit,value));
// Injected Styles do not have Apple's per-capture calibration. Keeping the
// automatic Palette below 100 avoids stacking an aggressive editable preset
// on top of colour already rendered into the source photo.
export const SUGGESTED_STYLE_PALETTE_MAX=.70;

function refine(preset,stats){
  const parameters={tone:preset.tone,color:preset.color,palette:preset.palette};
  if(!stats)return parameters;
  const stat=(name,fallback)=>Number.isFinite(stats[name])?stats[name]:fallback;
  const p50=stat('p50',.18),shadow=stat('shadowRatio',0),highlight=stat('highlightRatio',0);
  const saturation=stat('saturationMedian',.32),chroma=stat('chromaMedian',.22),warmth=stat('warmth',0);
  const contrast=stat('contrast',.35),iqr=stat('lumaIqr',.18);
  const tone=parameters.tone+bounded((.18-p50)*.22+(shadow-highlight)*.03,.07);
  const color=parameters.color+bounded((.32-saturation)*.08+(.22-chroma)*.05-warmth*.02,.05);
  const palette=preset.hasPalette?Math.min(SUGGESTED_STYLE_PALETTE_MAX,
    parameters.palette+bounded((.35-contrast)*.05+(.18-iqr)*.04,.04)):preset.palette;
  return {
    tone:clamp(tone,STYLE_PARAMETER_BOUNDS.tone),
    color:clamp(color,STYLE_PARAMETER_BOUNDS.color),
    palette:clamp(palette,STYLE_PARAMETER_BOUNDS.palette),
  };
}

function fallback(level,stats,confidence){
  const p=styleSelection(1);
  const adjusted=refine(p,stats);
  return validateStyleRecommendation({styleId:1,...adjusted,confidence,fallback:true,level});
}

export function recommendStyle({prototypes,level='standard',embeddings,statistics=null}){
  const quality=styleQuality(level);
  const decision=scoreStylePrototypes({
    prototypes,embeddings,level,minSupport:quality.minSupport,minScoreMargin:quality.minScoreMargin,
  });
  if(decision.ambiguous)return fallback(level,statistics,decision.confidence);
  const preset=styleSelection(decision.winner.styleId);
  const adjusted=refine(preset,statistics);
  return validateStyleRecommendation({
    styleId:preset.id,
    ...adjusted,
    confidence:decision.confidence,
    fallback:false,
    level,
  });
}
