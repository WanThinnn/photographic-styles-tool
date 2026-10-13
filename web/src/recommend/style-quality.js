export const STYLE_QUALITY=Object.freeze({
  lite:Object.freeze({level:'lite',views:3,k:3,statsSize:48,minSupport:.50,minMargin:.18,minScoreMargin:.16,maxSemanticDispersion:.55,minConfidence:.25}),
  standard:Object.freeze({level:'standard',views:9,k:7,statsSize:72,minSupport:.45,minMargin:.14,minScoreMargin:.13,maxSemanticDispersion:.45,minConfidence:.28}),
  pro:Object.freeze({level:'pro',views:17,k:11,statsSize:96,minSupport:.40,minMargin:.11,minScoreMargin:.10,maxSemanticDispersion:.38,minConfidence:.30}),
});

export function styleQuality(level='standard'){
  const value=STYLE_QUALITY[level];
  if(!value)throw new RangeError('Unsupported AI level');
  return value;
}
