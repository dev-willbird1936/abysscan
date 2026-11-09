"""Export Codex transparent creature layers and validate every style/depth pair."""
from pathlib import Path
import json
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parent
STYLES = ['minimal-silhouettes', 'paper-cut', 'watercolor', 'pixel-art', 'field-guide', 'screen-print']
DEPTHS = ['01-sunlight', '02-twilight', '03-midnight', '04-abyss', '05-trench']
SOURCES = ROOT / 'creature-source-assets'
DEST = ROOT / 'creature-assets'
expected = [SOURCES / s / f'{d}.png' for s in STYLES for d in DEPTHS]
missing = [str(p.relative_to(ROOT)) for p in expected if not p.is_file()]
if missing:
    raise SystemExit('Missing source layers: ' + ', '.join(missing))
if DEST.exists():
    raise SystemExit('Refusing to overwrite existing creature-assets.')
records = []
for src in expected:
    with Image.open(src) as original:
        original.load()
        if 'A' not in original.getbands():
            raise SystemExit(f'No native alpha channel: {src}')
        alpha = original.getchannel('A')
        hist = alpha.histogram()
        transparent = hist[0] / (original.width * original.height)
        visible = sum(hist[1:]) / (original.width * original.height)
        if transparent < .25 or visible < .002:
            raise SystemExit(f'Invalid creature transparency/content: {src}, empty={transparent:.3f}, visible={visible:.3f}')
        bounds = alpha.getbbox()
        # Fit the entire generated composition, without cutting animal bodies.
        # Leave a modest outer margin and room for the depth caption.
        body = original.convert('RGBA')
        resample = Image.Resampling.NEAREST if src.parent.name == 'pixel-art' else Image.Resampling.LANCZOS
        size = (1056, 594) if src.stem == '03-midnight' else (1312, 720)
        body = ImageOps.contain(body, size, method=resample)
        out = Image.new('RGBA', (1600, 900), (0, 0, 0, 0))
        out.alpha_composite(body, ((1600 - body.width) // 2, (900 - body.height) // 2))
        dst = DEST / src.parent.name / src.name
        dst.parent.mkdir(parents=True, exist_ok=True)
        with dst.open('xb') as handle:
            out.save(handle, format='PNG')
        pixels = out.getchannel('A').histogram()
        records.append({'source': str(src.relative_to(ROOT)), 'path': str(dst.relative_to(ROOT)),
                        'source_dimensions': list(original.size), 'dimensions': [1600, 900],
                        'source_transparent_fraction': round(transparent, 4),
                        'transparent_fraction': round(pixels[0] / (1600 * 900), 4),
                        'alpha_extrema': list(out.getchannel('A').getextrema()),
                        'source_visible_bounds': list(bounds)})
manifest = {'generator': 'Codex native image_gen.imagegen', 'expected': 30, 'exported': len(records),
            'processing': 'Native RGBA alpha preserved. Composition fit onto exact 1600x900 with clear margins; no background removal or replacement artwork.',
            'images': records}
with (ROOT / 'creature-verification.json').open('x', encoding='utf-8') as handle:
    json.dump(manifest, handle, indent=2)
# Contact sheet composites the actual overlays against the actual ocean backgrounds.
sheet = Image.new('RGB', (1600, 6 * 214), '#07101a')
draw = ImageDraw.Draw(sheet)
for i, record in enumerate(records):
    s, d = STYLES[i // 5], DEPTHS[i % 5]
    with Image.open(ROOT / 'assets' / s / f'{d}.png') as background, Image.open(ROOT / record['path']) as overlay:
        composite = Image.alpha_composite(background.convert('RGBA'), overlay.convert('RGBA')).convert('RGB')
        thumb = composite.resize((320, 180), Image.Resampling.LANCZOS)
    x, y = (i % 5) * 320, (i // 5) * 214
    draw.text((x + 8, y + 5), f'{s} / {d}', fill='#d8ebf4')
    sheet.paste(thumb, (x, y + 28))
with (ROOT / 'creature-contact-sheet.jpg').open('xb') as handle:
    sheet.save(handle, format='JPEG', quality=92)
print(json.dumps({'exported': len(records), 'dimensions': [1600, 900], 'genuine_transparency': True}, indent=2))
