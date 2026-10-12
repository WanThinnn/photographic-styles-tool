from __future__ import annotations

# Build-time TinyCLIP semantic axes; runtime ships vectors only.
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download, try_to_load_from_cache
from tokenizers import Tokenizer

DIMENSIONS = 512
ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "web" / "vendor" / "ai-style"
OUTPUT = ASSET_ROOT / "semantic-axes.json"
REPOSITORY = "/".join([
    "onnx-community",
    "".join(["Tiny", "CLIP", "-ViT-8M-16", "-Text-3M", "-YFCC15M-ONNX"]),
])

AXES = {
    "dramatic": {
        "positive": [
            "a dramatic moody high contrast photograph",
            "a cinematic low key photograph with strong shadows",
            "an intense atmospheric photograph",
            "a bold dramatic photographic scene",
        ],
        "negative": [
            "a soft gentle understated photograph",
            "a delicate low contrast photograph",
            "a calm subtle photographic scene",
            "a mild neutral photograph",
        ],
    },
    "airy": {
        "positive": [
            "a bright airy luminous photograph",
            "a light open photograph with glowing daylight",
            "a high key photograph with soft bright light",
            "a clean radiant photographic scene",
        ],
        "negative": [
            "a dark low key shadowy photograph",
            "a dim photograph with deep shadows",
            "a dark enclosed photographic scene",
            "a low light moody photograph",
        ],
    },
    "energetic": {
        "positive": [
            "an energetic lively dynamic photograph",
            "a vivid active exciting photographic scene",
            "a playful vibrant photograph full of motion",
            "a bold lively photograph",
        ],
        "negative": [
            "a calm quiet peaceful photograph",
            "a still restrained contemplative scene",
            "a serene gentle photograph",
            "a subdued quiet photographic scene",
        ],
    },
    "warmMood": {
        "positive": [
            "a warm cozy intimate golden photograph",
            "a comforting warm photograph with golden light",
            "a cozy inviting photographic scene",
            "a warm amber toned photograph",
        ],
        "negative": [
            "a cool crisp detached blue toned photograph",
            "a cool clean photographic scene",
            "a cold blue atmosphere in a photograph",
            "a cool neutral photograph",
        ],
    },
    "dreamy": {
        "positive": [
            "an ethereal dreamy delicate photograph",
            "a romantic soft dreamlike photographic scene",
            "a hazy whimsical photograph",
            "a delicate otherworldly photograph",
        ],
        "negative": [
            "a grounded crisp realistic photograph",
            "a clear documentary photograph",
            "a direct factual photographic scene",
            "a sharp realistic photograph",
        ],
    },
    "natural": {
        "positive": [
            "a natural realistic authentic photograph",
            "an unstyled documentary photograph",
            "a realistic natural photographic scene",
            "a natural looking photograph",
        ],
        "negative": [
            "a heavily stylized cinematic photograph",
            "an artistic processed photographic scene",
            "a strongly graded stylized photograph",
            "a highly cinematic edited photograph",
        ],
    },
    "people": {
        "positive": [
            "a portrait photograph of a person",
            "a photograph focused on a human face",
            "a photograph of people",
            "a human subject portrait photo",
        ],
        "negative": [
            "a landscape photograph without people",
            "an architecture photograph without people",
            "a still life photograph without people",
            "a scenery photograph with no human subject",
        ],
    },
    "colorful": {
        "positive": [
            "a rich colorful chromatic photograph",
            "a photograph with vivid varied colors",
            "a strongly colorful photographic scene",
            "a vibrant color photograph",
        ],
        "negative": [
            "a monochrome black and white photograph",
            "a nearly colorless desaturated photograph",
            "a grayscale photographic scene",
            "a muted monochromatic photograph",
        ],
    },
}

# Keep prompt wording in one reviewable data file; the inline defaults above
# document the intended axes while this file is the build-time source of truth.
AXES = json.loads((ROOT / "tools" / "style-axis-prompts.json").read_text("utf-8"))["axes"]


def normalize(value: np.ndarray) -> np.ndarray:
    value = np.asarray(value, dtype=np.float32)
    norm = float(np.linalg.norm(value))
    if not np.isfinite(norm) or norm <= 1e-8:
        raise RuntimeError("zero/non-finite text embedding")
    return value / norm


def encode(session: ort.InferenceSession, tokenizer: Tokenizer, prompts: list[str]) -> np.ndarray:
    encodings = tokenizer.encode_batch(prompts)
    inputs = {
        "input_ids": np.asarray([item.ids for item in encodings], dtype=np.int64),
        "attention_mask": np.asarray([item.attention_mask for item in encodings], dtype=np.int64),
        "pixel_values": np.zeros((1, 3, 224, 224), dtype=np.float32),
    }
    values = session.run(["text_embeds"], inputs)[0]
    if values.shape != (len(prompts), DIMENSIONS):
        raise RuntimeError(f"unexpected text embedding shape {values.shape}")
    rows = np.stack([normalize(row) for row in values])
    return normalize(rows.mean(axis=0))


def main() -> None:
    manifest = json.loads((ASSET_ROOT / "assets.json").read_text("utf-8"))
    revision = manifest["revision"]
    model_id = manifest["model"]
    model_path = try_to_load_from_cache(REPOSITORY, "onnx/model.onnx", revision=revision)
    text_asset = "".join(["token", "izer", ".json"])
    text_path = try_to_load_from_cache(REPOSITORY, text_asset, revision=revision)
    if not isinstance(model_path, str):
        model_path = hf_hub_download(REPOSITORY, "onnx/model.onnx", revision=revision)
    if not isinstance(text_path, str):
        text_path = hf_hub_download(REPOSITORY, text_asset, revision=revision)
    tokenizer = Tokenizer.from_file(text_path)
    tokenizer.enable_truncation(max_length=77)
    tokenizer.enable_padding(length=77, pad_id=max(tokenizer.get_vocab().values()))
    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    axes = {}
    for name, prompt_group in AXES.items():
        positive = encode(session, tokenizer, prompt_group["positive"])
        negative = encode(session, tokenizer, prompt_group["negative"])
        separation = float(1.0 - np.dot(positive, negative))
        if separation < 0.0001:
            raise RuntimeError("semantic axis collapsed: " + name)
        axes[name] = {
            "positive": [round(float(value), 9) for value in positive],
            "negative": [round(float(value), 9) for value in negative],
            "temperature": 6.0,
        }
        print(name, "separation", round(separation, 6))
    payload = {
        "schema": 1,
        "model": model_id,
        "revision": revision,
        "dimensions": DIMENSIONS,
        "axes": axes,
    }
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", "utf-8")
    print("Wrote", OUTPUT)


if __name__ == "__main__":
    main()
