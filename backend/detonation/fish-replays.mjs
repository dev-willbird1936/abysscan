// The fish inside a creature (or a school), played on the training desktops from the ocean's creature panel
// (ui/abyss/creature-panel.js). No sandbox evidence exists for them: a base fish (data/ocean-base.json) is history, and an
// uploaded fish keeps no link to its job (privacy). So each one is an illustration: fictional evidence for what the creature
// stands for, written as a fish scene (upload-scenes.mjs for an uploaded fish) and labelled as an illustration.
//
// Run ids (/api/desktop/events?run=…, /desktop.html?job=…):
//   fish-b<n>                 base fish n of data/ocean-base.json
//   fish-f-<findingId>-<type> an uploaded fish a creature ate (its file type, or "any" when withheld)
//   fish-s-<depth>-<type>     an uploaded fish in a Sunlight or Twilight school
//   fish-r-<slug>             a threat a visitor searched for and created (backend/threats/scene-writer.mjs), once its scene passed
import { readFileSync } from 'node:fs';
import { compileScene, sceneSource } from './fish-scenes.mjs';
import { UPLOAD_BEHAVIOURS, uploadScene } from './upload-scenes.mjs';
import { cachedQuest, checkQuest } from './quest-writer.mjs';
import { FINDINGS } from '../../ui/job/creatures.mjs';
import { threatGuide, threatOfRun, threatPatches } from '../threats/scene-writer.mjs';

export const FINDING_IDS = UPLOAD_BEHAVIOURS;
const TYPE_RE = /^[a-z0-9]{1,8}(-[a-z0-9]{1,8})?$/;

// The fish a run id names: { name, type, findingId?, depth }, or null for an id that names none (or a base fish with no desktop).
export function fishOfRun(runId, base) {
  if (runId.startsWith('fish-r-')) return threatOfRun(runId);
  let match = /^fish-b(\d{1,3})$/.exec(runId);
  if (match) return base[Number(match[1])]?.scene ? base[Number(match[1])] : null;
  // Finding ids and types both hold hyphens (steal-credentials, js-wsh): split on a known finding id, longest first.
  const finding = runId.startsWith('fish-f-') ? [...UPLOAD_BEHAVIOURS].sort((a, b) => b.length - a.length).find(id => runId.startsWith(`fish-f-${id}-`)) : null;
  const type = finding ? runId.slice(`fish-f-${finding}-`.length) : null;
  if (finding && TYPE_RE.test(type)) return { name: 'An uploaded file', type, findingId: finding };
  match = /^fish-s-(sunlight|twilight)-([a-z0-9-]+)$/.exec(runId);
  if (match && TYPE_RE.test(match[2])) return { name: 'An uploaded file', type: match[2], depth: match[1] };
  return null;
}

// Desktop patches for one fish. A base fish plays its own scene (data/fish-scenes, fish-scenes.mjs); an uploaded fish plays the
// scene upload-scenes.mjs writes for its file type and its creature's behaviour.
export function fishPatches(fish) {
  if (fish.research) return threatPatches(fish);
  if (fish.scene) return compileScene(sceneSource(fish.scene) ?? '', fish, fish.scene).patches;
  return compileScene(uploadSource(fish), fish, 'upload').patches;
}

// An uploaded fish plays the quest Vultr inference wrote for its kind (quest-writer.mjs) once one passed the checks,
// else the scene upload-scenes.mjs writes.
function uploadSource(fish) {
  const quest = cachedQuest(fish);
  return quest && !checkQuest(quest, fish).length ? quest : uploadScene(fish);
}

// The step-by-step guide the desktop page walks a visitor through (GET /api/desktop/guide?run=fish-…):
// { name, os, about, lesson, setup, steps: [{ title, text, look, patch, attack? }], creature }.
// creature: { name, sprite } of the creature that ate the fish (or the fish's own species in a school), for the attack animation.
export function fishGuide(fish) {
  // A researched threat: its generated scene, and a debrief with the sources the scene was written from.
  if (fish.research) return { ...threatGuide(fish), creature: creatureOf(fish) };
  if (fish.scene) {
    const { os, guide } = compileScene(sceneSource(fish.scene) ?? '', fish, fish.scene);
    return { name: fish.name, os, ...guide, creature: creatureOf(fish) };
  }
  // An uploaded fish plays a generated scene: how a file of its type arrives and opens, then what its creature's kind of
  // malware does (upload-scenes.mjs). Same guide, same following, same lesson card as a base fish.
  const { os, guide } = compileScene(uploadSource(fish), fish, 'upload');
  return { name: fish.name, os, ...guide, creature: creatureOf(fish) };
}

let fishSprites;
function creatureOf(fish) {
  const finding = FINDINGS[fish.findingId];
  if (finding) return { name: finding.creature, sprite: finding.sprite };
  fishSprites ??= new Map(JSON.parse(readFileSync(new URL('../../data/fish.json', import.meta.url), 'utf8')).fish.map(item => [item.species, item.sprite]));
  const sprite = fishSprites.get(fish.species);
  return sprite ? { name: fish.species.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), sprite: `/${sprite}` } : null;
}
