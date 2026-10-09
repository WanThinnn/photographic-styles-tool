import {decodeDng} from './dng-decode.js';
import {dngReader} from './dng-tiff.js';
import {concat,be} from '../core/box.js';

function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
// LibRaw has already applied orientation. Keep capture metadata without applying
// that rotation twice in the subsequent browser PNG decode.
export function developedPngExif(png,exif){
  const tiff=exif.subarray(10).slice(),r=dngReader(tiff),v=new DataView(tiff.buffer);
  const table=r.ifd(r.rootOffset),orientation=table.entries.get(274);
  if(orientation?.type===3&&orientation.count===1)v.setUint16(orientation.data.byteOffset-tiff.byteOffset,1,r.little);
  const body=concat([new TextEncoder().encode('eXIf'),tiff]);
  const chunk=concat([be(tiff.length,4),body,be(crc32(body),4)]);
  // Insert after IHDR and before image data.
  return concat([png.subarray(0,33),chunk,png.subarray(33)]);
}
export async function importDngFile(bytes,name,onProgress){
  const decoded=await decodeDng(bytes,onProgress,{maxPixels:12_000_000});
  try{
    const blob=await new Promise(resolve=>decoded.image.toBlob(resolve,'image/png'));
    if(!blob)throw Error('DNG rendering failed');
    const png=developedPngExif(new Uint8Array(await blob.arrayBuffer()),decoded.sourceExif);
    return new File([png],name.replace(/\.[^.]+$/,'')+'.png',{type:'image/png'});
  }finally{decoded.close();}
}
