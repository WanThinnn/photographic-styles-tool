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
  assert.match(dock,/position: fixed/);assert.match(dock,/top: calc\(var\(--dock-viewport-bottom,var\(--dock-shell-height,100lvh\)\)/);assert.doesNotMatch(dock,/\n  bottom:/);
  assert.match(layout,/min-height: var\(--tab-height\)/);
  assert.match(layout,/\.app-tabs button \{[^}]*color: var\(--nav-idle\)/s);
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
  assert.match(workspace,/ai-settings-discovery-nudge/);
  assert.doesNotMatch(workspace,/ai-settings-discovery:not\(\[hidden\]\)[^}]*outline: 1px solid var\(--ai-violet\)/s);
  assert.match(controls,/grid-template-columns: minmax\(0,1fr\) minmax\(120px,46%\)/);
  assert.match(controls,/@container/);
});

test('old bright blue is shared and scrollbar hiding does not disable normal scrolling',()=>{
  const tokens=readFileSync(new URL('../../web/styles/foundations/tokens.css',import.meta.url),'utf8');
  const base=readFileSync(new URL('../../web/styles/foundations/base.css',import.meta.url),'utf8');
  assert.match(tokens,/--blue-600: #0894ff/);
  assert.match(base,/scrollbar-width: none/);assert.match(base,/\*::-webkit-scrollbar \{[^}]*display: none/);
  assert.match(base,/html \{[^}]*touch-action: pan-x pan-y/s);
  assert.match(base,/body \{[^}]*touch-action: pan-x pan-y/s);
  assert.doesNotMatch(base,/(?:^|\n)(?:html|body|\*) \{[^}]*overflow: hidden/);
});

test('PWA locks page zoom while keeping native one-finger scrolling',()=>{
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const bootstrap=readFileSync(new URL('../../web/src/ui/page-bootstrap.js',import.meta.url),'utf8');
  const nav=readFileSync(new URL('../../web/styles/components/navigation-effects.css',import.meta.url),'utf8');
  assert.match(html,/name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"/);
  assert.match(bootstrap,/\['gesturestart','gesturechange','gestureend'\]/);
  assert.match(bootstrap,/preventDefault\(\)/);
  assert.match(nav,/\.app-tabs \{[^}]*touch-action: pan-y/s);
  assert.doesNotMatch(nav,/touch-action: pan-y pinch-zoom/);
});


test('standalone shell keeps the intro visible, centers its copy, and anchors the dock from the safe bottom',()=>{
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const i18n=readFileSync(new URL('../../web/src/ui/i18n.js',import.meta.url),'utf8');
  assert.doesNotMatch(layout,/\.has-used-app \.intro/);
  assert.match(layout,/\.intro \{[^}]*text-align: center/s);
  assert.match(layout,/@media\(display-mode:standalone\)[\s\S]*?\.app-dock \{[^}]*position: fixed;[^}]*top: calc\(var\(--dock-viewport-bottom,var\(--dock-shell-height,100lvh\)\)[^}]*transform: translate\(-50%,-100%\)/s);
  assert.match(i18n,/Add Styles, Texture and Grain\.<br>Privately, on your device\./);
  assert.equal([...html.matchAll(/class="icon-button glass-surface"[^>]*><svg/g)].length>=2,true);
});

test('portrait aperture keeps the yellow selector centered while the ruler moves and preserves the initial aperture dot',()=>{
  const css=readFileSync(new URL('../../web/styles/components/portrait-editor.css',import.meta.url),'utf8');
  const js=readFileSync(new URL('../../web/src/portrait/ai-portrait-preview.js',import.meta.url),'utf8');
  assert.match(css,/\.ai-aperture-selection \{[^}]*left: 50%/s);
  assert.match(css,/\.ai-aperture-origin \{/);
  assert.match(js,/className='ai-aperture-origin'/);
  assert.match(js,/ruler\.style\.transform=.*-index\*TICK_SPACING/);
  assert.match(css,/\.ai-aperture-track \{[^}]*touch-action: pan-y/s);
  assert.match(js,/track\.addEventListener\('pointermove'/);
  assert.match(js,/drag\.startIndex-dx\/TICK_SPACING/);
  assert.doesNotMatch(js,/selection\.style\.left/);
});

test('settings follows iOS grouped rows with language navigation, appearance preview and GitHub toolbar action',()=>{
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const sheets=readFileSync(new URL('../../web/styles/components/sheets.css',import.meta.url),'utf8');
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const bootstrap=readFileSync(new URL('../../web/src/ui/page-bootstrap.js',import.meta.url),'utf8');
  assert.match(html,/class="top-github-symbol"/);
  assert.doesNotMatch(html,/class="settings-github icon-button glass-surface"/);
  assert.match(html,/class="settings-nav-row language-row"/);
  assert.match(html,/class="settings-leading-icon settings-icon-blue"/);
  assert.doesNotMatch(sheets,/\.language-row \.settings-leading-icon \{/);
  assert.match(html,/class="settings-leading-icon settings-icon-appearance"/);
  assert.match(sheets,/\.settings-icon-appearance \{[^}]*background: var\(--appearance-icon-bg\)/s);
  assert.match(html,/class="appearance-segment"/);
  assert.match(html,/settings\.defaultsave/);
  assert.match(html,/settings\.keepscreen/);
  assert.match(html,/settings\.originalformat/);
  assert.match(sheets,/\.language-row #lang \{[^}]*appearance: none/s);
  assert.match(sheets,/\.settings-leading-icon/);
  assert.match(layout,/\.top-github-symbol \{[^}]*translateY\(-22px\)/s);
  assert.match(layout,/body\.is-settings-destination \.top-help-symbol \{[^}]*translateY\(22px\)/s);
  assert.match(layout,/body\.is-settings-destination \.top-github-symbol \{[^}]*translateY\(0\)/s);
  assert.match(html,/id="refresh-app"/);
  assert.match(html,/id="version">1\.0\.0</);
  assert.match(bootstrap,/registration\?\.update\?\.\(\)/);
  assert.match(bootstrap,/photographic-style-port-/);
});

test('first-run notice is a single grouped card and appearance controls are interactive and persisted',()=>{
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../../web/styles/layout/workspace.css',import.meta.url),'utf8');
  const bootstrap=readFileSync(new URL('../../web/src/ui/page-bootstrap.js',import.meta.url),'utf8');
  const sheets=readFileSync(new URL('../../web/styles/components/sheets.css',import.meta.url),'utf8');
  const base=readFileSync(new URL('../../web/styles/foundations/base.css',import.meta.url),'utf8');
  assert.match(workspace,/\.photo-format-tip \{[^}]*border: 0;[^}]*border-radius: 18px;[^}]*background: var\(--surface-secondary\)/s);
  assert.match(html,/data-theme-value="light"/);
  assert.match(html,/data-theme-value="system"/);
  assert.match(html,/data-theme-value="dark"/);
  assert.doesNotMatch(html,/data-theme-value="(?:light|system|dark)"[^>]*aria-disabled="true"/);
  assert.match(bootstrap,/stylio-theme-v1/);
  assert.match(bootstrap,/root\.dataset\.theme/);
  assert.match(bootstrap,/theme-transition/);
  assert.match(bootstrap,/animate:true/);
  assert.match(base,/html\.theme-transition body/);
  assert.match(sheets,/\.settings-row-stack/);
  assert.match(html,/id="header-guide" class="icon-button top-guide glass-surface"/);
});
test('semantic icon palette switches with dark mode across settings, guide and photo details',()=>{
  const tokens=readFileSync(new URL('../../web/styles/foundations/tokens.css',import.meta.url),'utf8');
  const sheets=readFileSync(new URL('../../web/styles/components/sheets.css',import.meta.url),'utf8');
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const results=readFileSync(new URL('../../web/styles/components/results.css',import.meta.url),'utf8');
  assert.match(tokens,/@media\(prefers-color-scheme:dark\)[\s\S]*?--icon-blue-a: #2f8fff;[\s\S]*?--appearance-icon-bg: linear-gradient\(145deg,#f2f2f7/s);
  assert.match(tokens,/:root\[data-theme="dark"\][\s\S]*?--icon-detail-green: #30d158;[\s\S]*?--appearance-icon-fg: #111/s);
  assert.match(sheets,/\.settings-icon-blue \{ background: linear-gradient\(155deg,var\(--icon-blue-a\),var\(--icon-blue-b\)\) \}/);
  assert.match(layout,/\.guide-icon-purple \{ background: linear-gradient\(145deg,var\(--icon-purple-a\),var\(--icon-purple-b\)\) \}/);
  assert.match(results,/meta\.camera[^}]*var\(--icon-detail-blue\)/);
  assert.match(results,/meta\.capture[^}]*var\(--icon-detail-green\)/);
});

test('search and sheet surfaces suppress browser-blue focus frames without removing control focus styles globally',()=>{
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const sheets=readFileSync(new URL('../../web/styles/components/sheets.css',import.meta.url),'utf8');
  const base=readFileSync(new URL('../../web/styles/foundations/base.css',import.meta.url),'utf8');
  assert.match(layout,/#history-search:focus,[\s\S]*?#history-search:focus-visible \{[^}]*outline: none;[^}]*box-shadow: none/s);
  assert.match(layout,/\.dock-search-field:has\(#history-search:focus-visible\) \{[^}]*box-shadow: inset 0 0 0 \.5px var\(--glass-outline\)/s);
  assert.match(sheets,/\.sheet:focus,[\s\S]*?\.sheet:focus-visible \{[^}]*outline: none/s);
  assert.match(sheets,/\.language-row #lang:focus,[\s\S]*?\.language-row #lang:focus-visible \{[^}]*outline: none;[^}]*box-shadow: none/s);
  assert.match(sheets,/\.language-row:has\(#lang:focus-visible\) \{[^}]*outline: none;[^}]*box-shadow: inset 0 0 0 \.5px var\(--line\)/s);
  assert.doesNotMatch(sheets,/\.language-row:has\(#lang:focus-visible\) \{[^}]*var\(--focus-ring\)/s);
  assert.match(base,/:focus-visible \{[^}]*outline: 3px solid var\(--focus-ring\)/s);
});
test('sheets close with motion and the full-screen photo header protects the Dynamic Island safe area',()=>{
  const sheets=readFileSync(new URL('../../web/styles/components/sheets.css',import.meta.url),'utf8');
  const results=readFileSync(new URL('../../web/styles/components/results.css',import.meta.url),'utf8');
  assert.match(sheets,/\.sheet\.is-closing \{[^}]*sheet-out/s);
  assert.match(sheets,/@keyframes sheet-out/);
  assert.match(results,/@media\(max-width:767px\)[\s\S]*?\.photo-workspace>\.sheet-header \{[^}]*padding-top: calc\(20px \+ env\(safe-area-inset-top,0px\)\)[^}]*backdrop-filter: none/s);
  assert.match(results,/\.photo-workspace\[open\] \{[^}]*photo-workspace-in/s);
  assert.match(results,/\.photo-workspace:focus,[\s\S]*?\.photo-workspace:focus-visible \{[^}]*outline: none/s);
});

test('photo details and guide use compact icon-led disclosures instead of dense always-visible copy',()=>{
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const results=readFileSync(new URL('../../web/styles/components/results.css',import.meta.url),'utf8');
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const resultView=readFileSync(new URL('../../web/src/ui/results/result-view.js',import.meta.url),'utf8');
  assert.equal([...html.matchAll(/class="guide-card"/g)].length,4);
  assert.equal([...html.matchAll(/class="guide-icon /g)].length,4);
  assert.match(html,/data-i18n="guide\.seemore"/);
  assert.match(html,/data-i18n="guide\.showless"/);
  assert.match(layout,/\.guide-card>summary \{[^}]*grid-template-columns: 38px minmax\(0,1fr\) auto/s);
  assert.match(results,/\.result-meta-row \{[^}]*grid-template-columns: 26px minmax\(0,1fr\)/s);
  assert.match(results,/\.detail-group-title \{/);
  assert.match(results,/\.details-summary-icon,/);
  assert.match(resultView,/details\.processing/);
  assert.match(resultView,/details\.photo/);
  assert.match(resultView,/className='result-meta-icon'/);
  assert.match(resultView,/className='detail-note-icon'/);
  assert.match(resultView,/if\(!text\)\{[\s\S]*?note\?\.remove\(\)/);
  assert.doesNotMatch(resultView,/this\.note\('', 'metadata'\)/);
  assert.doesNotMatch(resultView,/className='result-notice'/);
});

test('photo actions use a compact liquid-glass capsule that expands on interaction and collapses on scroll',()=>{
  const results=readFileSync(new URL('../../web/styles/components/results.css',import.meta.url),'utf8');
  const materials=readFileSync(new URL('../../web/styles/components/materials.css',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../../web/src/ui/shell/app-shell.js',import.meta.url),'utf8');
  const action=results.match(/\.photo-workspace \.act \{([^}]+)\}/)[1];
  assert.match(action,/bottom: max\(18px/);
  assert.match(action,/width: min\(440px,calc\(100% - 88px\)\)/);
  assert.match(action,/border-radius: 24px/);
  assert.match(results,/\.photo-workspace \.act\.is-expanded \{[^}]*width: min\(720px,calc\(100% - 32px\)\)[^}]*border-radius: 28px/s);
  assert.match(shell,/actions\?\.addEventListener\('pointerdown',expandActions/);
  assert.match(shell,/photo\.addEventListener\('scroll',collapseActions/);
  assert.doesNotMatch(action,/border-top:/);
  assert.match(materials,/\.glass-surface,\.photo-workspace \.act/);
  assert.match(materials,/\.photo-workspace \.act \{ --glass-blur: 20px; --glass-opacity: \.58 \}/);
});
test('tab glass expands outside the platter, keeps badges optically anchored, and uses heavier symbol weights',()=>{
  const css=readFileSync(new URL('../../web/styles/components/navigation-effects.css',import.meta.url),'utf8');
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const materials=readFileSync(new URL('../../web/styles/components/materials.css',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../../web/styles/layout/workspace.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  assert.match(css,/\.app-tabs\.is-pressing::before/);
  assert.match(css,/scale: 1\.15 1\.4/);
  assert.match(css,/\.app-tabs \{[^}]*overflow: visible;[^}]*contain: layout style/s);
  assert.match(css,/touch-action: pan-y/);
  assert.match(layout,/transform: translate3d\(var\(--lens-offset,calc\(var\(--tab-index,0\) \* 100%\)\),0,0\)/);
  assert.match(css,/\.app-tabs\.is-dragging::before/);
  assert.match(css,/contain: paint/);
  assert.match(layout,/\.tab-icon-wrap \{[^}]*position: relative/s);
  assert.match(layout,/\.tab-count \{[^}]*top: -7px;[^}]*right: -10px/s);
  assert.match(html,/class="tab-icon-wrap"[^>]*>[\s\S]*?id="history-count" class="tab-count"/);
  assert.match(layout,/\.app-tabs svg \{[^}]*stroke-width: 2\.05/s);
  assert.match(materials,/\.app-tabs button\[aria-current="page"\] svg \{ stroke-width: 2\.35 \}/);
  assert.match(materials,/\.dock-search svg \{ stroke-width: 2\.15/);
  assert.match(workspace,/\.ai-discovery-pill \{[^}]*rgb\(var\(--glass-rgb\) \/ \.42\)/s);
  assert.match(workspace,/#ai-settings-discovery-copy \{[^}]*background: var\(--gradient\)/s);
  assert.match(workspace,/ai-discovery-spring/);
  assert.match(workspace,/@media\(max-width:767px\)[\s\S]*?\.ai-discovery-arrow \{[^}]*display: none/s);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/prefers-reduced-transparency:reduce/);
  assert.match(css,/forced-colors:active/);
  assert.doesNotMatch(css,/(?:^|\n)\s*(?:-webkit-)?backdrop-filter:/);
});
