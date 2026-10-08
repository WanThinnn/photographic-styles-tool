import {hasSoftSkinData} from './soft-skin-container.js';
import {installSoftSkinInWorker} from './heic-processing.js';
import {discoverHeic, dimensionsForItem, displayDimensions, itemOrientation} from './raster/heif.js';
import {aiSourceCanvas} from './ai-portrait-source.js';
import {releaseDecodeCache} from './decode.js';
import {releaseHevcEncoder} from './raster/ffmpeg-hevc.js';

export async function completeSoftSkin(data, file, options={}) {
  if(hasSoftSkinData(data)) return {data,state:'preserved'};
  let canvas, vision, result;
  try {
    releaseDecodeCache();
    vision=await import('./vision/face-mattes.js');
    const d=discoverHeic(data), {angle,mirror}=itemOrientation(data,d.props,d.primary);
    const [w,h]=displayDimensions(...dimensionsForItem(d.props,d.primary),angle),scale=Math.min(1,1024/Math.max(w,h));
    canvas=await aiSourceCanvas(null,{width:Math.round(w*scale),height:Math.round(h*scale),angle:0},file);
    result=await vision.generateRasterFaceMattes(canvas,angle,mirror,{onProgress:options.onProgress});
    if(result.state!=='generated') return {data,state:'none'};
    const {state,faces,overrides,texturePeopleData,personMetadata}=result;
    const {nativeStyles,sourceBytes}=options;
    const {data:output}=await installSoftSkinInWorker(data,{state,faces,overrides,texturePeopleData,personMetadata},{nativeStyles,sourceBytes});
    // The inference review/overlay is transient, not retained in processing history.
    return {data:output,state:'generated',faces:result.faces};
  } finally {
    for(const surface of [result?.review?.display,...Object.values(result?.review?.segmented||{})]){
      if(surface) surface.width=surface.height=0;
    }
    if(canvas) canvas.width=canvas.height=0;
    if(vision){const {releaseOrtModels}=await import('./vision/ort-vision.js');await releaseOrtModels();}
    releaseHevcEncoder();
  }
}
