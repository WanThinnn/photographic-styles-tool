import test from 'node:test';
import assert from 'node:assert/strict';
import {appleDepthXmp,readAppleDepthRange} from '../../web/src/portrait/apple-depth-metadata.js';

const xmp=range=>new TextDecoder().decode(appleDepthXmp(range));
test('8-bit camera disparity retains its range with either XMP prefix or attribute encoding',()=>{
  for(const [floatMin,floatMax]of [[0,1],[0,.75],[.043335,1.615234],[.110901,.750488]]){
    const original=xmp({floatMin,floatMax});
    assert.deepEqual(readAppleDepthRange(original),{floatMin,floatMax});
    assert.deepEqual(readAppleDepthRange(original.replaceAll('pixel:','apdi:').replace('xmlns:pixel=','xmlns:apdi=')),{floatMin,floatMax});
    const attribute=original.replace(`<pixel:FloatMinValue>${floatMin}</pixel:FloatMinValue>`,'')
      .replace('xmlns:pixel=',`pixel:FloatMinValue="${floatMin}" xmlns:pixel=`);
    assert.deepEqual(readAppleDepthRange(attribute),{floatMin,floatMax});
  }
});
test('unsupported or ambiguous camera ranges never become the default AI 0..1 range',()=>{
  const original=xmp({floatMin:.043335,floatMax:1.615234});
  for(const changed of [
    original.replace(/<pixel:FloatMinValue>[^<]+<\/pixel:FloatMinValue>/,''),
    original.replace('>0.043335<','><'),original.replace('>0.043335<','>-0.043335<'),
    original.replace('>1.615234<','>0.01<'),original.replace('>1.615234<','>NaN<'),
    original.replace('>1.615234<','>Infinity<'),original.replace('>1.615234<','>2000000000<'),
    original.replace('</pixel:FloatMaxValue>','</pixel:FloatMaxValue><pixel:FloatMaxValue>2</pixel:FloatMaxValue>'),
    original.replace('xmlns:pixel=', 'pixel:FloatMinValue="0.043335" xmlns:pixel='),
    original.replace('http://ns.apple.com/pixeldatainfo/1.0/','https://example.invalid/'),
    original.replace('<rdf:RDF ', '<rdf:RDF xmlns:pixel="https://example.invalid/" '),
    original.replace('>disparity<','>depth<'),original.replace('>255<','>1023<'),
    '<!DOCTYPE x>'+original,
  ])assert.equal(readAppleDepthRange(changed),null);
});
