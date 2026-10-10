import test from 'node:test';
import assert from 'node:assert/strict';
import {sharpBackgroundEvidence} from '../../web/src/portrait/native-base-analysis.js';

function scene({background=false,noise=false,isolated=false}={}){
  const width=768,height=1024,rgb=new Uint8Array(width*height*3),depth=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const tx=Math.floor(x/128),ty=Math.floor(y/128),far=tx<2;
    const textured=far?(background&&((ty===0&&tx<=1)||(ty===7&&tx===0))):true;
    const detail=textured&&(!isolated||tx===0&&ty===0);
    const v=detail?noise?((x+y)%2?230:20):128+70*Math.sin(x*Math.PI/4)*Math.sin(y*Math.PI/4):128+x/width*10;
    const i=y*width+x;rgb.fill(Math.round(v),i*3,i*3+3);depth[i]=far?60:200;
  }
  return [rgb,width,height,depth,width,height];
}
test('separated sharp background detail permits native depth restoration; foreground alone does not',()=>{
  assert.equal(sharpBackgroundEvidence(...scene()),null);
  const evidence=sharpBackgroundEvidence(...scene({background:true}));
  assert.equal(evidence.method,'native-background-detail-v1');
  assert.ok(evidence.detailedTiles>=3);
});
test('noise, isolated edges, flat depth and insufficient samples do not establish a sharp base',()=>{
  assert.equal(sharpBackgroundEvidence(...scene({background:true,noise:true})),null);
  assert.equal(sharpBackgroundEvidence(...scene({background:true,isolated:true})),null);
  const flat=scene({background:true});flat[3].fill(128);
  assert.equal(sharpBackgroundEvidence(...flat),null);
  const empty=scene({background:true});for(let i=0;i<empty[3].length;i++)if(empty[3][i]===60)empty[3][i]=0;
  assert.equal(sharpBackgroundEvidence(...empty),null);
  assert.equal(sharpBackgroundEvidence(new Uint8Array(3),1,1,new Uint8Array(1),1,1),null);
});
