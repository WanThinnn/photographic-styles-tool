import {readFileSync} from 'node:fs';

// Existing source-contract checks span the responsibilities formerly in app.js.
// Keep imports as written so path regressions are not hidden by this helper.
export function readApplicationSource(){
  return [
    'src/app/application.js',
    'src/app/processing/photo-analysis.js',
    'src/app/processing/file-processor.js',
    'src/app/processing/portrait-controller.js',
    'src/ui/results/result-view.js',
    'src/media/live-photo-session.js',
  ].map(relative=>readFileSync(new URL('../../../web/'+relative,import.meta.url),'utf8')).join('\n');
}
