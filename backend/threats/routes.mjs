// HTTP routes for threat search (docs/threat-search/CONTRACT.md). Search checks a query on the live web (Parallel Decisions),
// names the match (Vultr inference), says whether the ocean already has it, and starts the research for a new one in the
// background. Create writes the scene from the research; the desktop plays it as fish-r-<slug>. No file is ever downloaded,
// uploaded or run. Writes need the page's own origin; searches and creates are limited per address and per day.
import { decisionBody, normaliseQuery, readDecision } from './decide.mjs';
import { resolveMatch } from './resolve.mjs';
import { buildCatalogue, findOnSite } from './catalogue.mjs';
import { runResearch, STAGE_LABELS } from './research.mjs';
import { createLimiter } from './limits.mjs';
import { creatureFor, findingFor } from './scene-writer.mjs';
import { clip, publisherOf, slugOf } from './text.mjs';

const MAX_BODY_BYTES = 2048;
const MAX_RESEARCH = 4;
const THREAT_ID_RE = /^r-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const MESSAGES = {
  'no-match': 'No documented malware family, exploit or hack matched that search. Try a name such as WannaCry, Log4Shell or Zeus.',
  refused: "The web check couldn't answer that search. Try the name of a known malware family, exploit or hack.",
  declined: "This site explains how known threats behaved. It can't help build or carry out an attack.",
};
const UNAVAILABLE = {
  'search-disabled': 'Threat search is switched off on this server.',
  'cap-reached': "Today's threat searches are used up. Try again tomorrow.",
  'naming-unavailable': 'Threat search is switched off on this server.',
  'upstream-failed': "The web check didn't answer. Try again in a minute.",
};

class InputError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(response, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer',
  });
  response.end(bytes);
}

async function readBody(request, keys) {
  if (String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new InputError(415, 'Send JSON.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new InputError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InputError(400, 'Send a JSON object.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length || !keys.every(key => Object.hasOwn(body, key))) {
    throw new InputError(400, `Send exactly: ${keys.join(', ')}.`);
  }
  return body;
}

const sourcesOf = citations => citations.slice(0, 8).map(item => ({ url: item.url, title: item.title, publisher: publisherOf(item.url) }));

export function createThreatRoutes({
  parallel, inference, writer = null, store, base = [], aliasFile, now = () => new Date(), uploadsUi = false,
  searchesPerHour = 10, createsPerHour = 3, logger = () => {},
}) {
  const searchLimit = createLimiter({ perHour: searchesPerHour, now: () => now().getTime() });
  const createLimit = createLimiter({ perHour: createsPerHour, now: () => now().getTime() });
  const today = () => now().toISOString().slice(0, 10);
  const catalogue = () => buildCatalogue({ base, aliasFile, threatDir: store.dir });
  const searchReady = () => Boolean(parallel?.available?.()) && Boolean(inference?.available?.('threat'));
  const createReady = () => Boolean(writer?.available?.());

  function threatRecord(result, candidate) {
    const slug = slugOf(candidate.name);
    const saved = store.threat(slug);
    return {
      threatId: `r-${slug}`, slug, name: candidate.name, date: candidate.date, summary: candidate.summary, aliases: candidate.aliases,
      kind: result.kind, family: result.family, depth: result.depth, sources: result.sources,
      ...(saved?.brief ? { brief: saved.brief } : {}),
    };
  }

  // The background research for a threat: one job per threat, at most MAX_RESEARCH at once. null when it is not needed.
  function startResearch(threat) {
    const existing = store.jobs.get(threat.threatId);
    if (existing && !['failed', 'cancelled'].includes(existing.stage)) return existing;
    if (store.threat(threat.slug)?.brief) return null;
    if ([...store.jobs.values()].filter(job => job.stage === 'researching').length >= MAX_RESEARCH) return null;
    const controller = new AbortController();
    const job = { stage: 'researching', created: false, controller, message: '' };
    job.research = runResearch({ threat, parallel, inference, signal: controller.signal, today: today() }).then(brief => {
      store.saveThreat({ ...(store.threat(threat.slug) ?? threat), brief });
      if (job.stage === 'researching' && !job.created) job.stage = 'idle';
      logger(`threat research ${threat.slug}: ${brief.entries.length} entries, missing ${brief.missing.join(',') || 'none'}`);
      return brief;
    }, error => {
      if (job.stage !== 'cancelled') { job.stage = 'failed'; job.message = error.code === 'cancelled' ? 'Cancelled.' : 'The research did not finish. Try again later.'; }
      logger(`threat research ${threat.slug}: ${error.code ?? 'failed'}`);
      return null;
    });
    store.jobs.set(threat.threatId, job);
    return job;
  }

  function onSiteOf(candidates) {
    const index = catalogue();
    return candidates.map((candidate, id) => {
      const slug = slugOf(candidate.name);
      return { id, ...candidate, threatId: `r-${slug}`, onSite: findOnSite(candidate, index) };
    });
  }

  async function search(query, ip) {
    const key = normaliseQuery(query);
    let result = store.decision(key);
    if (!result) {
      if (!searchReady()) return [503, { status: 'unavailable', code: parallel?.reason?.() === 'cap-reached' ? 'cap-reached' : 'search-disabled' }];
      if (!searchLimit.take(ip)) return [429, { status: 'rate-limited', message: 'Too many searches from here. Try again in an hour.' }];
      let decision;
      try {
        decision = readDecision(await parallel.decide(decisionBody(query, today())));
      } catch (error) {
        return [503, { status: 'unavailable', code: error.code === 'cap-reached' ? 'cap-reached' : 'upstream-failed' }];
      }
      if (decision.outcome !== 'accepted') {
        result = { status: decision.outcome };
      } else {
        let resolved;
        try {
          resolved = await resolveMatch({ inference, query, specific: decision.specific, citations: decision.citations, today: today() });
        } catch (error) {
          return [503, { status: 'unavailable', code: error.code === 'cap-reached' ? 'cap-reached' : 'upstream-failed' }];
        }
        result = resolved
          ? { status: 'matched', kind: decision.kind, family: decision.family, depth: decision.depth, specific: resolved.specific, candidates: resolved.candidates, sources: sourcesOf(decision.citations) }
          : { status: 'no-match' };
      }
      store.saveDecision(key, result);
    }
    if (result.status !== 'matched') return [200, { status: result.status, message: MESSAGES[result.status] }];
    const candidates = onSiteOf(result.candidates);
    const searchId = store.newSession({ ...result, candidates });
    // One match, not in the ocean yet: keep its record and start the research now, while the visitor reads the confirmation.
    if (result.specific === 'one' && !candidates[0].onSite) {
      const threat = threatRecord(result, candidates[0]);
      if (!store.threat(threat.slug)) store.saveThreat(threat);
      startResearch(threat);
    }
    return [200, { status: 'matched', searchId, kind: result.kind, family: result.family, depth: result.depth, specific: result.specific, candidates, sources: result.sources }];
  }

  function select({ searchId, candidate }) {
    const result = store.session(searchId);
    if (!result) throw new InputError(404, 'That search has expired. Search again.');
    const picked = Number.isInteger(candidate) ? result.candidates[candidate] : undefined;
    if (!picked) throw new InputError(400, 'Pick one of the results.');
    if (picked.onSite) return [200, { status: 'selected', threatId: picked.threatId, candidate: picked, research: 'not-needed' }];
    const threat = threatRecord(result, picked);
    if (!store.threat(threat.slug)) store.saveThreat(threat);
    const job = startResearch(threat);
    return [200, { status: 'selected', threatId: threat.threatId, candidate: picked, research: threat.brief || (!job && store.threat(threat.slug)?.brief) ? 'cached' : 'running' }];
  }

  function recordOf(threatId) {
    const slug = THREAT_ID_RE.exec(threatId ?? '')?.[1];
    return slug ? store.threat(slug) : null;
  }

  function create({ threatId }, ip) {
    const record = recordOf(threatId);
    if (!record) throw new InputError(404, 'Search for the threat first.');
    const run = `fish-r-${record.slug}`;
    if (writer?.cached?.(record.slug)) return [200, { status: 'ready', threatId, run }];
    if (!createReady()) return [503, { status: 'unavailable', code: 'create-disabled', message: 'Building new simulations is switched off on this server.' }];
    let job = store.jobs.get(threatId);
    if (job?.created && ['researching', 'writing'].includes(job.stage)) return [202, { status: 'creating', threatId, run }];
    if (!createLimit.take(ip)) return [429, { status: 'rate-limited', message: 'Too many new simulations from here. Try again in an hour.' }];
    if (!job || ['failed', 'cancelled'].includes(job.stage)) {
      store.jobs.delete(threatId);
      job = startResearch(record) ?? { stage: 'idle', controller: new AbortController(), research: Promise.resolve(record.brief ?? null) };
      store.jobs.set(threatId, job);
    }
    job.created = true;
    job.message = '';
    if (job.stage !== 'researching') job.stage = 'writing';
    (async () => {
      const brief = (await job.research) ?? store.threat(record.slug)?.brief;
      if (!brief) { job.stage = 'failed'; job.message ||= 'The research did not finish. Try again later.'; return; }
      job.stage = 'writing';
      const written = await writer.write({ ...store.threat(record.slug), brief });
      job.stage = written.ok ? 'ready' : 'failed';
      job.message = written.ok ? '' : written.problems.includes('public reporting is too thin to build a scene')
        ? 'Public reporting is too thin to build a scene for this one.' : "The scene didn't pass its checks. Try again later.";
      logger(`threat scene ${record.slug}: ${written.ok ? `written in ${written.attempts} attempt(s)` : `not written (${written.problems.slice(0, 3).join('; ')})`}`);
    })().catch(() => { job.stage = 'failed'; job.message = "The scene couldn't be built. Try again later."; });
    return [202, { status: 'creating', threatId, run }];
  }

  function cancel({ threatId }) {
    const job = store.jobs.get(threatId);
    if (job?.created && ['researching', 'writing'].includes(job.stage)) return [409, { status: job.stage, message: 'It is already being built.' }];
    if (job && job.stage === 'researching') { job.stage = 'cancelled'; job.controller.abort(); }
    if (job) store.jobs.delete(threatId);
    return [200, { status: 'cancelled' }];
  }

  function status(threatId) {
    const record = recordOf(threatId);
    if (!record) return [404, { error: 'Not found.' }];
    const job = store.jobs.get(threatId);
    const ready = Boolean(writer?.cached?.(record.slug));
    const brief = record.brief;
    return [200, {
      threatId, run: `fish-r-${record.slug}`, stage: ready ? 'ready' : job?.stage ?? 'idle',
      name: record.name, date: record.date, summary: record.summary, kind: record.kind, family: record.family, depth: record.depth,
      findingId: findingFor(record), creature: creatureFor(record),
      sources: brief?.sources?.length ? brief.sources : record.sources ?? [],
      missing: (brief?.missing ?? []).map(stage => STAGE_LABELS[stage]),
      ...(job?.message && !ready ? { message: job.message } : {}),
    }];
  }

  // Handles /api/threats/*; resolves false for any other path. ctx: { writeAllowed: the page's own origin, ip: the client }.
  async function handle(request, response, pathname, { writeAllowed = false, ip = '' } = {}) {
    if (!pathname.startsWith('/api/threats/')) return false;
    const route = pathname.slice('/api/threats/'.length);
    const method = { config: 'GET', status: 'GET', search: 'POST', select: 'POST', create: 'POST', cancel: 'POST' }[route];
    if (!method) { send(response, 404, { error: 'Not found.' }); return true; }
    if (request.method !== method) { response.setHeader('Allow', method); send(response, 405, { error: `Use ${method}.` }); return true; }
    if (method === 'POST' && !writeAllowed) { send(response, 403, { error: 'Same-origin requests only.' }); return true; }
    try {
      let reply;
      if (route === 'config') reply = [200, { search: searchReady(), create: createReady(), uploads: uploadsUi === true }];
      else if (route === 'status') reply = status(new URL(request.url, 'http://127.0.0.1').searchParams.get('id'));
      else if (route === 'search') {
        const { query } = await readBody(request, ['query']);
        const text = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim() : '';
        if (text.length < 2 || text.length > 200 || /[\u0000-\u001f\u007f]/.test(text)) throw new InputError(400, 'Type 2 to 200 characters.');
        reply = await search(text, ip);
        if (reply[0] === 503) reply[1].message = UNAVAILABLE[reply[1].code] ?? UNAVAILABLE['upstream-failed'];
      } else if (route === 'select') reply = select(await readBody(request, ['searchId', 'candidate']));
      else if (route === 'create') reply = create(await readBody(request, ['threatId']), ip);
      else reply = cancel(await readBody(request, ['threatId']));
      send(response, ...reply);
    } catch (error) {
      if (error instanceof InputError) send(response, error.status, { error: error.message });
      else { logger(`threat route ${route}: ${clip(error?.code ?? error?.name ?? 'error', 40)}`); send(response, 500, { error: 'Something went wrong.' }); }
    }
    return true;
  }

  return { handle };
}
