import fs from 'node:fs';
import {topBox} from '../web/src/box.js';
import {discoverHeic,propertyBoxBytes} from '../web/src/raster/heif.js';
import {hevcSpsColor} from '../web/src/raster/hevc-color.js';
for(const file of process.argv.slice(2)) {
  const bytes=new Uint8Array(fs.readFileSync(file)),d=discoverHeic(bytes),rows=[];
  for(const id of [d.primary,d.primaryTiles[0],d.thumbnail,d.linearThumb]) {
    if(id==null)continue;
    const properties=(d.props.associations.get(id)||[]).map(a=>d.props.properties[a.index-1]);
    const colors=properties.filter(p=>p.type==='colr').map(p=>{
      const raw=bytes.subarray(p.box.off,p.box.off+p.box.size),b=topBox(raw,'colr');
      const type=new TextDecoder().decode(raw.subarray(b.hdr,b.hdr+4));
      if(type==='nclx') {const v=new DataView(raw.buffer,raw.byteOffset);return {type,
        primaries:v.getUint16(b.hdr+4),transfer:v.getUint16(b.hdr+6),matrix:v.getUint16(b.hdr+8),fullRange:!!(raw[b.hdr+10]&128)};}
      if(type==='prof'||type==='rICC') {
        const icc=raw.subarray(b.hdr+4),v=new DataView(icc.buffer,icc.byteOffset),tags=[];
        for(let i=0;i<v.getUint32(128);i++) {
          const p=132+i*12,name=new TextDecoder().decode(icc.subarray(p,p+4)),off=v.getUint32(p+4),size=v.getUint32(p+8);
          if(!['rTRC','gTRC','bTRC'].includes(name))continue;
          const kind=new TextDecoder().decode(icc.subarray(off,off+4)),fn=kind==='para'?v.getUint16(off+8):null;
          const params=kind==='para'?Array.from({length:(size-12)/4},(_,j)=>v.getInt32(off+12+j*4)/65536):null;
          tags.push({name,off,size,kind,fn,params});
        }
        return {type,bytes:raw.length,trc:tags};
      }
      return {type,bytes:raw.length};
    });
    const codec=propertyBoxBytes(bytes,d.props,id,'hvcC');
    rows.push({id,colors,sps:codec?hevcSpsColor(codec.subarray(topBox(codec,'hvcC').hdr)):null});
  }
  console.log(JSON.stringify({file,rows}));
}
