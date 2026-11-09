"""Verify the 30 generated ocean backgrounds; optionally create a contact sheet."""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parent
STYLES = ['minimal-silhouettes', 'paper-cut', 'watercolor', 'pixel-art', 'field-guide', 'screen-print']
DEPTHS = ['01-sunlight', '02-twilight', '03-midnight', '04-abyss', '05-trench']
rows = []
for style in STYLES:
    for depth in DEPTHS:
        path = ROOT / 'assets' / style / f'{depth}.png'
        row = {'style': style, 'depth': depth, 'path': str(path.relative_to(ROOT))}
        if not path.is_file():
            row['error'] = 'missing'
        else:
            try:
                with Image.open(path) as im:
                    im.load()
                    w, h = im.size
                    row.update(width=w, height=h, approximately_16_9=abs(w / h - 16 / 9) < .01,
                               exact_16_9=w * 9 == h * 16,
                               mean_brightness=round(ImageStat.Stat(im.convert('L').resize((160, 90))).mean[0], 2))
                    if not row['approximately_16_9']:
                        row['error'] = 'not 16:9'
            except (OSError, ValueError) as error:
                row['error'] = str(error)
        rows.append(row)
summary = {'expected': 30, 'valid': sum('error' not in r for r in rows), 'images': rows}
print(json.dumps(summary, indent=2))
if '--contact-sheet' in sys.argv:
    from PIL import ImageOps
    sheet = Image.new('RGB', (1600, 6 * 214), '#07101a')
    draw = ImageDraw.Draw(sheet)
    for i, row in enumerate(rows):
        x, y = (i % 5) * 320, (i // 5) * 214
        draw.text((x + 8, y + 5), f"{row['style']} / {row['depth']}", fill='#d8ebf4')
        if 'error' not in row:
            with Image.open(ROOT / row['path']) as im:
                sheet.paste(ImageOps.fit(im.convert('RGB'), (320, 180)), (x, y + 28))
        else:
            draw.text((x + 8, y + 70), row['error'], fill='#eda59d')
    target = ROOT / 'contact-sheet.jpg'
    if target.exists():
        raise SystemExit('Contact sheet already exists; preserve it or choose another filename before rerunning.')
    sheet.save(target, quality=90)
raise SystemExit(0 if summary['valid'] == 30 else 1)
