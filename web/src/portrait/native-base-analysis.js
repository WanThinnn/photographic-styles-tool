// Conservative image evidence, not an undocumented Portrait toggle. Sparse or
// naturally soft backgrounds stay unknown; sharp texture must occur at several
// separated locations behind the subject. This cannot prove Photos edit history.
import {box,concat,be} from '../core/box.js';
import {discoverHeic,extractItem,dimensionsForItem,propertyBoxBytes,auxUriForItem,
  DEPTH_URI,irotAngleForItem,imirAxisForItem} from '../core/heif.js';
import {decodeToRgb,loadLibheif} from '../media/decode.js';
import {releaseLibheif} from '../codecs/libheif-lifecycle.js';

export function sharpBackgroundEvidence(rgb,width,height,depth,dw,dh){
  if(!(rgb instanceof Uint8Array)||rgb.length!==width*height*3
    ||!(depth instanceof Uint8Array)||depth.length!==dw*dh
    ||Math.min(width,height)<256||Math.min(dw,dh)<64)return null;
  const luma=new Float32Array(width*height);
  for(let i=0;i<luma.length;i++)luma[i]=.2126*rgb[i*3]+.7152*rgb[i*3+1]+.0722*rgb[i*3+2];
  const tiles=[];
  for(let ty=0;ty<8;ty++)for(let tx=0;tx<6;tx++){
    let sharp=0,gradient=0,disparity=0,strong=0,n=0;
    for(let y=Math.ceil(ty*height/8)+2;y<Math.floor((ty+1)*height/8)-2;y++)
      for(let x=Math.ceil(tx*width/6)+2;x<Math.floor((tx+1)*width/6)-2;x++){
        const i=y*width+x,lap=Math.abs(4*luma[i]-luma[i-1]-luma[i+1]-luma[i-width]-luma[i+width]);
        sharp+=lap;gradient+=Math.abs(luma[i+1]-luma[i-1])+Math.abs(luma[i+width]-luma[i-width]);
        if(lap>12)strong++;
        disparity+=depth[Math.floor(y/height*dh)*dw+Math.floor(x/width*dw)];n++;
      }
    tiles.push({x:tx,y:ty,disparity:disparity/n,sharp:sharp/n,ratio:gradient?sharp/gradient:0,strong:strong/n});
  }
  const ordered=tiles.map(t=>t.disparity).sort((a,b)=>a-b),near=ordered[36];
  if(!Number.isFinite(near)||near-ordered[12]<30)return null;
  const far=tiles.filter(t=>t.disparity>2&&t.disparity<=near*.75);
  // Reject isolated edges, foreground texture, sensor noise and sharpened halos.
  const detailed=far.filter(t=>t.sharp>=7&&t.strong>=.15&&t.ratio>=.35&&t.ratio<=.85);
  if(detailed.length<3||new Set(detailed.map(t=>t.x)).size<2||new Set(detailed.map(t=>t.y)).size<2
    ||Math.max(...detailed.map(t=>t.y))-Math.min(...detailed.map(t=>t.y))<3)return null;
  return {method:'native-background-detail-v1',farTiles:far.length,detailedTiles:detailed.length};
}

function isolatedItem(data,d,id){
  const full=new Uint8Array(4),ascii=s=>new TextEncoder().encode(s);
  const props=['ispe','pixi','hvcC','colr'].map(t=>propertyBoxBytes(data,d.props,id,t)).filter(Boolean);
  const iprp=box('iprp',concat([box('ipco',concat(props)),box('ipma',concat([
    full,be(1,4),be(1,2),Uint8Array.of(props.length),Uint8Array.from(props,(_,i)=>i+1)]))]));
  const payload=extractItem(data,d.iloc,id),ftyp=box('ftyp',ascii('heic\0\0\0\0mif1heic'));
  const meta=offset=>box('meta',concat([full,
    box('hdlr',concat([full,be(0,4),ascii('pict'),new Uint8Array(13)])),box('pitm',concat([full,be(1,2)])),
    box('iinf',concat([full,be(1,2),box('infe',concat([Uint8Array.of(2,0,0,0),be(1,2),be(0,2),ascii('hvc1\0')]))])),
    iprp,box('iloc',concat([Uint8Array.of(1,0,0,0,0x44,0),be(1,2),be(1,2),be(0,2),be(0,2),
      be(1,2),be(offset,4),be(payload.length,4)]))]));
  return concat([ftyp,meta(ftyp.length+meta(0).length+8),box('mdat',payload)]);
}

export async function analyzeNativePortraitBase(data,d=discoverHeic(data)){
  const ids=[...d.infos.keys()].filter(id=>auxUriForItem(d.props,id)===DEPTH_URI);
  if(ids.length!==1)return null;
  const id=ids[0],[dw,dh]=dimensionsForItem(d.props,id),[w,h]=dimensionsForItem(d.props,d.primary);
  const sides=d.refs.filter(r=>r.type==='cdsc'&&r.to.includes(id)&&d.infos.get(r.from)?.type==='mime');
  if(sides.length!==1)return null;
  const xml=new DOMParser().parseFromString(new TextDecoder().decode(extractItem(data,d.iloc,sides[0].from)),'application/xml');
  const value=name=>{const nodes=xml.getElementsByTagNameNS('http://ns.apple.com/pixeldatainfo/1.0/',name);
    return nodes.length===1?nodes[0].textContent.trim():null;};
  const min=Number(value('FloatMinValue')),max=Number(value('FloatMaxValue'));
  if(xml.getElementsByTagName('parsererror').length||value('AuxiliaryImageType')!=='disparity'
    ||value('NativeFormat')!=='1751411059'||value('StoredFormat')!=='1278226488'
    ||value('IntMinValue')!=='0'||value('IntMaxValue')!=='255'
    ||value('FloatMinValue')===null||value('FloatMaxValue')===null||!Number.isFinite(min)||!Number.isFinite(max)||!(max>min))return null;
  const pixi=propertyBoxBytes(data,d.props,id,'pixi');
  if(d.infos.get(id)?.type!=='hvc1'||pixi?.[12]!==1||pixi?.[13]!==8||dw*dh>2048*2048
    ||Math.abs(dw/dh-w/h)>.01)return null;
  for(const read of [irotAngleForItem,imirAxisForItem])if(read(data,d.props,id)!==read(data,d.props,d.primary))return null;
  // Never treat an upscaled low-resolution embedded thumbnail as detail evidence.
  if(d.thumbnail!==null&&Math.max(...dimensionsForItem(d.props,d.thumbnail))<1024)return null;
  const scale=Math.min(1,1024/Math.max(w,h)),width=Math.round(w*scale),height=Math.round(h*scale);
  const rgb=await decodeToRgb(data,{width,height,angle:irotAngleForItem(data,d.props,d.primary),mirror:imirAxisForItem(data,d.props,d.primary)});
  const lib=await loadLibheif(),decoder=new lib.HeifDecoder();let images;
  try{
    images=decoder.decode(isolatedItem(data,d,id));const image=images?.[0];
    if(!image||image.get_width()!==dw||image.get_height()!==dh)return null;
    const rgba=new ImageData(dw,dh);
    await new Promise((resolve,reject)=>image.display(rgba,out=>out?resolve():reject(Error('Native depth display failed'))));
    const depth=new Uint8Array(dw*dh);for(let i=0;i<depth.length;i++)depth[i]=rgba.data[i*4];
    return sharpBackgroundEvidence(rgb,width,height,depth,dw,dh);
  }finally{releaseLibheif(lib,decoder,images);}
}
