import {STYLE_MODEL_INPUT} from './style-model.js';

function validateImage(image){
  if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1)
    throw new TypeError('Invalid Suggested Styles image');
  const pixels=image.width*image.height;
  const channels=image.data?.length===pixels*4?4:image.data?.length===pixels*3?3:0;
  if(!channels)throw new TypeError('Suggested Styles expects packed RGB or RGBA pixels');
  return channels;
}
function sample(data,width,height,channels,x,y,c){
  const xx=Math.max(0,Math.min(width-1,x)),yy=Math.max(0,Math.min(height-1,y));
  const x0=Math.floor(xx),y0=Math.floor(yy);
  const x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=xx-x0,fy=yy-y0;
  const p=(px,py)=>data[(py*width+px)*channels+c];
  const a=p(x0,y0)*(1-fx)+p(x1,y0)*fx,b=p(x0,y1)*(1-fx)+p(x1,y1)*fx;
  return a*(1-fy)+b*fy;
}
export function preprocessClipView(image,rect,{size=STYLE_MODEL_INPUT.size}={}){
  const channels=validateImage(image);
  if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)
    throw new TypeError('Invalid Suggested Styles view');
  const x0=Math.max(0,rect.x),y0=Math.max(0,rect.y),rw=Math.min(image.width-x0,rect.width),rh=Math.min(image.height-y0,rect.height);
  if(rw<=0||rh<=0)throw new RangeError('Suggested Styles view lies outside the image');
  const side=Math.min(rw,rh),left=x0+(rw-side)/2,top=y0+(rh-side)/2;
  const plane=size*size,tensor=new Float32Array(plane*3);
  for(let oy=0;oy<size;oy++)for(let ox=0;ox<size;ox++){
    const sx=left+(ox+.5)*side/size-.5,sy=top+(oy+.5)*side/size-.5,q=oy*size+ox;
    for(let c=0;c<3;c++){
      const value=sample(image.data,image.width,image.height,channels,sx,sy,c)/255;
      tensor[c*plane+q]=(value-STYLE_MODEL_INPUT.mean[c])/STYLE_MODEL_INPUT.std[c];
    }
  }
  return tensor;
}
