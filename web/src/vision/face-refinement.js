// Geometry and compositing for local skin segmentation. These routines do not
// amplify confidence or change photo pixels; only auxiliary masks are refined.
export function faceCropRect(rect, width, height, padding = 1.65) {
  if (![width,height,padding,rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)
      || width < 1 || height < 1 || rect.width <= 0 || rect.height <= 0 || padding < 1)
    throw Error('Invalid face crop geometry');
  const side = Math.min(width,height,Math.max(4,Math.ceil(Math.max(rect.width*width,rect.height*height)*padding)));
  const x = Math.max(0,Math.min(width-side,Math.round((rect.x+rect.width/2)*width-side/2)));
  const y = Math.max(0,Math.min(height-side,Math.round((rect.y+rect.height/2)*height-side/2)));
  return {x,y,width:side,height:side};
}

function sample(plane, width, height, x, y) {
  x=Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1);
  const fx=x-x0,fy=y-y0;
  return (plane[y0*width+x0]*(1-fx)+plane[y0*width+x1]*fx)*(1-fy)
    +(plane[y1*width+x0]*(1-fx)+plane[y1*width+x1]*fx)*fy;
}

// Return a new plane. Outside the soft face contour the original is exact.
// An unusable crop leaves the global fallback intact rather than clearing skin.
export function blendFaceConfidence(base, detail, gate, width, height, crop, detailWidth, detailHeight) {
  if (base.length!==width*height || gate.length!==base.length || detail.length!==detailWidth*detailHeight
      || ![width,height,detailWidth,detailHeight].every(n=>Number.isInteger(n)&&n>0)
      || ![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite) || crop.width<=0 || crop.height<=0)
    throw Error('Invalid face confidence planes');
  let weight=0,confidence=0;
  const x0=Math.max(0,Math.floor(crop.x)),y0=Math.max(0,Math.floor(crop.y));
  const x1=Math.min(width,Math.ceil(crop.x+crop.width)),y1=Math.min(height,Math.ceil(crop.y+crop.height));
  const each = fn => {
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++) {
      const u=(x+.5-crop.x)/crop.width,v=(y+.5-crop.y)/crop.height,p=y*width+x;
      const feather=Math.max(0,Math.min(1,Math.min(u,v,1-u,1-v)/.1));
      const w=gate[p]/255*feather;
      if(w>0)fn(p,w,sample(detail,detailWidth,detailHeight,u*detailWidth-.5,v*detailHeight-.5));
    }
  };
  each((p,w,value)=>{weight+=w;confidence+=w*value/255;});
  if(weight<4 || confidence/weight<.1) return {plane:base,applied:false,meanConfidence:weight?confidence/weight:0};
  const plane=base.slice();
  each((p,w,value)=>{plane[p]=Math.round(base[p]*(1-w)+value*w);});
  return {plane,applied:true,meanConfidence:confidence/weight};
}

// Local contrast proxy selected after the IMG_0783 D phone test. A symmetric
// residual rejects broad lighting gradients; this is not Apple's calibrated
// SkinSmoothFaceRoughness estimator.
export function skinDetailVariance(luma, alpha, width, height) {
  if(luma.length!==width*height || alpha.length!==luma.length)throw Error('Invalid skin statistics');
  let sum=0,squared=0,count=0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const p=y*width+x;
    if([p,p-1,p+1,p-width,p+width].some(i=>alpha[i]<192))continue;
    const value=luma[p]-(luma[p-1]+luma[p+1]+luma[p-width]+luma[p+width])/4;
    sum+=value;squared+=value*value;count++;
  }
  return count?Math.max(0,squared/count-(sum/count)**2):0;
}
