"""Controlled RGB photo restoration benchmark for local ONNX models.

Uses a public scikit-image test photograph and synthetic degradations.
Downloads candidate weights ONLY into ignored tests/web/.cache; does not touch
the production manifest or selected Lite/Standard/Pro models.

Run: python tools/benchmark-ai-detail-models.py
"""
from pathlib import Path
import hashlib, json, time, urllib.request, io
import numpy as np
import cv2
import onnxruntime as ort

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'tests/web/.cache/ai-detail-eval'
CACHE.mkdir(parents=True,exist_ok=True)
REPO=ROOT/'web/vendor/ai-detail'
CANDIDATES={
 'RealPLKSR Denoise':('1xDeNoise_realplksr_otf_fp32.onnx','fa7a85412634b30e078299aafc9a9d4074358f1a5abcd8f17a8355715a258c51'),
 'ReFocus Cleanly':('1x-ReFocus-Cleanly.onnx','3e30504a14beeb24344bdcb9bdbb3138e862e5787154f02a544f3dfdbcf44fe5')
}
REV='42bc0d52e3f9f015b3f0106912c5342462ef0569'
def download(url,path,sha=None):
 if path.exists() and (not sha or hashlib.sha256(path.read_bytes()).hexdigest()==sha):return
 print('Downloading',path.name,flush=True)
 temp=path.with_suffix('.partial')
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'photographic-styles-tool-benchmark/1.0'}),timeout=90) as res, open(temp,'wb') as f:
   hash=hashlib.sha256()
   while True:
    buf=res.read(1024*1024)
    if not buf: break
    f.write(buf);hash.update(buf)
  if sha and hash.hexdigest()!=sha:raise RuntimeError('SHA-256 mismatch: '+path.name)
  temp.replace(path)
 finally:
  temp.unlink(missing_ok=True)
for name,(filename,sha) in CANDIDATES.items():
 url=f'https://huggingface.co/notaneimu/onnx-image-models/resolve/{REV}/{filename}?download=true'
 download(url,CACHE/filename,sha)
photo=CACHE/'astronaut.png'
download('https://raw.githubusercontent.com/scikit-image/scikit-image/v0.24.0/skimage/data/astronaut.png',photo)
source=cv2.imread(str(photo),cv2.IMREAD_COLOR)
if source is None:raise RuntimeError('Photo unavailable')
reference=cv2.cvtColor(cv2.resize(source,(256,256),interpolation=cv2.INTER_AREA),cv2.COLOR_BGR2RGB).astype('float32')/255
rng=np.random.default_rng(2026)
degradations={
 'clean':reference,
 'blur-1.1':cv2.GaussianBlur(reference,(0,0),1.1),
 'noise-0.032':np.clip(reference+rng.normal(0,.032,reference.shape).astype('float32'),0,1),
 'jpeg-q45':cv2.cvtColor(cv2.imdecode(cv2.imencode('.jpg',cv2.cvtColor((reference*255).astype('uint8'),cv2.COLOR_RGB2BGR),[cv2.IMWRITE_JPEG_QUALITY,45])[1],1),cv2.COLOR_BGR2RGB).astype('float32')/255,
}
def psnr(out,gt):
 err=float(np.mean((out-gt)**2))
 return 99 if err<1e-10 else 10*np.log10(1/err)
def ssim(out,gt):
 # Full-color SSIM mean (Gaussian 11x11), evaluates luminance + local contrast.
 sig1=cv2.GaussianBlur(out,(11,11),1.5)
 sig2=cv2.GaussianBlur(gt,(11,11),1.5)
 v1=cv2.GaussianBlur(out*out,(11,11),1.5)-sig1*sig1
 v2=cv2.GaussianBlur(gt*gt,(11,11),1.5)-sig2*sig2
 cov=cv2.GaussianBlur(out*gt,(11,11),1.5)-sig1*sig2
 return float(np.mean(((2*sig1*sig2+.01**2)*(2*cov+.03**2))/((sig1**2+sig2**2+.01**2)*(v1+v2+.03**2))))
models={
 'Lite SPAN':REPO/'lite.onnx',
 'Standard RPLKSR':REPO/'standard.onnx',
 'Pro Fatality':REPO/'pro.onnx',
 **{name:CACHE/file for name,(file,sha) in CANDIDATES.items()},
}
settings=ort.SessionOptions()
settings.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL
settings.intra_op_num_threads=2
results=[]
for name,file in models.items():
 print('\n'+name+' ('+f'{file.stat().st_size/1048576:.1f} MiB)',flush=True)
 tick=time.perf_counter()
 session=ort.InferenceSession(str(file),sess_options=settings,providers=['CPUExecutionProvider'])
 setup=round(time.perf_counter()-tick,2)
 print('Session load:',setup,'seconds',flush=True)
 try:
  inp=session.get_inputs()[0]
  outs=session.get_outputs()
  if len(session.get_inputs())!=1 or len(outs)!=1:raise RuntimeError('Requires single-input single-output')
  for kind,source in degradations.items():
   tensor=source.transpose(2,0,1)[None].astype('float32')
   start=time.perf_counter()
   try:
    output=session.run(None,{inp.name:tensor})[0]
    if output.shape!=(1,3,256,256):raise RuntimeError('wrong output shape '+str(output.shape))
    prediction=np.clip(output[0].transpose(1,2,0),0,1)
    elapsed=time.perf_counter()-start
    baseline_p=psnr(source,reference);result_p=psnr(prediction,reference)
    baseline_s=ssim(source,reference);result_s=ssim(prediction,reference)
    diff=float(np.mean(np.abs(prediction-source)))
    record={'model':name,'scenario':kind,'psnr_before':round(baseline_p,2),'psnr_after':round(result_p,2),
      'psnr_delta':round(result_p-baseline_p,2),'ssim_before':round(baseline_s,4),'ssim_after':round(result_s,4),
      'ssim_delta':round(result_s-baseline_s,4),'mean_change':round(diff,5),'seconds':round(elapsed,2)}
    results.append(record)
    print(f' {kind:10} PSNR: {result_p:5.2f} dB Δ{result_p-baseline_p:+6.2f} | SSIM {result_s:.4f} Δ{result_s-baseline_s:+.4f} | {elapsed:.1f}s | mean change {diff:.4f}',flush=True)
   except Exception as e:print('FAILED scenario',kind,type(e).__name__,str(e)[:240],flush=True)
 finally: del session
(CACHE/'results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
print('\nFinished. This is a proxy test (one public photograph, synthetic blur/noise/JPEG), NOT a ranking of real iPhone images.',flush=True)
