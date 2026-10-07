import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {styleDeltaSize} from '../../web/src/graft.js';
import {patch} from '../../web/src/port.js';
import {loadProfile} from '../../web/src/zip.js';
import {discoverHeic, extractItem, propertyBoxBytes, dimensionsForItem, auxUriForItem} from '../../web/src/heif.js';
import {photoContentIdentifier} from '../../web/src/live-photo.js';

test('unknown geometries require opt-in and keep stored portrait axes',()=>{
  assert.equal(styleDeltaSize(2597,3462),null);
  assert.deepEqual(styleDeltaSize(4032,3024),[2880,2160]);
  assert.deepEqual(styleDeltaSize(2597,3462,true),[1856,2496]);
  assert.deepEqual(styleDeltaSize(3462,2597,true),[2496,1856]);
  assert.equal(styleDeltaSize(0,0,true),null);
  assert.equal(styleDeltaSize(9000,6000,true),null);
});

const source='C:/Users/WanThinnn/Downloads/IMG_1739.HEIC';
const generated='C:/Users/WanThinnn/Downloads/IMG_1739_ExperimentalStyle.HEIC';
test('real 14 Pro graph keeps primary, single-item HDR, depth and original associations',
  {skip:!fs.existsSync(source)||!fs.existsSync(generated)},async()=>{
    const bytes=new Uint8Array(fs.readFileSync(source));
    const rendered=new Uint8Array(fs.readFileSync(generated));
    const original=discoverHeic(bytes),done=discoverHeic(rendered);
    assert.equal(original.thumbnail,null);
    assert.equal(original.infos.get(original.hdrGrid).type,'hvc1');
    const id=done.linearThumb;
    const linearThumb={sample:extractItem(rendered,done.iloc,id),
      ...Object.fromEntries(['hvcC','ispe','pixi'].map(k=>[k,propertyBoxBytes(rendered,done.props,id,k)]))};
    const profile=await loadProfile(new Uint8Array(fs.readFileSync(new URL('../../web/profiles/48-12.zip',import.meta.url))));
    await assert.rejects(patch(bytes,profile,{linearThumb}),/supported/);
    const {data,report}=await patch(bytes,profile,{linearThumb,experimental:true,sceneStats:'donor'});
    const output=discoverHeic(data);
    assert.equal(report.experimental,true);
    assert.ok(output.stylesItem!==null);
    assert.deepEqual(dimensionsForItem(output.props,output.primary),dimensionsForItem(original.props,original.primary));
    assert.deepEqual(dimensionsForItem(output.props,output.deltaGrid),[1856,2496]);
    assert.equal(output.hdrGrid,original.hdrGrid);
    assert.equal(photoContentIdentifier(data),photoContentIdentifier(bytes));
    for(const [iid,item] of original.iloc.items){
      if(item.constructionMethod===0&&iid!==original.exifItem)
        assert.deepEqual(extractItem(data,output.iloc,iid),extractItem(bytes,original.iloc,iid),`payload ${iid}`);
      assert.deepEqual(output.props.associations.get(iid),original.props.associations.get(iid),`associations ${iid}`);
      assert.equal(auxUriForItem(output.props,iid),auxUriForItem(original.props,iid),`auxiliary ${iid}`);
    }
  });
