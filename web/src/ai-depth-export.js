// Experimental unblurred HEIC + depth export. Photos aperture/lighting support
// remains unverified; the production bokeh UI must not promise those controls.
import {encodeHevcPixels} from './raster/ffmpeg-hevc.js';
import {discoverHeic,auxUriForItem,DEPTH_URI,dimensionsForItem} from './heif.js';
import {attachAiDepth} from './ai-portrait-container.js';

export async function exportAiDepth(result,onProgress=()=>{}) {
  const {sourceData,gray,width,height}=result;
  const d=discoverHeic(sourceData);
  if([...d.infos.keys()].some(id=>auxUriForItem(d.props,id)===DEPTH_URI))
    throw Error('Existing depth must not be replaced');
  const [w,h]=dimensionsForItem(d.props,d.primary);
  if(!(gray instanceof Uint8Array)||gray.length!==width*height||Math.abs(width/height-w/h)>.01)
    throw Error('AI depth does not match the source photo');
  const encoded=await encodeHevcPixels(gray,{width,height,pixelFormat:'gray',fullRange:true,lossless:true},onProgress);
  // encodeHevcPixels already returns the complete hvcC property box.
  const data=attachAiDepth(sourceData,{payload:encoded.payload,hvcc:encoded.hvcc,width,height});
  return {data,report:{mode:'ai-depth',relative:true,bakedBlur:false,photosPortraitEditing:'unverified'}};
}
