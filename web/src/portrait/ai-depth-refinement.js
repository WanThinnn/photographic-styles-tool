// Joint bilateral resampling in stored image coordinates. RGB guides existing
// depth boundaries; it cannot invent a surface that the depth model missed.
// Keep float depth until the final Apple-compatible 8-bit auxiliary image.
export function refineDepth(values,mw,mh,rgb,width,height){
  if(values.length!==mw*mh||rgb.length!==width*height*3||![mw,mh,width,height].every(n=>Number.isInteger(n)&&n>0))throw Error('Invalid depth refinement geometry');
  let min=Infinity,max=-Infinity;
  for(const value of values){if(!Number.isFinite(value))throw Error('Invalid AI depth');min=Math.min(min,value);max=Math.max(max,value);}
  if(!(max>min))throw Error('AI returned a flat depth map');
  const out=new Uint8Array(width*height),scale=255/(max-min);
  const anchorRgb=new Uint8Array(mw*mh*3);
  for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
    const p=(Math.min(height-1,Math.floor((y+.5)*height/mh))*width+Math.min(width-1,Math.floor((x+.5)*width/mw)))*3;
    anchorRgb.set(rgb.subarray(p,p+3),(y*mw+x)*3);
  }
  // Precompute colour weights. A conservative range keeps strong real edges
  // without turning texture in a constant-depth surface into false geometry.
  const colourWeights=Float32Array.from({length:195076},(_,d)=>Math.exp(-d/(2*30*30)));
  for(let y=0;y<height;y++){
    const sy=(y+.5)*mh/height-.5,iy=Math.floor(sy);
    for(let x=0;x<width;x++){
      const sx=(x+.5)*mw/width-.5,ix=Math.floor(sx),p=(y*width+x)*3;
      let sum=0,weight=0;
      for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){
        const ax=Math.max(0,Math.min(mw-1,ix+dx)),ay=Math.max(0,Math.min(mh-1,iy+dy)),i=ay*mw+ax,k=i*3;
        const spatial=(dx?sx-ix:1-(sx-ix))*(dy?sy-iy:1-(sy-iy));
        const r=rgb[p]-anchorRgb[k],g=rgb[p+1]-anchorRgb[k+1],b=rgb[p+2]-anchorRgb[k+2];
        // A small bilinear floor avoids unstable extrapolation if none of the
        // four colour anchors resembles a thin strand/highlight at this pixel.
        const a=spatial*(.02+colourWeights[r*r+g*g+b*b]);
        sum+=values[i]*a;weight+=a;
      }
      out[y*width+x]=Math.round(Math.max(0,Math.min(255,(sum/weight-min)*scale)));
    }
  }
  return out;
}
