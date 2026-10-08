// Disk sampling rejects nearer pixels when blurring the background, avoiding
// foreground colour bleeding. No dependency on Safari canvas.filter support.
const taps=Array.from({length:48},(_,i)=>{
  const r=Math.sqrt((i+.5)/48),a=i*2.399963229728653;
  return [r*Math.cos(a),r*Math.sin(a)];
});
export function renderDepthBlur(rgba,gray,width,height,focus,radius) {
  if(rgba.length!==width*height*4||gray.length!==width*height)throw Error('Blur geometry mismatch');
  radius=Math.max(0,Math.min(20,Number(radius)));
  const pixels=new Uint8ClampedArray(rgba);
  if(!radius)return pixels;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,depth=gray[i],distance=Math.max(0,focus-depth-12)/120;
    const localRadius=radius*Math.min(1,distance);
    if(localRadius<.5)continue;
    let red=rgba[i*4],green=rgba[i*4+1],blue=rgba[i*4+2],weight=1;
    for(const [dx,dy] of taps){
      const sx=Math.max(0,Math.min(width-1,Math.round(x+dx*localRadius)));
      const sy=Math.max(0,Math.min(height-1,Math.round(y+dy*localRadius))),j=sy*width+sx;
      const difference=gray[j]-depth;
      if(difference>24)continue;
      const contribution=Math.max(0,1-Math.max(0,difference)/24);
      red+=rgba[j*4]*contribution;green+=rgba[j*4+1]*contribution;blue+=rgba[j*4+2]*contribution;weight+=contribution;
    }
    pixels[i*4]=red/weight;pixels[i*4+1]=green/weight;pixels[i*4+2]=blue/weight;
  }
  return pixels;
}
