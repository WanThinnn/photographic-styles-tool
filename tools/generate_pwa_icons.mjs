// Render install icons from THIS app's photographic-styles.svg.
// Shalielie is used only as a reference for the Apple PNG container contract;
// no reference artwork/pixels are copied into production.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
const sharp=require(process.argv[2]||'sharp');
const directory=new URL('../web/icons/',import.meta.url);
const svg=await readFile(new URL('photographic-styles.svg',directory));

const crcTable=Array.from({length:256},(_,n)=>{
  let c=n;
  for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
  return c>>>0;
});
function crc32(bytes){
  let c=0xffffffff;
  for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function chunk(type,data){
  const name=Buffer.from(type,'ascii'),body=Buffer.from(data),out=Buffer.alloc(12+body.length);
  out.writeUInt32BE(body.length,0);name.copy(out,4);body.copy(out,8);
  out.writeUInt32BE(crc32(Buffer.concat([name,body])),8+body.length);
  return out;
}
function applePngEnvelope(png){
  const parts=[png.subarray(0,8)],kept=[];let offset=8,ihdr=null;
  while(offset+12<=png.length){
    const length=png.readUInt32BE(offset),end=offset+12+length,type=png.toString('ascii',offset+4,offset+8);
    const raw=png.subarray(offset,end);
    if(type==='IHDR')ihdr=raw;
    else if(!['sRGB','gAMA','pHYs'].includes(type))kept.push(raw);
    offset=end;
  }
  if(!ihdr)throw Error('Generated icon is not a PNG');
  parts.push(ihdr);
  parts.push(chunk('sRGB',Buffer.from([0])));
  parts.push(chunk('gAMA',Buffer.from([0x00,0x00,0xb1,0x8f])));
  parts.push(chunk('pHYs',Buffer.from([0x00,0x00,0x0e,0xc3,0x00,0x00,0x0e,0xc3,0x01])));
  parts.push(...kept);
  return Buffer.concat(parts);
}

// iOS Home Screen appearance generation is heuristic for web clips. A dense
// matrix, even centered, did not reliably receive Dark/Light appearance
// synthesis. Keep the install artwork intentionally simple and high-contrast.
const touchSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2f6df6"/>
  <rect x="154" y="154" width="204" height="204" rx="56" fill="none" stroke="#fff" stroke-width="24"/>
  <circle cx="326" cy="202" r="27" fill="#fff"/>
</svg>`);
const touch=await sharp(touchSvg).resize(180,180).ensureAlpha(1).png().toBuffer();
const appleTouch=applePngEnvelope(touch);
await writeFile(new URL('icon-180.png',directory),appleTouch);

// Windows does not consistently apply an app-icon mask, so bake the rounded
// blue silhouette into the PNG itself and leave transparent corners.
const desktopSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="1" y="1" width="510" height="510" rx="112" fill="#2f6df6"/>
  <rect x="154" y="154" width="204" height="204" rx="56" fill="none" stroke="#fff" stroke-width="24"/>
  <circle cx="326" cy="202" r="27" fill="#fff"/>
</svg>`);
for(const size of [192,512]){
  const desktopIcon=await sharp(desktopSvg).resize(size,size).ensureAlpha().png().toBuffer();
  await writeFile(new URL(`icon-${size}.png`,directory),desktopIcon);
  await writeFile(new URL(`icon-${size}-v2.png`,directory),desktopIcon);
}

// Keep the stable name and also emit a fresh URL so Safari/iOS cannot reuse
// the failed matrix Web Clip artwork from cache.
await writeFile(new URL('apple-touch-icon.png',directory),appleTouch);
await writeFile(new URL('apple-touch-icon-v2.png',directory),appleTouch);

// Keep the Windows maskable source visually identical too; Edge may prefer it.
const maskable=await sharp(desktopSvg).resize(512,512).ensureAlpha().png().toBuffer();
await writeFile(new URL('icon-512-maskable.png',directory),maskable);
await writeFile(new URL('icon-512-maskable-v2.png',directory),maskable);
