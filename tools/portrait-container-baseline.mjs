// Private on-device diagnostics. No new depth or Portrait eligibility is fabricated.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boxes, topBox, box, concat, be} from '../web/src/box.js';
import {discoverHeic, extractItem, idatItemBytes, parseIloc, auxUriForItem,
  DEPTH_URI, dimensionsForItem} from '../web/src/heif.js';
import {addTexture} from '../web/src/texture.js';

const [input, directory] = process.argv.slice(2);
assert.ok(input && directory, 'Pass source HEIC and a new private output directory');
assert.ok(!fs.existsSync(directory), 'Use a new directory; previous batches are immutable');
const source = new Uint8Array(fs.readFileSync(input));
const original = discoverHeic(source);
assert.ok([...original.infos.keys()].some(id => auxUriForItem(original.props,id)===DEPTH_URI),
  'Source must contain its own depth');
assert.equal(original.iloc.baseOffsetSize,0);
assert.ok(original.iloc.offsetSize>0 && original.iloc.lengthSize>0);

function repack() {
  // Preserve every non-mdat box, including embedded idat. Only external extent offsets move.
  const top = [...boxes(source,0,source.length)];
  assert.equal(top.at(-1).off+top.at(-1).size,source.length);
  const kept = top.filter(b=>b.type!=='mdat').map(b=>source.slice(b.off,b.off+b.size));
  const metadataIndex = top.filter(b=>b.type!=='mdat').findIndex(b=>b.type==='meta');
  const meta = kept[metadataIndex];
  const iloc = parseIloc(meta,topBox(meta,'meta'));
  let cursor = kept.reduce((n,b)=>n+b.length,0)+8;
  const chunks=[];
  // Reverse external item order so this actually exercises offset rewriting.
  for(const [id,item] of [...iloc.items].reverse()) {
    assert.ok(item.constructionMethod===0 || item.constructionMethod===1);
    if(item.constructionMethod!==0)continue;
    const old=original.iloc.items.get(id);
    assert.equal(old.baseOffset,0);
    for(let i=0;i<item.extents.length;i++) {
      const extent=old.extents[i];
      assert.ok(extent.offset+extent.length<=source.length);
      const data=source.slice(extent.offset,extent.offset+extent.length);
      assert.ok(cursor<2**(8*iloc.offsetSize));
      meta.set(be(cursor,iloc.offsetSize),item.extents[i].offsetPos);
      chunks.push(data);cursor+=data.length;
    }
  }
  assert.ok(cursor<2**32);
  return concat([...kept,box('mdat',concat(chunks))]);
}

function payload(data,d,id) {
  const item=d.iloc.items.get(id);
  return item.constructionMethod===0 ? extractItem(data,d.iloc,id) : idatItemBytes(data,id,d.meta);
}
function validate(data,{texture=false,toneCurveAdded=false}={}) {
  const d=discoverHeic(data);
  let preserved=0;
  for(const [id] of original.iloc.items) {
    if(toneCurveAdded && id===original.stylesItem)continue;
    assert.deepEqual(payload(data,d,id),payload(source,original,id),`Source payload ${id} changed`);
    preserved++;
  }
  for(const ref of original.refs)assert.ok(d.refs.some(r=>
    r.type===ref.type && r.from===ref.from && JSON.stringify(r.to)===JSON.stringify(ref.to)),
    'Original reference missing');
  for(const prop of original.props.properties) {
    const after=d.props.properties[prop.index-1];
    assert.deepEqual(data.slice(after.box.off,after.box.off+after.box.size),
      source.slice(prop.box.off,prop.box.off+prop.box.size),'Original property changed');
  }
  for(const [id,associations] of original.props.associations)
    assert.deepEqual(d.props.associations.get(id),associations,'Original property association changed');
  for(const [id,info] of original.infos)assert.deepEqual(d.infos.get(id),info);
  if(!texture)assert.deepEqual(d.refs,original.refs);
  return {bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),
    preservedSourcePayloads:preserved,depthDimensions:dimensionsForItem(d.props,
      [...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI)),
    nativeStyles:d.stylesItem!==null,hdr:d.hdrGrid!==null,
    photosApertureControl:'Requires independent reimport and physical iPhone test'};
}
const b=repack();
assert.notDeepEqual(b,source,'Repacking did not change container bytes');
const variants=[['A_Original',source,{}],['B_Repacked_OriginalDepth',b,{}]];
if(original.stylesItem!==null) {
  const c=addTexture(source);
  variants.push(['C_NativeStyles_Texture',c.data,{texture:true,toneCurveAdded:c.report.toneCurveAdded}]);
}
// Finish all assertions before creating the batch.
const stem=path.parse(input).name.replace(/[^a-zA-Z0-9_-]/g,'_');
const report=variants.map(([name,data,options])=>({file:`${stem}_${name}.HEIC`,...validate(data,options)}));
fs.mkdirSync(directory,{recursive:true});
for(let i=0;i<variants.length;i++)fs.writeFileSync(path.join(directory,report[i].file),variants[i][1],{flag:'wx'});
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({source:input,variants:report},null,2),{flag:'wx'});
console.log(JSON.stringify({directory,variants:report},null,2));
