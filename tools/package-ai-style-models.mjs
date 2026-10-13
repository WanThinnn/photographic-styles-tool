// Keep large ONNX assets below GitHub's per-file limit without changing browser URLs.
// Usage: node tools/package-ai-style-models.mjs split|assemble [--remove-parts]
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../web/vendor/ai-style/',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,'assets.json'),'utf8'));
const chunkSize=48_000_000;
const mode=process.argv[2];
if(!['split','assemble'].includes(mode))throw Error('Usage: package-ai-style-models.mjs split|assemble [--remove-parts]');
for(const model of Object.values(manifest.models)){
  for(const asset of Object.values(model.providers)){
    if(asset.bytes<=90_000_000)continue;
    const file=resolve(root,asset.file);
    const parts=Array.from({length:Math.ceil(asset.bytes/chunkSize)},(_,i)=>`${file}.part${String(i).padStart(3,'0')}`);
    const bytes=mode==='split'?await readFile(file):Buffer.concat(await Promise.all(parts.map(part=>readFile(part))));
    if(bytes.length!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)
      throw Error(`Size or SHA-256 mismatch: ${asset.file}`);
    if(mode==='split'){
      for(let i=0;i<parts.length;i++)await writeFile(parts[i],bytes.subarray(i*chunkSize,(i+1)*chunkSize));
    }else{
      await writeFile(file,bytes);
      if(process.argv.includes('--remove-parts'))for(const part of parts)await unlink(part);
    }
    console.log(`${mode}: ${asset.file} (${parts.length} parts), SHA-256 verified`);
  }
}
