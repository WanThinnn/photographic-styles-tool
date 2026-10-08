import {aiSourceCanvas} from './ai-portrait-source.js';
import {renderBokeh} from './ai-bokeh.js';
import {importRaster,targetGeometry} from './raster/raster-import.js';
import {discoverHeic,extractItem} from './heif.js';
import {developedPngExif} from './dng/dng-import.js';
import {concat,be} from './box.js';

export async function exportBokehStyles(result,settings,onProgress=()=>{},analyze=true){
  const {sourceWidth:w,sourceHeight:h,orientation,sourceData,sourceFile}=result;
  const swap=orientation.angle===90||orientation.angle===270;
  const geometry=targetGeometry({width:swap?h:w,height:swap?w:h});
  let source,rendered;
  try{
    onProgress({stage:'bokeh'});
    source=await aiSourceCanvas(sourceData,{
      width:swap?geometry.storedWidth:geometry.displayWidth,
      height:swap?geometry.storedHeight:geometry.displayHeight,...orientation},sourceFile);
    rendered=renderBokeh(source,result.gray,result.width,result.height,{...settings,...orientation});
    source.width=source.height=0;source=null;
    // PNG is only a lossless internal bridge to the unchanged Styles converter.
    // The downloadable result is high-resolution HEIC, never this PNG.
    const blob=await new Promise(resolve=>rendered.canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('Bokeh rendering failed');
    rendered.close();rendered=null;
    let png=new Uint8Array(await blob.arrayBuffer());
    const d=discoverHeic(sourceData),id=[...d.infos].find(([,info])=>info.type==='Exif')?.[0];
    if(id!==undefined){
      const exif=extractItem(sourceData,d.iloc,id);
      const offset=new DataView(exif.buffer,exif.byteOffset,exif.byteLength).getUint32(0);
      const wrapped=concat([be(6,4),new TextEncoder().encode('Exif\0\0'),exif.subarray(4+offset)]);
      png=developedPngExif(png,wrapped);
    }
    const output=await importRaster(new File([png],'Bokeh.png',{type:'image/png'}),null,onProgress,{analyze});
    return {...output,resized:geometry.resized};
  }finally{if(source)source.width=source.height=0;rendered?.close();}
}
