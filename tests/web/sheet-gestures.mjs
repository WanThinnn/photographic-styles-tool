import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSheetDismissGesture} from '../../web/src/ui/shell/sheet-gestures.js';

function harness(){
  const sheet=new EventTarget(),handle=new EventTarget(),win=new EventTarget();
  const classes=new Set(),styles=new Map();let time=0,frame=null,closed=0;
  sheet.open=true;sheet.querySelectorAll=()=>[handle];
  sheet.classList={contains:key=>classes.has(key),add:key=>classes.add(key),remove:key=>classes.delete(key)};
  sheet.style={setProperty:(key,value)=>styles.set(key,value),removeProperty:key=>styles.delete(key)};
  sheet.getBoundingClientRect=()=>({height:700});sheet.setPointerCapture=()=>{};sheet.releasePointerCapture=()=>{};
  win.PointerEvent=class{};win.performance={now:()=>time};
  win.requestAnimationFrame=fn=>{frame=fn;return 1;};win.cancelAnimationFrame=()=>{frame=null;};
  const dispose=bindSheetDismissGesture({sheet,win,close:()=>{closed++;sheet.open=false;sheet.dispatchEvent(new Event('close'));}});
  const fire=(type,{x=100,y=100,ms=0,id=1,interactive=false}={})=>{
    time=ms;
    const event=new Event(type);Object.assign(event,{clientX:x,clientY:y,pointerId:id,button:0,isPrimary:true});
    Object.defineProperty(event,'target',{value:{closest:()=>interactive?{}:null}});
    (type==='pointerdown'?handle:sheet).dispatchEvent(event);
  };
  return {sheet,handle,win,styles,classes,fire,dispose,closed:()=>closed,flush(){const fn=frame;frame=null;fn?.();}};
}

test('sheet header drag coalesces movement and a downward swipe dismisses once',()=>{
  const h=harness();h.fire('pointerdown');h.fire('pointermove',{y:140,ms:50});h.fire('pointermove',{y:180,ms:100});h.flush();
  assert.equal(h.styles.get('--sheet-drag-y'),'80px');assert.equal(h.classes.has('is-dragging'),true);
  h.fire('pointerup',{y:180,ms:110});h.fire('pointerup',{y:180,ms:120});
  assert.equal(h.closed(),1);assert.equal(h.styles.has('--sheet-drag-y'),false);h.dispose();
});

test('short, upward, horizontal and cancelled drags keep the sheet open',()=>{
  for(const [type,point]of [['pointerup',{y:120,ms:200}],['pointerup',{y:70,ms:100}],['pointerup',{x:160,y:115,ms:100}],['pointercancel',{y:210,ms:100}]]){
    const h=harness();h.fire('pointerdown');h.fire('pointermove',point);h.flush();h.fire(type,point);
    assert.equal(h.closed(),0);assert.equal(h.styles.has('--sheet-drag-y'),false);assert.equal(h.classes.has('is-dragging'),false);h.dispose();
  }
});

test('sheet controls, unrelated pointers and teardown cannot accidentally dismiss it',()=>{
  const h=harness();h.fire('pointerdown',{interactive:true});h.fire('pointerup',{y:240,ms:80});assert.equal(h.closed(),0);
  h.fire('pointerdown');h.fire('pointerup',{id:2,y:240,ms:100});assert.equal(h.closed(),0);
  h.win.dispatchEvent(new Event('pagehide'));h.dispose();h.fire('pointerdown');h.fire('pointerup',{y:240,ms:150});
  assert.equal(h.closed(),0);assert.equal(h.styles.has('--sheet-drag-y'),false);
});
