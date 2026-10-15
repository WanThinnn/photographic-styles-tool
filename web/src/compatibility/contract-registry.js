import {
  URI_HDR_GAIN,URI_LINEAR_THUMB,URI_STYLE_DELTA,URI_STYLES,DEPTH_URI,MATTE_URIS,
} from '../core/heif.js';
import {URI_TEXTURE_STYLES,MATTE_2026_URIS} from '../styles/texture.js';

export const KNOWN_STYLES_SCHEMAS=Object.freeze([13,14,16,131087,131088]);
export const KNOWN_STYLES_KEYS=new Set(['0','1','2','3','4','5','6','7','c','d','e','f','g','h','i','j','k','l']);
export const KNOWN_STYLE_SELECTION_KEYS=new Set(['0','1','2','3','4','5','6','7']);
export const KNOWN_TEXTURE_KEYS=new Set([
  'Preset','CaptureType','CaptureMode','PortType','HardwareModel',
  'TextureStylePeopleDataVersion','FilmGrainSeed','TextureStylePostProcessedPeopleData',
]);
export const URI_PERSON_INSTANCES='tag:apple.com,2026:photo:aux:semanticpersoninstances';

export const KNOWN_APPLE_TAG_URIS=new Set([
  URI_LINEAR_THUMB,URI_STYLE_DELTA,URI_STYLES,URI_TEXTURE_STYLES,
  URI_PERSON_INSTANCES,...MATTE_2026_URIS,
]);

export const KNOWN_APPLE_URN_AUX_URIS=new Set([
  URI_HDR_GAIN,DEPTH_URI,...Object.values(MATTE_URIS),
]);

export const LEGACY_BASELINE_CONTRACT_ID='stylio/apple-photos-known-baseline-v1';
export const CONTRACT_IDS=Object.freeze({
  knownNative:'stylio/apple-native-supported-v1',
  nonNative:'stylio/non-native-source-v1',
  unknownApple:'stylio/apple-unknown-contract-v1',
});
export const GENERIC_RECOVERY_STRATEGY_ID='stylio/editing-layer-recovery-v1';
export const KNOWN_RENDERING_REFERENCE_TYPES=new Set(['auxl','cdsc','dimg','thmb']);
export const KNOWN_RENDERING_PROPERTY_TYPES=new Set([
  'ispe','pixi','hvcC','colr','irot','imir','auxC','clap','pasp','mdcv','clli',
]);

export const isAppleTagUri=uri=>typeof uri==='string'&&uri.startsWith('tag:apple.com');
export const isApplePhotoUrn=uri=>typeof uri==='string'&&uri.startsWith('urn:com:apple:photo:');

export function isKnownStylesSchema(schema){
  return KNOWN_STYLES_SCHEMAS.includes(schema);
}
export function isKnownAppleTagUri(uri){return KNOWN_APPLE_TAG_URIS.has(uri);}
export function isKnownApplePhotoUrn(uri){return KNOWN_APPLE_URN_AUX_URIS.has(uri);}
