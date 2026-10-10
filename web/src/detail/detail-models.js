// Curated families; assets are loaded ONLY if a matching verified local model
// has been packaged at vendor/ai-detail/assets.json. No implicit fake AI fallback.
// Model families require different training objectives; labels indicate resource tiers,
// NOT guaranteed image-quality rankings.
export const DETAIL_MODELS = Object.freeze({
  lite: Object.freeze({label:'Lite',family:'1x SuperScale SPAN',tile:384,overlap:16,webgpuWorkers:2}),
  standard: Object.freeze({label:'Standard',family:'1x SuperScale RPLKSR-S',tile:256,overlap:24,webgpuWorkers:4}),
  pro: Object.freeze({label:'Pro',family:'1x Fatality DeBlur',tile:256,overlap:32,webgpuWorkers:1}),
});
export const DETAIL_DEFAULT='standard';
export function detailModel(id=DETAIL_DEFAULT){
  if(!Object.hasOwn(DETAIL_MODELS,id))throw new RangeError('Unsupported detail model');
  return DETAIL_MODELS[id];
}
/** Trusted manifest contract, validated before loading an ONNX network. */
export function validateDetailAsset(config){
  if(!config||typeof config!=='object'||!['span','rplksr','fatality-deblur'].includes(config.family)
    ||!Number.isInteger(config.bytes)||config.bytes<100
    ||!/^[a-f0-9]{64}$/.test(config.sha256||'')
    ||!/^[-\w.]+\.onnx$/.test(config.file||''))throw Error('Invalid AI detail asset manifest');
  if(config.channels!==3||config.layout!=='rgb'||config.output!=='rgb')throw Error('Unsupported ONNX detail model layout');
  return config;
}
