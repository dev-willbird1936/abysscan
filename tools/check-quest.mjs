// Checks one quest scene from any path, without adding it to the fish catalogue: it compiles into valid desktop worlds,
// every `when` can be done by the trainee, and it keeps the quest rules (docs/desktop-parity/QUESTS.md §6).
// Usage: node tools/check-quest.mjs <file.scene> [--name "Display name"] [--json]   Exit code 1 on any problem.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { compileScene, questProblems } from '../backend/detonation/fish-scenes.mjs';

const args = process.argv.slice(2);
const file = args.find(arg => !arg.startsWith('--') && args[args.indexOf(arg) - 1] !== '--name');
const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : basename(file ?? 'scene', '.scene');
const json = args.includes('--json');
if (!file) { console.error('Usage: node tools/check-quest.mjs <file.scene> [--name "Display name"] [--json]'); process.exit(2); }
let report;
try {
  const compiled = compileScene(readFileSync(file, 'utf8'), { name }, basename(file, '.scene'));
  const { guide, warnings, os } = compiled;
  const problems = [
    ...warnings,
    ...guide.steps.filter(step => !Object.keys(step.patch).length).map(step => `step "${step.title}" changes nothing on the desktop`),
    ...guide.steps.filter(step => !step.text || !step.look).map(step => `step "${step.title}" needs | text and a look line`),
    !guide.lesson && 'needs a "lesson"',
    ...questProblems(compiled),
  ].filter(Boolean);
  report = { ok: !problems.length, os, problems, steps: guide.steps.map((step, n) => ({ n: n + 1, title: step.title, when: step.when ?? null, next: step.next?.windows ?? null, attack: step.attack?.kind ?? null })),
    flags: guide.flags.map(item => `${item.hard ? 'hard' : 'soft'} ${item.key}`) };
} catch (error) {
  report = { ok: false, problems: [error.message], steps: [], flags: [] };
}
if (json) console.log(JSON.stringify(report, null, 2));
else {
  for (const step of report.steps) console.log(`${String(step.n).padStart(2)}. ${step.title}${step.when ? `  [when ${step.when.kind} ${step.when.ref ?? ''}]` : step.attack ? `  [attack ${step.attack}]` : '  [Next]'}`);
  console.log(report.flags.map(flag => `   flag ${flag}`).join('\n'));
  console.log(report.ok ? '\nOK: the quest compiles and keeps the quest rules.' : `\n${report.problems.length} problem(s):\n- ${report.problems.join('\n- ')}`);
}
process.exit(report.ok ? 0 : 1);
