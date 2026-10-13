"""Download the pinned TinyCLIP ONNX variants and export image-only graphs.

The upstream ONNX Community files contain both CLIP towers. Suggested Styles uses
only pixel_values -> image_embeds, so this tool verifies the pinned LFS objects,
extracts that dependency subgraph, smoke-tests it with ONNX Runtime, and then
hands the two verified files to tools/package-ai-style.mjs.

Requires: Python packages onnx, onnxruntime and numpy, plus Node.js.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

try:
    import numpy as np
    import onnx
    from onnx import utils as onnx_utils
    import onnxruntime as ort
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.transformers.float16 import convert_float_to_float16
    from onnxruntime.transformers.onnx_model import OnnxModel
except ImportError as exc:
    raise SystemExit(
        "AI Style export requires Python packages: onnx, onnxruntime, numpy"
    ) from exc

REPOSITORY = "onnx-community/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M-ONNX"
REVISION = "9463a9c508a344c837ffefe9d724f3827bf2dc79"
INPUT_NAME = "pixel_values"
OUTPUT_NAME = "image_embeds"
INPUT_SHAPE = (1, 3, 224, 224)
EMBEDDING_DIMENSIONS = 512

SOURCES = {
    "wasm": {
        # Upstream model_int8.onnx quantizes the patch convolution to
        # ConvInteger, which is not portable across ORT CPU/WASM builds.
        # Extract from the pinned FP32 graph, then weight-quantize only
        # transformer MatMul/Gemm operations.
        "remote": "onnx/model.onnx",
        "sha256": "31d28cb07209533d10fc4fef73ac324ce17de6741a2372e7e1531a4ac8fdaeb2",
        "bytes": 94_071_688,
        "quantize": True,
    },
    "webgpu": {
        # Export FP16 from the same verified FP32 image tower. This avoids
        # cross-tower optimizer aliases present in the upstream all-tower FP16
        # graph while keeping float32 I/O for browser interoperability.
        "remote": "onnx/model.onnx",
        "sha256": "31d28cb07209533d10fc4fef73ac324ce17de6741a2372e7e1531a4ac8fdaeb2",
        "bytes": 94_071_688,
        "quantize": False,
        "fp16": True,
    },
}

ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(provider: str, spec: dict[str, object], destination: Path) -> None:
    url = (
        f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/"
        f"{spec['remote']}?download=true"
    )
    print(f"{provider}: downloading pinned source {spec['remote']}")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Stylio-AI-Style-Packager/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as output:
        total = int(response.headers.get("content-length") or 0)
        written = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
            written += len(chunk)
            if total:
                print(f"\r  {written / total:6.1%}", end="", flush=True)
    if total:
        print()
    size = destination.stat().st_size
    if size != spec["bytes"]:
        raise RuntimeError(f"{provider}: upstream byte length mismatch: {size}")
    actual = sha256(destination)
    if actual != spec["sha256"]:
        raise RuntimeError(f"{provider}: upstream SHA-256 mismatch: {actual}")
    print(f"{provider}: source verified ({size / 1048576:.1f} MiB)")


def verify_image_only(provider: str, destination: Path) -> None:
    extracted = onnx.load(destination, load_external_data=False)
    onnx.checker.check_model(extracted)
    if [item.name for item in extracted.graph.input] != [INPUT_NAME]:
        raise RuntimeError(f"{provider}: extracted graph retained non-image inputs")
    if [item.name for item in extracted.graph.output] != [OUTPUT_NAME]:
        raise RuntimeError(f"{provider}: extracted graph retained unexpected outputs")

    options=ort.SessionOptions()
    if provider=="webgpu":
        options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    session = ort.InferenceSession(str(destination), sess_options=options, providers=["CPUExecutionProvider"])
    try:
        inputs = session.get_inputs()
        outputs = session.get_outputs()
        if len(inputs) != 1 or inputs[0].name != INPUT_NAME:
            raise RuntimeError(f"{provider}: runtime input contract mismatch")
        runtime_shape = tuple(inputs[0].shape)
        if len(runtime_shape) != len(INPUT_SHAPE) or any(
            isinstance(actual, int) and actual != expected
            for actual, expected in zip(runtime_shape, INPUT_SHAPE)
        ):
            raise RuntimeError(f"{provider}: runtime input shape is {inputs[0].shape}")
        if not any(output.name == OUTPUT_NAME for output in outputs):
            raise RuntimeError(f"{provider}: runtime output contract mismatch")
        result = session.run(
            [OUTPUT_NAME],
            {INPUT_NAME: np.zeros(INPUT_SHAPE, dtype=np.float32)},
        )[0]
        if result.size != EMBEDDING_DIMENSIONS or not np.isfinite(result).all():
            raise RuntimeError(f"{provider}: invalid image embedding output")
    finally:
        del session


def export_image_only(
    provider: str,
    source: Path,
    destination: Path,
    *,
    quantize: bool,
    fp16: bool,
) -> None:
    model = onnx.load(source, load_external_data=False)
    input_names = {item.name for item in model.graph.input}
    output_names = {item.name for item in model.graph.output}
    if INPUT_NAME not in input_names:
        raise RuntimeError(f"{provider}: source graph has no {INPUT_NAME} input")
    if OUTPUT_NAME not in output_names:
        raise RuntimeError(f"{provider}: source graph has no {OUTPUT_NAME} output")

    extracted_path = (
        destination
        if not quantize and not fp16
        else destination.with_name(destination.stem + "-fp32.onnx")
    )
    onnx_utils.extract_model(
        str(source),
        str(extracted_path),
        [INPUT_NAME],
        [OUTPUT_NAME],
        check_model=True,
        infer_shapes=True,
    )

    if quantize:
        quantize_dynamic(
            str(extracted_path),
            str(destination),
            weight_type=QuantType.QInt8,
            per_channel=True,
            op_types_to_quantize=["MatMul", "Gemm"],
            extra_options={"MatMulConstBOnly": True},
        )
    elif fp16:
        float_model=onnx.load(extracted_path,load_external_data=False)
        half_model=convert_float_to_float16(float_model,keep_io_types=True)
        sorted_model=OnnxModel(half_model)
        sorted_model.topological_sort(is_deterministic=True)
        onnx.save(sorted_model.model,destination)

    verify_image_only(provider, destination)
    full_size = source.stat().st_size
    size = destination.stat().st_size
    print(
        f"{provider}: image-only graph verified "
        f"({size / 1048576:.1f} MiB, {100 * size / full_size:.1f}% of source)"
    )


def main() -> None:
    node = "node.exe" if os.name == "nt" else "node"

    with tempfile.TemporaryDirectory(prefix="stylio-ai-style-") as temp:
        tempdir = Path(temp)
        extracted: dict[str, Path] = {}
        downloaded: dict[tuple[str,str],Path] = {}
        for provider, spec in SOURCES.items():
            key=(str(spec["remote"]),str(spec["sha256"]))
            source=downloaded.get(key)
            if source is None:
                source=tempdir/f"source-{len(downloaded)}.onnx"
                download(provider,spec,source)
                downloaded[key]=source
            target = tempdir / f"{provider}-image-only.onnx"
            export_image_only(
                provider,
                source,
                target,
                quantize=bool(spec["quantize"]),
                fp16=bool(spec.get("fp16")),
            )
            extracted[provider] = target

        subprocess.run(
            [
                node,
                "tools/package-ai-style.mjs",
                "--wasm",
                str(extracted["wasm"]),
                "--webgpu",
                str(extracted["webgpu"]),
            ],
            cwd=ROOT,
            check=True,
        )

    print("Suggested Styles image-only TinyCLIP package is ready.")


if __name__ == "__main__":
    main()
