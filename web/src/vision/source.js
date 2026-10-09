import {aiSourceCanvas} from '../portrait/ai-portrait-source.js';
import {discoverHeic, dimensionsForItem, displayDimensions, itemOrientation} from '../raster/heif.js';

export async function decodeToDisplayCanvas(bytes) {
  const d=discoverHeic(bytes), {angle}=itemOrientation(bytes,d.props,d.primary);
  const [w,h]=displayDimensions(...dimensionsForItem(d.props,d.primary),angle);
  const scale=Math.min(1,1024/Math.max(w,h));
  // Read the primary image, never the low resolution embedded thumbnail.
  return aiSourceCanvas(bytes,{width:Math.round(w*scale),height:Math.round(h*scale),angle:0});
}
