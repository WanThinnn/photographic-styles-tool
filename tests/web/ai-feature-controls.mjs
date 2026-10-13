import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AI_STRINGS} from '../../web/src/ui/ai-strings.js';
import {createAiFeatureControls} from '../../web/src/ui/ai-feature-controls.js';

function switchControl(checked=false){
  const control=new EventTarget();
  control.checked=checked;
  control.disabled=false;
  control.toggle=()=>{
    if(control.disabled)return;
    control.checked=!control.checked;
    control.dispatchEvent(new Event('change'));
  };
  return control;
}

test('enabling the AI group never auto-selects Portrait or other effects',()=>{
  const master=switchControl(),portrait=switchControl(),detail=switchControl(),style=switchControl();
  const state=createAiFeatureControls({master,features:{portrait,detail,style}});
  assert.equal(portrait.disabled,true);
  master.toggle();
  assert.equal(master.checked,true);
  assert.equal(portrait.disabled,false);
  assert.equal(detail.disabled,false);
  assert.equal(style.disabled,false);
  assert.equal(portrait.checked,false);
  assert.equal(detail.checked,false);
  assert.equal(style.checked,false);
  assert.equal(state.enabled('portrait'),false);
  assert.equal(state.enabled('detail'),false);
  assert.equal(state.enabled('style'),false);
});

test('every effect is independently opt-in, and group off cancels all active features',()=>{
  const master=switchControl(),portrait=switchControl(),detail=switchControl(),style=switchControl();
  const events={portrait:0,detail:0,style:0};
  portrait.addEventListener('change',()=>events.portrait++);
  detail.addEventListener('change',()=>events.detail++);
  style.addEventListener('change',()=>events.style++);
  const state=createAiFeatureControls({master,features:{portrait,detail,style}});
  master.toggle();
  portrait.toggle();
  assert.equal(state.enabled('portrait'),true);
  assert.equal(state.enabled('detail'),false);
  assert.equal(state.enabled('style'),false);
  assert.deepEqual(events,{portrait:1,detail:0,style:0});
  detail.toggle();
  style.toggle();
  assert.equal(state.enabled('detail'),true);
  assert.equal(state.enabled('style'),true);
  master.toggle();
  assert.equal(state.enabled('portrait'),false);
  assert.equal(state.enabled('detail'),false);
  assert.equal(state.enabled('style'),false);
  assert.deepEqual(events,{portrait:2,detail:2,style:2});
  assert.equal(portrait.checked,false);
  assert.equal(detail.checked,false);
  assert.equal(style.checked,false);
  assert.equal(portrait.disabled,true);
  master.toggle();
  assert.equal(portrait.checked,false);
  assert.equal(detail.checked,false);
  assert.equal(style.checked,false);
});

test('readiness temporarily locks settings without selecting or clearing effects',()=>{
  let ready=false;
  const master=switchControl(),portrait=switchControl();
  const state=createAiFeatureControls({master,features:{portrait},isAvailable:()=>ready});
  assert.equal(master.disabled,true);
  master.toggle();
  assert.equal(master.checked,false);
  ready=true;state.sync();
  master.toggle();portrait.toggle();
  assert.equal(state.enabled('portrait'),true);
  ready=false;state.sync();
  assert.equal(master.disabled,true);
  assert.equal(portrait.disabled,true);
  assert.equal(portrait.checked,true);
  ready=true;state.sync();
  assert.equal(state.enabled('portrait'),true);
});

test('AI switches share one quality control and have accessible localized copy',()=>{
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../web/styles.css',import.meta.url),'utf8');
  const app=readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
  const portrait=html.indexOf('id="ai-portrait"');
  const detail=html.indexOf('id="ai-detail"');
  const style=html.indexOf('id="ai-style-suggest"');
  const gpu=html.indexOf('id="gpu-acceleration"');
  const sharedModel=html.indexOf('id="depth-model"');
  assert.ok(portrait>=0&&portrait<detail&&detail<style&&style<gpu&&gpu<sharedModel,'One model selector must follow Portrait, Detail, Suggested Styles and GPU');
  assert.equal((html.match(/type="range"[^>]*id="(?:depth|detail)-model"|id="(?:depth|detail)-model"[^>]*type="range"/g)||[]).length,1);
  assert.doesNotMatch(html,/id="detail-model"/);
  assert.match(app,/modelId:selectedAiLevel\(\)/);
  assert.doesNotMatch(app,/detailSelector|selectedDetailModel|renderDetailModel/);
  assert.match(html,/id="ai-detail"[^>]+role="switch"[^>]+aria-describedby="ai-detail-hint"/);
  assert.match(html,/id="ai-style-suggest"[^>]+role="switch"[^>]+aria-describedby="ai-style-suggest-hint"/);
  assert.match(css,/\.ai-settings :is\(\.detail-option, \.style-option, \.gpu-option\)/);
  assert.match(css,/@keyframes ai-settings-in/);
  assert.match(css,/@keyframes ai-settings-out/);
  assert.match(css,/@property --ai-ring-angle/);
  assert.match(css,/\.workspace:has\(\.ai-settings\[open\]\)[\s\S]*animation: ai-ring-spin/);
  assert.match(css,/@keyframes ai-ring-spin/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(app,/aiSettings\.classList\.add\('is-closing'\)/);
  assert.match(css,/:is\(#enhance-ai, #ai-portrait, #ai-detail, #ai-style-suggest, #gpu-acceleration\)/);
  assert.match(app,/features:\{portrait:aiPortrait,detail:aiDetail,style:aiStyleSuggest\}/);
  assert.match(app,/function stagePercent\(/);
  assert.doesNotMatch(app,/progress\.progress\.done}\s*\/\s*\${progress\.progress\.total}|progress\.done}\s*\/\s*\${progress\.total}/);
  for(const lang of ['vi','en','zh']){
    assert.ok(AI_STRINGS[lang].detailToggle);
    assert.ok(AI_STRINGS[lang].detailHint);
    assert.ok(AI_STRINGS[lang].styleToggle);
    assert.ok(AI_STRINGS[lang].styleHint);
  }
});

test('AI model progress distinguishes downloads from cached preparation and names each feature',()=>{
  const app=readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
  const styleWorker=readFileSync(new URL('../../web/src/recommend/style-inference-worker.js',import.meta.url),'utf8');
  const depthWorker=readFileSync(new URL('../../web/src/portrait/ai-inference-worker.js',import.meta.url),'utf8');
  const detailWorker=readFileSync(new URL('../../web/src/detail/detail-worker.js',import.meta.url),'utf8');
  for(const source of [styleWorker,depthWorker,detailWorker]){
    assert.match(source,/progress\.source==='cache'\?'modelCache'/);
    assert.match(source,/progress\.source==='cacheWarning'\?'modelCacheWarning':'modelDownload'/);
  }
  assert.match(detailWorker,/downloadModelBytes\(url\.href/,'Detail models must use the persistent model cache');
  assert.match(app,/modelDownloadStatus\(aiText\(\)\.styleDownloading/);
  assert.match(app,/modelDownloadStatus\(aiText\(\)\.detailDownloading/);
  for(const lang of ['vi','en','zh']){
    assert.ok(AI_STRINGS[lang].styleDownloading.includes('Style')||AI_STRINGS[lang].styleDownloading.includes('风格'));
    assert.ok(AI_STRINGS[lang].detailDownloading);
    assert.ok(AI_STRINGS[lang].modelLoading);
    assert.notEqual(AI_STRINGS[lang].modelLoading,'Preparing AI');
  }
});

test('Adaptive Styles completion guidance explains the required Photos edit commit',()=>{
  assert.match(AI_STRINGS.vi.styleCompletionNotice,/Ảnh → Sửa.*thay đổi nhẹ.*nhấn Xong/);
  assert.match(AI_STRINGS.en.styleCompletionNotice,/Photos → Edit.*small change.*Done/);
  assert.match(AI_STRINGS.zh.styleCompletionNotice,/照片.*编辑.*轻微调整.*完成/);
  for(const lang of ['vi','en','zh']){
    assert.doesNotMatch(AI_STRINGS[lang].styleCompletionNotice,/hiển thị ngay|appear immediately|立即显示/);
  }
});

test('unknown feature lookup rejects invalid names',()=>{
  const state=createAiFeatureControls({master:switchControl(),features:{portrait:switchControl()}});
  assert.throws(()=>state.enabled('missing'),RangeError);
});
