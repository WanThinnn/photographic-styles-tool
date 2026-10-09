import {isDng} from '../dng/dng-tiff.js';
/** Container signatures, independent of filename/MIME supplied by a photo picker. */
export function imageFormat(b) {
  if(b.length>=8&&((b[0]===73&&b[1]===73)||(b[0]===77&&b[1]===77))&&isDng(b))return 'dng';
  const ascii = (offset, length) => String.fromCharCode(...b.subarray(offset, offset + length));
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpeg';
  if (b.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i) => b[i] === n)) return 'png';
  if (b.length >= 12 && ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP') return 'webp';
  if (['GIF87a','GIF89a'].includes(ascii(0,6))) return 'gif';
  if (b.length >= 14 && ascii(0,2) === 'BM') return 'bmp';
  if (b.length >= 16 && ascii(4,4) === 'ftyp') {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const size = view.getUint32(0);
    if (size < 16 || size > b.length) return 'unknown';
    const brands = [ascii(8,4)];
    for (let p=16;p+4<=size;p+=4) brands.push(ascii(p,4));
    if (brands.some(n => n === 'avif' || n === 'avis')) return 'avif';
    if (brands.some(n => /^(hei[cfxms]|mif1|msf1)$/.test(n))) return 'heic';
  }
  return 'unknown';
}
export const RASTER_MIMES = Object.freeze({
  jpeg:'image/jpeg', png:'image/png', webp:'image/webp',
  gif:'image/gif', bmp:'image/bmp', avif:'image/avif',
});
