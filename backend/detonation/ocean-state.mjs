// Public ocean state (SPEC §9.2, DETONATION-DESIGN §6). Holds counts, plus per creature the last few fish it ate as species, file type,
// depth and UTC date: no file names, hashes, job IDs or fine-grained times.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FISH_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'fish.json');
export const BASE_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'ocean-base.json');
const FISH_DEPTHS = ['sunlight', 'twilight'];
const CREATURE_DEPTHS = ['midnight', 'abyss', 'trench'];
const RARE_BELOW = 5;
const MAX_EATS = 20; // fish remembered per creature; `creatures[id]` keeps the full count

// Fallback when data/fish.json is absent or lacks a type: DETONATION-DESIGN §6, keyed by detectedType.
const INLINE_SPECIES = {
  pufferfish: ['zip', '7z', 'rar'], flounder: ['pdf'], 'leafy-seadragon': ['docx', 'docm', 'doc'],
  boxfish: ['xlsx', 'xlsm', 'xls'], lionfish: ['pptx', 'pptm', 'ppt'], ribbonfish: ['rtf'],
  barracuda: ['exe'], remora: ['dll'], 'mandarin-dragonet': ['html'], 'picasso-triggerfish': ['svg'],
  'flying-fish': ['eml', 'msg'], batfish: ['bat'], 'pilot-fish': ['js-wsh', 'vbs', 'hta'],
  'torpedo-ray': ['ps1'], archerfish: ['lnk'], 'snake-eel': ['py'], jack: ['js-node'],
  'sea-bass': ['sh'], 'goblin-shark': ['elf'], jawfish: ['msi'],
  butterflyfish: ['png', 'jpeg', 'gif'], plaice: ['text'], 'pocket-shark': ['apk'],
  mackerel: ['dmg', 'pkg', 'macho'], 'java-rabbitfish': ['jar'], sole: ['one'],
};

let speciesMap;
function species() {
  if (speciesMap) return speciesMap;
  const byType = new Map(Object.entries(INLINE_SPECIES).flatMap(([name, types]) => types.map((t) => [t, name])));
  let fallback = 'coelacanth';
  if (existsSync(FISH_FILE)) {
    const fish = JSON.parse(readFileSync(FISH_FILE, 'utf8'));
    for (const { species: name, types } of fish.fish) for (const t of types) byType.set(t, name);
    fallback = fish.fallback ?? fallback;
  }
  return (speciesMap = { byType, fallback });
}

// The base fish (data/ocean-base.json): well-known files and attacks that are in the ocean before any upload. Public history,
// so they keep their names; they are never stored in the state, and never count towards the rare-species fold that hides an
// uploader's unusual file type. Each is { ref, name, year?, depth, type, findingId? }: a creature eats it, or it joins its school.
// ref (b<n>, its place in the file) names its desktop scene (fish-replays.mjs, run fish-b<n>): scene is data/fish-scenes/<scene>.scene,
// os the desktop it starts on (that file's `os` line); noDesktop says why a fish has none.
export function loadBase(file = BASE_FILE) {
  if (!existsSync(file)) return [];
  const { byType, fallback } = species();
  const osOf = (scene) => {
    const path = join(dirname(file), 'fish-scenes', `${scene}.scene`);
    return existsSync(path) ? (/^os (windows|macos)\s*$/m.exec(readFileSync(path, 'utf8'))?.[1] ?? 'windows') : null;
  };
  return JSON.parse(readFileSync(file, 'utf8')).entries.map(({ name, year, depth, type, findingId, scene, noDesktop }, n) => ({
    ref: `b${n}`, name, ...(scene && osOf(scene) ? { scene, os: osOf(scene) } : { noDesktop: noDesktop ?? 'No desktop scene yet.' }), ...(year ? { year } : {}), depth, type: type ?? null, species: (type && byType.get(type)) || fallback, ...(findingId ? { findingId } : {}),
  }));
}

// `eats` is absent from state files written before it existed; readers treat a missing list as empty.
export const emptyState = () => ({ schools: {}, creatures: {}, eats: {} });

export function loadState(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : emptyState();
}

export function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, file);
}

// pending is a plain array; nothing reaches the public state until applyBatch.
export function addResult(pending, { detectedType, depth, findings = [] }) {
  if (FISH_DEPTHS.includes(depth)) {
    const { byType, fallback } = species();
    pending.push({ species: byType.get(detectedType) ?? fallback, depth });
  } else if (CREATURE_DEPTHS.includes(depth)) {
    const { byType, fallback } = species();
    const known = byType.has(detectedType);
    for (const finding of findings) {
      pending.push({ findingId: typeof finding === 'string' ? finding : finding.id, species: byType.get(detectedType) ?? fallback, type: known ? detectedType : null, depth });
    }
  } else {
    throw new Error(`unknown depth: ${depth}`);
  }
  return pending;
}

export function applyBatch(state, pending, at = new Date()) {
  const day = at.toISOString().slice(0, 10);
  for (const { species: name, depth, findingId, type } of pending) {
    if (findingId !== undefined) {
      state.creatures[findingId] = (state.creatures[findingId] ?? 0) + 1;
      const eats = ((state.eats ??= {})[findingId] ??= []);
      eats.push({ species: name, type, depth, day });
      if (eats.length > MAX_EATS) eats.splice(0, eats.length - MAX_EATS);
    } else {
      const school = (state.schools[name] ??= {});
      school[depth] = (school[depth] ?? 0) + 1;
    }
  }
  pending.length = 0;
  return state;
}

export function publicView(state, batchAt, base = []) {
  const { fallback } = species();
  const folded = {};
  for (const [name, depths] of Object.entries(state.schools)) {
    const total = Object.values(depths).reduce((a, b) => a + b, 0);
    const target = total < RARE_BELOW ? fallback : name;
    for (const [depth, count] of Object.entries(depths)) {
      folded[target] ??= {};
      folded[target][depth] = (folded[target][depth] ?? 0) + count;
    }
  }
  // Base school fish join after the fold, and name the school's well-known members.
  const named = {}, refs = {}, oses = {}, whys = {};
  for (const fish of base) {
    if (fish.findingId || !FISH_DEPTHS.includes(fish.depth)) continue;
    (folded[fish.species] ??= {})[fish.depth] = (folded[fish.species][fish.depth] ?? 0) + 1;
    ((named[fish.species] ??= {})[fish.depth] ??= []).push(fish.name);
    ((refs[fish.species] ??= {})[fish.depth] ??= []).push(fish.ref);
    ((oses[fish.species] ??= {})[fish.depth] ??= []).push(fish.os ?? null);
    ((whys[fish.species] ??= {})[fish.depth] ??= []).push(fish.noDesktop ?? null);
  }
  // Sorted, so output order cannot reveal arrival order.
  const schools = Object.entries(folded)
    .flatMap(([name, depths]) => Object.entries(depths).map(([depth, count]) => ({ species: name, depth, count,
      ...(base.length ? { observed: count - (named[name]?.[depth]?.length ?? 0), examples: named[name]?.[depth]?.length ?? 0 } : {}),
      ...(named[name]?.[depth] ? { known: named[name][depth], knownRefs: refs[name][depth], knownOs: oses[name][depth], knownWhy: whys[name][depth] } : {}) })))
    .sort((a, b) => a.species.localeCompare(b.species) || a.depth.localeCompare(b.depth));
  // A species with fewer than RARE_BELOW fish (in its schools and among the fish creatures ate) shows as the fallback, without a type.
  const seen = {};
  for (const [name, depths] of Object.entries(state.schools)) seen[name] = Object.values(depths).reduce((a, b) => a + b, 0);
  for (const list of Object.values(state.eats ?? {})) for (const { species: name } of list) seen[name] = (seen[name] ?? 0) + 1;
  // Uploads first (newest first), then the base fish by name, which carry no day.
  const baseEats = (findingId) => base.filter((fish) => fish.findingId === findingId)
    .map(({ ref, name, year, species: kind, type, depth, os, noDesktop }) => ({ species: kind, type, depth, name, ...(year ? { year } : {}), base: true, ref, ...(os ? { os } : { noDesktop }) }));
  const recent = (findingId) => [...(state.eats?.[findingId] ?? [])
    .map(({ species: name, type, depth, day }) => (name === fallback || seen[name] >= RARE_BELOW ? { species: name, type, depth, day } : { species: fallback, type: null, depth, day }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.species.localeCompare(b.species) || a.depth.localeCompare(b.depth)), ...baseEats(findingId)];
  const counts = { ...state.creatures };
  for (const fish of base) if (fish.findingId) counts[fish.findingId] = (counts[fish.findingId] ?? 0) + 1;
  const creatures = Object.entries(counts)
    .map(([findingId, eaten]) => ({ findingId, eaten, ...(base.length ? { observed: state.creatures[findingId] ?? 0, examples: eaten - (state.creatures[findingId] ?? 0) } : {}), recent: recent(findingId) }))
    .sort((a, b) => a.findingId.localeCompare(b.findingId));
  return { batchAt, schools, creatures };
}

export const creatureSize = (base, eaten) => (eaten < 1 ? 0 : base * Math.min(3, 1 + Math.log2(eaten)));
