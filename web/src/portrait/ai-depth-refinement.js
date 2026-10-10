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
  return refineDepthEdges(out,rgb,width,height);
}

// Fast RGB guided filtering. Fit on a bounded grid, then evaluate against the
// full-resolution colour image. Unlike blur/sharpen on depth alone, this can
// align a gradual model boundary with a real colour edge. It cannot recover a
// missed subject or replace semantic segmentation. Called after releasing GPU
// tensors; scratch storage stays bounded even for large source photographs.
// Separable sliding extrema replace a square neighbourhood scan. This keeps
// the exact same local envelope with O(pixels) work instead of O(radius²).
export function depthEnvelope(field,w,h,radius=4){
  const deque=new Int32Array(Math.max(w,h)),temporary=new Float32Array(field.length);
  const filter=(input,output,length,lines,stride,lineStep,isMin)=>{
    for(let line=0;line<lines;line++){
      const start=line*lineStep;let head=0,tail=0,added=-1;
      for(let x=0;x<length;x++){
        const right=Math.min(length-1,x+radius);
        while(added<right){
          const i=++added,value=input[start+i*stride];
          while(tail>head&&(isMin?input[start+deque[tail-1]*stride]>=value:input[start+deque[tail-1]*stride]<=value))tail--;
          deque[tail++]=i;
        }
        while(deque[head]<x-radius)head++;
        output[start+x*stride]=input[start+deque[head]*stride];
      }
    }
  };
  const result=[new Float32Array(field.length),new Float32Array(field.length)];
  for(let i=0;i<2;i++){
    filter(field,temporary,w,h,1,w,i===0);filter(temporary,result[i],h,w,w,1,i===0);
    for(let p=0;p<field.length;p++)result[i][p]*=255;
  }
  return result;
}

export function refineDepthEdges(gray,rgb,width,height){
  if(![width,height].every(n=>Number.isInteger(n)&&n>0)||gray.length!==width*height||rgb.length!==width*height*3)throw Error('Invalid depth edge geometry');
  const scale=Math.min(1,256/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale)),n=w*h;
  const channels=Array.from({length:4},()=>new Float32Array(n));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=Math.min(width-1,Math.floor((x+.5)*width/w)),sy=Math.min(height-1,Math.floor((y+.5)*height/h)),p=sy*width+sx,i=y*w+x;
    for(let c=0;c<3;c++)channels[c][i]=rgb[p*3+c]/255;
    channels[3][i]=gray[p]/255;
  }
  const stride=w+1,integral=new Float64Array(stride*(h+1)),radius=4;
  const mean=field=>{
    integral.fill(0);const out=new Float32Array(n);
    for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=field[y*w+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;}}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const l=Math.max(0,x-radius),r=Math.min(w,x+radius+1),t=Math.max(0,y-radius),b=Math.min(h,y+radius+1);
      out[y*w+x]=(integral[b*stride+r]-integral[t*stride+r]-integral[b*stride+l]+integral[t*stride+l])/((r-l)*(b-t));
    }return out;
  };
  const averages=channels.map(mean),product=new Float32Array(n);
  const covariance=(a,b)=>{for(let i=0;i<n;i++)product[i]=channels[a][i]*channels[b][i];const v=mean(product);for(let i=0;i<n;i++)v[i]-=averages[a][i]*averages[b][i];return v;};
  const rr=covariance(0,0),rg=covariance(0,1),rb=covariance(0,2),gg=covariance(1,1),gb=covariance(1,2),bb=covariance(2,2);
  const rp=covariance(0,3),gp=covariance(1,3),bp=covariance(2,3),coefficients=Array.from({length:4},()=>new Float32Array(n));
  for(let i=0;i<n;i++){
    const a=rr[i]+.0025,b=rg[i],c=rb[i],d=gg[i]+.0025,e=gb[i],f=bb[i]+.0025;
    const xx=d*f-e*e,xy=c*e-b*f,xz=b*e-c*d,yy=a*f-c*c,yz=b*c-a*e,zz=a*d-b*b,det=a*xx+b*xy+c*xz;
    coefficients[0][i]=(xx*rp[i]+xy*gp[i]+xz*bp[i])/det;
    coefficients[1][i]=(xy*rp[i]+yy*gp[i]+yz*bp[i])/det;
    coefficients[2][i]=(xz*rp[i]+yz*gp[i]+zz*bp[i])/det;
    coefficients[3][i]=averages[3][i]-coefficients[0][i]*averages[0][i]-coefficients[1][i]*averages[1][i]-coefficients[2][i]*averages[2][i];
  }
  const smooth=coefficients.map(mean),out=new Uint8Array(gray.length),[minimum,maximum]=depthEnvelope(channels[3],w,h,radius);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=(x+.5)*w/width-.5,sy=(y+.5)*h/height-.5,ix=Math.floor(sx),iy=Math.floor(sy),p=y*width+x;
    let fitted=0,lo=255,hi=0;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
      const ax=Math.max(0,Math.min(w-1,ix+dx)),ay=Math.max(0,Math.min(h-1,iy+dy)),i=ay*w+ax;
      const weight=(dx?sx-ix:1-sx+ix)*(dy?sy-iy:1-sy+iy);
      fitted+=weight*(smooth[3][i]+smooth[0][i]*rgb[p*3]/255+smooth[1][i]*rgb[p*3+1]/255+smooth[2][i]*rgb[p*3+2]/255);
      // Restrict correction to the local depth envelope. A constant-depth
      // surface stays constant even when its texture has strong RGB contrast.
      lo=Math.min(lo,minimum[i]);hi=Math.max(hi,maximum[i]);
    }
    lo=Math.min(lo,gray[p]);hi=Math.max(hi,gray[p]);
    // Refine transitions only; keep shallow gradients inside a surface and
    // cap correction to avoid RGB texture punching deep holes in the subject.
    const corrected=hi-lo<32?gray[p]:.8*fitted*255+.2*gray[p];
    out[p]=Math.round(Math.max(lo,gray[p]-24,Math.min(hi,gray[p]+24,corrected)));
  }
  return out;
}
