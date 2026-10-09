import {discoverHeic,auxUriForItem,URI_HDR_GAIN,appendIpcoProperty,auxcBox,setItemPropertyAssociations,setItemReference} from '../raster/heif.js';
import {topBox} from '../core/box.js';
import {rebuildHeic} from './graft.js';
import {styleCapabilities} from './style-capabilities.js';

// Photos' Styles/Portrait editor needs the legacy auxiliary role even when the
// original ISO tmap can already display HDR. V4 D/E validated this additive fix.
export function registerTmapHdr(data){
  const d=discoverHeic(data);
  if(d.hdrGrid===null||auxUriForItem(d.props,d.hdrGrid)===URI_HDR_GAIN)return null;
  // Do not replace any other declared auxiliary role.
  if(auxUriForItem(d.props,d.hdrGrid))return null;
  if(!styleCapabilities(data).editable)return null;
  let meta=data.slice(d.meta.off,d.meta.off+d.meta.size),index;
  [meta,index]=appendIpcoProperty(meta,auxcBox(URI_HDR_GAIN));
  const associations=(d.props.associations.get(d.hdrGrid)||[]).map(a=>[a.index,a.essential]);
  meta=setItemPropertyAssociations(meta,d.hdrGrid,[...associations,[index,true]]);
  const previous=d.refs.find(r=>r.type==='auxl'&&r.from===d.hdrGrid)?.to||[];
  meta=setItemReference(meta,'auxl',d.hdrGrid,[...new Set([...previous,d.primary])]);
  const ft=topBox(data,'ftyp');
  return rebuildHeic(data,d,data.slice(ft.off,ft.off+ft.size),meta,new Map());
}
