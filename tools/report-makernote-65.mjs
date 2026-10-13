import fs from 'node:fs';
import path from 'node:path';
import {discoverHeic,extractItem} from '../web/src/core/heif.js';
import {exifCameraModel,extractAppleMakerNoteTag} from '../web/src/core/exif.js';
import {parseBplist} from '../web/src/core/bplist.js';
const root=path.resolve(process.argv[2]||'tests/private-fixtures'),rows=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.hei[cf]$/i.test(e.name)){try{const data=new Uint8Array(fs.readFileSync(p)),d=discoverHeic(data);if(d.exifItem==null)return;const exif=extractItem(data,d.iloc,d.exifItem),model=exifCameraModel(exif);let v65=null;try{const t=extractAppleMakerNoteTag(exif,0x65);v65=Object.fromEntries(parseBplist(t.payload));}catch{}rows.push({file:path.relative(root,p).replaceAll('\\','/'),model,v65});}catch{}}}}
walk(root);
const groups={};for(const r of rows){const k=r.model||'unknown';groups[k]??={count:0,with65:0,examples:[]};groups[k].count++;if(r.v65){groups[k].with65++;if(groups[k].examples.length<5)groups[k].examples.push(r);}}
console.log(JSON.stringify(groups,null,2));