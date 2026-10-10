import {discoverHeic,extractItemData,auxUriForItem,URI_HDR_GAIN,appendIpcoProperty,auxcBox,setItemPropertyAssociations,setItemReference,addItems} from '../raster/heif.js';
import {topBox} from '../core/box.js';
import {rebuildHeic} from './graft.js';

// Photos' Styles/Portrait editor needs the legacy auxiliary role even when the
// original ISO tmap can already display HDR. V4 D/E validated this additive fix.
// The tested edited Bright exports use this single-channel ISO contract. Do not
// reinterpret RGB gain maps, future versions, offsets or gamma as this format.
export function editableTmapHeadroom(data,d=discoverHeic(data)){
  if(d.hdrGrid===null)return null;
  const maps=[...d.infos].filter(([,info])=>info.type==='tmap');
  if(maps.length!==1)return null;
  const [id]=maps[0],inputs=d.refs.find(r=>r.type==='dimg'&&r.from===id)?.to;
  if(inputs?.length!==2||inputs[0]!==d.primary||inputs[1]!==d.hdrGrid)return null;
  const bytes=extractItemData(data,d,id);
  if(bytes.length!==62)return null;
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  if(bytes[0]!==0||v.getUint16(1)!==0||v.getUint16(3)!==0||bytes[5]!==0)return null;
  let p=6;
  const rational=(signed=false)=>{
    const n=signed?v.getInt32(p):v.getUint32(p),den=v.getUint32(p+4);p+=8;
    return den?n/den:NaN;
  };
  const base=rational(),alternate=rational(),min=rational(true),max=rational(true),
    gamma=rational(),baseOffset=rational(true),alternateOffset=rational(true);
  if(base!==0||!Number.isFinite(alternate)||alternate<=0||alternate>16
    ||min!==0||max!==alternate||gamma!==1||!Number.isFinite(baseOffset)
    ||baseOffset<0||baseOffset>1||baseOffset!==alternateOffset)return null;
  return 2**alternate;
}

export function registerTmapHdr(data,{headroom=false}={}){
  const d=discoverHeic(data);
  if(d.hdrGrid===null)return null;
  const role=auxUriForItem(d.props,d.hdrGrid);
  // Do not replace any other declared auxiliary role.
  if(role&&role!==URI_HDR_GAIN)return null;
  // The unambiguous ISO tmap relation already identifies this source gain map.
  // Native edited exports can omit Styles while retaining it; requiring Styles
  // here silently skips HDR registration precisely for those exported copies.
  let meta=data.slice(d.meta.off,d.meta.off+d.meta.size),index,changed=false;
  const payloads=new Map();
  if(!role){
    [meta,index]=appendIpcoProperty(meta,auxcBox(URI_HDR_GAIN));
    const associations=(d.props.associations.get(d.hdrGrid)||[]).map(a=>[a.index,a.essential]);
    meta=setItemPropertyAssociations(meta,d.hdrGrid,[...associations,[index,true]]);
    const previous=d.refs.find(r=>r.type==='auxl'&&r.from===d.hdrGrid)?.to||[];
    meta=setItemReference(meta,'auxl',d.hdrGrid,[...new Set([...previous,d.primary])]);
    changed=true;
  }
  if(headroom){
    const own=editableTmapHeadroom(data,d);
    // Existing HDR metadata owns the rendering contract, even if incomplete.
    const described=d.refs.filter(r=>r.type==='cdsc'&&r.to.includes(d.hdrGrid));
    const existing=described.some(r=>d.infos.get(r.from)?.type==='mime'
      &&new TextDecoder().decode(extractItemData(data,d,r.from)).includes('http://ns.apple.com/HDRGainMap/1.0/'));
    if(own!==null&&!existing){
      let ids;
      [meta,ids]=addItems(meta,[{key:'hdr-headroom',itemType:'mime',contentType:'application/rdf+xml',refType:'cdsc',refTo:[d.hdrGrid]}]);
      payloads.set(ids.get('hdr-headroom'),new TextEncoder().encode(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:HDRGainMap="http://ns.apple.com/HDRGainMap/1.0/"><HDRGainMap:HDRGainMapVersion>131072</HDRGainMap:HDRGainMapVersion><HDRGainMap:HDRGainMapHeadroom>${own.toFixed(9)}</HDRGainMap:HDRGainMapHeadroom></rdf:Description></rdf:RDF></x:xmpmeta>`));
      changed=true;
    }
  }
  if(!changed)return null;
  const ft=topBox(data,'ftyp');
  return rebuildHeic(data,d,data.slice(ft.off,ft.off+ft.size),meta,payloads);
}
