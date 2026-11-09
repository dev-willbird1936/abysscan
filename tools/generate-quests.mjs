// Writes quests for kinds of uploaded file with Vultr Serverless Inference (backend/detonation/quest-writer.mjs) and caches
// the ones that pass the checks in data/generated-quests. Spends one to three inference calls per kind.
// Needs DETONATION_INFERENCE_ENABLED=true, VULTR_INFERENCE_API_KEY and VULTR_INFERENCE_CODE_MODEL.
// Usage: node tools/generate-quests.mjs <finding>-<type> …   e.g. keylog-exe encrypt-docm
//        node tools/generate-quests.mjs --all [--types exe,docm,pdf,zip,js]   every behaviour × these types
//        node tools/generate-quests.mjs --prompt keylog-exe   print the brief the model gets (no call)
//        add --force to rewrite a cached quest
import { createInferenceClient } from '../backend/detonation/inference.mjs';
import { FINDING_IDS, fishOfRun } from '../backend/detonation/fish-replays.mjs';
import { questMessages, writeQuest } from '../backend/detonation/quest-writer.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const typesAt = args.indexOf('--types');
const types = (typesAt >= 0 ? args[typesAt + 1] : 'exe,docm,pdf,zip,js').split(',');
const keys = flag('--all') ? FINDING_IDS.flatMap(id => types.map(type => `${id}-${type}`)) : args.filter((arg, n) => !arg.startsWith("--") && (typesAt < 0 || n !== typesAt + 1));
if (!keys.length) { console.error('Usage: node tools/generate-quests.mjs <finding>-<type> … | --all [--types a,b] | --prompt <key>'); process.exit(2); }
const fishOf = key => fishOfRun(`fish-f-${key}`, []);
if (flag('--prompt')) {
  const fish = fishOf(keys[0]);
  if (!fish) { console.error(`unknown kind ${keys[0]}`); process.exit(2); }
  for (const message of questMessages(fish)) console.log(`----- ${message.role} (${message.content.length} chars)\n${message.content}\n`);
  process.exit(0);
}
const client = createInferenceClient({ env: process.env, capFile: `${process.env.DETONATION_DATA_DIR || '.'}/inference-calls.log` });
if (!client.available('code')) { console.error('Vultr inference is not configured (DETONATION_INFERENCE_ENABLED, VULTR_INFERENCE_API_KEY, VULTR_INFERENCE_CODE_MODEL).'); process.exit(1); }
let failed = 0;
for (const key of keys) {
  const fish = fishOf(key);
  if (!fish) { console.log(`skip ${key}: not a kind of upload`); failed++; continue; }
  const result = await writeQuest(fish, { client, force: flag('--force') });
  if (!result.ok) failed++;
  console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${key}${result.cached ? ' (cached)' : ` in ${result.attempts} attempt(s)`}${result.ok ? '' : `: ${result.problems.slice(0, 4).join('; ')}`}`);
}
console.log(`\n${keys.length - failed}/${keys.length} written. Inference calls today: ${client.calls}.`);
process.exit(failed ? 1 : 0);
