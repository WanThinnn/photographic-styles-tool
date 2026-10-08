import {renderBokeh} from './ai-bokeh.js';
export const AI_STRINGS={
  vi:{toggle:'Xóa phông AI · GPU (thử nghiệm)',hint:'Tạo depth cho ảnh thường. Photos có thể chưa cho chỉnh Portrait. Bỏ qua ảnh có Styles hoặc depth gốc.',loading:'Đang tải AI · khoảng 120 MB lần đầu',inference:'Đang tạo depth trên GPU',encoding:'Đang đóng gói depth HEIC',skip:'AI được bỏ qua để giữ Styles / Portrait gốc.',ready:'Depth AI đã thêm. Hãy kiểm tra công cụ Portrait trong Photos; chưa bảo đảm tương thích.',failed:'AI không chạy được; kết quả Styles thông thường vẫn có sẵn.',gpu:'Thiết bị / trình duyệt chưa cung cấp WebGPU. Không chuyển sang CPU.',export:'HEIC + depth AI',preview:'Xóa phông xem trước · chạm để lấy nét',blur:'Độ mờ',flat:'Lưu ảnh xóa phông (ảnh phẳng)'},
  en:{toggle:'AI background blur · GPU (experimental)',hint:'Generate depth for ordinary photos. Photos Portrait editing may be unavailable. Skips native Styles and depth.',loading:'Loading AI · about 120 MB initially',inference:'Generating depth on GPU',encoding:'Packaging HEIC depth',skip:'AI skipped to preserve native Styles / Portrait.',ready:'AI depth added. Test Portrait controls in Photos; compatibility is unverified.',failed:'AI unavailable; the normal Styles result is still available.',gpu:'WebGPU is unavailable in this browser / device. No CPU fallback.',export:'HEIC + AI depth',preview:'Blur preview · tap to focus',blur:'Blur amount',flat:'Save blurred image (flattened)'},
  zh:{toggle:'AI 背景虚化 · GPU（实验）',hint:'为普通照片生成深度。照片 App 未必支持人像编辑。跳过原生风格和深度。',loading:'正在加载 AI · 首次约 120 MB',inference:'GPU 正在生成深度',encoding:'正在封装 HEIC 深度',skip:'已跳过 AI，保留原生风格和人像。',ready:'已添加 AI 深度，请在照片 App 中测试人像编辑，兼容性尚未验证。',failed:'AI 不可用，普通风格结果仍可下载。',gpu:'当前浏览器或设备不支持 WebGPU，不回退到 CPU。',export:'HEIC + AI 深度',preview:'虚化预览 · 点击对焦',blur:'虚化程度',flat:'保存虚化照片（平面图像）'},
};
Object.assign(AI_STRINGS.vi,{normalLabel:'Styles',depthLabel:'Depth thử nghiệm · ảnh chưa xóa phông',ready:'Đã thêm depth AI. Bản này giữ ảnh chưa xóa phông; Photos chưa nhận Portrait trong lần thử của bạn.',flat:'Tải ảnh xem trước đã xóa phông',hint:'Xóa phông trong web. Bản thử depth HEIC chưa được Photos nhận là Portrait; giữ nguyên ảnh có Styles/depth gốc.'});
Object.assign(AI_STRINGS.en,{normalLabel:'Styles',depthLabel:'Depth test · unblurred image',ready:'AI depth added. This keeps the unblurred photo; Photos Portrait recognition failed in the device test.',flat:'Download blurred preview',hint:'Blur in the browser. Experimental HEIC depth is not yet recognised as Portrait by Photos. Native Styles/depth are preserved.'});
Object.assign(AI_STRINGS.zh,{normalLabel:'风格',depthLabel:'深度测试 · 未虚化图像',ready:'已添加 AI 深度，保留未虚化图像。设备测试中照片 App 未识别人像。',flat:'下载虚化预览',hint:'在网页中虚化。HEIC 深度尚未被照片 App 识别为人像，保留原生风格和深度。'});

Object.assign(AI_STRINGS.vi,{hint:'Chỉnh bokeh và lấy nét trên web, xuất HEIC có Styles. Bỏ qua ảnh có Styles/depth gốc.',preview:'Bokeh & lấy nét',focus:'Khoảng lấy nét · xa → gần',flat:'Tạo HEIC với bokeh & Styles',save:'Lưu vào Ảnh',download:'Tải HEIC',encoding:'Đang xuất HEIC chất lượng cao…',ready:'Chỉnh bokeh bên dưới rồi tạo HEIC. Hiệu ứng được lưu vào ảnh; Photos chưa hỗ trợ chỉnh lại Portrait.',done:'Đã tạo HEIC có bokeh và Styles.',resized:'Ảnh được giảm kích thước theo giới hạn xuất HEIC.',exportFailed:'Không xuất được HEIC. Hãy thử lại.',changed:'Đã đổi thiết lập — tạo lại HEIC để lưu.'});
Object.assign(AI_STRINGS.en,{hint:'Adjust bokeh and focus in the browser; export HEIC with Styles. Skips native Styles/depth.',preview:'Bokeh & focus',focus:'Focus distance · far → near',flat:'Create HEIC with bokeh & Styles',save:'Save to Photos',download:'Download HEIC',encoding:'Exporting high-quality HEIC…',ready:'Adjust bokeh below, then create HEIC. The effect is baked into the image; Photos Portrait editing is unavailable.',done:'HEIC with bokeh and Styles is ready.',resized:'Image resized to fit the HEIC export limit.',exportFailed:'HEIC export failed. Try again.',changed:'Settings changed — create HEIC again to save.'});
Object.assign(AI_STRINGS.zh,{hint:'在网页调整散景和焦点，导出含风格的 HEIC。跳过原生风格和深度。',preview:'散景与焦点',focus:'焦距 · 远 → 近',flat:'生成散景与风格 HEIC',save:'保存到照片',download:'下载 HEIC',encoding:'正在导出高质量 HEIC…',ready:'在下方调整散景后生成 HEIC。效果写入图像，照片 App 尚不支持再次编辑人像。',done:'含散景和风格的 HEIC 已生成。',resized:'图像已缩小以符合 HEIC 导出限制。',exportFailed:'HEIC 导出失败，请重试。',changed:'设置已更改，请重新生成 HEIC。'});

export function blurPreview(result,host,strings,exportImage) {
  const {width:w,height:h,gray,previewRgb:rgb,orientation:{angle,mirror}}=result;
  const source=document.createElement('canvas');source.width=w;source.height=h;
  const ctx=source.getContext('2d'),image=ctx.createImageData(w,h);
  for(let i=0;i<gray.length;i++){image.data.set([rgb[i*3],rgb[i*3+1],rgb[i*3+2],255],i*4);}ctx.putImageData(image,0,0);
  const view=document.createElement('canvas'),swap=angle===90||angle===270;
  view.width=swap?h:w;view.height=swap?w:h;view.className='ai-preview';
  const vctx=view.getContext('2d');
  const label=document.createElement('label');label.textContent=strings.blur;
  const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='20';slider.value='8';label.append(slider);
  const focusLabel=document.createElement('label');focusLabel.textContent=strings.focus;
  const focusSlider=document.createElement('input');focusSlider.type='range';focusSlider.min='0';focusSlider.max='255';focusLabel.append(focusSlider);
  const save=document.createElement('button');save.className='dl alt';save.textContent=strings.flat;save.type='button';
  const output=document.createElement('div');output.className='bokeh-output';
  const status=document.createElement('p');status.className='ai-status';
  let outputUrl=null;
  function focusAt(x,y){
    const samples=[];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)samples.push(gray[Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx))]);
    samples.sort((a,b)=>a-b);return samples[12];
  }
  let focus=focusAt(Math.floor(w/2),Math.floor(h/2)),pending=null;
  focusSlider.value=String(focus);
  function invalidate(){if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=null;output.replaceChildren();status.textContent=strings.changed;}
  function draw(){
    const rendered=renderBokeh(source,gray,w,h,{focus,blur:Number(slider.value),angle,mirror});
    try{vctx.drawImage(rendered.canvas,0,0);}finally{rendered.close();}
  }
  function schedule(){invalidate();if(pending===null)pending=requestAnimationFrame(()=>{pending=null;draw();});}
  slider.addEventListener('input',schedule);
  focusSlider.addEventListener('input',()=>{focus=Number(focusSlider.value);schedule();});
  view.addEventListener('click',event=>{
    const rect=view.getBoundingClientRect();let x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(mirror===0)x=1-x;if(mirror===1)y=1-y;
    if(angle===90)[x,y]=[1-y,x];else if(angle===180)[x,y]=[1-x,1-y];else if(angle===270)[x,y]=[y,1-x];
    focus=focusAt(Math.floor(x*w),Math.floor(y*h));focusSlider.value=String(focus);schedule();
  });
  save.addEventListener('click',async()=>{
    save.disabled=slider.disabled=focusSlider.disabled=true;view.style.pointerEvents='none';invalidate();status.textContent=strings.encoding;
    try{
      const result=await exportImage({focus,blur:Number(slider.value)}),file=result.file;
      outputUrl=URL.createObjectURL(file);const download=document.createElement('a');download.className='dl alt';download.href=outputUrl;download.download=file.name;download.textContent=strings.download;
      if(navigator.canShare?.({files:[file]})){
        const share=document.createElement('button');share.className='dl';share.type='button';share.textContent=strings.save;
        share.addEventListener('click',async()=>{share.disabled=true;try{await navigator.share({files:[file]});}catch(error){if(error.name!=='AbortError')status.textContent=strings.exportFailed;}finally{share.disabled=false;}});output.append(share);
      }
      output.append(download);status.textContent=strings.done+(result.resized?' '+strings.resized:'');
    }catch(error){console.warn('Bokeh HEIC export failed',error);status.textContent=strings.exportFailed;}
    finally{save.disabled=slider.disabled=focusSlider.disabled=false;view.style.pointerEvents='';}
  });
  const actions=document.createElement('div');actions.className='bokeh-actions';actions.append(save,status,output);
  host.append(view,label,focusLabel,actions);draw();
}
