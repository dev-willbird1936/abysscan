// Quest generation for uploaded fish (docs/desktop-parity/QUESTS.md, BACKEND.md "Quest generation"). Vultr Serverless
// Inference writes a quest scene for a kind of upload: one per creature behaviour and file type (fish-f-<finding>-<type>),
// never per file, so nothing of an upload is kept or sent. Each reply is compiled and checked like a hand-written quest;
// the problems go back to the model, up to `attempts` times. A passing quest is cached in data/generated-quests and the
// guide plays it; until then the guide plays the scene upload-scenes.mjs writes. Spending calls needs QUEST_WRITER_ENABLED.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileScene, questProblems, sceneSource } from './fish-scenes.mjs';
import { uploadScene } from './upload-scenes.mjs';
import { FINDINGS } from '../../ui/job/creatures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const QUEST_DIR = join(ROOT, 'data', 'generated-quests');
const KEY_RE = /^[a-z0-9-]{1,40}$/;
const MAX_SCENE_CHARS = 24_000;

// The cache key for an uploaded fish: its behaviour and file type. null for a fish no quest is written for (a school fish).
export function questKey(fish) {
  if (!fish?.findingId || !fish.type) return null;
  const key = `${fish.findingId}-${fish.type}`;
  return KEY_RE.test(key) ? key : null;
}

// The cached quest for a fish, if one passed the checks: its source, else null.
export function cachedQuest(fish, dir = QUEST_DIR) {
  const key = questKey(fish);
  const file = key && join(dir, `${key}.scene`);
  return file && existsSync(file) ? readFileSync(file, 'utf8') : null;
}

const read = path => readFileSync(join(ROOT, path), 'utf8');
// The model's brief: the quest guide, the language, the reference quest, and the facts of this kind of upload (how such a
// file arrives and what its behaviour does, as the fallback scene tells it).
export function questMessages(fish) {
  const finding = FINDINGS[fish.findingId];
  const system = [
    'You write training quests for a fictional Windows and macOS desktop simulator. Reply with ONLY the scene file text: no code fences, no commentary.',
    'Everything must be fictional: people, companies and websites use .example or .invalid domains; IPs use 192.0.2.x or 203.0.113.x; card numbers start 4000 0012; phone numbers use 555. No real brand in a lure. No real malware code or commands.',
    'Keep it between 6 and 12 steps and under 16000 characters. Every | line is one or two short plain sentences.',
    '', '=== QUESTS.md (the quest rules) ===', read('docs/desktop-parity/QUESTS.md'),
    '', '=== FISH-SCENES.md (the scene language) ===', read('docs/desktop-parity/FISH-SCENES.md'),
    '', '=== Reference quest: zeus.scene ===', sceneSource('zeus') ?? '',
  ].join('\n');
  const user = [
    `Write a quest for an uploaded file of type ".${fish.type}" whose behaviour is "${fish.findingId}"${finding ? ` (${finding.creature}: ${finding.label ?? finding.title ?? ''})` : ''}.`,
    'The trainee never saw this file before: invent a believable job and a day at work where a file like this arrives. Use the same shape as the reference: story and quota, one safe task, the lure, what the OS shows, one more task under attack, the reveal with an attack, flags (at least 4 hard, at least 1 soft), lesson.',
    'These facts must stay true (how such a file arrives and opens, and what this behaviour does). This is the scene the simulator plays today; turn it into a quest:',
    '', uploadScene(fish),
  ].join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// The scene text in a reply: code fences and talk around it removed.
export function sceneOf(reply) {
  const text = String(reply ?? '').replace(/\r\n/g, '\n');
  const fenced = /```[a-z]*\n([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/^(#|os |user |about$|title )/m);
  return (start > 0 ? body.slice(start) : body).slice(0, MAX_SCENE_CHARS);
}

// Every problem a quest has, as a hand-written one would get from check-quest: [] when it passes.
export function checkQuest(source, fish = { name: 'An uploaded file' }) {
  try {
    const compiled = compileScene(source, fish, 'generated');
    const { guide, warnings } = compiled;
    return [...warnings,
      ...guide.steps.filter(step => !Object.keys(step.patch).length).map(step => `step "${step.title}" changes nothing on the desktop`),
      ...guide.steps.filter(step => !step.text || !step.look).map(step => `step "${step.title}" needs | text and a look line`),
      ...(guide.lesson ? [] : ['needs a "lesson"']),
      ...questProblems(compiled)];
  } catch (error) {
    return [error.message];
  }
}

// Writes (or returns the cached) quest for a fish. client: createInferenceClient. Resolves to
// { ok, key, source?, attempts, problems } and caches a passing quest. Never throws for a model failure.
export async function writeQuest(fish, { client, attempts = 3, dir = QUEST_DIR, force = false } = {}) {
  const key = questKey(fish);
  if (!key) return { ok: false, key, attempts: 0, problems: ['no quest for this fish'] };
  if (!force) {
    const cached = cachedQuest(fish, dir);
    if (cached && !checkQuest(cached, fish).length) return { ok: true, key, source: cached, attempts: 0, problems: [], cached: true };
  }
  if (!client?.available?.('code')) return { ok: false, key, attempts: 0, problems: ['inference unavailable'] };
  const messages = questMessages(fish);
  let problems = [];
  for (let n = 1; n <= attempts; n++) {
    let reply;
    try {
      reply = await client.complete(messages, { model: 'code', maxTokens: 12288 });
    } catch (error) {
      return { ok: false, key, attempts: n, problems: [`inference: ${error.code ?? error.message}`] };
    }
    const source = sceneOf(reply);
    problems = checkQuest(source, fish);
    if (!problems.length) {
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${key}.scene`);
      writeFileSync(`${file}.tmp`, `# Written by Vultr Serverless Inference (quest-writer.mjs) for ${key}; checked by check-quest.\n${source}\n`);
      renameSync(`${file}.tmp`, file);
      return { ok: true, key, source, attempts: n, problems: [] };
    }
    // Repair: the model sees its own scene and exactly what failed.
    messages.push({ role: 'assistant', content: source }, { role: 'user', content: `That scene fails these checks. Fix every one and reply with the whole corrected scene only:\n- ${problems.slice(0, 20).join('\n- ')}` });
  }
  return { ok: false, key, attempts, problems };
}

// The server's background writer: the first guide request for a kind of upload starts one job; later requests get the
// cached quest. One job per key at a time, and none at all unless QUEST_WRITER_ENABLED=true.
export function createQuestWriter({ client, env = process.env, dir = QUEST_DIR, logger = console.log } = {}) {
  const enabled = env.QUEST_WRITER_ENABLED === 'true';
  const running = new Map();
  return {
    enabled,
    request(fish) {
      const key = questKey(fish);
      if (!enabled || !key || running.has(key) || cachedQuest(fish, dir)) return null;
      const job = writeQuest(fish, { client, dir }).then(result => {
        logger(`quest-writer ${key}: ${result.ok ? `written in ${result.attempts} attempt(s)` : `not written (${result.problems.slice(0, 3).join('; ')})`}`);
        return result;
      }).finally(() => running.delete(key));
      running.set(key, job);
      return job;
    },
    get running() { return [...running.keys()]; },
  };
}
