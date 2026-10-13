import test from 'node:test';
import assert from 'node:assert/strict';
import {STYLE_IDS,STYLE_SELECTIONS} from '../../web/src/recommend/style-selection.js';
import {STYLE_BANK_MODEL,STYLE_BANK_REVISION,STYLE_EMBEDDING_DIMENSIONS,queryReferenceBank,validateReferenceBank} from '../../web/src/recommend/style-reference-bank.js';

const basis=(slot,value=1)=>{
  const embedding=new Array(STYLE_EMBEDDING_DIMENSIONS).fill(0);embedding[slot%embedding.length]=value;return embedding;
};
function completeBank(){
  return {version:1,model:STYLE_BANK_MODEL,revision:STYLE_BANK_REVISION,dimensions:STYLE_EMBEDDING_DIMENSIONS,records:STYLE_IDS.map((id,index)=>{
    const p=STYLE_SELECTIONS[id];
    return {embedding:basis(index),styleId:id,tone:p.tone,color:p.color,palette:p.palette,sourceClass:'native-complete'};
  })};
}
test('bank requires complete validated style coverage',()=>{
  const bank=completeBank();
  assert.equal(validateReferenceBank(bank).records.length,16);
  bank.records.pop();
  assert.throws(()=>validateReferenceBank(bank),/missing Style/);
});
test('bank rejects malformed embeddings and metadata',()=>{
  const bank=completeBank();bank.records[0].embedding=[0,1];
  assert.throws(()=>validateReferenceBank(bank),/dimensions/);
  const bank2=completeBank();bank2.records[0].embedding[0]=NaN;
  assert.throws(()=>validateReferenceBank(bank2),/Non-finite/);
  const bank3=completeBank();bank3.records[0].filename='private.heic';
  assert.throws(()=>validateReferenceBank(bank3),/Unexpected reference field/);
  const bank4=completeBank();bank4.records[0].embedding.fill(0);
  assert.throws(()=>validateReferenceBank(bank4),/Zero embedding/);
  const bank5=completeBank();bank5.records[0].styleId=99;
  assert.throws(()=>validateReferenceBank(bank5),/Unsupported Photographic Style/);
  const bank6=completeBank();bank6.revision='wrong';
  assert.throws(()=>validateReferenceBank(bank6),/Unsupported reference bank/);
  const capture=completeBank();capture.records[0].sourceClass='native-capture';
  assert.equal(validateReferenceBank(capture).records[0].sourceClass,'native-capture');
  const synthetic=completeBank();synthetic.records[0].sourceClass='generated';
  assert.throws(()=>validateReferenceBank(synthetic),/Unsupported reference source/);
});
test('equal weighted support uses lower Style ID only as deterministic final tie break',()=>{
  const p1=STYLE_SELECTIONS[1],p4=STYLE_SELECTIONS[4],embedding=basis(0);
  const bank=validateReferenceBank({version:1,model:STYLE_BANK_MODEL,revision:STYLE_BANK_REVISION,dimensions:STYLE_EMBEDDING_DIMENSIONS,records:[
    {embedding:[...embedding],styleId:4,tone:p4.tone,color:p4.color,palette:p4.palette,sourceClass:'native-complete'},
    {embedding:[...embedding],styleId:1,tone:p1.tone,color:p1.color,palette:p1.palette,sourceClass:'native-complete'},
  ]},{requireComplete:false});
  assert.equal(queryReferenceBank(bank,embedding,{k:2}).styleId,1);
});

test('cosine retrieval deterministically selects the nearest style',()=>{
  const bank=validateReferenceBank(completeBank());
  const result=queryReferenceBank(bank,basis(0),{k:3});
  assert.equal(result.styleId,STYLE_IDS[0]);
  assert.ok(result.support>0);
  assert.ok(Number.isFinite(result.margin));
});
