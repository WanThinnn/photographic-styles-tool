import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
const raster=readFileSync(new URL('../../web/src/raster/raster-import.js',import.meta.url),'utf8');

test('Suggested Styles stays lazy when the independent feature is disabled',()=>{
  assert.match(app,/async function recommendHeicStyle[\s\S]*if\(!aiFeatures\.enabled\('style'\)\|\|modernNativeCamera\(bytes,d\)\)return null;[\s\S]*import\('\.\/src\/recommend\/style-runtime\.js'\)/);
  assert.match(raster,/async function suggestStyleForImage\(image,request,onProgress\)\{\s*if\(!request\)return \{recommendation:null,error:null\};[\s\S]*import\('\.\.\/recommend\/style-runtime\.js'\)/);
  assert.match(app,/styleSuggestion:aiFeatures\.enabled\('style'\)\?\{level:selectedAiLevel\(\),provider:/);
});

test('native preservation classification happens before any HEIC recommendation',()=>{
  const classify=app.indexOf('const textureOnly = preserveNativeStyles(bytes,d);');
  const nativeBranch=app.indexOf('if (nativeTexture && !hasTexture(d.infos))');
  const patchBranch=app.indexOf('const needsExperimental = d.hdrGrid === null');
  const recommend=app.indexOf("opts.styleRecommendation=await recommendHeicStyle(bytes,d,ui)");
  assert.ok(classify>=0&&classify<nativeBranch&&nativeBranch<patchBranch&&patchBranch<recommend);
  assert.equal((app.match(/opts\.styleRecommendation=await recommendHeicStyle/g)||[]).length,1);
  const helper=app.slice(app.indexOf('async function recommendHeicStyle'),app.indexOf('async function handleFile'));
  const bypass=helper.indexOf("modernNativeCamera(bytes,d))return null"),load=helper.indexOf("import('./src/recommend/style-runtime.js')");
  assert.ok(bypass>=0&&load>=0&&bypass<load,'iPhone 16+ must return before loading the recommender');
});

test('raster Detail changes pixels before Suggested Styles analyzes them',()=>{
  const detail=raster.indexOf('if(detail){');
  const assignsEnhanced=raster.indexOf('image=enhanced;',detail);
  const suggest=raster.indexOf('await suggestStyleForImage(image,styleSuggestion,onProgress)',detail);
  assert.ok(detail>=0&&detail<assignsEnhanced&&assignsEnhanced<suggest);
});

test('HEIC recommendation canonicalizes stored pixels to display orientation before inference',()=>{
  assert.match(app,/const orientation=rasterHeif\.itemOrientation\(bytes,rd\.props,rd\.primary\);[\s\S]*decodeToRgb\(bytes,\{width:sampleWidth,height:sampleHeight,\.\.\.orientation\}\)[\s\S]*orientStyleImage\([\s\S]*recommendStyleRgb\(display,/);
});

test('shared AI level and GPU toggle are forwarded to both raster and HEIC recommendation paths',()=>{
  assert.match(app,/styleSuggestion:aiFeatures\.enabled\('style'\)\?\{level:selectedAiLevel\(\),provider:gpuAcceleration\.checked\?'webgpu':'wasm'\}/);
  assert.match(app,/recommendStyleRgb\([\s\S]*level:selectedAiLevel\(\),provider:gpuAcceleration\.checked\?'webgpu':'wasm'/);
});

test('Suggested Styles bakes only the ordinary SDR display rendition while retaining editable metadata',()=>{
  const patch=app.indexOf('await patchInWorker(bytes, profile, opts)');
  const display=app.indexOf("import('./src/recommend/style-display-heic.js')",patch);
  assert.ok(patch>=0&&display>patch);
  assert.match(app,/if\(report\.styleRecommendation&&d\.hdrGrid===null\)[\s\S]*renderSuggestedStyleDisplay\(data,report\.styleRecommendation/);
  const linear=raster.indexOf('const linearThumbnail = await encodeLinearThumbnail(image');
  const render=raster.indexOf('const styleDisplayRendered=',linear);
  assert.ok(linear>=0&&render>linear,'linear thumbnail stays based on the unbaked editable source');
  assert.match(raster,/ctx\.drawImage\(stored,[\s\S]*renderStyleDisplayCanvas\(ctx,TILE,TILE,styled\.recommendation\)/);
});
