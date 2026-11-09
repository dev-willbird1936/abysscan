"""Export native Codex originals to exact 1600x900, preserving every source."""
from pathlib import Path
import json
from PIL import Image, ImageOps, ImageEnhance, ImageStat

ROOT = Path(__file__).resolve().parent
source = ROOT / 'source-assets'
target = ROOT / 'assets'
if not source.is_dir():
    raise SystemExit('Preserve the finished native assets as source-assets before exporting.')
if target.exists():
    raise SystemExit('Refusing to replace existing assets.')
styles = ['minimal-silhouettes', 'paper-cut', 'watercolor', 'pixel-art', 'field-guide', 'screen-print']
depths = ['01-sunlight', '02-twilight', '03-midnight', '04-abyss', '05-trench']
paths = [source / style / f'{depth}.png' for style in styles for depth in depths]
if not all(p.is_file() for p in paths):
    raise SystemExit('All 30 native source images are required before export.')
records = []
for style in styles:
    previous = None
    for depth in depths:
        src = source / style / f'{depth}.png'
        dst = target / style / f'{depth}.png'
        with Image.open(src) as original:
            original.load()
            resample = Image.Resampling.NEAREST if style == 'pixel-art' else Image.Resampling.LANCZOS
            im = ImageOps.fit(original.convert('RGB'), (1600, 900), method=resample)
            brightness = ImageStat.Stat(im.convert('L').resize((160, 90))).mean[0]
            factor = 1.0
            if previous is not None and brightness >= previous:
                factor = previous * .85 / brightness
                im = ImageEnhance.Brightness(im).enhance(factor)
            previous = ImageStat.Stat(im.convert('L').resize((160, 90))).mean[0]
            dst.parent.mkdir(parents=True, exist_ok=True)
            with dst.open('xb') as handle:
                im.save(handle, format='PNG')
            records.append({'source': str(src.relative_to(ROOT)), 'path': str(dst.relative_to(ROOT)),
                            'source_dimensions': list(original.size), 'export_dimensions': [1600, 900],
                            'brightness_factor': round(factor, 5), 'mean_brightness': round(previous, 2)})
with (ROOT / 'export-manifest.json').open('x', encoding='utf-8') as handle:
    json.dump({'generation': 'Codex native image_gen.imagegen',
               'processing': 'Exact 16:9 export; only non-decreasing depth brightness is reduced. Native originals preserved.',
               'images': records}, handle, indent=2)
print(json.dumps({'exported': len(records), 'dimensions': [1600, 900],
                  'darkened_images': [r['path'] for r in records if r['brightness_factor'] < 1]}, indent=2))
