// Private inherited Styles-data replacement after neutral-delta device acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {discoverHeic,propertyBoxBytes} from '../web/src/heif.js';
import {discoverHeic as inspect,extractItemData} from '../web/src/raster/heif.js';
import {parseBplist,buildBplist} from '../web/src/bplist.js';
import {generatedStyleMetadata} from '../web/src/generated-style-metadata.js';
import {rebuildHeic} from '../web/src/graft.js';
import {topBox} from '../web/src/box.js';

const [sourcePath,directory]=process.argv.slice(2);
assert.ok(directory&&!fs.existsSync(directory),'Pass V18 B and a fresh directory');
const source=new Uint8Array(fs.readFileSync(sourcePath)),d=discoverHeic(source),rd=inspect(source);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(source),'e56bd252a3c4b31761998b7c9eaba4aedca91de939eec6bbd12b1a72ed13ef70');
const original=parseBplist(extractItemData(source,rd,d.stylesItem),{preserveReals:true});
const generated=parseBplist(generatedStyleMetadata(),{preserveReals:true});
assert.equal(original.get('0'),131087);assert.equal(generated.get('0'),14);
assert.equal(original.get('1').length,generated.get('1').length);
assert.equal(original.get('1').length,51840);
const curve=original.get('3').slice();assert.equal(curve.length,516);
curve.set(generated.get('3').subarray(4),4);
// Keep native schema/version, its key set, curve header and k flag. These values
// are neutral baselines, not inferred capture calibration or native parity.
const baselineKeys=['1','3','4','5','6','7','c','d','h','i','j'];
const specs=[['A_V18_Accepted_Control.HEIC',[]],
  ['B_Identity_Coefficients_Only.HEIC',['1']],
  ['C_Neutral_Rendering_Metadata.HEIC',baselineKeys]];
const variants=[];
for(const [file,keys] of specs) {
  const plist=new Map(original);
  for(const key of keys) {
    assert.ok(original.has(key)&&generated.has(key));
    const value=key==='3'?curve:generated.get(key);
    if(original.get(key) instanceof Uint8Array)assert.equal(original.get(key).length,value.length);
    plist.set(key,value);
  }
  const data=keys.length?rebuildHeic(source,d,source.subarray(0,topBox(source,'ftyp').size),
    source.subarray(d.meta.off,d.meta.off+d.meta.size),new Map([[d.stylesItem,buildBplist(plist)]])):source;
  const after=inspect(data),actual=parseBplist(extractItemData(data,after,d.stylesItem),{preserveReals:true});
  assert.deepEqual(actual,plist);assert.deepEqual([...actual.keys()],[...original.keys()]);
  assert.deepEqual(after.infos,rd.infos);assert.deepEqual(after.refs,rd.refs);assert.deepEqual(after.props,rd.props);
  for(const [id] of rd.infos) {
    if(id!==d.stylesItem)assert.deepEqual(extractItemData(data,after,id),extractItemData(source,rd,id));
    for(const assoc of rd.props.associations.get(id)||[]) {
      const type=rd.props.properties[assoc.index-1].type;
      assert.deepEqual(propertyBoxBytes(data,after.props,id,type),propertyBoxBytes(source,rd.props,id,type));
    }
  }
  const changed=keys.filter(key=>!isDeepStrictEqual(actual.get(key),original.get(key)));
  variants.push({file,data,keys,changed});
}
const report={source:path.resolve(sourcePath),sourceSha256:hash(source),stylesItem:d.stylesItem,items:rd.infos.size,
  diagnosticOnly:true,productionChanged:false,colourParameterFitting:false,
  schemaPreserved:original.get('0'),templateBaselineSchema:generated.get('0'),
  note:'Uses existing generated neutral field values, retaining the native schema and curve header; cross-version semantic compatibility is unproven. Earlier other-photo tests did not establish native colour parity. No gain tuning or invented donor arrays. Device results pending.',
  variants:variants.map(v=>({file:v.file,bytes:v.data.length,sha256:hash(v.data),replacedKeys:v.keys,changedKeys:v.changed,
    mainTextureDepthRendExifMattesAndNeutralDeltaExact:true}))};
fs.mkdirSync(directory,{recursive:true});
for(const v of variants)fs.writeFileSync(path.join(directory,v.file),v.data,{flag:'wx'});
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
