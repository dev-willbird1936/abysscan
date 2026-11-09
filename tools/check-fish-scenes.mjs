// Checks every fish scene (data/fish-scenes/*.scene, docs/desktop-parity/FISH-SCENES.md): it parses, every step is a valid
// desktop world change, every `when` is something the trainee can do when its step starts, the guide has at least two steps that each change the desktop and a lesson, and every base fish (data/ocean-base.json) either names a scene that exists or says why it has none.
// Usage: node tools/check-fish-scenes.mjs [scene-name ...]   Exit code 1 on any problem.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileScene, questProblems, SCENE_DIR } from '../backend/detonation/fish-scenes.mjs';

const base = JSON.parse(readFileSync(new URL('../data/ocean-base.json', import.meta.url), 'utf8')).entries;
const files = readdirSync(SCENE_DIR).filter(name => name.endsWith('.scene')).map(name => name.slice(0, -6));
const only = process.argv.slice(2);
const problems = [];
for (const name of only.length ? only : files) {
  const fish = base.find(entry => entry.scene === name) ?? { name };
  try {
    const compiled = compileScene(readFileSync(join(SCENE_DIR, `${name}.scene`), 'utf8'), fish, name);
    const { os, guide, warnings } = compiled;
    const guideProblems = [
      guide.steps.length < 2 && 'needs at least two "step" commands',
      !guide.lesson && 'needs a "lesson"',
      ...guide.steps.filter(step => !Object.keys(step.patch).length).map(step => `step "${step.title}" changes nothing on the desktop`),
      ...guide.steps.filter(step => !step.text || !step.look).map(step => `step "${step.title}" needs | text and a look line`),
      // A `when` the trainee cannot do when the step starts: the guide would not follow them (FISH-SCENES.md).
      ...warnings,
      // A quest (a scene with a story) also keeps the quest rules (QUESTS.md §6).
      ...(guide.story ? questProblems(compiled) : []),
    ].filter(Boolean);
    if (guideProblems.length) throw new Error(guideProblems.join('; '));
    console.log(`ok   ${name.padEnd(22)} ${os.padEnd(8)} ${guide.steps.length} guide steps${guide.story ? `, quest: ${guide.flags.filter(item => item.hard).length} hard flags` : ''}`);
  } catch (error) {
    problems.push(`${name}: ${error.message}`);
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
if (!only.length) {
  for (const entry of base) {
    if (entry.scene && !files.includes(entry.scene)) problems.push(`${entry.name}: scene "${entry.scene}" has no file`);
    if (!entry.scene && !entry.noDesktop) problems.push(`${entry.name}: needs a scene or a noDesktop reason`);
  }
  for (const name of files) if (!base.some(entry => entry.scene === name)) problems.push(`${name}.scene: no base fish uses it`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`\nAll ${only.length || files.length} scenes compile into valid desktop worlds.`);
