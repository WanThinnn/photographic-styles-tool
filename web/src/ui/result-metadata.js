import {discoverHeic, dimensionsForItem, displayDimensions, irotAngleForItem, auxUriForItem, DEPTH_URI, extractItem} from '../core/heif.js';
import {exifCameraModel} from '../core/exif.js';
import {photoCaptureDate} from '../media/photo-date.js';

// Report file resources, not promises about controls in Apple Photos.
export function describeHeic(bytes, discovery = discoverHeic(bytes)) {
  const [w, h] = dimensionsForItem(discovery.props, discovery.primary);
  const [width, height] = displayDimensions(w, h, irotAngleForItem(bytes, discovery.props, discovery.primary));
  let camera = null;
  try { camera = exifCameraModel(extractItem(bytes, discovery.iloc, discovery.exifItem)); } catch {}
  return {width, height, camera, capture: photoCaptureDate(bytes), bytes: bytes.byteLength,
    hdr: discovery.hdrGrid !== null,
    depth: [...discovery.infos.keys()].some(id => auxUriForItem(discovery.props, id) === DEPTH_URI)};
}

export function formatBytes(bytes) {
  return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}
