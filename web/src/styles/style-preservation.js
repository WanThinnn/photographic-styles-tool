import {discoverHeic, extractItem} from '../core/heif.js';
import {exifCameraModel} from '../core/exif.js';

export function preserveNativeStyles(data, discovery = discoverHeic(data)) {
  if (discovery.exifItem === null) return false;
  const model = exifCameraModel(extractItem(data, discovery.iloc, discovery.exifItem));
  const generation = /^iPhone (\d+)(?:\s|$)/.exec(model || '');
  return Boolean(generation && Number(generation[1]) >= 16);
}

/** Missing native Styles on a newer iPhone must not silently become a full port.
 * This identifies missing data, not whether or how the user edited the photo.
 */
export function styleReconstructionRisk(data, discovery = discoverHeic(data)) {
  if (discovery.stylesItem !== null || discovery.exifItem === null) return null;
  const model = exifCameraModel(extractItem(data, discovery.iloc, discovery.exifItem));
  const generation = /^iPhone (\d+)(?:\s|$)/.exec(model || '');
  if (!generation || Number(generation[1]) < 16) return null;
  return {cameraModel: model, nativeStylesMissing: true, hdrGainMapMissing: discovery.hdrGrid === null};
}
