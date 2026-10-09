import fs from 'node:fs';
import {discoverHeic,auxUriForItem,dimensionsForItem,URI_HDR_GAIN} from '../web/src/raster/heif.js';
for(const file of process.argv.slice(2)) {
  const bytes=new Uint8Array(fs.readFileSync(file)),d=discoverHeic(bytes);
  const hdr=new Set([...d.infos].filter(([id,info])=>info.type==='tmap'||auxUriForItem(d.props,id)===URI_HDR_GAIN).map(([id])=>id));
  const members=new Set(hdr);
  for(const r of d.refs)if(r.type==='dimg'&&hdr.has(r.from))for(const id of r.to)members.add(id);
  console.log(JSON.stringify({file,primary:d.primary,
    hdrItems:[...members].map(id=>({id,info:d.infos.get(id),uri:auxUriForItem(d.props,id),dims:dimensionsForItem(d.props,id)})),
    refs:d.refs.filter(r=>members.has(r.from)||r.to.some(id=>members.has(id)))}));
}
