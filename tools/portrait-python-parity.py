"""Reconstruct a web export with Python's graph writer using the export's style inputs.

This checks graph-writer parity, not independent decoding, thumbnail encoding, or Photos UI.
Reads both photos without writing either one.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import photographic_style_port as p


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("original", type=Path)
    parser.add_argument("exported", type=Path)
    args = parser.parse_args()
    original, exported = args.original.read_bytes(), args.exported.read_bytes()
    source, target = p.discover_heic(original), p.discover_heic(exported)
    for iid, item in source["iloc"]["items"].items():
        if iid == source["exif_item"] or item["construction_method"] != 0:
            continue
        if p.extract_item(original, source["iloc"], iid) != p.extract_item(exported, target["iloc"], iid):
            raise p.PortError(f"Export item {iid} differs from the supplied original")
    lt = target["linear_thumb"]
    if lt is None or target["styles_item"] is None:
        raise p.PortError("Export needs styles and a linear thumbnail")
    thumbnail = {"sample": p.extract_item(exported, target["iloc"], lt),
                 **{key: p.property_box_bytes(exported, target["props"], lt, key)
                    for key in ("hvcC", "ispe", "pixi")}}
    marker_type, marker = p.extract_apple_makernote_tag(
        p.extract_item(exported, target["iloc"], target["exif_item"]))
    styles = p.extract_item(exported, target["iloc"], target["styles_item"])
    texture = any(info.get("uri") == p.URI_TEXTURE_STYLES for info in target["infos"].values())
    rebuilt, report = p.graft_style_graph(original, source, styles, marker, marker_type, thumbnail, texture)
    equal = rebuilt == exported
    print(json.dumps({"byte_identical": equal, "python_bytes": len(rebuilt),
                      "exported_bytes": len(exported),
                      "python_sha256": hashlib.sha256(rebuilt).hexdigest(),
                      "exported_sha256": hashlib.sha256(exported).hexdigest(),
                      "scope": "graph writer with exported styles, marker, and thumbnail inputs",
                      "report": report}, indent=2))
    return 0 if equal else 1


if __name__ == "__main__":
    raise SystemExit(main())
