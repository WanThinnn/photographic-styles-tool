import {discoverHeic,dimensionsForItem,propertyBoxBytes,auxUriForItem,MATTE_URIS,itemOrientation} from '../raster/heif.js';
import {isolatedAuxiliaryImage} from '../media/auxiliary-image.js';
import {loadLibheif} from '../media/decode.js';
import {releaseLibheif} from '../codecs/libheif-lifecycle.js';

// Reuse this photo's existing matte, including one already generated for Soft
// Skin. No second segmentation model or arbitrary depth dilation is needed.
export async function readPersonGuidance(data,width,height){
  const d=discoverHeic(data),ids=[...d.infos.keys()].filter(id=>auxUriForItem(d.props,id)===MATTE_URIS.portraiteffectsmatte);
  if(ids.length!==1)return null;
  const id=ids[0],[mw,mh]=dimensionsForItem(d.props,id),[w,h]=dimensionsForItem(d.props,d.primary),pixi=propertyBoxBytes(data,d.props,id,'pixi');
  if(d.infos.get(id)?.type!=='hvc1'||pixi?.[12]!==1||pixi?.[13]!==8||mw*mh>2048*2048||Math.abs(mw/mh-w/h)>.01)return null;
  const a=itemOrientation(data,d.props,id),b=itemOrientation(data,d.props,d.primary);
  if(a.angle!==b.angle||a.mirror!==b.mirror)return null;
  const lib=await loadLibheif(),decoder=new lib.HeifDecoder();let images,full,sample;
  try{
    images=decoder.decode(isolatedAuxiliaryImage(data,d,id));const image=images?.[0];
    if(!image||image.get_width()!==mw||image.get_height()!==mh)return null;
    const rgba=new ImageData(mw,mh);
    await new Promise((resolve,reject)=>image.display(rgba,out=>out?resolve():reject(Error('Person matte decode failed'))));
    full=document.createElement('canvas');full.width=mw;full.height=mh;full.getContext('2d').putImageData(rgba,0,0);
    sample=document.createElement('canvas');sample.width=width;sample.height=height;
    const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(full,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height).data,person=new Uint8Array(width*height);
    for(let i=0;i<person.length;i++)person[i]=pixels[i*4];
    return person;
  }finally{for(const canvas of [full,sample])if(canvas)canvas.width=canvas.height=0;releaseLibheif(lib,decoder,images);}
}

// Protect confidently segmented person pixels near a depth transition. The
// closest confident interior supplies a bounded depth floor, retaining 3D depth
// within the person. Never pull background forward or fill uncertain hair gaps.
export function protectPersonDepth(gray,person,width,height){
  if(![width,height].every(n=>Number.isInteger(n)&&n>0)||gray.length!==width*height||person.length!==gray.length)throw Error('Invalid person depth geometry');
  const out=gray.slice(),radius=Math.max(2,Math.round(Math.max(width,height)/128));
  const offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*width+x;if(person[p]<224)continue;
    // Most person pixels are interior. Reject them using eight distant samples
    // before scanning the narrow boundary band at full depth resolution.
    if(!offsets.some(([dx,dy])=>{
      const ax=x+dx*radius,ay=y+dy*radius;
      return ax>=0&&ax<width&&ay>=0&&ay<height&&person[ay*width+ax]<32;
    }))continue;
    let interior=null,far=255;
    for(let r=1;r<=radius;r++){
      for(const [dx,dy]of offsets){
        const ax=x+dx*r,ay=y+dy*r;if(ax<0||ax>=width||ay<0||ay>=height)continue;
        const i=ay*width+ax;
        if(person[i]<32)far=Math.min(far,gray[i]);
        // Nearest interior only: farther objects/people cannot overwrite it.
        if(interior===null&&person[i]>=250)interior=gray[i];
      }
    }
    if(interior!==null&&interior-far>=32&&gray[p]<interior-8)
      out[p]=Math.min(gray[p]+32,interior-8);
  }
  return out;
}
