// Build the legacy chamber and generated Abyss homepage from project-owned sources.
// Usage: node build.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validatePersonaManifest } from './backend/personas.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ENTRY_TAG = '<script type="module" src="/desktop-entry.js"></script>';

/** Register the project-owned desktop adapter once, without changing the vendor package. */
export function registerDesktopEntry(html) {
  if (typeof html !== 'string') throw new TypeError('Abyss HTML must be text.');
  const withoutOldRegistrations = html.replace(
    /<script\b(?=[^>]*\bsrc=["'](?:\/ui\/abyss)?\/desktop-entry\.js(?:\?[^"']*)?["'])[^>]*>\s*<\/script>\s*/gi,
    '',
  );
  const rendererTag = /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\/ui\/abyss\/assets\/[^"']+\.js["'])[^>]*>[\s\S]*?<\/script>/i;
  if (!rendererTag.test(withoutOldRegistrations)) {
    throw new Error('Packaged Abyss HTML is missing its hashed module entry point.');
  }
  return withoutOldRegistrations.replace(rendererTag, `${DESKTOP_ENTRY_TAG}\n  $&`);
}

function build() {
  const data = JSON.parse(readFileSync(join(root, 'data/attacks.json'), 'utf8'));
  const personas = validatePersonaManifest(JSON.parse(readFileSync(join(root, 'data/personas.json'), 'utf8')));
  const template = readFileSync(join(root, 'src/index.template.html'), 'utf8');

  if (!data.attacks?.length) throw new Error('data/attacks.json has no attacks array');

  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  const personaPayload = JSON.stringify(personas).replace(/</g, '\\u003c');
  const dataMarker = '/*__DATA__*/';
  const personaMarker = '/*__PERSONAS__*/';
  if (!template.includes(dataMarker) || !template.includes(personaMarker)) {
    throw new Error(`template must contain both ${dataMarker} and ${personaMarker} markers`);
  }

  const chamber = template.replace(dataMarker, payload).replace(personaMarker, personaPayload);
  const rendererDir = join(root, 'ui/abyss');
  const hasRenderer = existsSync(rendererDir);
  const source = hasRenderer ? readFileSync(join(rendererDir, 'index.html'), 'utf8') : chamber;
  const homepage = hasRenderer ? registerDesktopEntry(source) : source;
  writeFileSync(join(root, 'chamber.html'), chamber, 'utf8');
  writeFileSync(join(root, 'index.html'), homepage, 'utf8');

  const classCounts = Object.fromEntries(['A', 'B', 'C', 'D'].map(cls => [
    cls,
    data.attacks.filter(attack => attack.cls === cls).length,
  ]));
  console.log(
    `built ${hasRenderer ? 'Abyss' : 'timeline (Abyss renderer not installed)'} index.html and chamber.html  ${data.attacks.length} attacks  A ${classCounts.A} / B ${classCounts.B} / C ${classCounts.C} / D ${classCounts.D}  ${(chamber.length / 1024).toFixed(1)} KB`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) build();
