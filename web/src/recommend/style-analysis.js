import {styleQuality} from './style-quality.js';
import {normalizeQueryEmbedding} from './style-reference-bank.js';
import {storedPointToDisplay} from '../raster/heif.js';

function validateImage(image){
  if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1)
    throw new TypeError('Invalid style analysis image');
  const pixels=image.width*image.height;
  const channels=image.data?.length===pixels*4?4:image.data?.length===pixels*3?3:0;
  if(!channels)throw new TypeError('Style analysis requires packed RGB or RGBA data');
  return channels;
}
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const srgbToLinear=value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4);

export function orientStyleImage(image,{angle=0,mirror=null}={}){
  const channels=validateImage(image);
  if(![0,90,180,270].includes(angle)||![null,0,1].includes(mirror))throw new RangeError('Invalid Style image orientation');
  if(angle===0&&mirror===null)return image;
  const width=(angle===90||angle===270)?image.height:image.width;
  const height=(angle===90||angle===270)?image.width:image.height;
  const data=new Uint8Array(width*height*channels);
  for(let sy=0;sy<image.height;sy++)for(let sx=0;sx<image.width;sx++){
    const point=storedPointToDisplay((sx+.5)/image.width,(sy+.5)/image.height,angle,mirror);
    const dx=clamp(Math.floor(point.x*width),0,width-1),dy=clamp(Math.floor(point.y*height),0,height-1);
    const source=(sy*image.width+sx)*channels,target=(dy*width+dx)*channels;
    for(let c=0;c<channels;c++)data[target+c]=image.data[source+c];
  }
  return Object.freeze({data,width,height});
}

export function styleViewRects(width,height,level='standard'){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new TypeError('Invalid image geometry');
  const budget=styleQuality(level),rects=[Object.freeze({x:0,y:0,width,height,kind:'global'})];
  const minSide=Math.min(width,height);
  const seen=new Set();
  const add=(cx,cy,scale,kind)=>{
    const side=Math.max(1,Math.min(minSide,Math.round(minSide*scale)));
    const x=clamp(Math.round(cx*width-side/2),0,width-side);
    const y=clamp(Math.round(cy*height-side/2),0,height-side);
    const key=`${x}:${y}:${side}`;if(seen.has(key))return;seen.add(key);
    rects.push(Object.freeze({x,y,width:side,height:side,kind}));
  };
  if(width>=height){add(0,.5,1,'leading');add(1,.5,1,'trailing');}
  else{add(.5,0,1,'leading');add(.5,1,1,'trailing');}
  for(const [cx,cy,scale,kind] of [
    [.5,.5,.78,'center'],[.22,.22,.70,'top-left'],[.78,.22,.70,'top-right'],
    [.22,.78,.70,'bottom-left'],[.78,.78,.70,'bottom-right'],[.5,.18,.62,'top'],
    [.18,.5,.62,'left'],[.82,.5,.62,'right'],[.5,.82,.62,'bottom'],
    [.33,.33,.50,'inner-top-left'],[.67,.33,.50,'inner-top-right'],
    [.33,.67,.50,'inner-bottom-left'],[.67,.67,.50,'inner-bottom-right'],
    [.5,.5,.48,'detail-center'],[.5,.10,.44,'detail-top'],[.5,.90,.44,'detail-bottom'],
    [.10,.5,.44,'detail-left'],[.90,.5,.44,'detail-right'],
  ])add(cx,cy,scale,kind);
  return Object.freeze(rects.slice(0,budget.views));
}

function percentile(sorted,p){
  if(!sorted.length)return 0;
  const i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i),f=i-lo;
  return sorted[lo]*(1-f)+sorted[hi]*f;
}

export function styleImageStatistics(image,{sampleSize=72}={}){
  const channels=validateImage(image);
  const sx=Math.max(1,Math.ceil(image.width/sampleSize)),sy=Math.max(1,Math.ceil(image.height/sampleSize));
  const luma=[],sat=[],chroma=[];let warmth=0,chromaSum=0,count=0,shadow=0,highlight=0;
  for(let y=Math.floor(sy/2);y<image.height;y+=sy)for(let x=Math.floor(sx/2);x<image.width;x+=sx){
    const i=(y*image.width+x)*channels,r=image.data[i]/255,g=image.data[i+1]/255,b=image.data[i+2]/255;
    const rl=srgbToLinear(r),gl=srgbToLinear(g),bl=srgbToLinear(b);
    const yv=.2126*rl+.7152*gl+.0722*bl,hi=Math.max(r,g,b),lo=Math.min(r,g,b),sv=hi===0?0:(hi-lo)/hi;
    const cv=hi-lo;
    luma.push(yv);sat.push(sv);chroma.push(cv);warmth+=r-b;chromaSum+=cv;count++;if(yv<.04)shadow++;if(yv>.65)highlight++;
  }
  luma.sort((a,b)=>a-b);sat.sort((a,b)=>a-b);chroma.sort((a,b)=>a-b);
  const p10=percentile(luma,.1),p25=percentile(luma,.25),p50=percentile(luma,.5),p75=percentile(luma,.75),p90=percentile(luma,.9);
  return Object.freeze({
    p10,p25,p50,p75,p90,contrast:p90-p10,lumaIqr:p75-p25,
    shadowRatio:count?shadow/count:0,
    highlightRatio:count?highlight/count:0,
    chromaMean:count?chromaSum/count:0,
    chromaMedian:percentile(chroma,.5),
    saturationMedian:percentile(sat,.5),
    saturationP90:percentile(sat,.9),
    warmth:count?warmth/count:0,
    samples:count,
  });
}

export function aggregateStyleEmbeddings(embeddings){
  if(!Array.isArray(embeddings)||!embeddings.length)throw new TypeError('Style embeddings required');
  const normalized=embeddings.map(value=>normalizeQueryEmbedding(value));
  const dim=normalized[0].length,out=new Float32Array(dim);
  for(const item of normalized){
    if(item.length!==dim)throw new RangeError('Style embedding dimensions disagree');
    for(let i=0;i<dim;i++)out[i]+=item[i];
  }
  const mean=normalizeQueryEmbedding(out,dim);
  let disagreement=0;
  for(const item of normalized){
    let cosine=0;for(let i=0;i<dim;i++)cosine+=item[i]*mean[i];
    disagreement+=1-clamp(cosine,-1,1);
  }
  return Object.freeze({embedding:mean,disagreement:disagreement/normalized.length});
}
