"""v0.6.2: patch builds on the photo's own item graph (graft_style_graph). Checks against the
source photo and against native style files.

Fixtures are Git-ignored local photos: noSmartStyle/ and noSmartStyle-people/ (pre-iPhone 16
photos, some re-saved without thumbnail or tmap), Smartstyle/ and 18series/ (native style
photos). Missing fixtures are skipped. Needs ffmpeg and heif-convert for the orientation part.

    uv run tests/graph.py
"""
import hashlib
import plistlib
import shutil
import statistics as st
import struct
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import photographic_style_port as p  # noqa: E402

passed = failed = 0


def check(label, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  [PASS] {label}")
    else:
        failed += 1
        print(f"  [FAIL] {label} {detail}")


def item_for_uri(d, uri):
    return next((i for i in d["infos"] if p.aux_uri_for_item(d["props"], i) == uri), None)


def signature(data, d, iid):
    """Property types with essential flags, irot left out (its position varies natively)."""
    pr = d["props"]
    return [(pr["properties"][a["index"] - 1]["type"], a["essential"])
            for a in pr["associations"].get(iid, []) if pr["properties"][a["index"] - 1]["type"] != "irot"]


def refs_from(d, iid, typ):
    return [r["to"] for r in d["refs"] if r["from"] == iid and r["type"] == typ]


def pixels(data):
    try:
        import pillow_heif
    except ImportError:
        return None
    im = pillow_heif.open_heif(data, convert_hdr_to_8bit=True)[0]
    return im.size, hashlib.sha256(bytes(im.data)).hexdigest()


def corr(a, b):
    ma, mb = st.mean(a), st.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5
    return num / den if den else 0.0


def run_patch(src, out, *extra):
    args = p.build_parser().parse_args(["patch", str(src), str(out), *extra])
    args.func(args)


native_ref = ROOT / "Smartstyle" / "IMG_5102.HEIC"
NATIVE = None
if native_ref.exists():
    data = native_ref.read_bytes()
    d = p.discover_heic(data)
    NATIVE = {"lt": signature(data, d, d["linear_thumb"]), "grid": signature(data, d, d["delta_grid"]),
              "tile": signature(data, d, d["delta_tiles"][0])}

sources = sorted((ROOT / "noSmartStyle").glob("*.HEIC")) + sorted((ROOT / "noSmartStyle-people").glob("*.HEIC"))
if not sources:
    print("  no fixtures; skipped")
with tempfile.TemporaryDirectory() as work:
    work = Path(work)
    _, _, _, _, mn54 = p.load_profile(p.builtin_profile_bytes("48-12"))
    for src in sources:
        sdata = src.read_bytes()
        sd = p.discover_heic(sdata)
        out = work / f"{src.stem}_out.HEIC"
        mode = "reuse-thumbnail" if sd["thumbnail"] is not None else "generate"
        if mode == "generate" and not (shutil.which("ffmpeg") and shutil.which("heif-convert")):
            print(f"{src.name}: no thumbnail and no encoder; skipped")
            continue
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()):
            run_patch(src, out, "--linear-thumb", mode, "--scene-stats", "donor")
        data = out.read_bytes()
        d = p.discover_heic(data)
        name = f"{src.name} ({mode})"
        print(name)

        same = all(p.extract_item(data, d["iloc"], i) == p.extract_item(sdata, sd["iloc"], i)
                   for i, it in sd["iloc"]["items"].items()
                   if it["construction_method"] == 0 and i != sd["exif_item"])
        check(f"{name}: every source item keeps its ID and payload", set(sd["infos"]) <= set(d["infos"]) and same)
        check(f"{name}: idat items unchanged",
              all(p.idat_item_bytes(data, i, d["meta"]) == p.idat_item_bytes(sdata, i, sd["meta"])
                  for i, it in sd["iloc"]["items"].items() if it["construction_method"] == 1))
        exif = p.extract_item(data, d["iloc"], d["exif_item"])
        check(f"{name}: Exif gains MakerNote 0x54 = the 8-key record",
              p.extract_apple_makernote_tag(exif)[1] == mn54)
        fo, fs, fh, _ = p.top_box(sdata, "ftyp")
        sb = [sdata[i:i+4] for i in range(fo + 16, fo + fs, 4)]
        fo, fs, fh, _ = p.top_box(data, "ftyp")
        ob = [data[i:i+4] for i in range(fo + 16, fo + fs, 4)]
        check(f"{name}: ftyp adds MiHA and heix after MiHB, keeps the rest",
              [b for b in ob if b not in p.STYLE_BRANDS] == sb
              and ob[ob.index(b"MiHB") + 1:ob.index(b"MiHB") + 3] == list(p.STYLE_BRANDS))

        targets = [d["primary"]] + p.find_items_by_type(d["infos"], "tmap")[:1]
        pw, ph = p.dimensions_for_item(d["props"], d["primary"])
        dw, dh = p.style_delta_size(pw, ph)
        rows, cols = -(-dh // 512), -(-dw // 512)
        check(f"{name}: linear thumbnail, delta grid and styles found", None not in
              (d["linear_thumb"], d["delta_grid"], d["styles_item"]))
        check(f"{name}: StyleDeltaMap {dw}x{dh} with {rows}x{cols} neutral tiles",
              p.dimensions_for_item(d["props"], d["delta_grid"]) == (dw, dh)
              and len(d["delta_tiles"]) == rows * cols
              and all(p.extract_item(data, d["iloc"], t) == p.V02_NEUTRAL_DELTA_SAMPLE for t in d["delta_tiles"]))
        check(f"{name}: grid descriptor in idat",
              d["iloc"]["items"][d["delta_grid"]]["construction_method"] == 1
              and p.idat_item_bytes(data, d["delta_grid"], d["meta"])
              == bytes([0, 0, rows - 1, cols - 1]) + dw.to_bytes(2, "big") + dh.to_bytes(2, "big"))
        check(f"{name}: wired to the primary and tmap like native files",
              refs_from(d, d["linear_thumb"], "auxl") == [targets]
              and refs_from(d, d["delta_grid"], "auxl") == [targets]
              and refs_from(d, d["styles_item"], "cdsc") == [targets])
        if NATIVE:
            check(f"{name}: property layout matches a native file",
                  signature(data, d, d["linear_thumb"]) == NATIVE["lt"]
                  and signature(data, d, d["delta_grid"]) == NATIVE["grid"]
                  and signature(data, d, d["delta_tiles"][0]) == NATIVE["tile"])
        primary_irot = p.property_for_item(d["props"], d["primary"], "irot")
        check(f"{name}: new items share the primary's irot",
              all(p.property_for_item(d["props"], i, "irot") == primary_irot
                  for i in (d["linear_thumb"], d["delta_grid"])))
        before, after = pixels(sdata), pixels(data)
        if after is not None:
            check(f"{name}: decodes pixel-identical to the source", before == after, (before, after))

    print("auto falls back to the donor graph for an unknown size")
    src = ROOT / "noSmartStyle" / "IMG_5037.HEIC"
    if src.exists():
        saved = dict(p.STYLE_DELTA_SIZES)
        p.STYLE_DELTA_SIZES.clear()
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                run_patch(src, work / "auto.HEIC", "--linear-thumb", "reuse-thumbnail", "--scene-stats", "donor")
                run_patch(src, work / "donor.HEIC", "--linear-thumb", "reuse-thumbnail", "--scene-stats", "donor",
                          "--graph", "donor")
        finally:
            p.STYLE_DELTA_SIZES.update(saved)
        check("unknown size: auto output equals --graph donor",
              (work / "auto.HEIC").read_bytes() == (work / "donor.HEIC").read_bytes())
    check("style_delta_size covers both stored orientations",
          p.style_delta_size(3024, 4032) == (2160, 2880) and p.style_delta_size(1000, 800) is None)

# Orientation (v0.6.2 fix): the stored-orientation sample must match Apple's own linear
# thumbnail and light map as is, at every irot. One native file per irot keeps this quick.
if shutil.which("ffmpeg") and shutil.which("heif-convert"):
    print("orientation vs native files")
    picked = {}
    for f in sorted((ROOT / "18series").rglob("*.HEIC")) + sorted((ROOT / "Smartstyle").glob("IMG_51*.HEIC")):
        data = f.read_bytes()
        d = p.discover_heic(data)
        if d["linear_thumb"] is None:
            continue
        picked.setdefault(p.irot_angle_for_item(data, d["props"], d["primary"]), f)
    for angle, f in sorted(picked.items()):
        data = f.read_bytes()
        d = p.discover_heic(data)
        mirror = p.imir_axis_for_item(data, d["props"], d["primary"])
        lw, lh = p.dimensions_for_item(d["props"], d["linear_thumb"])
        w, h = (64, 48) if lw >= lh else (48, 64)
        with tempfile.TemporaryDirectory() as t:
            png = p.decode_target_primary(f, Path(t))
            ours = p.sample_linear_luma(png, w, h, p.raw_orientation_filters(angle, mirror))
            native = p.decode_aux_gray(data, d["props"], d["iloc"], d["linear_thumb"], Path(t), w, h)
            c_ours = p.sample_linear_luma(png, p.LIGHTMAP_N, p.LIGHTMAP_N, p.raw_orientation_filters(angle, mirror))
        pl = plistlib.loads(p.extract_item(data, d["iloc"], d["styles_item"]))
        c_native = [v[0] for v in struct.iter_unpack("<e", pl["c"])]
        r, r180 = corr(ours, native), corr(ours, native[::-1])
        check(f"irot {angle} ({f.name[:24]}): linear thumbnail upright (r {r:.2f} vs {r180:.2f} turned)", r > 0.8 > r180)
        rc, rc180 = corr(c_ours, c_native), corr(c_ours, c_native[::-1])
        check(f"irot {angle} ({f.name[:24]}): light map unflipped (r {rc:.2f} vs {rc180:.2f} turned)", rc > 0.8 > rc180)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
