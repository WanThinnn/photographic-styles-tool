import {discoverHeic, extractItem} from '../core/heif.js';
import {exifCameraModel,extractAppleMakerNoteTag} from '../core/exif.js';
import {parseBplist} from '../core/bplist.js';

function nativeStyleSelection(exif) {
  try {
    const tag=extractAppleMakerNoteTag(exif,0x54);
    if(![1,7].includes(tag.type))return false;
    const marker=parseBplist(tag.payload);
    return marker instanceof Map&&marker.get('0')===1
      &&Number.isInteger(marker.get('4'))&&marker.get('4')>=1
      &&['1','2'].every(key=>Number.isFinite(marker.get(key)));
  } catch { return false; }
}

export function nativeTextureCapture(data, discovery = discoverHeic(data)) {
  if (discovery.exifItem === null) return false;
  const exif=extractItem(data,discovery.iloc,discovery.exifItem);
  const model=exifCameraModel(exif);
  const generation=/^iPhone (\d+)(?:\s|$)/.exec(model||'');
  if(!generation||Number(generation[1])<18)return false;
  try {
    const tag=extractAppleMakerNoteTag(exif,0x65);
    return tag.type===7&&tag.payload.length>0;
  } catch { return false; }
}

export function preserveNativeStyles(data, discovery = discoverHeic(data)) {
  if(discovery.stylesItem!==null)return true;
  if (discovery.exifItem === null) return false;
  const exif=extractItem(data, discovery.iloc, discovery.exifItem);
  const model = exifCameraModel(exif);
  const generation = /^iPhone (\d+)(?:\s|$)/.exec(model || '');
  return Boolean(generation&&Number(generation[1])>=16&&nativeStyleSelection(exif));
}

/** Missing native Styles with an actual native selection must not silently become a full port.
 * This identifies missing data, not whether or how the user edited the photo.
 */
export function styleReconstructionRisk(data, discovery = discoverHeic(data)) {
  if (discovery.stylesItem !== null || !preserveNativeStyles(data,discovery)) return null;
  const model = exifCameraModel(extractItem(data, discovery.iloc, discovery.exifItem));
  return {cameraModel: model, nativeStylesMissing: true, hdrGainMapMissing: discovery.hdrGrid === null};
}
