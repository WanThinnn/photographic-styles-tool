import {discoverHeic,extractItemData} from './raster/heif.js';
import {parseBplist} from './bplist.js';
// Gate transformations by the actual data contract, never EXIF Software/iOS.
// New native schemas can take the additive Texture route without having their
// unknown colour/people metadata rewritten by our older Portrait template.
export function styleCapabilities(data){
  const d=discoverHeic(data);
  if(d.stylesItem===null)return {native:false,schema:null,editable:false};
  try{
    const styles=parseBplist(extractItemData(data,d,d.stylesItem));
    const schema=styles instanceof Map?styles.get('0'):null;
    // Flag-bearing values are not iOS versions. 131087 is the accepted
    // Portrait reference; 131088 is the native v16 variant in IMG_0932 and
    // the reported Live Photo IMG_0471. Preserve these values verbatim.
    return {native:true,schema,editable:[13,14,16,131087,131088].includes(schema)};
  }catch{return {native:true,schema:null,editable:false};}
}
