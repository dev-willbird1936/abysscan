"""Apply five native flat-style revisions, preserving previous outputs and evidence."""
from pathlib import Path
import json
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parent
DEPTHS = ['01-sunlight', '02-twilight', '03-midnight', '04-abyss', '05-trench']
STYLES = ['minimal-silhouettes', 'paper-cut', 'watercolor', 'pixel-art', 'field-guide', 'screen-print']
source = ROOT / 'creature-revisions' / 'minimal-silhouettes'
target = ROOT / 'creature-assets' / 'minimal-silhouettes'
backup = ROOT / 'creature-prior-exports' / 'minimal-silhouettes'
report = ROOT / 'creature-verification.json'
sheet_path = ROOT / 'creature-contact-sheet.jpg'
old_report = ROOT / 'creature-verification-before-flat-revision.json'
old_sheet = ROOT / 'creature-contact-sheet-before-flat-revision.jpg'
if any(p.exists() for p in [backup, old_report, old_sheet]):
    raise SystemExit('Revision backup already exists; refusing to overwrite.')
for depth in DEPTHS:
    with Image.open(source / f'{depth}.png') as im:
        im.load()
        if im.mode != 'RGBA' or im.getchannel('A').getextrema() != (0, 255):
            raise SystemExit(f'Invalid native transparency: {depth}')
        if im.getchannel('A').histogram()[0] / (im.width * im.height) < .25:
            raise SystemExit(f'Insufficient transparent space: {depth}')
manifest = json.loads(report.read_text())
backup.parent.mkdir(parents=True, exist_ok=True)
target.rename(backup)
target.mkdir()
for depth in DEPTHS:
    src = source / f'{depth}.png'
    with Image.open(src) as original:
        original.load()
        size = (1056, 594) if depth == '03-midnight' else (1312, 720)
        body = ImageOps.contain(original, size, method=Image.Resampling.LANCZOS)
        out = Image.new('RGBA', (1600, 900), (0, 0, 0, 0))
        out.alpha_composite(body, ((1600 - body.width) // 2, (900 - body.height) // 2))
        dst = target / f'{depth}.png'
        with dst.open('xb') as handle:
            out.save(handle, format='PNG')
        record = next(r for r in manifest['images'] if Path(r['path']).parent.name == 'minimal-silhouettes' and Path(r['path']).stem == depth)
        record.update(source=str(src.relative_to(ROOT)), source_dimensions=list(original.size),
                      source_transparent_fraction=round(original.getchannel('A').histogram()[0] / (original.width * original.height), 4),
                      transparent_fraction=round(out.getchannel('A').histogram()[0] / (1600 * 900), 4),
                      alpha_extrema=list(out.getchannel('A').getextrema()),
                      source_visible_bounds=list(original.getchannel('A').getbbox()))
manifest['flat_style_revision'] = 'Five new native Codex imagegen flat silhouette compositions; previous outputs and evidence retained.'
report.rename(old_report)
with report.open('x', encoding='utf-8') as handle:
    json.dump(manifest, handle, indent=2)
sheet = Image.new('RGB', (1600, 6 * 214), '#07101a')
draw = ImageDraw.Draw(sheet)
for i, style in enumerate(STYLES):
    for j, depth in enumerate(DEPTHS):
        with Image.open(ROOT / 'assets' / style / f'{depth}.png') as bg, Image.open(ROOT / 'creature-assets' / style / f'{depth}.png') as creature:
            composite = Image.alpha_composite(bg.convert('RGBA'), creature).convert('RGB')
            thumb = composite.resize((320, 180), Image.Resampling.LANCZOS)
        x, y = j * 320, i * 214
        draw.text((x + 8, y + 5), f'{style} / {depth}', fill='#d8ebf4')
        sheet.paste(thumb, (x, y + 28))
sheet_path.rename(old_sheet)
with sheet_path.open('xb') as handle:
    sheet.save(handle, format='JPEG', quality=92)
print('Applied five flat native creature revisions; preserved previous exports, report, and contact sheet.')
