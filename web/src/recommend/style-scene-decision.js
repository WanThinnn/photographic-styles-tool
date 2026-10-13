import {STYLE_IDS,STYLE_SELECTIONS} from './style-selection.js';
import {STYLE_PROFILES} from './style-profile-matrix.js';
import {styleQuality} from './style-quality.js';

const clamp=(value,min=-1,max=1)=>Math.min(max,Math.max(min,value));
const stat=(stats,name,fallback)=>Number.isFinite(stats?.[name])?stats[name]:fallback;
// The monochrome presets remain valid metadata choices, but Suggested Styles
// must not remove colour automatically. Users can still select either B&W
// style later in Photos Edit.
const RECOMMENDABLE_STYLE_IDS=Object.freeze(STYLE_IDS.filter(id=>id!==13&&id!==15));
export function scenePhotoFeatures(stats){
  const p50=Math.max(1e-5,stat(stats,'p50',.18));
  const saturation=stat(stats,'saturationMedian',.32);
  return Object.freeze({
    brightness:clamp(Math.log2((p50+.012)/.192)/2),
    contrast:clamp((stat(stats,'contrast',.38)-.38)/.30),
    saturation:clamp((saturation-.32)/.30),
    warmth:clamp(stat(stats,'warmth',0)/.22),
    shadow:clamp((stat(stats,'shadowRatio',.20)-.20)/.35),
    highlight:clamp((stat(stats,'highlightRatio',.04)-.04)/.12),
    chroma:clamp((stat(stats,'chromaMedian',.22)-.22)/.25),
    monochrome:clamp((.18-saturation)/.18),
  });
}

function channelScore(features,targets,normalizer){
  let total=0;
  for(const [name,[target,strength]] of Object.entries(targets)){
    const value=features[name],direction=clamp(target);
    if(!Number.isFinite(value)||!Number.isFinite(direction)||!Number.isFinite(strength)||strength<=0||Math.abs(direction)<.05)continue;
    const influence=Math.abs(direction)*strength;
    const aligned=direction<0?-clamp(value):clamp(value);
    total+=aligned*influence;
  }
  return clamp(total/normalizer);
}

function rankedStyles(semantic,photo,mix){
  return RECOMMENDABLE_STYLE_IDS.map(id=>{
    const profile=STYLE_PROFILES[id];
    const semanticScore=channelScore(semantic,profile.semantic,1.20);
    const photoScore=channelScore(photo,profile.photo,.90);
    const score=semanticScore*mix.semantic+photoScore*mix.photo+profile.prior;
    return Object.freeze({
      styleId:id,
      styleName:STYLE_SELECTIONS[id].name,
      score,
      semanticScore,
      photoScore,
      prior:profile.prior,
    });
  }).sort((a,b)=>b.score-a.score||a.styleId-b.styleId);
}

export function scoreStyleScene({semantic,semanticViews=null,statistics,level='standard',meanDispersion=0,maxDispersion=meanDispersion}){
  const quality=styleQuality(level),photo=scenePhotoFeatures(statistics);
  const mix=level==='lite'?{semantic:.50,photo:.40}:level==='pro'?{semantic:.62,photo:.32}:{semantic:.58,photo:.34};
  const scores=rankedStyles(semantic,photo,mix);
  const winner=scores[0],runnerUp=scores[1],margin=winner.score-runnerUp.score;
  const views=Array.isArray(semanticViews)&&semanticViews.length?semanticViews:[semantic];
  // Several colour presets intentionally sit close together. Count a view as
  // supporting the aggregate winner when it considers that style effectively
  // tied for first; requiring the exact same winner made harmless crop-to-crop
  // ordering noise look like a semantic disagreement.
  const support=views.reduce((count,view)=>{
    const ranked=rankedStyles(view,photo,mix),candidate=ranked.find(style=>style.styleId===winner.styleId);
    return count+(candidate&&ranked[0].score-candidate.score<=quality.minScoreMargin?1:0);
  },0)/views.length;
  const meanStability=clamp(1-meanDispersion/Math.max(.001,quality.maxSemanticDispersion),0,1);
  const peakStability=clamp(1-maxDispersion/Math.max(.001,quality.maxSemanticDispersion*1.35),0,1);
  const stability=meanStability*.65+peakStability*.35;
  const marginConfidence=clamp((margin-quality.minScoreMargin*.45)/.28,0,1);
  const evidenceConfidence=clamp((winner.score+.30)/1.20,0,1);
  const confidence=clamp((marginConfidence*.60+support*.24+evidenceConfidence*.16)*(.72+.28*stability),0,1);
  // Confidence remains useful telemetry, but a small margin is normal among
  // neighbouring presets and must not veto a coherent choice. Fall back only
  // when the sampled views genuinely disagree about the aggregate winner.
  const ambiguous=support<quality.minSupport;
  return Object.freeze({
    winner,
    runnerUp,
    scores:Object.freeze(scores),
    photo,
    margin,
    support,
    stability,
    confidence,
    ambiguous,
  });
}
