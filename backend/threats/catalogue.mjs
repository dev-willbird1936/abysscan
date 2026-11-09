// Step 3 of threat search: is the resolved threat already in the ocean? Match the canonical name and its aliases, never the
// visitor's wording, against the base fish (data/ocean-base.json, with data/threat-aliases.json), the authored scene files
// (data/fish-scenes) and the threats this site has already generated (a record with a scene that passed its checks).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nameKey } from './text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ALIAS_FILE = join(ROOT, 'data', 'threat-aliases.json');
export const SCENE_DIR = join(ROOT, 'data', 'fish-scenes');

// The names a base fish is known by: its own, its parts ("DarkSide / Colonial Pipeline"), the bracketed part ("CIH (Chernobyl)")
// and the alias table's.
function baseNames(entry, table) {
  const names = new Set([entry.name, ...(table[entry.name] ?? [])]);
  for (const part of entry.name.split(/\s+\/\s+/)) names.add(part);
  const bracket = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(entry.name);
  if (bracket) names.add(bracket[1]).add(bracket[2]);
  if (entry.scene) names.add(entry.scene.replace(/-/g, ' '));
  return [...names].map(nameKey).filter(key => key.length >= 3);
}

// An index from a name key to the run that plays it: { key → { run, name } }. Built once per call site; cheap (60 entries).
export function buildCatalogue({ base = [], aliasFile = ALIAS_FILE, threatDir } = {}) {
  const table = existsSync(aliasFile) ? JSON.parse(readFileSync(aliasFile, 'utf8')).aliases ?? {} : {};
  const index = new Map();
  for (const entry of base) {
    if (!entry.scene) continue; // a base fish with no desktop cannot be opened
    for (const key of baseNames(entry, table)) if (!index.has(key)) index.set(key, { run: `fish-${entry.ref}`, name: entry.name });
  }
  if (threatDir && existsSync(threatDir)) {
    for (const file of readdirSync(threatDir)) {
      if (!file.endsWith('.json')) continue;
      const slug = file.slice(0, -5);
      if (!existsSync(join(threatDir, `${slug}.scene`))) continue; // researched but never created: not in the ocean yet
      try {
        const record = JSON.parse(readFileSync(join(threatDir, file), 'utf8'));
        for (const key of [record.name, ...(record.aliases ?? [])].map(nameKey)) if (key.length >= 3 && !index.has(key)) index.set(key, { run: `fish-r-${slug}`, name: record.name });
      } catch { /* a damaged record is skipped */ }
    }
  }
  return index;
}

// { run, name } of the scene that already plays this threat, or null.
export function findOnSite({ name, aliases = [] }, catalogue) {
  for (const key of [name, ...aliases].map(nameKey)) {
    const hit = catalogue.get(key);
    if (hit) return hit;
  }
  return null;
}
