"""Verify packaged Suggested Styles TinyCLIP image-only models.

This is the release verifier for environments where onnxruntime-node is not
installed. It validates manifest identity, file integrity, graph I/O, runtime
execution, and agreement between the INT8/WASM and FP16/WebGPU variants.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

try:
    import numpy as np
    import onnx
    import onnxruntime as ort
except ImportError as exc:
    raise SystemExit(
        "AI Style verification requires Python packages: onnx, onnxruntime, numpy"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "web" / "vendor" / "ai-style"
MANIFEST_PATH = ASSET_ROOT / "assets.json"

MODEL = "tinyclip-vit-8m-16-image"
REVISION = "9463a9c508a344c837ffefe9d724f3827bf2dc79"
INPUT_NAME = "pixel_values"
OUTPUT_NAME = "image_embeds"
INPUT_SHAPE = (1, 3, 224, 224)
EMBEDDING_DIMENSIONS = 512
EXPECTED = {
    "wasm": {"file": "tinyclip-image-int8.onnx", "precision": "int8"},
    "webgpu": {"file": "tinyclip-image-fp16.onnx", "precision": "fp16"},
}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_manifest(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise RuntimeError("Suggested Styles model manifest must be an object")
    if raw.get("schema") != 1 or raw.get("model") != MODEL or raw.get("revision") != REVISION:
        raise RuntimeError("Suggested Styles model manifest identity mismatch")
    input_spec = raw.get("input")
    if not isinstance(input_spec, dict):
        raise RuntimeError("Suggested Styles input contract missing")
    if (
        input_spec.get("shape") != list(INPUT_SHAPE)
        or input_spec.get("inputName") != INPUT_NAME
        or input_spec.get("outputName") != OUTPUT_NAME
        or input_spec.get("embeddingDimensions") != EMBEDDING_DIMENSIONS
    ):
        raise RuntimeError("Suggested Styles input contract mismatch")
    models = raw.get("models")
    if not isinstance(models, dict) or set(models) != set(EXPECTED):
        raise RuntimeError("Suggested Styles model variants mismatch")
    for provider, expected in EXPECTED.items():
        spec = models.get(provider)
        if not isinstance(spec, dict):
            raise RuntimeError(f"{provider}: missing model asset")
        if spec.get("file") != expected["file"] or spec.get("precision") != expected["precision"]:
            raise RuntimeError(f"{provider}: model variant mismatch")
        if spec.get("inputName") != INPUT_NAME or spec.get("outputName") != OUTPUT_NAME:
            raise RuntimeError(f"{provider}: model I/O metadata mismatch")
        if spec.get("inputShape") != list(INPUT_SHAPE) or spec.get("embeddingDimensions") != EMBEDDING_DIMENSIONS:
            raise RuntimeError(f"{provider}: model shape metadata mismatch")
    return raw


def session_options(provider: str) -> ort.SessionOptions:
    options = ort.SessionOptions()
    if provider == "webgpu":
        # The generated FP16 graph is valid but extended ORT CPU optimization
        # attempts an unrelated cross-tower LayerNorm fusion. Production uses
        # the same basic optimization level in the WebGPU worker.
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    return options


def run_model(provider: str, spec: dict, pixels: np.ndarray) -> np.ndarray:
    path = ASSET_ROOT / spec["file"]
    if not path.is_file():
        raise RuntimeError(f"{provider}: packaged model missing")
    size = path.stat().st_size
    if size != spec.get("bytes"):
        raise RuntimeError(f"{provider}: byte length mismatch")
    digest = file_sha256(path)
    if digest != spec.get("sha256"):
        raise RuntimeError(f"{provider}: SHA-256 mismatch")

    model = onnx.load(path, load_external_data=False)
    onnx.checker.check_model(model)
    if [item.name for item in model.graph.input] != [INPUT_NAME]:
        raise RuntimeError(f"{provider}: graph contains non-image inputs")
    if [item.name for item in model.graph.output] != [OUTPUT_NAME]:
        raise RuntimeError(f"{provider}: graph contains unexpected outputs")

    session = ort.InferenceSession(
        str(path),
        sess_options=session_options(provider),
        providers=["CPUExecutionProvider"],
    )
    inputs = session.get_inputs()
    outputs = session.get_outputs()
    if len(inputs) != 1 or inputs[0].name != INPUT_NAME:
        raise RuntimeError(f"{provider}: runtime input mismatch")
    if len(outputs) != 1 or outputs[0].name != OUTPUT_NAME:
        raise RuntimeError(f"{provider}: runtime output mismatch")
    embedding = np.asarray(
        session.run([OUTPUT_NAME], {INPUT_NAME: pixels})[0],
        dtype=np.float32,
    ).reshape(-1)
    if embedding.size != EMBEDDING_DIMENSIONS or not np.isfinite(embedding).all():
        raise RuntimeError(f"{provider}: invalid embedding")
    norm = float(np.linalg.norm(embedding))
    if not np.isfinite(norm) or norm <= 1e-8:
        raise RuntimeError(f"{provider}: zero embedding")
    print(
        f"{provider}: VERIFIED {size / 1048576:.1f} MiB "
        f"sha256={digest}"
    )
    return embedding / norm


def main() -> None:
    manifest = validate_manifest(json.loads(MANIFEST_PATH.read_text("utf-8")))
    # Deterministic CLIP-like normalized image tensor spanning realistic values.
    pixels = np.linspace(-1.5, 1.5, np.prod(INPUT_SHAPE), dtype=np.float32).reshape(INPUT_SHAPE)
    embeddings = {
        provider: run_model(provider, manifest["models"][provider], pixels)
        for provider in ("wasm", "webgpu")
    }
    cosine = float(np.dot(embeddings["wasm"], embeddings["webgpu"]))
    print(f"variant cosine agreement: {cosine:.6f}")
    if cosine < 0.985:
        raise RuntimeError(
            f"INT8/FP16 image encoders diverge too much (cosine={cosine:.6f})"
        )
    print("Suggested Styles packaged model verification passed.")


if __name__ == "__main__":
    main()
