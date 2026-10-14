import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryStore,restoredFile} from '../../web/src/ui/history-store.js';

test('history storage degrades safely when IndexedDB is unavailable',async()=>{
  const store=createHistoryStore({indexedDB:null});
  const file=new File(['abc'],'result.heic',{type:'image/heic'});
  await store.save({id:'one',name:'original.heic',file});
  await store.remove('one');
  await store.clear();
  assert.deepEqual(await store.list(),[]);
});

test('restored history turns a stored Blob back into a named File',()=>{
  const blob=new Blob(['image'],{type:'image/heic'});
  const file=restoredFile({file:blob,fileName:'saved.heic',type:'image/heic',lastModified:123});
  assert.equal(file.name,'saved.heic');
  assert.equal(file.type,'image/heic');
  assert.equal(file.size,5);
  assert.equal(file.lastModified,123);
});
