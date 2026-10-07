// Decode a browser-exported HEIC with the real libheif bundle for pixel comparison.
// Cache populated by: node tests/web/libheif-api.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const [input, output] = process.argv.slice(2);
assert.ok(input && output, 'usage: node tests/web/raster-decode.mjs INPUT.HEIC OUTPUT.rgba');
const quiet = () => {};
const context = vm.createContext({console:{log:quiet,error:quiet,warn:quiet,info:quiet,debug:quiet},
  TextDecoder,TextEncoder,performance,setTimeout,clearTimeout,fetch});
context.window=context; context.self=context; context.globalThis=context;
vm.runInContext(fs.readFileSync(new URL('./.cache/libheif.js',import.meta.url),'utf8'),context);
const factory = context.libheif;
let heif = typeof factory === 'function' ? factory() : factory;
if(heif?.then) heif=await heif;
if(heif.ready?.then) await heif.ready;
const source = fs.readFileSync(input);
const bytes=vm.runInContext(`new Uint8Array(${source.length})`,context); bytes.set(source);
const decoder=new heif.HeifDecoder();
const images=decoder.decode(bytes);
assert.ok(images.length>0,'HEIC must decode');
try {
  const image=images[0], width=image.get_width(), height=image.get_height();
  const rgba=vm.runInContext('({})',context);
  rgba.width=width;rgba.height=height;
  rgba.data=vm.runInContext(`new Uint8ClampedArray(${width*height*4})`,context);
  const result=await new Promise((resolve,reject)=>image.display(rgba,
    value=>value?resolve(value):reject(Error('HEIC display failed'))));
  fs.writeFileSync(output,Buffer.from(result.data));
  console.log(JSON.stringify({width,height,rgba:output}));
} finally {for(const image of images) image.free?.();}
