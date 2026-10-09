import {generateStylesPlist} from '../raster/generated-profile.js';
import {parseBplist, buildBplist, BplistReal} from '../core/bplist.js';

// Research-only override, never selected by the normal website conversion.
// Device testing on IMG_0783 found no colour improvement over the existing profile.
// A donor's gain (~14.6), range and exposure fields describe its own capture.
// Keep the generated SDR reference internally consistent: Gain=1, h=Gain/4,
// range [0,1], identity coefficients/curve. Scene and people statistics are then
// measured from the target. This is a baseline, not Apple camera calibration.
export const generatedStyleMetadata = () => {
  const metadata=parseBplist(generateStylesPlist(),{preserveReals:true});
  metadata.set('h',new BplistReal(0.25));
  return buildBplist(metadata);
};
