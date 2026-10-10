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
  const master=switchControl(),portrait=switchControl(),detail=switchControl();
  const state=createAiFeatureControls({master,features:{portrait,detail}});
  assert.equal(portrait.disabled,true);
  master.toggle();
  assert.equal(master.checked,true);
  assert.equal(portrait.disabled,false);
  assert.equal(detail.disabled,false);
  assert.equal(portrait.checked,false);
  assert.equal(detail.checked,false);
  assert.equal(state.enabled('portrait'),false);
  assert.equal(state.enabled('detail'),false);
});

test('every effect is independently opt-in, and group off cancels all active features',()=>{
  const master=switchControl(),portrait=switchControl(),detail=switchControl();
  const events={portrait:0,detail:0};
  portrait.addEventListener('change',()=>events.portrait++);
  detail.addEventListener('change',()=>events.detail++);
  const state=createAiFeatureControls({master,features:{portrait,detail}});
  master.toggle();
  portrait.toggle();
  assert.equal(state.enabled('portrait'),true);
  assert.equal(state.enabled('detail'),false);
  assert.deepEqual(events,{portrait:1,detail:0});
  detail.toggle();
  assert.equal(state.enabled('detail'),true);
  master.toggle();
  assert.equal(state.enabled('portrait'),false);
  assert.equal(state.enabled('detail'),false);
  assert.deepEqual(events,{portrait:2,detail:2});
  assert.equal(portrait.checked,false);
  assert.equal(detail.checked,false);
  assert.equal(portrait.disabled,true);
  master.toggle();
  assert.equal(portrait.checked,false);
  assert.equal(detail.checked,false);
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

test('Detail switch matches the existing settings layout and has accessible localized copy',()=>{
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../web/styles.css',import.meta.url),'utf8');
  const app=readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
  const portrait=html.indexOf('id="ai-portrait"');
  const detail=html.indexOf('id="ai-detail"');
  const gpu=html.indexOf('id="gpu-acceleration"');
  const sharedModel=html.indexOf('id="depth-model"');
  assert.ok(portrait>=0&&portrait<detail&&detail<gpu&&gpu<sharedModel,'One model selector must follow Portrait, Detail and GPU');
  assert.equal((html.match(/type="range"[^>]*id="(?:depth|detail)-model"|id="(?:depth|detail)-model"[^>]*type="range"/g)||[]).length,1);
  assert.doesNotMatch(html,/id="detail-model"/);
  assert.match(app,/modelId:selectedModel\(\)/);
  assert.doesNotMatch(app,/detailSelector|selectedDetailModel|renderDetailModel/);
  assert.match(html,/id="ai-detail"[^>]+role="switch"[^>]+aria-describedby="ai-detail-hint"/);
  assert.match(css,/\.ai-settings :is\(\.detail-option, \.gpu-option\)/);
  assert.match(css,/:is\(#enhance-ai, #ai-portrait, #ai-detail, #gpu-acceleration\)/);
  assert.match(app,/features:\{portrait:aiPortrait,detail:aiDetail\}/);
  for(const lang of ['vi','en','zh']){
    assert.ok(AI_STRINGS[lang].detailToggle);
    assert.ok(AI_STRINGS[lang].detailHint);
  }
});

test('unknown feature lookup rejects invalid names',()=>{
  const state=createAiFeatureControls({master:switchControl(),features:{portrait:switchControl()}});
  assert.throws(()=>state.enabled('missing'),RangeError);
});
