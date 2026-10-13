"""Inspect and smoke-test every local AI Detail ONNX model (CPU only).

Needs: pip install onnx onnxruntime numpy (already present on the development PC).
Run: python tools/verify-ai-detail-models.py
"""
import json, hashlib, pathlib, sys, time
import numpy as np
import onnxruntime as ort

root=pathlib.Path(__file__).resolve().parents[1]/"web/vendor/ai-detail"
manifest=json.loads((root/"assets.json").read_text(encoding="utf8"))
failed=[]
for label,spec in manifest["models"].items():
    filename=root/spec["file"]
    digest=hashlib.sha256()
    with open(filename,"rb") as f:
        for chunk in iter(lambda:f.read(1048576),b""):
            digest.update(chunk)
    sha=digest.hexdigest()
    if sha!=spec["sha256"]:
        print(f"{label}: HASH MISMATCH")
        failed.append(label)
        continue
    try:
        settings=ort.SessionOptions()
        settings.intra_op_num_threads=2
        settings.inter_op_num_threads=1
        settings.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
        session=ort.InferenceSession(str(filename),sess_options=settings,providers=["CPUExecutionProvider"])
        inputs=session.get_inputs()
        outputs=session.get_outputs()
        print(f"{label}: {filename.stat().st_size/1048576:.2f} MiB, inputs={[(x.name,x.shape,x.type) for x in inputs]}, outputs={[(x.name,x.shape,x.type) for x in outputs]}",flush=True)
        if len(inputs)!=1 or len(outputs)!=1:
            raise ValueError("This graph does not have the expected single image input/output")
        if inputs[0].type!="tensor(float)" or outputs[0].type!="tensor(float)":
            raise ValueError("This graph does not use float32 tensors")
        shape=inputs[0].shape
        if len(shape)!=4 or shape[1]!=3:
            raise ValueError(f"Unexpected layout {shape}; expected NCHW RGB")
        sizes=[64,128,256]
        size=next((n for n in ([256] if label=="pro" else sizes) if all(not isinstance(dim,int) or dim==n for dim in shape[-2:])),None)
        if not size:
            raise ValueError(f"Unsupported fixed spatial shape {shape}")
        # Input with color gradients, not an all-zeros/identity-only smoke test.
        y,x=np.mgrid[0:size,0:size].astype(np.float32)
        inp=np.stack([x/max(1,size-1),y/max(1,size-1),0.3+0.2*np.sin((x+y)*0.1)],axis=0)[None].astype("float32")
        tick=time.perf_counter()
        result=session.run(None,{inputs[0].name:inp})[0]
        elapsed=time.perf_counter()-tick
        if result.shape!=(1,3,size,size) or not np.isfinite(result).all():
            raise ValueError(f"Invalid output {result.shape}")
        error=float(np.mean(np.abs(result-inp)))
        print(f"{label}: inference PASS {size}x{size} in {elapsed:.2f}s, mean pixel difference={error:.6f}, output range={result.min():.3f}..{result.max():.3f}",flush=True)
        if error<1e-7:raise ValueError("Suspicious identity network output")
        if error>0.8:raise ValueError("Suspicious output scale (possible normalization mismatch)")
        if spec["channels"]!=3 or spec["layout"]!="rgb" or spec["output"]!="rgb":
            raise ValueError("Manifest is incompatible with model")
        print(f"{label}: VERIFIED",flush=True)
    except Exception as exc:
        failed.append(label)
        print(f"{label}: FAILED: {exc}",flush=True)
if failed:
    print("FAILED:",",".join(failed))
    sys.exit(1)
print("ALL THREE AI DETAIL MODELS VERIFIED ON LOCAL ONNXRUNTIME CPU")
