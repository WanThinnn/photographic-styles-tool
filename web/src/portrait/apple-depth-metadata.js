// Experimental Apple-readable auxiliary disparity. Recognition as an editable
// Photos Portrait is a separate on-device check, never implied by these tags.
import {box,be,concat} from '../core/box.js';
import {DEPTH_URI} from '../core/heif.js';

function range(min,max) {
  if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||!(max>min)||max>2**30)
    throw Error('Invalid relative disparity range');
}

export function depthRepresentationSubtype(min,max) {
  range(min,max);
  const bits=[];
  const write=(value,count)=>{for(let i=count-1;i>=0;i--)bits.push(Math.floor(value/2**i)%2);};
  const ue=value=>{const n=value+1,size=Math.floor(Math.log2(n))+1;write(0,size-1);write(n,size);};
  const element=value=>{
    // H.265 depth_representation_sei_element; 16 fraction bits match the
    // precision of the supplied native descriptor. This is not IEEE float.
    const length=16;
    if(value===0){write(0,1);write(0,7);write(length-1,5);write(0,length);return;}
    let power=Math.floor(Math.log2(value));
    let mantissa=Math.round((value/2**power-1)*2**length);
    if(mantissa===2**length){power++;mantissa=0;}
    if(power+31<=0||power+31>=127)throw Error('Disparity range cannot be represented');
    write(0,1);write(power+31,7);write(length-1,5);write(mantissa,length);
  };
  write(3,4); // no zNear/zFar; dMin and dMax present
  ue(1);ue(0); // uniform disparity, reference view 0
  element(min);element(max);
  // The native auxC descriptor includes its trailing one bit in payloadSize.
  write(1,1);
  const payload=new Uint8Array(Math.ceil(bits.length/8));
  bits.forEach((bit,i)=>payload[Math.floor(i/8)]|=bit<<(7-i%8));
  // Prefix SEI NAL, payload type 177. Escape EBSP bytes.
  const rbsp=concat([new Uint8Array([177,payload.length]),payload]);
  const escaped=[];let zeros=0;
  for(const value of rbsp){
    if(zeros===2&&value<=3){escaped.push(3);zeros=0;}
    escaped.push(value);zeros=value===0?zeros+1:0;
  }
  const nal=concat([new Uint8Array([78,1]),new Uint8Array(escaped)]);
  return concat([be(nal.length+4,4),be(nal.length,4),nal]);
}

export function appleDepthAuxc({floatMin=0,floatMax=1}={}) {
  const uri=new TextEncoder().encode(DEPTH_URI+'\0');
  return box('auxC',concat([new Uint8Array(4),uri,depthRepresentationSubtype(floatMin,floatMax)]));
}

export function appleDepthXmp({floatMin=0,floatMax=1}={}) {
  range(floatMin,floatMax);
  // AI min/max normalization has no metric calibration. Do not claim absolute
  // distance, copy camera matrices, or insert capture-specific blur settings.
  return new TextEncoder().encode(`<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description
xmlns:pixel="http://ns.apple.com/pixeldatainfo/1.0/"
xmlns:depth="http://ns.apple.com/depthData/1.0/"
xmlns:tool="https://wanthinnn.github.io/photographic-styles-tool/ai/">
<pixel:AuxiliaryImageType>disparity</pixel:AuxiliaryImageType>
<pixel:StoredFormat>1278226488</pixel:StoredFormat><pixel:NativeFormat>1751411059</pixel:NativeFormat>
<pixel:IntMinValue>0</pixel:IntMinValue><pixel:IntMaxValue>255</pixel:IntMaxValue>
<pixel:FloatMinValue>${floatMin}</pixel:FloatMinValue><pixel:FloatMaxValue>${floatMax}</pixel:FloatMaxValue>
<depth:DepthDataVersion>65541</depth:DepthDataVersion><depth:Accuracy>relative</depth:Accuracy>
<depth:Quality>low</depth:Quality><depth:Filtered>True</depth:Filtered>
<tool:Source>Depth-Anything-V2-Small</tool:Source><tool:Units>relative</tool:Units>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`);
}
