// Capture classes observed on native depth photos whose Portrait renderer was
// removed by Photos. Keep classification and export eligibility in one place.
export function supportsNativePortraitRestore(capture) {
  return [1, 2, 10, 11, 12].includes(capture);
}

export function isKnownSharpPortraitOffBase(capture, cameraGeneration) {
  if (!Number.isInteger(cameraGeneration)) return false;
  // iPhone 12/13 Portrait-off exports use class 10. iPhone 14 changed the
  // same sharp-primary + native-depth state to class 1.
  return (capture === 10 && cameraGeneration < 16)
    || (capture === 1 && cameraGeneration === 14);
}
