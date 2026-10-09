// Private format-declaration experiment, not a production Portrait writer.
// heix / MiPr are observed in the accepted native file. Their addition is a
// controlled hypothesis, not proof of conformance or Photos eligibility.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {topBox,box,concat,be} from '../web/src/box.js';
import {discoverHeic,extractItemData,auxUriForItem,DEPTH_URI,dimensionsForItem} from '../web/src/raster/heif.js';

const [input,output]=process.argv.slice(2);
assert.ok(input&&output,'Pass V5 JPEG B and a new output directory');
assert.ok(!fs.existsSync(output),'Never overwrite a tested batch');
const source=new Uint8Array(fs.readFileSync(input)),d=discoverHeic(source);
const ftyp=topBox(source,'ftyp');
assert.equal(ftyp.off,0);assert.equal(ftyp.hdr,8);
assert.ok(ftyp.size<=d.meta.off);
assert.equal(d.iloc.version,1);assert.equal(d.iloc.offsetSize,4);
assert.equal(d.iloc.lengthSize,4);assert.equal(d.iloc.baseOffsetSize,0);assert.equal(d.iloc.indexSize,0);
const decoder=new TextDecoder(),encoder=new TextEncoder();
const brands=data=>{
  const f=topBox(data,'ftyp'),result=[];
  for(let i=f.off+f.hdr+8;i<f.off+f.size;i+=4)result.push(decoder.decode(data.subarray(i,i+4)));
  return result;
};
assert.deepEqual(brands(source),['mif1','heic']);
const depth=[...d.infos.keys()].find(id=>auxUriForItem(d.props,id)===DEPTH_URI);
assert.ok(depth!==undefined,'The source must already contain AI depth');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const specs=[['A_JPEG_AddHeix',['heix']],['B_JPEG_AddMiPr',['MiPr']],['C_JPEG_AddBoth',['heix','MiPr']]];
const results=[];
for(const [name,extra] of specs) {
  const newFtyp=box('ftyp',concat([source.subarray(ftyp.hdr,ftyp.size),encoder.encode(extra.join(''))]));
  const delta=newFtyp.length-ftyp.size;
  const out=concat([newFtyp,source.subarray(ftyp.size)]);
  for(const item of d.iloc.items.values()) {
    assert.ok([0,1].includes(item.constructionMethod));
    if(item.constructionMethod!==0)continue;
    for(const extent of item.extents) {
      assert.ok(extent.offset>=ftyp.size&&extent.offset+extent.length<=source.length);
      assert.ok(extent.offset+delta<2**32);
      out.set(be(extent.offset+delta,4),extent.offsetPos+delta);
    }
  }
  const check=discoverHeic(out);
  assert.equal(check.primary,d.primary);
  assert.deepEqual(check.infos,d.infos);assert.deepEqual(check.refs,d.refs);
  assert.deepEqual(brands(out),[...brands(source),...extra]);
  // Independent byte comparison: after undoing the required iloc shifts,
  // every byte beyond the new ftyp must equal the original file tail.
  const restored=out.slice(newFtyp.length);
  for(const item of d.iloc.items.values())if(item.constructionMethod===0) {
    for(const extent of item.extents)restored.set(be(extent.offset,4),extent.offsetPos-ftyp.size);
  }
  assert.deepEqual(restored,source.subarray(ftyp.size));
  let payloadsChecked=0;
  for(const id of d.infos.keys()) {
    assert.deepEqual(extractItemData(out,check,id),extractItemData(source,d,id),`Item ${id}`);
    payloadsChecked++;
  }
  assert.deepEqual(check.props.associations,d.props.associations);
  assert.equal(check.props.properties.length,d.props.properties.length);
  for(let i=0;i<d.props.properties.length;i++) {
    const a=d.props.properties[i].box,b=check.props.properties[i].box;
    assert.deepEqual(out.subarray(b.off,b.off+b.size),source.subarray(a.off,a.off+a.size));
  }
  results.push({name,data:out,report:{file:name+'.HEIC',compatibleBrands:brands(out),addedBrands:extra,
    bytes:out.length,sha256:hash(out),payloadsChecked,depthItem:depth,
    depthDimensions:dimensionsForItem(check.props,depth),depthPayloadSha256:hash(extractItemData(out,check,depth)),
    onlyFtypAndRequiredIlocOffsetsChanged:true,photosPortraitEditing:'pending device test'}});
}
fs.mkdirSync(output,{recursive:true});
for(const result of results)fs.writeFileSync(path.join(output,result.name+'.HEIC'),result.data,{flag:'wx'});
const report={input:path.resolve(input),sourceSha256:hash(source),sourceCompatibleBrands:brands(source),
  explanation:'Private brand isolation; no new inference, calibration, rendering parameters or capture flags.',
  results:results.map(r=>r.report)};
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
