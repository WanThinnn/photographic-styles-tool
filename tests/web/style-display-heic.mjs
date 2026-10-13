import test from 'node:test';
import assert from 'node:assert/strict';
import {styleDisplayColorFromSps} from '../../web/src/recommend/style-display-heic.js';

test('iPhone HEVC with unspecified SPS colour uses its retained Display-P3 item profile',()=>{
  assert.deepEqual(styleDisplayColorFromSps({
    luma:8,chromaDepth:8,chroma:1,primaries:null,transfer:null,matrix:null,fullRange:false,
  }),{primaries:'smpte432',transfer:'bt709',matrix:'bt709',fullRange:false});
});

test('unsupported explicit HEVC colour signalling still fails closed',()=>{
  assert.throws(()=>styleDisplayColorFromSps({
    luma:8,chromaDepth:8,chroma:1,primaries:9,transfer:9,matrix:9,fullRange:false,
  }),/unsupported HEIC colour signalling/);
});
