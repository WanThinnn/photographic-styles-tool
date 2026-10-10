import fs from 'node:fs';
import path from 'node:path';
import {discoverHeic,extractItem} from '../web/src/core/heif.js';
import {parseBplist} from '../web/src/core/bplist.js';
import {URI_TEXTURE_STYLES} from '../web/src/styles/texture.js';

const root=path.resolve(process.argv[2]||'tests/private-fixtures');
const rows=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(/\.hei[cf]$/i.test(entry.name)){
      try{
        const bytes=new Uint8Array(fs.readFileSync(full)),d=discoverHeic(bytes);
        const hit=[...d.infos].find(([,info])=>info.uri===URI_TEXTURE_STYLES);
        if(!hit)continue;
        const plist=parseBplist(extractItem(bytes,d.iloc,hit[0]));
        rows.push({file:path.relative(root,full),hardwareModel:plist.get('HardwareModel')??null,
          preset:plist.get('Preset')??null,grain:plist.get('FilmGrainSeed')??null,
          people:Array.isArray(plist.get('TextureStylePostProcessedPeopleData'))
            ? plist.get('TextureStylePostProcessedPeopleData').length:0});
      }catch{}
    }
  }
}
walk(root);
const counts={};
for(const row of rows)counts[row.hardwareModel]=(counts[row.hardwareModel]||0)+1;
console.log(JSON.stringify({count:rows.length,counts,rows},null,2));
