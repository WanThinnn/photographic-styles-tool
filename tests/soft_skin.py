"""Soft Skin (v0.6.0): check what patch and add-texture write for photos with people.

Fixtures are Git-ignored local photos: noSmartStyle-people/ (pre-iPhone 16 Portrait photos),
Smartstyle/ (iPhone 16 style photos), and 18series/ sorted into "style only" (iPhone 17/18 style
photos) and "portrait+softskin" (iOS 27 photos where Soft Skin works natively). Missing
fixtures are skipped, not failed.

    uv run tests/soft_skin.py
"""
import math
import plistlib
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import photographic_style_port as p  # noqa: E402

NATIVE = ROOT / "18series" / "portrait+softskin"
STYLE_ONLY = ROOT / "18series" / "style only"
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


def texture(data):
    d = p.discover_heic(data)
    tex = next(i for i, info in d["infos"].items() if info.get("uri") == p.URI_TEXTURE_STYLES)
    return plistlib.loads(p.extract_item(data, d["iloc"], tex))


def shape(x):
    """Key structure and value types, ignoring values and list lengths."""
    if isinstance(x, dict):
        return {k: shape(x[k]) for k in sorted(x)}
    if isinstance(x, list):
        return [shape(x[0])] if x else []
    return type(x).__name__


def decodes_with_libheif(data):
    try:
        import pillow_heif
    except ImportError:
        return None
    heif = pillow_heif.open_heif(data, convert_hdr_to_8bit=True)
    heif[0].data  # forces a full decode
    return heif.size


def native_entry():
    for f in sorted(NATIVE.glob("*.HEIC")) if NATIVE.exists() else []:
        for e in texture(f.read_bytes()).get("TextureStylePostProcessedPeopleData", []):
            if e["imageStats"].get("SkinSmoothingStandalone"):
                return e
    return None


NATIVE_ENTRY = native_entry()


def check_output(name, src, out):
    """out was made from src by patch or add-texture; src has faces and both mattes."""
    ds, do = p.discover_heic(src), p.discover_heic(out)
    faces = p.xmp_face_regions(src, ds)
    size = decodes_with_libheif(out)
    if size is not None:
        check(f"{name}: libheif decodes the primary", size == decodes_with_libheif(src), size)
    tex = texture(out)
    people = tex.get("TextureStylePostProcessedPeopleData", [])
    check(f"{name}: one people entry per face region ({len(faces)})", len(people) == len(faces) > 0)
    check(f"{name}: texture header is the native header with the photo's grain seed",
          [(k, v) for k, v in tex.items() if k != "TextureStylePostProcessedPeopleData"]
          == [(k, p.film_grain_seed(src, ds) if k == "FilmGrainSeed" else v)
              for k, v in p.TEXTURE_STYLES_HEADER])
    check(f"{name}: people data sits after CaptureMode",
          list(tex).index("TextureStylePostProcessedPeopleData") == list(tex).index("CaptureMode") + 1)
    if NATIVE_ENTRY is not None:
        check(f"{name}: entries have Apple's keys and value types",
              all(shape(e) == shape(NATIVE_ENTRY) for e in people),
              [k for k in shape(people[0]) if shape(people[0])[k] != shape(NATIVE_ENTRY).get(k)] if people else "")
    check(f"{name}: 76 landmarks per face, every box and point inside the frame",
          all(len(e["faceLandmarks"]) == 76
              and all(0 <= q["point"][c] <= 1 for q in e["faceLandmarks"] for c in "xy")
              and all(0 <= e[r]["x"] and 0 <= e[r]["y"] and e[r]["x"] + e[r]["width"] <= 1 + 1e-9
                      and e[r]["y"] + e[r]["height"] <= 1 + 1e-9 for r in ("faceROI", "faceSkinROI"))
              for e in people))
    check(f"{name}: faceIDs run 0..n-1, also inside imageStats",
          all(e["faceID"] == i and all(s["faceID"] == i for s in e["imageStats"].values())
              for i, e in enumerate(people)))

    skin = p.extract_item(src, ds["iloc"], item_for_uri(ds, p.MATTE_URIS["semanticskinmatte"]))
    portrait_iid = item_for_uri(ds, p.MATTE_URIS["portraiteffectsmatte"])
    portrait = p.extract_item(src, ds["iloc"], portrait_iid)
    for uri, want, label in ((p.SOFT_SKIN_SKIN_URIS[0], skin, "skin v2"),
                             (p.SOFT_SKIN_SKIN_URIS[1], skin, "face skin"),
                             (p.SOFT_SKIN_PERSON_URI, portrait, "person")):
        iid = item_for_uri(do, uri)
        check(f"{name}: {label} matte is the photo's own matte",
              iid is not None and p.extract_item(out, do["iloc"], iid) == want)
        check(f"{name}: {label} matte geometry is that matte's",
              iid is not None and p.dimensions_for_item(do["props"], iid)
              == p.dimensions_for_item(ds["props"], portrait_iid if label == "person"
                                       else item_for_uri(ds, p.MATTE_URIS["semanticskinmatte"])))
    empty = [u for u in p.MATTE_2026_URIS if u not in p.SOFT_SKIN_SKIN_URIS + (p.SOFT_SKIN_PERSON_URI,)]
    check(f"{name}: the other nine 2026 mattes stay empty",
          all(p.extract_item(out, do["iloc"], item_for_uri(do, u)) == p.MATTE_2026_EMPTY for u in empty))

    inst = [i for i in do["infos"] if p.aux_uri_for_item(do["props"], i) == p.URI_PERSON_INSTANCES]
    check(f"{name}: one person-instance matte per face", len(inst) == len(faces), inst)
    keys = []
    for iid in inst:
        side = [r["from"] for r in do["refs"] if r["type"] == "cdsc" and r["to"] == [iid]]
        xmp = p.extract_item(out, do["iloc"], side[0]).decode() if len(side) == 1 else ""
        keys.append(xmp.split("ReferenceKey>")[1].split("<")[0] if "ReferenceKey>" in xmp else None)
        auxl = [r["to"] for r in do["refs"] if r["type"] == "auxl" and r["from"] == iid]
        check(f"{name}: instance {iid} is the Portrait matte, auxl to the primary",
              p.extract_item(out, do["iloc"], iid) == portrait and len(auxl) == 1
              and do["primary"] in auxl[0])
    check(f"{name}: instance XMP keys match the people entries",
          keys == [e["instanceMaskReferenceKey"] for e in people], keys)


def run(args, out):
    r = subprocess.run([sys.executable, str(ROOT / "photographic_style_port.py"), *args, str(out)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr or r.stdout)


with tempfile.TemporaryDirectory() as work:
    work = Path(work)
    cases = []
    for f in sorted((ROOT / "noSmartStyle-people").glob("*.HEIC")):
        cases.append(("patch", f))
    for folder in (ROOT / "Smartstyle", STYLE_ONLY):
        for f in sorted(folder.glob("*.HEIC")) if folder.exists() else []:
            data = f.read_bytes()
            d = p.discover_heic(data)
            if d["styles_item"] is not None and not any(
                    i.get("uri") == p.URI_TEXTURE_STYLES for i in d["infos"].values()):
                cases.append(("add-texture", f))
    if not cases:
        print("  no fixtures; skipped")
    for mode, f in cases:
        src = f.read_bytes()
        d = p.discover_heic(src)
        out = work / f"{f.stem}_out.HEIC"
        if mode == "patch":
            run(["patch", str(f), "--linear-thumb", "reuse-thumbnail", "--scene-stats", "donor",
                 "--light-maps", "flat"], out)
        else:
            run(["add-texture", str(f)], out)
        data = out.read_bytes()
        name = f"{mode} {f.name[:40]}"
        print(name)
        if p.soft_skin_people(src, d) is not None:
            check_output(name, src, data)
        else:
            tex = texture(data)
            check(f"{name}: no faces or mattes, so no people data and no instances",
                  "TextureStylePostProcessedPeopleData" not in tex
                  and item_for_uri(p.discover_heic(data), p.URI_PERSON_INSTANCES) is None)
        tex = texture(data)
        check(f"{name}: FilmGrainSeed is the photo's own ({p.film_grain_seed(src, d)})",
              tex["FilmGrainSeed"] == p.film_grain_seed(src, d))
        if mode == "patch":
            do = p.discover_heic(data)
            own = {p.aux_uri_for_item(d["props"], i) for i in d["infos"]}
            slots = [i for i in do["infos"] if p.aux_uri_for_item(do["props"], i) in p.MATTE_URIS.values()
                     and p.aux_uri_for_item(do["props"], i) not in own]
            check(f"{name}: matte slots the photo does not fill are exactly empty ({len(slots)})",
                  all(p.extract_item(data, do["iloc"], i) == p.CLASSIC_MATTE_EMPTY for i in slots))

# The synthesis must land near what iOS 27 itself writes, judged on native Soft Skin photos.
if NATIVE.exists():
    print("synthesis vs Apple (native Soft Skin photos, frontal faces)")
    for f in sorted(NATIVE.glob("*.HEIC")):
        data = f.read_bytes()
        d = p.discover_heic(data)
        W, H = p.dimensions_for_item(d["props"], d["primary"])
        irot = p.irot_angle_for_item(data, d["props"], d["primary"])
        regions = p.xmp_face_regions(data, d)
        for e in texture(data)["TextureStylePostProcessedPeopleData"]:
            if abs(math.degrees(e["faceYaw"])) > 25:
                continue  # the frontal template does not cover turned faces
            r = e["faceROI"]
            cx, cy = r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
            face = min(regions, key=lambda q: (q["x"] - cx) ** 2 + (q["y"] - cy) ** 2)
            ours = p.soft_skin_people_entry(face, 0, irot, W, H)
            s = r["width"] * W
            o = ours["faceROI"]
            centre = math.hypot((o["x"] + o["width"] / 2 - cx) * W, (o["y"] + o["height"] / 2 - cy) * H) / s
            lm = statistics.mean(math.hypot((a["point"]["x"] - b["point"]["x"]) * W,
                                            (a["point"]["y"] - b["point"]["y"]) * H) / s
                                 for a, b in zip(ours["faceLandmarks"], e["faceLandmarks"]))
            roll = abs((math.degrees(ours["faceRoll"] - e["faceRoll"]) + 180) % 360 - 180)
            yaw = abs(math.degrees(ours["faceYaw"] - e["faceYaw"]))
            label = f"{f.name[-14:]} face {e['faceID']}"
            check(f"{label}: faceROI centre within 8% of face width ({centre:.3f})", centre < 0.08)
            check(f"{label}: faceROI size within 10% ({o['width'] / r['width']:.3f})",
                  abs(o["width"] / r["width"] - 1) < 0.10)
            check(f"{label}: landmarks within 12% of face width on average ({lm:.3f})", lm < 0.12)
            check(f"{label}: faceRoll within 10 degrees ({roll:.1f})", roll < 10)
            check(f"{label}: faceYaw within 10 degrees ({yaw:.1f})", yaw < 10)

print("plist writer")
sample = {"s": "Standard", "t": True, "f": False, "i": 3, "big": 300, "neg": -1, "r": 0.0,
          "one": 1.0, "list": [1.5, {"x": 0.25}], "u": "数", "s2": "Standard"}
check("build_bplist round-trips through plistlib with types intact",
      plistlib.loads(p.build_bplist(sample)) == sample
      and isinstance(plistlib.loads(p.build_bplist(sample))["one"], float))
check("build_bplist keeps the Texture renderer header bytes' meaning",
      plistlib.loads(p.build_bplist(dict(p.TEXTURE_STYLES_HEADER))) == plistlib.loads(p.TEXTURE_STYLES_BLOB))
check("Texture renderer keeps the native iPhone19,2 donor profile",
      plistlib.loads(p.TEXTURE_STYLES_BLOB)["HardwareModel"] == "iPhone19,2")

print("no people")
for f in [ROOT / "Smartstyle" / "IMG_5096.HEIC", ROOT / "noSmartStyle" / "IMG_5037.HEIC"]:
    if f.exists():
        data = f.read_bytes()
        check(f"{f.name}: soft_skin_people is None (no face regions or mattes)",
              p.soft_skin_people(data, p.discover_heic(data)) is None)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
