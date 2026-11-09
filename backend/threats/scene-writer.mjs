// Step 7 of threat search: Vultr Serverless Inference writes a quest scene for a researched threat from its research brief.
// The same write, check and repair loop as quest-writer.mjs, with the same checks (compileScene, questProblems) and two more:
// every step must cite the brief entries it comes from (`# cite e1 e3` in its block; an uncited step is dropped before the
// checks), and the text must stay behavioural (no real hosts, no hashes, no working commands). At most 3 attempts; a scene
// that passes is cached as <dir>/<slug>.scene, and the desktop plays it as run fish-r-<slug> (fish-replays.mjs).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileScene, sceneSource } from '../detonation/fish-scenes.mjs';
import { checkQuest, sceneOf } from '../detonation/quest-writer.mjs';
import { FINDINGS } from '../../ui/job/creatures.mjs';
import { STAGE_LABELS } from './research.mjs';
import { untrusted, UNTRUSTED_NOTE } from './text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Where threat records, research briefs and scenes are cached: THREAT_DIR, else <data dir>/threats on a server (the code in
// /opt is root-owned and the service cannot write there), else data/generated-threats in a local checkout.
const DATA_DIR = process.env.DETONATION_DATA_DIR || '/var/lib/detonation-ocean';
export const THREAT_DIR = process.env.THREAT_DIR || (existsSync(DATA_DIR) ? join(DATA_DIR, 'threats') : join(ROOT, 'data', 'generated-threats'));
export const SCENE_MARKER = '[threat-scene]';
export const ILLUSTRATION_LABEL = 'Illustration based on public reporting, not observed malware.';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ATTEMPTS = 3;

// The creature that eats a researched threat in the ocean: by the family of its harm, as an uploaded file's worst behaviour.
const FINDING_BY_FAMILY = {
  'extortion-destruction': 'encrypt', 'theft-surveillance': 'steal-credentials', intrusion: 'remote-control',
  'network-abuse': 'spread', 'trusted-source': 'second-stage', deception: 'fake-login',
};
export const findingFor = threat => FINDING_BY_FAMILY[threat?.family] ?? 'other-harm';
export function creatureFor(threat) {
  const finding = FINDINGS[findingFor(threat)];
  return finding ? { name: finding.creature, sprite: finding.sprite } : null;
}

// The fish a researched threat plays as on the desktops (fishOfRun('fish-r-<slug>')).
export function threatFish(threat) {
  const finding = FINDINGS[findingFor(threat)];
  const depth = ['sunlight', 'twilight', 'midnight', 'abyss', 'trench'].includes(threat.depth) ? threat.depth : finding?.depth ?? 'midnight';
  return { name: threat.name, type: 'exe', findingId: findingFor(threat), depth, research: true, slug: threat.slug };
}

// ---- checks --------------------------------------------------------------------------------------------------------

const TOP = /^\S/;
const BLOCK_END = /^(step|flag|lesson|spotted)\b/;
const CITE = /^\s*#\s*cite\b(.*)$/i;

// Drops every step block that cites no entry of the brief. Returns { source, dropped: [title], cited: { title: [ids] } }.
export function keepCitedSteps(source, entryIds) {
  const ids = new Set(entryIds);
  const lines = String(source).split('\n');
  const out = [];
  const dropped = [];
  const cited = {};
  for (let i = 0; i < lines.length;) {
    if (!/^step\s/.test(lines[i])) { out.push(lines[i]); i += 1; continue; }
    let end = i + 1;
    while (end < lines.length && !(TOP.test(lines[end]) && BLOCK_END.test(lines[end]))) end += 1;
    const block = lines.slice(i, end);
    const title = lines[i].slice(5).trim();
    const refs = block.flatMap(line => (CITE.exec(line)?.[1] ?? '').split(/[\s,]+/)).filter(id => ids.has(id));
    if (refs.length) { out.push(...block); cited[title] = [...new Set(refs)]; } else dropped.push(title);
    i = end;
  }
  return { source: out.join('\n'), dropped, cited };
}

const REAL_TLD = /\.(com|net|org|io|info|biz|co|uk|de|ru|cn|su|top|xyz|onion|me|us|tk|cc|ws|in|ir|kp|gov|edu|mil|int|eu|app|dev|site|online|club|shop)$/i;
const FILE_EXT = /\.(exe|dll|scr|bat|cmd|ps1|vbs|js|jar|msi|zip|rar|7z|iso|img|pdf|doc|docx|docm|xls|xlsx|xlsm|ppt|pptx|rtf|txt|csv|png|jpg|gif|lnk|hta|eml|html?|wncry|locked|encrypted|bin|dat|tmp|sys|app|dmg|pkg|sh|py)$/i;
const DOC_IP = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$|^(10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^192\.168\.\d{1,3}\.\d{1,3}$/;

// Content rules (docs/safety.md, FISH-SCENES.md "Rules"): fictional hosts only, documentation IPs, no hashes, no encoded payloads,
// no download-and-run commands. [] when the scene keeps them.
export function safetyProblems(source, ownNames = []) {
  const problems = [];
  // Comments (the cache header, cite lines) are never shown; the threat's own name may contain a host ("Booking.com hack").
  const text = String(source).split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
  const own = ownNames.join(' ').toLowerCase();
  for (const host of new Set((text.match(/\b(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*\b/gi) ?? []).map(item => item.toLowerCase()))) {
    if (/\.(example|invalid)$/.test(host) || FILE_EXT.test(host) || !REAL_TLD.test(host) || own.includes(host)) continue;
    problems.push(`"${host}" looks like a real host name: use a fictional .example or .invalid address`);
  }
  for (const ip of new Set(text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [])) if (!DOC_IP.test(ip)) problems.push(`IP address ${ip}: use 192.0.2.x or 203.0.113.x`);
  if (/\b[0-9a-f]{32,}\b/i.test(text)) problems.push('remove hashes and long hex strings');
  if (/[A-Za-z0-9+/]{80,}={0,2}/.test(text)) problems.push('remove encoded blobs');
  if (/-enc(odedcommand)?\b|\biex\b|invoke-expression|downloadstring|downloadfile|\bcertutil\b.*-urlcache|\bbitsadmin\b.*\/transfer|\bcurl\b\s+\S*https?:|\bwget\b\s+\S*https?:/i.test(text)) {
    problems.push('remove working commands: show what the user saw, never how to run the attack');
  }
  if (/^os\s+macos\b/m.test(text)) problems.push('this scene plays on Windows: use "os windows"');
  return problems;
}

// Every problem a researched scene has after its uncited steps are dropped. { problems, source, dropped }.
export function checkThreatScene(raw, threat, brief) {
  const { source, dropped, cited } = keepCitedSteps(raw, (brief?.entries ?? []).map(entry => entry.id));
  const problems = [...safetyProblems(source, [threat.name, ...(threat.aliases ?? [])]), ...checkQuest(source, threatFish(threat))];
  if (Object.keys(cited).length < 4) problems.push('fewer than 4 steps cite the brief: every step needs a "# cite e<n>" line under it');
  return { problems: [...new Set(problems)], source, dropped };
}

// ---- prompt --------------------------------------------------------------------------------------------------------

const read = path => readFileSync(join(ROOT, path), 'utf8');
export function sceneMessages(threat, brief) {
  const system = [
    `${SCENE_MARKER} You write training quests for a fictional Windows desktop simulator, from a research brief about a real threat. ${UNTRUSTED_NOTE} Reply with ONLY the scene file text: no code fences, no commentary.`,
    'Everything on the desktop is fictional: people, companies and websites use .example or .invalid domains; IPs use 192.0.2.x or 203.0.113.x; card numbers start 4000 0012; phone numbers use 555. No real brand in a lure. No real malware code, commands, hashes or exploit details: show what the victim saw and what changed, never how to carry out the attack.',
    'Use "os windows". Keep it between 6 and 12 steps and under 16000 characters. Every | line is one or two short plain sentences.',
    'Every step comes from the brief: directly under each "step" line write "# cite" and the ids of the brief entries it shows, for example "# cite e2 e5". The safe-task steps cite the entry that says who the victims were or how the threat arrived. A step without a cite is deleted. Do not show any stage the brief lists as missing.',
    'The name of the threat, its date and the facts come from the brief only; name no attacker unless the brief does.',
    '', '=== QUESTS.md (the quest rules) ===', read('docs/desktop-parity/QUESTS.md'),
    '', '=== FISH-SCENES.md (the scene language) ===', read('docs/desktop-parity/FISH-SCENES.md'),
    '', '=== Reference quest: zeus.scene ===', sceneSource('zeus') ?? '',
  ].join('\n');
  const entries = brief.entries.map(entry => `${entry.id} [${entry.stage}] ${entry.claim} (reported by ${entry.publisher}${entry.reportedAt ? `, ${entry.reportedAt}` : ''})`).join('\n');
  const user = [
    `Write a quest about ${threat.name}${threat.date ? ` (${threat.date})` : ''}, a ${threat.kind} whose harm is "${threat.family}". The trainee works where its real victims worked, per the brief.`,
    untrusted('Research brief', entries),
    brief.missing.length ? `Public reporting does not cover: ${brief.missing.map(stage => STAGE_LABELS[stage]).join('; ')}. Leave those out.` : 'The brief covers every stage.',
    'In "about", say that this is an illustration based on public reporting, not observed malware.',
  ].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ---- the writer ----------------------------------------------------------------------------------------------------

export function createThreatSceneWriter({ client, dir = THREAT_DIR } = {}) {
  const file = slug => (SLUG_RE.test(slug ?? '') ? join(dir, `${slug}.scene`) : null);
  const record = slug => {
    try { return JSON.parse(readFileSync(join(dir, `${slug}.json`), 'utf8')); } catch { return null; }
  };
  function cached(slug) {
    const path = file(slug);
    if (!path || !existsSync(path)) return null;
    const threat = record(slug);
    const source = readFileSync(path, 'utf8');
    return threat?.brief && !checkThreatScene(source, threat, threat.brief).problems.length ? source : null;
  }

  // { ok, source?, attempts, problems, dropped }. Never throws for a model failure.
  async function write(threat, { signal } = {}) {
    const brief = threat.brief;
    if (!file(threat.slug)) return { ok: false, attempts: 0, problems: ['bad slug'], dropped: [] };
    if (!brief?.entries?.length) return { ok: false, attempts: 0, problems: ['public reporting is too thin to build a scene'], dropped: [] };
    const already = cached(threat.slug);
    if (already) return { ok: true, source: already, attempts: 0, problems: [], dropped: [], cached: true };
    if (!client?.available?.('threat')) return { ok: false, attempts: 0, problems: ['inference unavailable'], dropped: [] };
    const messages = sceneMessages(threat, brief);
    let problems = [];
    let dropped = [];
    for (let n = 1; n <= ATTEMPTS; n++) {
      if (signal?.aborted) return { ok: false, attempts: n - 1, problems: ['cancelled'], dropped };
      let reply;
      try {
        reply = await client.complete(messages, { model: 'threat', maxTokens: 12288 });
      } catch (error) {
        return { ok: false, attempts: n, problems: [`inference: ${error.code ?? 'failed'}`], dropped };
      }
      const raw = sceneOf(reply);
      ({ problems, dropped } = { ...checkThreatScene(raw, threat, brief) });
      const kept = keepCitedSteps(raw, brief.entries.map(entry => entry.id)).source;
      if (!problems.length) {
        mkdirSync(dir, { recursive: true });
        const path = file(threat.slug);
        writeFileSync(`${path}.tmp`, `# Written by Vultr Serverless Inference (scene-writer.mjs) from the research brief for ${threat.name}; checked like a quest.\n${kept}\n`);
        renameSync(`${path}.tmp`, path);
        return { ok: true, source: kept, attempts: n, problems: [], dropped };
      }
      const droppedNote = dropped.length ? [`these steps were deleted because they cite no brief entry: ${dropped.join('; ')}`] : [];
      messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `That scene fails these checks. Fix every one and reply with the whole corrected scene only:\n- ${[...droppedNote, ...problems].slice(0, 20).join('\n- ')}` });
    }
    return { ok: false, attempts: ATTEMPTS, problems, dropped };
  }

  return { available: () => Boolean(client?.available?.('threat')), cached, write, findingFor, creatureFor };
}

// ---- playing it ----------------------------------------------------------------------------------------------------

// The researched threat a run id names, when its record and a passing scene exist: the fish, else null.
export function threatOfRun(runId, dir = THREAT_DIR) {
  const slug = /^fish-r-([a-z0-9-]{1,33})$/.exec(runId)?.[1];
  if (!slug || !SLUG_RE.test(slug)) return null;
  const writer = createThreatSceneWriter({ dir });
  const source = writer.cached(slug);
  if (!source) return null;
  const threat = JSON.parse(readFileSync(join(dir, `${slug}.json`), 'utf8'));
  return { ...threatFish(threat), threat, source };
}

// The debrief at the end of the guide: the label, the sources with their reporting dates, and what reporting did not cover.
export function debriefLines(threat) {
  const brief = threat.brief ?? { sources: [], missing: [] };
  return [
    ILLUSTRATION_LABEL,
    ...brief.sources.map(source => `Reported by ${source.publisher}${source.reportedAt ? ` (${source.reportedAt})` : ''}: ${source.title || source.url} — ${source.url}`),
    ...brief.missing.map(stage => `Public reporting doesn't cover ${STAGE_LABELS[stage]}, so this scene leaves it out.`),
    ...(brief.reportedAsOf ? [`Researched on ${brief.reportedAsOf}; reporting on recent incidents can change.`] : []),
  ];
}

export function threatPatches(fish) {
  return compileScene(fish.source, fish, `threat-${fish.slug}`).patches;
}

export function threatGuide(fish) {
  const { os, guide } = compileScene(fish.source, fish, `threat-${fish.slug}`);
  const lesson = [guide.lesson, ...debriefLines(fish.threat)].filter(Boolean).join('\n');
  return { name: fish.name, os, ...guide, lesson, sources: fish.threat.brief?.sources ?? [], illustration: true };
}
