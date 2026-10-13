import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {discoverHeic,extractItem} from '../web/src/core/heif.js';
import {parseBplist,buildBplist} from '../web/src/core/bplist.js';
import {topBox} from '../web/src/core/box.js';
import {rebuildHeic} from '../web/src/styles/graft.js';
import {URI_TEXTURE_STYLES} from '../web/src/styles/texture.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const input=path.resolve(root,process.argv[2]||'tests/private-fixtures/IMG_0783_Refinement/IMG_0783_Web_Default_D.HEIC');
const outDir=path.resolve(root,process.argv[3]||'tests/private-fixtures/Film_Halation_V1');
await fs.mkdir(outDir,{recursive:true});
const source=new Uint8Array(await fs.readFile(input)),d=discoverHeic(source);
const pair=[...d.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES);
if(!pair)throw Error('input has no texture_styles item');
const textureId=pair[0],original=extractItem(source,d.iloc,textureId);
const originalModel=parseBplist(original).get('HardwareModel')??null;

function variant(model){
  const p=parseBplist(original,{preserveReals:true});
  if(model===null)p.delete('HardwareModel');else p.set('HardwareModel',model);
  const payload=buildBplist(p),ft=topBox(source,'ftyp');
  const ftyp=source.slice(ft.off,ft.off+ft.size),meta=source.slice(d.meta.off,d.meta.off+d.meta.size);
  return rebuildHeic(source,d,ftyp,meta,new Map([[textureId,payload]]));
}

const files=[['A_iPhone19,2.HEIC','iPhone19,2'],['B_iPhone19,7.HEIC','iPhone19,7'],['C_NoHardwareModel.HEIC',null]];
const report={input:path.relative(root,input).replaceAll('\\\\','/'),textureItem:textureId,originalModel,variants:[]};
for(const [name,model] of files){
  const bytes=variant(model),after=discoverHeic(bytes);
  const tex=[...after.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES)[0];
  const parsed=parseBplist(extractItem(bytes,after.iloc,tex));
  await fs.writeFile(path.join(outDir,name),bytes);
  report.variants.push({file:name,hardwareModel:parsed.get('HardwareModel')??null,bytes:bytes.length});
}
await fs.writeFile(path.join(outDir,'report.json'),JSON.stringify(report,null,2));
const guide='Film halation A/B/C\n\nA: HardwareModel iPhone19,2 (native donor value / old production)\nB: HardwareModel iPhone19,7 (current mitigation)\nC: HardwareModel removed entirely\n\nFor EACH file in Photos:\n1. Edit -> Film.\n2. Observe preview at 90, 94, 97, 98, 99, 100.\n3. At 100 tap Done. Reopen and compare the saved/final render.\n4. Record whether red halation is none / light / strong and whether 97->100 changes direction.\n\nOnly texture_styles HardwareModel differs. Do not compare different photos.\n';
await fs.writeFile(path.join(outDir,'HUONG_DAN.txt'),guide);
console.log(JSON.stringify(report,null,2));
