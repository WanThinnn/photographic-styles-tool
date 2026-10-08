"""Private iPhone ablations for older native Styles + Texture rendering.

These outputs are diagnostic files, not a validated renderer fix. No photo pixels,
HDR, depth, Exif, original masks or native coefficient lattice are replaced.
Run: python tools/texture-compatibility.py ORIGINAL.HEIC OUTPUT_DIRECTORY
"""
import argparse
import json
import plistlib
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import photographic_style_port as p


def rewrite_styles(data, transform):
    d = p.discover_heic(data)
    styles = plistlib.loads(p.extract_item(data, d['iloc'], d['styles_item']))
    before = plistlib.loads(p.extract_item(data, d['iloc'], d['styles_item']))
    transform(styles)
    changed = sorted(k for k in set(before) | set(styles) if before.get(k) != styles.get(k))
    mo, ms = d['meta'][:2]
    fo, fs = p.top_box(data, 'ftyp')[:2]
    result = p.rebuild_heic(data, d, data[fo:fo+fs], data[mo:mo+ms],
                            {d['styles_item']: plistlib.dumps(styles, fmt=plistlib.FMT_BINARY, sort_keys=False)})
    return result, changed


def without_people(data):
    d = p.discover_heic(data)
    mo, ms = d['meta'][:2]
    fo, fs = p.top_box(data, 'ftyp')[:2]
    meta, payloads, _ = p.add_texture_items(data[mo:mo+ms], d['primary'],
                                         people=None, grain_seed=p.film_grain_seed(data, d))
    return p.rebuild_heic(data, d, data[fo:fo+fs], meta, payloads)


def verify(original, output, changed_keys):
    a, b = p.discover_heic(original), p.discover_heic(output)
    count = 0
    for iid, item in a['iloc']['items'].items():
        if iid == a['styles_item']:
            continue
        if item['construction_method'] == 0:
            assert p.extract_item(original, a['iloc'], iid) == p.extract_item(output, b['iloc'], iid), iid
        else:
            assert p.idat_item_bytes(original, iid, a['meta']) == p.idat_item_bytes(output, iid, b['meta']), iid
        count += 1
    before = plistlib.loads(p.extract_item(original, a['iloc'], a['styles_item']))
    after = plistlib.loads(p.extract_item(output, b['iloc'], b['styles_item']))
    actual = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
    assert actual == set(changed_keys), actual
    for iid in a['infos']:
        for kind in ['hvcC', 'ispe', 'pixi', 'colr', 'irot', 'imir', 'auxC']:
            assert p.property_box_bytes(original, a['props'], iid, kind) == p.property_box_bytes(output, b['props'], iid, kind), (iid, kind)
    for ref in a['refs']:
        assert ref in b['refs'], ref
    return {'preserved_original_payloads_except_styles': count,
            'changed_style_values': sorted(actual), 'original_properties_and_references_preserved': True}


def generate(source, directory):
    data = source.read_bytes()
    d = p.discover_heic(data)
    if d['styles_item'] is None:
        raise p.PortError('Needs native Styles')
    styles = plistlib.loads(p.extract_item(data, d['iloc'], d['styles_item']))
    if '3' in styles:
        raise p.PortError('This experiment requires an older Styles photo without a tone curve')
    base, _ = p.add_texture_bytes(data)
    # Known native curve header; identity samples are computed, never copied
    # from another photo. This is deliberately an unvalidated ablation.
    curve = b'\x01\x01\x00\x00' + b''.join(struct.pack('<H', i * 257) for i in range(256))
    def add_curve(pl):
        pl['3'] = curve
    def add_schema_curve(pl):
        pl['3'] = curve
        pl['0'] = 131087
        pl['k'] = False
    control, _ = rewrite_styles(base, lambda pl: None)
    curve_only, _ = rewrite_styles(base, add_curve)
    schema_curve, _ = rewrite_styles(base, add_schema_curve)
    variants = [('A_Control', control, []),
                ('B_NoPeople', without_people(data), []),
                ('C_IdentityCurve', curve_only, ['3']),
                ('D_SchemaAndCurve', schema_curve, ['0', '3', 'k'])]
    directory.mkdir(parents=True, exist_ok=True)
    report = {'source': source.name, 'source_style_version': styles['0'],
              'native_faces': len(p.xmp_face_regions(data, d)), 'photos_validation': 'pending', 'variants': {}}
    for label, output, changes in variants:
        name = f'{source.stem}_{label}.HEIC'
        checks = verify(data, output, changes)
        (directory / name).write_bytes(output)
        report['variants'][name] = {'bytes': len(output), **checks}
    (directory / f'{source.stem}_checks.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('source', type=Path)
    ap.add_argument('directory', type=Path)
    args = ap.parse_args()
    print(json.dumps(generate(args.source, args.directory), indent=2))
