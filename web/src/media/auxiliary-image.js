import {box,concat,be} from '../core/box.js';
import {propertyBoxBytes,extractItem} from '../core/heif.js';

// Decode just one auxiliary plane. Omit display transforms so the returned
// pixels remain in stored coordinates; callers must check orientation first.
export function isolatedAuxiliaryImage(data,d,id){
  const props=['ispe','pixi','hvcC','colr'].map(t=>propertyBoxBytes(data,d.props,id,t)).filter(Boolean);
  return standaloneAuxiliaryImage(extractItem(data,d.iloc,id),props);
}
export function standaloneAuxiliaryImage(payload,props){
  const full=new Uint8Array(4),ascii=s=>new TextEncoder().encode(s);
  const iprp=box('iprp',concat([box('ipco',concat(props)),box('ipma',concat([
    full,be(1,4),be(1,2),Uint8Array.of(props.length),Uint8Array.from(props,(_,i)=>i+1)]))]));
  const ftyp=box('ftyp',ascii('heic\0\0\0\0mif1heic'));
  const meta=offset=>box('meta',concat([full,
    box('hdlr',concat([full,be(0,4),ascii('pict'),new Uint8Array(13)])),box('pitm',concat([full,be(1,2)])),
    box('iinf',concat([full,be(1,2),box('infe',concat([Uint8Array.of(2,0,0,0),be(1,2),be(0,2),ascii('hvc1\0')]))])),
    iprp,box('iloc',concat([Uint8Array.of(1,0,0,0,0x44,0),be(1,2),be(1,2),be(0,2),be(0,2),
      be(1,2),be(offset,4),be(payload.length,4)]))]));
  return concat([ftyp,meta(ftyp.length+meta(0).length+8),box('mdat',payload)]);
}
