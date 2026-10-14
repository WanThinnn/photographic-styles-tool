import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const entry=new URL('../../web/styles.css',import.meta.url);
const css=readFileSync(entry,'utf8');
const paths=[...css.matchAll(/@import url\("([^"]+)"\);/g)].map(match=>match[1]);
const worker=readFileSync(new URL('../../web/sw.js',import.meta.url),'utf8');
test('flat CSS entry is small, ordered, locally resolvable and available on cold offline boot',()=>{
  assert.equal(paths.length,10);assert.ok(css.split('\n').length<15);
  assert.match(paths[0],/foundations\/tokens/);assert.match(paths[1],/foundations\/base/);
  const boot=worker.match(/const BOOT_SHELL=(.*);/)[1];
  for(const path of paths){
    const imported=readFileSync(new URL(path,entry),'utf8');
    assert.doesNotMatch(imported,/@import/,'no extra import waterfall');
    assert.ok(boot.includes(path),'cold shell must cache '+path);
  }
});
test('preview styles preserve full image geometry, and shell uses safe areas and reduced motion',()=>{
  const all=paths.map(path=>readFileSync(new URL(path,entry),'utf8')).join('\n');
  assert.match(all,/safe-area-inset-top/);assert.match(all,/safe-area-inset-bottom/);
  assert.match(all,/prefers-reduced-motion/);
  assert.doesNotMatch(all,/ai-ring-spin|target-bounce/);
  assert.doesNotMatch(all,/\.ai-preview\s*\{[^}]*object-fit:\s*cover/);
  assert.doesNotMatch(all,/\.ai-preview\s*\{[^}]*filter:/);
});

test('four-tab floating dock has a separate search action and material fallbacks',()=>{
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const material=readFileSync(new URL('../../web/styles/components/materials.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const dock=layout.match(/\.app-dock \{([^}]+)\}/)[1];
  assert.match(dock,/position: fixed/);assert.match(dock,/top: calc\(var\(--dock-viewport-bottom,100dvh\)/);assert.doesNotMatch(dock,/\n  bottom:/);
  assert.match(layout,/min-height: var\(--tab-height\)/);
  assert.match(material,/prefers-reduced-transparency:reduce/);assert.match(material,/prefers-contrast:more/);
  assert.match(material,/prefers-reduced-motion:reduce/);assert.match(material,/forced-colors:active/);
  assert.equal([...html.matchAll(/data-screen="/g)].length,4);
  assert.match(html,/id="settings-screen" class="app-screen/);
  assert.doesNotMatch(html,/<dialog id="app-settings"/);
  assert.match(html,/id="history-search" type="search"/);
  assert.match(material,/inset 0 1px 2px/);
});
test('AI summary is centered in a single grid and model range stays beside its label',()=>{
  const workspace=readFileSync(new URL('../../web/styles/layout/workspace.css',import.meta.url),'utf8');
  const controls=readFileSync(new URL('../../web/styles/components/controls.css',import.meta.url),'utf8');
  assert.match(workspace,/grid-template-columns: minmax\(0,1fr\) 63px 44px/);
  assert.doesNotMatch(workspace,/\.ai-settings-trigger \{[^}]*position: absolute/);
  assert.match(controls,/grid-template-columns: minmax\(0,1fr\) minmax\(120px,46%\)/);
  assert.match(controls,/@container/);
});

test('old bright blue is shared and scrollbar hiding does not disable normal scrolling',()=>{
  const tokens=readFileSync(new URL('../../web/styles/foundations/tokens.css',import.meta.url),'utf8');
  const base=readFileSync(new URL('../../web/styles/foundations/base.css',import.meta.url),'utf8');
  assert.match(tokens,/--blue-600: #0894ff/);
  assert.match(base,/scrollbar-width: none/);assert.match(base,/\*::-webkit-scrollbar \{[^}]*display: none/);
  assert.doesNotMatch(base,/(?:^|\n)(?:html|body|\*) \{[^}]*overflow: hidden/);
});

test('tab glass has a pressed lens without nested backdrop filters and preserves accessibility fallbacks',()=>{
  const css=readFileSync(new URL('../../web/styles/components/navigation-effects.css',import.meta.url),'utf8');
  assert.match(css,/\.app-tabs\.is-pressing::before/);
  assert.match(css,/scale: 1\.12 1\.36/);
  assert.match(css,/touch-action: pan-y pinch-zoom/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/prefers-reduced-transparency:reduce/);
  assert.match(css,/forced-colors:active/);
  assert.doesNotMatch(css,/(?:^|\n)\s*(?:-webkit-)?backdrop-filter:/);
});
