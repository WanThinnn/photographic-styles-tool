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
test('AI summary keeps the switch beside its label while pinning Settings to the trailing edge',()=>{
  const workspace=readFileSync(new URL('../../web/styles/layout/workspace.css',import.meta.url),'utf8');
  const controls=readFileSync(new URL('../../web/styles/components/controls.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  assert.match(workspace,/\.depth-options>\.ai-summary \{[^}]*display: flex;[^}]*gap: 10px/s);
  assert.match(workspace,/\.depth-options>\.ai-summary>\.ai-settings-trigger \{[^}]*margin-left: auto/s);
  assert.doesNotMatch(workspace,/\.ai-settings-trigger \{[^}]*position: absolute/);
  assert.match(workspace,/ai-settings-discovery-nudge/);
  assert.match(html,/id="enhance-ai"[^>]*>[\s\S]*?id="ai-settings-discovery"[\s\S]*?id="open-ai-settings"/);
  assert.match(workspace,/\.depth-options>\.ai-summary>\.ai-settings-discovery:not\(\[hidden\]\)\+\.ai-settings-trigger \{[^}]*margin-left: 0/s);
  assert.doesNotMatch(workspace,/ai-settings-discovery:not\(\[hidden\]\)[^}]*outline: 1px solid var\(--ai-violet\)/s);
  assert.match(controls,/grid-template-columns: 34px minmax\(0,1fr\) minmax\(132px,42%\)/);
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
  assert.match(i18n,/Portrait Lighting, Styles, Texture and Grain\.<br>Privately, on your device\./);
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

test('process header and Smart Enhance controls use a tighter native grouping',()=>{
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../../web/styles/layout/workspace.css',import.meta.url),'utf8');
  assert.match(layout,/\.app-logo \{[^}]*width: 36px;[^}]*height: 36px/s);
  assert.match(layout,/h1 \{[^}]*font-size: 1\.25rem;[^}]*font-weight: 700/s);
  assert.match(workspace,/\.depth-options>\.ai-summary \{[^}]*display: flex;[^}]*align-items: center/s);
  assert.match(workspace,/\.depth-options>\.ai-summary>\.ai-settings-trigger \{[^}]*margin-left: auto/s);
});

test('Portrait preview uses an Apple-like control strip with Photos info, toggle and reset',()=>{
  const css=readFileSync(new URL('../../web/styles/components/portrait-editor.css',import.meta.url),'utf8');
  const js=readFileSync(new URL('../../web/src/portrait/ai-portrait-preview.js',import.meta.url),'utf8');
  const strings=readFileSync(new URL('../../web/src/ui/ai-strings.js',import.meta.url),'utf8');
  assert.match(css,/\.ai-preview-toolbar \{[^}]*grid-template-columns: 1fr auto 1fr/s);
  assert.match(css,/\.ai-photo-mode\[aria-pressed="true"\] \{[^}]*#d3a300/s);
  assert.match(css,/\.ai-preview-actions \{[^}]*justify-self: end/s);
  assert.match(css,/\.ai-portrait-toggle \{[^}]*border-radius: var\(--capsule-radius\);[^}]*background: linear-gradient\(180deg,#ffdf62/s);
  assert.match(css,/\.ai-portrait-toggle\[aria-pressed="false"\] \{[^}]*color: var\(--muted\)/s);
  assert.match(css,/\.result-details \+ \.ai-details \{[^}]*margin-top: -8px/s);
  assert.match(js,/className='ai-photos-controls'/);
  assert.match(js,/className='ai-photo-mode'/);
  assert.match(js,/className='ai-center-focus'/);
  assert.match(js,/className='ai-preview-actions'/);
  assert.match(js,/className='ai-portrait-toggle'/);
  assert.match(js,/portraitToggle\.setAttribute\('aria-pressed',String\(enabled\)\)/);
  assert.match(js,/photosInfo\.hidden=!lighting/);
  assert.match(js,/blur\.disabled=!enabled/);
  assert.match(strings,/"photosEdit": "Aperture and lighting"/);
  assert.match(strings,/"lighting": "Portrait Lighting"/);
  assert.match(strings,/"centreFocus": "Centre focus"/);
  assert.match(strings,/"photosEditHint": "After saving, open the photo in Photos/);
});

test('AI Settings model row preserves its icon column and reflows the slider on narrow sheets',()=>{
  const controls=readFileSync(new URL('../../web/styles/components/controls.css',import.meta.url),'utf8');
  assert.match(controls,/\.depth-model-row \{[^}]*grid-template-columns: 34px minmax\(0,1fr\) minmax\(132px,42%\)/s);
  assert.match(controls,/\.depth-model-row>\.ai-option-icon \{[^}]*grid-column: 1;[^}]*grid-row: 1/s);
  assert.match(controls,/@container \(max-width: 22rem\) \{[\s\S]*?\.depth-model-control \{ grid-column: 2; grid-row: 2; width: 100% \}/s);
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
  assert.match(html,/id="result-preview"/);
  assert.match(html,/settings\.resultpreviewhint/);
  assert.match(html,/settings\.originalformat/);
  assert.equal([...html.matchAll(/class="ai-option-icon /g)].length,5);
  assert.match(html,/settings-icon-github/);
  assert.match(html,/class="ai-depth-focus-symbol"/);
  assert.match(sheets,/\.settings-about \.settings-nav-row:has\(\.settings-leading-icon\) \.settings-chevron \{[^}]*grid-column: 4/s);
  assert.match(sheets,/\.settings-chevron \{[^}]*justify-self: end/s);
  assert.match(sheets,/\.language-row #lang \{[^}]*appearance: none/s);
  assert.match(sheets,/\.settings-leading-icon/);
  assert.match(layout,/\.top-github-symbol \{[^}]*translateY\(-22px\)/s);
  assert.match(layout,/body\.is-settings-destination \.top-help-symbol \{[^}]*translateY\(22px\)/s);
  assert.match(layout,/body\.is-settings-destination \.top-github-symbol \{[^}]*translateY\(0\)/s);
  assert.match(html,/id="refresh-app"/);
  assert.match(html,/id="version">1\.0\.0</);
  assert.match(bootstrap,/registration\?\.update\?\.\(\)/);
  assert.match(bootstrap,/stylio-result-preview-v1/);
  assert.match(bootstrap,/photographic-style-port-/);
});

test('first-run notice is a single grouped card and appearance controls are interactive and persisted',()=>{
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../../web/styles/layout/workspace.css',import.meta.url),'utf8');
  const bootstrap=readFileSync(new URL('../../web/src/ui/page-bootstrap.js',import.meta.url),'utf8');
  const sheets=readFileSync(new URL('../../web/styles/components/sheets.css',import.meta.url),'utf8');
  const base=readFileSync(new URL('../../web/styles/foundations/base.css',import.meta.url),'utf8');
  const shellLayout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  assert.match(workspace,/\.photo-format-tip \{[^}]*grid-template-columns: 17px minmax\(0,1fr\) auto;[^}]*border-radius: 16px;[^}]*background: var\(--surface-secondary\)/s);
  assert.match(workspace,/\.photo-format-tip button \{[^}]*grid-column: 3;[^}]*min-height: 44px/s);
  assert.match(html,/data-theme-value="light"/);
  assert.match(html,/data-theme-value="system"/);
  assert.match(html,/data-theme-value="dark"/);
  assert.doesNotMatch(html,/data-theme-value="(?:light|system|dark)"[^>]*aria-disabled="true"/);
  assert.match(bootstrap,/stylio-theme-v1/);
  assert.match(bootstrap,/root\.dataset\.theme/);
  assert.match(bootstrap,/theme-transition/);
  assert.match(bootstrap,/animate:true/);
  assert.match(base,/html\.theme-transition body/);
  assert.match(shellLayout,/#boot \{[^}]*background: linear-gradient\(100deg,var\(--ai-blue\),var\(--ai-violet\)/s);
  assert.match(shellLayout,/@keyframes boot-soft-pulse/);
  assert.match(sheets,/\.settings-row-stack/);
  assert.match(html,/id="header-guide" class="icon-button top-guide glass-surface"/);
});
test('semantic icon palette switches internal app icons to dark material without changing install icons',()=>{
  const tokens=readFileSync(new URL('../../web/styles/foundations/tokens.css',import.meta.url),'utf8');
  const sheets=readFileSync(new URL('../../web/styles/components/sheets.css',import.meta.url),'utf8');
  const layout=readFileSync(new URL('../../web/styles/layout/app-shell.css',import.meta.url),'utf8');
  const results=readFileSync(new URL('../../web/styles/components/results.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  const manifest=readFileSync(new URL('../../web/manifest.webmanifest',import.meta.url),'utf8');
  assert.match(tokens,/@media\(prefers-color-scheme:dark\)[\s\S]*?--icon-blue-bg: var\(--icon-dark-tile\);[\s\S]*?--icon-blue-fg: #0a84ff/s);
  assert.match(tokens,/:root\[data-theme="dark"\][\s\S]*?--appearance-icon-bg: var\(--icon-dark-tile\);[\s\S]*?--appearance-icon-fg: #f5f5f7/s);
  assert.match(tokens,/:root\[data-theme="dark"\][\s\S]*?--icon-green-bg: var\(--icon-dark-tile\)/s);
  assert.match(sheets,/\.settings-icon-blue \{ background: var\(--icon-blue-bg\); color: var\(--icon-blue-fg\) \}/);
  assert.match(layout,/\.guide-icon-purple \{ background: var\(--icon-purple-bg\); color: var\(--icon-purple-fg\) \}/);
  assert.match(layout,/\.logo-dark \{ opacity: 0 \}/);
  assert.match(layout,/:root\[data-theme="dark"\] \.logo-dark \{ opacity: 1 \}/);
  assert.match(html,/photographic-styles-dark\.svg/);
  assert.match(manifest,/icons\/icon-192-v2\.png/);
  assert.match(manifest,/icons\/icon-512-v2\.png/);
  assert.doesNotMatch(manifest,/dark/i);
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
test('sheets and photo workspace close with motion while the photo header protects the Dynamic Island safe area',()=>{
  const sheets=readFileSync(new URL('../../web/styles/components/sheets.css',import.meta.url),'utf8');
  const results=readFileSync(new URL('../../web/styles/components/results.css',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../../web/src/ui/shell/app-shell.js',import.meta.url),'utf8');
  assert.match(sheets,/\.sheet\.is-closing \{[^}]*sheet-out/s);
  assert.match(sheets,/@keyframes sheet-out/);
  assert.match(results,/@media\(max-width:767px\)[\s\S]*?\.photo-workspace>\.sheet-header \{[^}]*padding-top: calc\(20px \+ env\(safe-area-inset-top,0px\)\)[^}]*backdrop-filter: none/s);
  assert.match(results,/\.photo-workspace\[open\] \{[^}]*photo-workspace-in/s);
  assert.match(results,/\.photo-workspace\.is-closing \{[^}]*photo-workspace-out/s);
  assert.match(shell,/photo\.classList\.add\('is-closing'\)/);
  assert.match(shell,/photoClosingTimer=later\(finish,180\)/);
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
  assert.match(layout,/\.guide-card-body \{[^}]*padding: 0 16px 16px;[^}]*border-top/s);
  assert.doesNotMatch(layout,/\.guide-card-body \{[^}]*66px/s);
  assert.match(results,/\.result-meta-row \{[^}]*grid-template-columns: 26px minmax\(0,1fr\)/s);
  assert.match(results,/\.detail-group-title \{/);
  assert.match(results,/\.details-summary-icon,/);
  assert.match(resultView,/details\.processing/);
  assert.match(resultView,/details\.photo/);
  assert.match(resultView,/className='result-meta-icon'/);
  assert.match(resultView,/className='detail-note-icon'/);
  assert.match(resultView,/presentation\?\.quickActions/);
  assert.match(resultView,/kind:'share'/);
  assert.match(resultView,/kind:'download'/);
  assert.match(resultView,/kind:'delete'/);
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
  assert.match(action,/width: min\(380px,calc\(100% - 112px\)\)/);
  assert.match(action,/border-radius: 22px/);
  assert.match(results,/\.photo-workspace \.act\.is-expanded \{[^}]*width: min\(660px,calc\(100% - 32px\)\)[^}]*border-radius: 26px/s);
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
  const tokens=readFileSync(new URL('../../web/styles/foundations/tokens.css',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../../web/src/ui/shell/app-shell.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  assert.match(css,/\.app-tabs\.is-pressing::before/);
  assert.match(css,/scale: 1\.15 1\.4/);
  assert.match(css,/transition: transform 360ms var\(--spring-ease\)/);
  assert.match(css,/\.app-tabs\.is-pressing::before \{[^}]*transition: transform 320ms var\(--spring-ease\)/s);
  assert.match(css,/var\(--selection-active-fill\)/);
  assert.match(css,/\.app-tabs \{[^}]*overflow: visible;[^}]*contain: layout style/s);
  assert.match(tokens,/:root\[data-theme="dark"\][\s\S]*?--selection-fill: #0000005c;[\s\S]*?--selection-active-fill: #08080bd9/s);
  assert.match(shell,/--tab-rest-offset/);
  assert.match(css,/touch-action: pan-y/);
  assert.match(layout,/transform: translate3d\(var\(--lens-offset,var\(--tab-rest-offset,calc\(var\(--tab-index,0\) \* 100%\)\)\),0,0\)/);
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
  assert.match(workspace,/@media\(max-width:767px\)[\s\S]*?\.ai-settings-discovery \{[^}]*display: none!important/s);
  assert.match(workspace,/\.ai-settings-trigger::before \{[^}]*conic-gradient\([^}]*var\(--ai-blue\)[^}]*var\(--ai-violet\)[^}]*var\(--ai-coral\)/s);
  assert.match(workspace,/ai-settings-ring-spin/);
  assert.match(workspace,/prefers-reduced-motion:reduce[\s\S]*?\.ai-settings-trigger::before,[\s\S]*?animation: none/s);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/prefers-reduced-transparency:reduce/);
  assert.match(css,/forced-colors:active/);
  assert.doesNotMatch(css,/(?:^|\n)\s*(?:-webkit-)?backdrop-filter:/);
});
