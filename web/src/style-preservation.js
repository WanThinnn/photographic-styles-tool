import {discoverHeic, extractItem} from './heif.js';
import {exifCameraModel} from './exif.js';

/** Missing native Styles on a newer iPhone must not silently become a full port.
 * This identifies missing data, not whether or how the user edited the photo.
 */
export function styleReconstructionRisk(data, discovery = discoverHeic(data)) {
  if (discovery.stylesItem !== null || discovery.exifItem === null) return null;
  const model = exifCameraModel(extractItem(data, discovery.iloc, discovery.exifItem));
  const generation = /^iPhone (\d+)(?:\s|$)/.exec(model || '');
  if (!generation || ![16, 17].includes(Number(generation[1]))) return null;
  return {cameraModel: model, nativeStylesMissing: true, hdrGainMapMissing: discovery.hdrGrid === null};
}
