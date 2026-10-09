import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const web=fileURLToPath(new URL('../../web/',import.meta.url));
function modules(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const name=path.join(directory,entry.name);
    return entry.isDirectory()?modules(name):name.endsWith('.js')?[name]:[];
  });
}
test('browser imports and module-relative worker/assets survive folder changes',()=>{
  const missing=[];
  for(const file of [path.join(web,'app.js'),...modules(path.join(web,'src'))]){
    const source=readFileSync(file,'utf8');
    const patterns=[
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.\.?\/[^'"]+)\1/g,
      /\bnew URL\(\s*(['"])(\.\.?\/[^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g,
    ];
    for(const pattern of patterns)for(const [, ,relative] of source.matchAll(pattern)){
      if(!existsSync(path.resolve(path.dirname(file),relative)))missing.push(`${path.relative(web,file)} -> ${relative}`);
    }
  }
  const html=readFileSync(path.join(web,'index.html'),'utf8');
  for(const [,relative] of html.matchAll(/<script[^>]+src="([^"]+)"/g))assert.ok(existsSync(path.join(web,relative)),relative);
  assert.deepEqual(missing,[],'broken browser module/worker/model paths');
});
