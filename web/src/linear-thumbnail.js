import { decodeToRgb } from './decode.js';
import { discoverHeic, dimensionsForItem, irotAngleForItem, imirAxisForItem, ispeBox } from './heif.js';
import { box } from './box.js';
import { encodeRgbThumbnail, releaseHevcEncoder } from './ffmpeg-hevc.js';

// The CLI photo-graph path needs only a linear-thumbnail auxiliary item, not a
// newly inserted ordinary thumbnail. Keep the existing primary/auxiliary graph.
export async function generateLinearThumbnail(bytes, onProgress) {
  const d = discoverHeic(bytes);
  const [pw, ph] = dimensionsForItem(d.props, d.primary);
  const [width, height] = pw >= ph ? [1024, 768] : [768, 1024];
  onProgress?.({stage: 'decode'});
  const rgb = await decodeToRgb(bytes, {width, height,
    angle: irotAngleForItem(bytes, d.props, d.primary),
    mirror: imirAxisForItem(bytes, d.props, d.primary)});
  try {
    const encoded = await encodeRgbThumbnail(rgb, width, height, onProgress);
    return {sample: encoded.payload, hvcC: encoded.hvcc, ispe: ispeBox(width, height),
      pixi: box('pixi', new Uint8Array([0, 0, 0, 0, 3, 10, 10, 10]))};
  } finally {
    // Safari has a limited memory budget; keep downloaded assets cached, not WASM heaps.
    releaseHevcEncoder();
  }
}
