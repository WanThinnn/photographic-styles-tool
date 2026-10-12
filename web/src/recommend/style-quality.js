export const STYLE_QUALITY=Object.freeze({
  lite:Object.freeze({level:'lite',views:1,k:3,statsSize:48,minSupport:.50,minMargin:.09,minScoreMargin:.060,maxSemanticDispersion:.50,minConfidence:.25}),
  standard:Object.freeze({level:'standard',views:5,k:7,statsSize:72,minSupport:.46,minMargin:.065,minScoreMargin:.050,maxSemanticDispersion:.40,minConfidence:.28}),
  pro:Object.freeze({level:'pro',views:9,k:11,statsSize:96,minSupport:.43,minMargin:.05,minScoreMargin:.040,maxSemanticDispersion:.34,minConfidence:.30}),
});

export function styleQuality(level='standard'){
  const value=STYLE_QUALITY[level];
  if(!value)throw new RangeError('Unsupported AI level');
  return value;
}
