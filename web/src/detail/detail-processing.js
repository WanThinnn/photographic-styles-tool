/**
 * Experimental, pure-pixel SDR detail enhancement.
 * This module NEVER reads or writes HEIF boxes, Styles, depth or Portrait data.
 * Pass a detached/copy ImageData-style buffer; returned bytes never alias the input.
 */
export const DETAIL_PRESETS = Object.freeze({
  natural: Object.freeze({amount:0.45, threshold:3.0, maxDelta:10}),
  balanced: Object.freeze({amount:0.85, threshold:2.5, maxDelta:17}),
  crisp: Object.freeze({amount:1.25, threshold:2.0, maxDelta:23}),
});
const clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const smooth = (x)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};

/**
 * Sharpen perceived luminance without creating separate RGB channel halos.
 * Expects 8-bit SDR RGBA in display-encoded sRGB space (NOT HDR/linear/P3).
 * @param {{data:Uint8Array|Uint8ClampedArray,width:number,height:number}} image
 * @param {{preset?:'natural'|'balanced'|'crisp',strength?:number,signal?:AbortSignal}} options
 * @returns {{data:Uint8ClampedArray,width:number,height:number}}
 */
export function enhanceDetail(image,{preset='balanced',strength=50,signal}={}){
  const {data,width,height}=image||{};
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
     !data||data.length!==width*height*4||width*height>32_000_000)
    throw new RangeError('Invalid or oversized SDR RGBA image');
  if(!Object.hasOwn(DETAIL_PRESETS,preset))throw new RangeError('Unknown detail preset');
  if(!Number.isFinite(strength)||strength<0||strength>100)throw new RangeError('Strength must be 0..100');
  if(signal?.aborted)throw new Error('Detail enhancement cancelled');
  const output=new Uint8ClampedArray(data),n=width*height;
  if(strength===0||width<3||height<3)return {data:output,width,height};
  const conf=DETAIL_PRESETS[preset];
  const luma=new Float32Array(n),horizontal=new Float32Array(n);
  for(let p=0;p<n;p++){
    const i=p*4;
    luma[p]=0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2];
  }
  // 1-2-1 separable Gaussian, clamped boundaries.
  for(let y=0;y<height;y++){
    if(signal?.aborted)throw new Error('Detail enhancement cancelled');
    const row=y*width;
    for(let x=0;x<width;x++){
      const p=row+x;
      horizontal[p]=(luma[row+Math.max(0,x-1)]+2*luma[p]+luma[row+Math.min(width-1,x+1)])/4;
    }
  }
  const amount=conf.amount*strength/50;
  for(let y=0;y<height;y++){
    if(signal?.aborted)throw new Error('Detail enhancement cancelled');
    for(let x=0;x<width;x++){
      const p=y*width,i=p*4;
      if(data[i+3]===0)continue;
      const base=(horizontal[Math.max(0,y-1)*width+x]+2*horizontal[p]+horizontal[Math.min(height-1,y+1)*width+x])/4;
      const detail=luma[p]-base,abs=Math.abs(detail);
      const gate=smooth((abs-conf.threshold)/(conf.threshold*3));
      // Suppress amplification near encoded-black/white where clipping makes halos conspicuous.
      const headroom=smooth(Math.min(luma[p],255-luma[p])/24);
      const delta=clamp(detail*amount*gate*headroom,-conf.maxDelta,conf.maxDelta);
      for(let c=0;c<3;c++)output[i+c]=clamp(data[i+c]+delta,0,255);
    }
  }
  return {data:output,width,height};
}
