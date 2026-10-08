import {encodeHevcPixels} from '../raster/ffmpeg-hevc.js';

// Software grayscale encoding works even when Safari exposes no HEVC VideoEncoder.
// The encoded SPS and hvcC travel together; pixi declares the single matte channel.
export async function encodeFaceMatte(source, onProgress) {
  const {width, height} = source;
  const rgba = source.getContext('2d', {willReadFrequently:true}).getImageData(0,0,width,height).data;
  const gray = new Uint8Array(width * height);
  for (let i=0; i<gray.length; i++) gray[i] = rgba[i*4];
  const result = await encodeHevcPixels(gray, {width, height, pixelFormat:'gray', fullRange:true}, onProgress);
  return {payload:result.payload, hvcc:result.hvcc, width, height};
}
