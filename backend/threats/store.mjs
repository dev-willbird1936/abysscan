// Threat search caches. On disk (THREAT_DIR): Decisions answers by normalised query for 24 hours (decisions/<sha256>.json),
// and one record per threat (<slug>.json: name, facts, sources, research brief); scene-writer.mjs adds <slug>.scene.
// In memory: search sessions (searchId → the candidates a visitor may pick, 1 hour) and the running research jobs.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DECISION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 2000;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function writeAtomic(path, value) {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export function createThreatStore({ dir, now = () => Date.now() }) {
  const decisions = join(dir, 'decisions');
  const sessions = new Map();
  const jobs = new Map();
  const queryFile = query => join(decisions, `${createHash('sha256').update(query).digest('hex')}.json`);
  const threatFile = slug => (SLUG_RE.test(slug ?? '') ? join(dir, `${slug}.json`) : null);

  function prune() {
    const at = now();
    for (const [id, session] of sessions) if (at - session.at > SESSION_TTL_MS) sessions.delete(id);
    while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  }

  return {
    dir,
    // The cached search result for a normalised query, or null.
    decision(query) {
      const saved = readJson(queryFile(query));
      return saved && saved.query === query && now() - saved.at < DECISION_TTL_MS ? saved.result : null;
    },
    saveDecision(query, result) {
      mkdirSync(decisions, { recursive: true });
      writeAtomic(queryFile(query), { query, at: now(), result });
    },
    threat(slug) {
      const file = threatFile(slug);
      return file ? readJson(file) : null;
    },
    saveThreat(threat) {
      const file = threatFile(threat.slug);
      if (!file) throw new Error('bad slug');
      mkdirSync(dir, { recursive: true });
      writeAtomic(file, threat);
    },
    hasScene: slug => Boolean(threatFile(slug)) && existsSync(join(dir, `${slug}.scene`)),
    newSession(result) {
      prune();
      const id = randomBytes(8).toString('hex');
      sessions.set(id, { at: now(), result });
      return id;
    },
    session(id) {
      prune();
      return typeof id === 'string' && /^[0-9a-f]{16}$/.test(id) ? sessions.get(id)?.result ?? null : null;
    },
    jobs,
  };
}
