// Private HDR/SDR isolation after V20 A/B/C darken in Edit but source JPEG does not.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boxes,topBox,metaChildren,box,concat,be,u} from '../web/src/box.js';
import {discoverHeic,extractItemData,propertyBoxBytes,removeItems,parseIloc,auxUriForItem,
  URI_HDR_GAIN,DEPTH_URI} from '../web/src/raster/heif.js';
import {getMakerNoteBlob} from '../web/src/exif.js';

const [sourcePath,directory]=process.argv.slice(2);
assert.ok(directory&&!fs.existsSync(directory),'Pass V20 A and a fresh directory');
const source=new Uint8Array(fs.readFileSync(sourcePath)),d=discoverHeic(source);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(source),'3924d1f66e00231f767fe4ff81186b2e4a6443fe3a8c573c637fb3077e41c515');
assert.ok(![...d.infos.keys()].some(id=>auxUriForItem(d.props,id)===DEPTH_URI));
const tmap=[...d.infos].find(([,i])=>i.type==='tmap')[0];
const gainTiles=d.refs.find(r=>r.type==='dimg'&&r.from===d.hdrGrid).to;
const gainSide=d.refs.find(r=>r.type==='cdsc'&&r.to.includes(d.hdrGrid)).from;
const hdrIds=[d.hdrGrid,...gainTiles,tmap,gainSide];
const baseIds=[d.primary,...d.primaryTiles,d.thumbnail,d.exifItem];

// Remove the whole synthetic Apple MakerNote IFD entry, not just its Styles tag.
// Leave the TIFF data area in place so other entry offsets remain valid.
const exif=extractItemData(source,d,d.exifItem).slice(),start=u(exif,0,4)+4,tiff=exif.subarray(start);
const little=String.fromCharCode(tiff[0],tiff[1])==='II',view=new DataView(tiff.buffer,tiff.byteOffset,tiff.byteLength);
const first=view.getUint32(4,little),firstCount=view.getUint16(first,little);
let exifIfd;
for(let i=0;i<firstCount;i++){const p=first+2+i*12;if(view.getUint16(p,little)===0x8769)exifIfd=view.getUint32(p+8,little);}
assert.ok(exifIfd!==undefined);
const count=view.getUint16(exifIfd,little),entries=[];
for(let i=0;i<count;i++){const p=exifIfd+2+i*12;if(view.getUint16(p,little)!==0x927c)entries.push(tiff.slice(p,p+12));}
assert.equal(entries.length,count-1);
const next=tiff.slice(exifIfd+2+count*12,exifIfd+6+count*12);
view.setUint16(exifIfd,entries.length,little);entries.forEach((e,i)=>tiff.set(e,exifIfd+2+i*12));
tiff.set(next,exifIfd+2+entries.length*12);tiff.fill(0,exifIfd+6+entries.length*12,exifIfd+6+count*12);
assert.throws(()=>getMakerNoteBlob(exif),/Apple MakerNote tag 0x927c not found/);

function pruneGroups(meta,keep){
  const m=topBox(meta,'meta');
  const children=metaChildren(meta,m).flatMap(child=>{
    if(child.type!=='grpl')return [meta.slice(child.off,child.off+child.size)];
    const groups=[];
    for(const g of boxes(meta,child.off+child.hdr,child.off+child.size)){
      assert.equal(g.type,'altr');const p=g.off+g.hdr;
      const count=u(meta,p+8,4),ids=Array.from({length:count},(_,i)=>u(meta,p+12+4*i,4));
      const survivors=ids.filter(id=>keep.has(id));
      // An alternative group has no function with fewer than two renditions.
      if(survivors.length>1)groups.push(box('altr',concat([meta.slice(p,p+8),be(survivors.length,4),...survivors.map(id=>be(id,4))])));
    }
    return groups.length?[box('grpl',concat(groups))]:[];
  });
  return box('meta',concat([meta.slice(m.off+m.hdr,m.off+m.hdr+4),...children]));
}
function assemble(keep){
  const removed=new Set([...d.infos.keys()].filter(id=>!keep.has(id)));
  const meta=pruneGroups(removeItems(source.slice(d.meta.off,d.meta.off+d.meta.size),removed),keep);
  const kept=[...boxes(source,0,source.length)].filter(b=>b.type!=='mdat')
    .map(b=>b.type==='meta'?meta:source.slice(b.off,b.off+b.size));
  const iloc=parseIloc(meta,topBox(meta,'meta'));let cursor=kept.reduce((n,b)=>n+b.length,0)+8;const chunks=[];
  for(const [id,item] of iloc.items){
    if(item.constructionMethod===1)continue;assert.equal(item.constructionMethod,0);assert.equal(item.baseOffset,0);
    for(const [i,extent] of item.extents.entries()){
      const old=d.iloc.items.get(id).extents[i],p=id===d.exifItem?exif:source.slice(old.offset,old.offset+old.length);
      if(id===d.exifItem)assert.equal(item.extents.length,1);
      meta.set(be(cursor,iloc.offsetSize),extent.offsetPos);meta.set(be(p.length,iloc.lengthSize),extent.lengthPos);
      chunks.push(p);cursor+=p.length;
    }
  }
  const data=concat([...kept,box('mdat',concat(chunks))]),after=discoverHeic(data);
  assert.deepEqual(new Set(after.infos.keys()),keep);assert.equal(after.stylesItem,null);assert.equal(after.deltaGrid,null);
  assert.equal(after.linearThumb,null);
  for(const id of keep){
    assert.deepEqual(extractItemData(data,after,id),id===d.exifItem?exif:extractItemData(source,d,id));
    for(const a of d.props.associations.get(id)||[]){
      const type=d.props.properties[a.index-1].type;
      assert.deepEqual(propertyBoxBytes(data,after.props,id,type),propertyBoxBytes(source,d.props,id,type));
    }
  }
  assert.ok(after.refs.every(r=>keep.has(r.from)&&r.to.every(id=>keep.has(id))));
  return {data,removed:[...removed],kept:[...keep]};
}
const b=assemble(new Set([...baseIds,...hdrIds])),c=assemble(new Set(baseIds));
assert.equal(discoverHeic(b.data).hdrGrid,d.hdrGrid);assert.equal(discoverHeic(c.data).hdrGrid,null);
const variants=[{file:'A_V20_Control_AllFeatures_NoAIDepth.HEIC',data:source,kept:[...d.infos.keys()],removed:[]},
  {file:'B_HDR_ImageOnly.HEIC',...b},{file:'C_SDR_Base_ImageOnly.HEIC',...c}];
fs.mkdirSync(directory,{recursive:true});
for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
const report={source:path.resolve(sourcePath),sourceSha256:hash(source),diagnosticOnly:true,productionChanged:false,
  originalJpeg:'C:/Users/WanThinnn/Downloads/IDG_20251020_121945_809.JPEG',primary:d.primary,primaryIds:d.primaryTiles,
  exifItem:d.exifItem,thumbnail:d.thumbnail,hdrIds,hdrGrid:d.hdrGrid,tmap,
  note:'No colour fitting/re-encoding/AI. B removes all Styles/Texture/linear thumbnail/human resources and the synthetic MakerNote. C additionally removes only HDR and its alternative group. C is an SDR diagnostic, not an HDR-preserving fix. Main and ordinary thumbnail remain exact.',
  variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:hash(v.data),kept:v.kept,removed:v.removed}))};
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
