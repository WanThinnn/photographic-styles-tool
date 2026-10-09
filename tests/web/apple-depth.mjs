import {test} from 'node:test';
import assert from 'node:assert/strict';
import {depthRepresentationSubtype,appleDepthAuxc,appleDepthXmp} from '../../web/src/portrait/apple-depth-metadata.js';

test('depth descriptor matches independently inspected native Apple disparity values',()=>{
  // IMG_5129 native auxC sample: dMin=0.73583984375, dMax=1.607421875.
  const expected='000000110000000d4e01b109351e7bc600fbe6e020';
  assert.equal(Buffer.from(depthRepresentationSubtype(.73583984375,1.607421875)).toString('hex'),expected);
});

test('AI disparity metadata describes quantization without claiming camera calibration',()=>{
  const xml=new TextDecoder().decode(appleDepthXmp());
  for(const value of ['http://ns.apple.com/pixeldatainfo/1.0/','1278226488','1751411059',
    '<pixel:FloatMinValue>0</pixel:FloatMinValue>','<pixel:FloatMaxValue>1</pixel:FloatMaxValue>',
    '<depth:Accuracy>relative</depth:Accuracy>'])assert.ok(xml.includes(value));
  assert.ok(!/IntrinsicMatrix|ExtrinsicMatrix|PixelSize|LensDistortion|RenderingParameters/.test(xml));
  const aux=appleDepthAuxc();
  assert.equal(new DataView(aux.buffer).getUint32(0),aux.length);
  assert.ok(new TextDecoder().decode(aux).includes('urn:mpeg:hevc:2015:auxid:2\0'));
  assert.ok(aux.length>41);
});

test('invalid disparity ranges are rejected before writing depth metadata',()=>{
  for(const [min,max] of [[0,0],[1,0],[-1,1],[NaN,1],[0,Infinity],[0,2**31]]) {
    assert.throws(()=>depthRepresentationSubtype(min,max));
    assert.throws(()=>appleDepthXmp({floatMin:min,floatMax:max}));
  }
});
