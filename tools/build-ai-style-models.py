"""Build the three zero-shot Suggested Styles model tiers.

No training or photo dataset is used. The script extracts image-only ONNX
graphs and precomputes style text prototypes from reviewable prompts.

Sources:
  Lite     TinyCLIP ViT-8M/16 (MIT)
  Standard TinyCLIP ViT-39M/16 (MIT)
  Pro      SigLIP2 Base patch16 224 (Apache-2.0)

Requires: huggingface_hub, tokenizers, transformers, numpy, onnx,
onnxruntime. Downloads are pinned to the repository revision returned before
the first file is fetched and the packaged assets are SHA-256 verified.
"""
from __future__ import annotations

import gc
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import urllib.request

import numpy as np
import onnx
from onnx import utils as onnx_utils
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.transformers.float16 import convert_float_to_float16
from onnxruntime.transformers.onnx_model import OnnxModel
from huggingface_hub import HfApi, hf_hub_download
from tokenizers import Tokenizer
from transformers import AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "web" / "vendor" / "ai-style"
PROMPTS = ROOT / "tools" / "style-prototype-prompts.json"

SOURCES = {
    "lite": {
        "repo": "onnx-community/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M-ONNX",
        "revision": "9463a9c508a344c837ffefe9d724f3827bf2dc79",
        "remote": "onnx/model.onnx",
        "model": "tinyclip-vit-8m-16-image",
        "license": "MIT",
        "dimensions": 512,
        "size": 224,
        "mean": [0.48145466, 0.4578275, 0.40821073],
        "std": [0.26862954, 0.26130258, 0.27577711],
        "tokenizer": "clip",
    },
    "standard": {
        "repo": "onnx-community/TinyCLIP-ViT-39M-16-Text-19M-YFCC15M-ONNX",
        "remote": "onnx/model.onnx",
        "model": "tinyclip-vit-39m-16-image",
        "license": "MIT",
        "dimensions": 512,
        "size": 224,
        "mean": [0.48145466, 0.4578275, 0.40821073],
        "std": [0.26862954, 0.26130258, 0.27577711],
        "tokenizer": "clip",
    },
    "pro": {
        "repo": "onnx-community/siglip2-base-patch16-224-ONNX",
        "remote": "onnx/model.onnx",
        "model": "siglip2-base-patch16-224-image",
        "license": "Apache-2.0",
        "dimensions": 768,
        "size": 224,
        "mean": [0.5, 0.5, 0.5],
        "std": [0.5, 0.5, 0.5],
        "tokenizer": "siglip2",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(value: np.ndarray) -> np.ndarray:
    value = np.asarray(value, dtype=np.float32)
    norm = float(np.linalg.norm(value))
    if not np.isfinite(norm) or norm <= 1e-8:
        raise RuntimeError("zero/non-finite embedding")
    return value / norm


def extract(source: Path, destination: Path, inputs: list[str], outputs: list[str]) -> None:
    onnx_utils.extract_model(str(source), str(destination), inputs, outputs, check_model=True, infer_shapes=True)


def verify_image_variant(path: Path, dimensions: int, *, fp16: bool) -> None:
    options = ort.SessionOptions()
    if fp16:
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
    output = session.run(["image_embeds"], {"pixel_values": np.zeros((1, 3, 224, 224), np.float32)})[0]
    if output.shape != (1, dimensions) or not np.isfinite(output).all():
        raise RuntimeError(f"invalid image output {output.shape}")
    del session


def export_variants(source: Path, output_prefix: str, dimensions: int) -> dict[str, dict[str, object]]:
    targets = {
        "wasm": ASSET_ROOT / f"{output_prefix}-int8.onnx",
        "webgpu": ASSET_ROOT / f"{output_prefix}-fp16.onnx",
    }
    quantize_dynamic(
        str(source), str(targets["wasm"]), weight_type=QuantType.QInt8,
        per_channel=True, op_types_to_quantize=["MatMul", "Gemm"],
        extra_options={"MatMulConstBOnly": True},
    )
    model = onnx.load(source, load_external_data=False)
    half = convert_float_to_float16(model, keep_io_types=True)
    sorted_model = OnnxModel(half)
    sorted_model.topological_sort(is_deterministic=True)
    onnx.save(sorted_model.model, targets["webgpu"])
    del model, half, sorted_model
    gc.collect()

    result = {}
    for provider, path in targets.items():
        verify_image_variant(path, dimensions, fp16=provider == "webgpu")
        result[provider] = {
            "file": path.name,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "precision": "int8" if provider == "wasm" else "fp16",
            "inputName": "pixel_values",
            "inputShape": [1, 3, 224, 224],
            "outputName": "image_embeds",
            "embeddingDimensions": dimensions,
        }
        print(provider, path.name, f"{path.stat().st_size / 1048576:.1f} MiB")
    return result


def existing_variants(output_prefix: str, dimensions: int) -> dict[str, dict[str, object]] | None:
    """Reuse a fully written tier after an interrupted multi-model build."""
    variants = {
        "wasm": (ASSET_ROOT / f"{output_prefix}-int8.onnx", "int8"),
        "webgpu": (ASSET_ROOT / f"{output_prefix}-fp16.onnx", "fp16"),
    }
    if not all(path.is_file() and path.stat().st_size > 0 for path, _ in variants.values()):
        return None
    try:
        for provider, (path, _) in variants.items():
            verify_image_variant(path, dimensions, fp16=provider == "webgpu")
    except Exception as error:
        print(output_prefix, "cannot reuse existing variants:", error)
        return None
    result = {}
    for provider, (path, precision) in variants.items():
        result[provider] = {
            "file": path.name,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "precision": precision,
            "inputName": "pixel_values",
            "inputShape": [1, 3, 224, 224],
            "outputName": "image_embeds",
            "embeddingDimensions": dimensions,
        }
    return result


def clip_text_inputs(repo: str, revision: str, prompts: list[str]) -> dict[str, np.ndarray]:
    path = hf_hub_download(repo, "tokenizer.json", revision=revision)
    tokenizer = Tokenizer.from_file(path)
    tokenizer.enable_truncation(max_length=77)
    tokenizer.enable_padding(length=77, pad_id=max(tokenizer.get_vocab().values()))
    encoded = tokenizer.encode_batch(prompts)
    return {
        "input_ids": np.asarray([item.ids for item in encoded], dtype=np.int64),
        "attention_mask": np.asarray([item.attention_mask for item in encoded], dtype=np.int64),
    }


def siglip_text_inputs(repo: str, revision: str, prompts: list[str]) -> dict[str, np.ndarray]:
    tokenizer = AutoTokenizer.from_pretrained(repo, revision=revision)
    encoded = tokenizer(
        [item.lower() for item in prompts], padding="max_length", truncation=True,
        max_length=64, return_tensors="np",
    )
    return {"input_ids": encoded["input_ids"].astype(np.int64)}


def build_prototypes(text_model: Path, spec: dict[str, object], prompts: dict[str, object]) -> dict[str, object]:
    session = ort.InferenceSession(str(text_model), providers=["CPUExecutionProvider"])
    styles = {}
    for style_id, group in prompts["styles"].items():
        vectors = {}
        for polarity in ("positive", "negative"):
            labels = group[polarity]
            if spec["tokenizer"] == "clip":
                inputs = clip_text_inputs(str(spec["repo"]), str(spec["revision"]), labels)
            else:
                inputs = siglip_text_inputs(str(spec["repo"]), str(spec["revision"]), labels)
            values = session.run(["text_embeds"], inputs)[0]
            if values.shape != (len(labels), spec["dimensions"]):
                raise RuntimeError(f"unexpected text embedding shape {values.shape}")
            vectors[polarity] = normalize(np.stack([normalize(row) for row in values]).mean(axis=0))
        styles[style_id] = {
            "name": group["name"],
            "positive": [round(float(value), 9) for value in vectors["positive"]],
            "negative": [round(float(value), 9) for value in vectors["negative"]],
        }
    del session
    return {
        "schema": 1,
        "model": spec["model"],
        "revision": spec["revision"],
        "dimensions": spec["dimensions"],
        "negativeWeight": 0.35,
        "styles": styles,
    }


def write_licenses() -> None:
    license_dir = ASSET_ROOT / "licenses"
    license_dir.mkdir(parents=True, exist_ok=True)
    urls = {
        "TinyCLIP-MIT.txt": "https://raw.githubusercontent.com/microsoft/Cream/main/TinyCLIP/LICENSE",
        "SigLIP2-Apache-2.0.txt": "https://raw.githubusercontent.com/google-research/big_vision/main/LICENSE",
    }
    for filename, url in urls.items():
        request = urllib.request.Request(url, headers={"User-Agent": "Stylio-model-packager/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            (license_dir / filename).write_bytes(response.read())


def main() -> None:
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    prompt_data = json.loads(PROMPTS.read_text("utf-8"))
    api = HfApi()
    manifest = {"schema": 2, "models": {}}
    with tempfile.TemporaryDirectory(prefix="stylio-zero-shot-") as temp:
        tempdir = Path(temp)
        for level, original in SOURCES.items():
            spec = dict(original)
            spec["revision"] = spec.get("revision") or api.model_info(spec["repo"]).sha
            print(level, spec["repo"], spec["revision"])
            prototype_path = ASSET_ROOT / f"style-prototypes-{level}.json"
            reusable = existing_variants(str(spec["model"]), int(spec["dimensions"]))
            existing_prototypes = None
            if reusable and prototype_path.is_file():
                candidate = json.loads(prototype_path.read_text("utf-8"))
                if (
                    candidate.get("model") == spec["model"]
                    and candidate.get("revision") == spec["revision"]
                    and candidate.get("dimensions") == spec["dimensions"]
                ):
                    existing_prototypes = candidate

            if reusable and existing_prototypes:
                providers = reusable
                print(level, "reusing verified image variants and text prototypes")
            else:
                source = Path(hf_hub_download(spec["repo"], spec["remote"], revision=spec["revision"]))
                image_fp32 = tempdir / f"{level}-image-fp32.onnx"
                text_fp32 = tempdir / f"{level}-text-fp32.onnx"
                extract(source, image_fp32, ["pixel_values"], ["image_embeds"])
                text_inputs = ["input_ids", "attention_mask"] if spec["tokenizer"] == "clip" else ["input_ids"]
                extract(source, text_fp32, text_inputs, ["text_embeds"])
                providers = export_variants(image_fp32, spec["model"], int(spec["dimensions"]))
                prototypes = build_prototypes(text_fp32, spec, prompt_data)
                prototype_path.write_text(json.dumps(prototypes, separators=(",", ":")) + "\n", "utf-8")
            input_contract = {
                "size": spec["size"], "channels": 3, "layout": "nchw-rgb",
                "shape": [1, 3, spec["size"], spec["size"]],
                "inputName": "pixel_values", "outputName": "image_embeds",
                "embeddingDimensions": spec["dimensions"],
                "mean": spec["mean"], "std": spec["std"],
            }
            manifest["models"][level] = {
                "id": spec["model"], "revision": spec["revision"], "license": spec["license"],
                "input": input_contract, "providers": providers,
            }
            gc.collect()
    (ASSET_ROOT / "assets.json").write_text(json.dumps(manifest, indent=2) + "\n", "utf-8")
    write_licenses()
    print("Packaged zero-shot Suggested Styles models without Apple weights.")


if __name__ == "__main__":
    main()
