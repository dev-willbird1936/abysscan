// Threat search (docs/threat-search/CONTRACT.md) against mocked Parallel and mocked Vultr inference. No live call: every client
// gets the fetch from tests/fixtures/threats/mock.mjs, and the keys are the literal test strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'threats-'));
process.env.THREAT_DIR = dir; // read when scene-writer.mjs loads: the desktop's fish-r-<slug> runs come from here
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

const mock = await import('./fixtures/threats/mock.mjs');
const { decisionBody, readDecision, normaliseQuery } = await import('../backend/threats/decide.mjs');
const { readResolve } = await import('../backend/threats/resolve.mjs');
const { runResearch, searchBody } = await import('../backend/threats/research.mjs');
const { createThreatSceneWriter, keepCitedSteps, safetyProblems, ILLUSTRATION_LABEL } = await import('../backend/threats/scene-writer.mjs');
const { createParallelClient } = await import('../backend/threats/parallel.mjs');
const { createThreatStore } = await import('../backend/threats/store.mjs');
const { createThreatRoutes } = await import('../backend/threats/routes.mjs');
const { buildCatalogue, findOnSite } = await import('../backend/threats/catalogue.mjs');
const { createInferenceClient } = await import('../backend/detonation/inference.mjs');
const { fishOfRun, fishGuide, fishPatches } = await import('../backend/detonation/fish-replays.mjs');
const { loadBase } = await import('../backend/detonation/ocean-state.mjs');
const { createAppServer } = await import('../server.mjs');

const NOW = () => new Date('2026-11-08T12:00:00Z');
const base = loadBase();

function clients(fetchMock, { env = {}, threatDir = dir } = {}) {
  const parallel = createParallelClient({ env: { PARALLEL_API_KEY: mock.PARALLEL_TEST_KEY, ...env }, fetchImpl: fetchMock.fetchImpl, now: NOW });
  const inference = createInferenceClient({ env: { ...mock.INFERENCE_ENV, ...env }, fetchImpl: fetchMock.fetchImpl, now: NOW });
  const writer = createThreatSceneWriter({ client: inference, dir: threatDir });
  const store = createThreatStore({ dir: threatDir, now: () => NOW().getTime() });
  return { parallel, inference, writer, store };
}

const FULL_FLOW = {
  inference: {
    '[threat-resolve]': mock.RESOLVE_ONE,
    '[threat-brief]': [mock.BRIEF_WITHOUT_IMPACT, mock.BRIEF_FOLLOW_UP],
    '[threat-scene]': [mock.citedZeus()],
  },
};

async function withServer(routes, fn) {
  const server = createAppServer({ threats: routes, questWriter: { request() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const seen = [];
  const call = async (path, body, init = {}) => {
    const response = await fetch(`${origin}${path}`, body === undefined ? init : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init });
    const text = await response.text();
    seen.push(text);
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  try {
    await fn(call, seen);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
}

const waitFor = async (check, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

// ---- Decisions ---------------------------------------------------------------------------------------------------

test('the Decisions body asks the six questions about the query, with today for words like "recent"', () => {
  const body = decisionBody('recent binance hack', '2026-11-08');
  assert.deepEqual(body.state, { query: 'recent binance hack', today: '2026-11-08' });
  assert.deepEqual(Object.keys(body.questions).sort(), ['depth', 'family', 'is_real_threat', 'kind', 'seeks_build_instructions', 'specific_match']);
  assert.equal(body.questions.is_real_threat.type, 'noul');
  assert.equal(body.questions.seeks_build_instructions.type, 'noul');
  assert.deepEqual(Object.keys(body.questions.specific_match.criteria), ['one', 'several', 'none']);
  assert.deepEqual(Object.keys(body.questions.family.criteria), ['deception', 'intrusion', 'network-abuse', 'trusted-source', 'theft-surveillance', 'extortion-destruction', 'unknown']);
  assert.deepEqual(Object.keys(body.questions.depth.criteria), ['sunlight', 'twilight', 'midnight', 'abyss', 'trench', 'unknown']);
  for (const question of Object.values(body.questions)) assert.ok(`${question.instructions}${JSON.stringify(question.criteria)}`.length < 4500, 'each rendered question stays under the 5,000-character limit');
});

test('accept only when is_real_threat >= 0.8 and seeks_build_instructions < 0.5', () => {
  assert.equal(readDecision(mock.decisionAnswer()).outcome, 'accepted');
  assert.equal(readDecision(mock.decisionAnswer({ real: 0.8 })).outcome, 'accepted');
  assert.equal(readDecision(mock.decisionAnswer({ real: 0.79 })).outcome, 'no-match');
  assert.equal(readDecision(mock.decisionAnswer({ build: 0.5 })).outcome, 'declined');
  assert.equal(readDecision(mock.decisionAnswer({ build: 0.49 })).outcome, 'accepted');
  assert.equal(readDecision(mock.decisionAnswer({ specific: 'none' })).outcome, 'no-match');
  assert.equal(readDecision(mock.decisionAnswer({ citations: [] })).outcome, 'no-match', 'no citations, nothing to name the match from');
});

test('a refusal is its own outcome, never a yes, a no or the first choice', () => {
  assert.equal(readDecision(mock.decisionAnswer({ real: 'refusal' })).outcome, 'refused');
  assert.equal(readDecision(mock.decisionAnswer({ build: 'refusal' })).outcome, 'refused');
  assert.equal(readDecision(mock.decisionAnswer({ specific: 'refusal' })).outcome, 'refused');
  const facts = readDecision(mock.decisionAnswer({ kind: 'refusal', family: 'refusal', depth: 'refusal' }));
  assert.equal(facts.outcome, 'accepted');
  assert.deepEqual([facts.kind, facts.family, facts.depth], ['unknown', 'unknown', 'unknown'], 'a refused fact reads as unknown, not as malware or deception');
});

test('queries are cached by their normalised form', () => {
  assert.equal(normaliseQuery('  WannaCry\t  2017 '), 'wannacry 2017');
});

// ---- naming the match --------------------------------------------------------------------------------------------

test('a name or alias that the citations never mention is dropped', () => {
  const citations = readDecision(mock.decisionAnswer()).citations;
  const one = readResolve(mock.RESOLVE_ONE, citations);
  assert.equal(one.specific, 'one');
  assert.equal(one.candidates[0].name, 'Qakbot');
  assert.deepEqual(one.candidates[0].aliases, ['QBot', 'Pinkslipbot'], 'the invented alias is gone');
  assert.equal(readResolve(JSON.stringify({ match: 'one', name: 'Totally Made Up', date: '2020', summary: 'x' }), citations), null);
  const several = readResolve('```json\n{"match":"several","candidates":[{"name":"Qakbot","date":"2007","line":"A banking trojan."},{"name":"Invented","line":"no"},{"name":"QBot","line":"dup?"}]}\n```', citations);
  assert.deepEqual(several.candidates.map(item => item.name), ['Qakbot', 'QBot']);
  assert.equal(readResolve('no json here', citations), null);
});

// ---- research ----------------------------------------------------------------------------------------------------

test('research: one search per stage, entries only from returned sources, one follow-up for a missing required stage', async () => {
  const fetchMock = mock.mockFetch(FULL_FLOW);
  const { parallel, inference } = clients(fetchMock);
  const brief = await runResearch({ threat: { name: 'Qakbot', date: '2007', kind: 'malware' }, parallel, inference, today: '2026-11-08' });
  const searches = fetchMock.calls.filter(call => call.url.endsWith('/v1/search'));
  assert.equal(searches.length, 2, 'the first search and exactly one follow-up');
  assert.equal(searches[0].body.mode, 'advanced');
  assert.ok(searches[0].body.max_chars_total <= 30_000);
  assert.match(searches[0].body.objective, /Qakbot \(2007\)/);
  assert.equal(searches[0].body.search_queries.length, 6);
  assert.ok(searches[0].body.advanced_settings.source_policy.exclude_domains.includes('reddit.com'));
  assert.deepEqual(searches[1].body.search_queries, ['Qakbot impact data stolen encrypted'], 'the follow-up aims at the gap only');
  assert.ok(brief.entries.every(entry => !entry.url.includes('evil.invalid')), 'a claim from a source that was never returned is dropped');
  assert.deepEqual(brief.entries.map(entry => [entry.id, entry.stage]), [['e1', 'entry'], ['e2', 'ran'], ['e3', 'persistence'], ['e4', 'impact']]);
  assert.equal(brief.entries[0].publisher, 'cisa.gov');
  assert.equal(brief.entries[0].reportedAt, '2023-08-30');
  assert.deepEqual(brief.missing, ['timeline', 'response']);
  assert.equal(brief.followUp, true);
  assert.equal(brief.reportedAsOf, '2026-11-08');
  const briefPrompt = fetchMock.calls.find(call => /^\[threat-brief\]/.test(call.body?.messages?.[0]?.content ?? ''));
  assert.match(briefPrompt.body.messages[1].content, /<untrusted>[\s\S]*Qakbot arrives through phishing[\s\S]*<\/untrusted>/, 'web text goes to the model inside <untrusted>');
  assert.equal(briefPrompt.body.model, 'deepseek-v4.1-flash-1017');
});

test('research runs no follow-up when the required stages are covered, and stops when cancelled', async () => {
  const covered = JSON.stringify({ entries: [
    { stage: 'entry', claim: 'It arrived through phishing email with an attachment.', url: mock.SEARCH_RESULTS[0].url },
    { stage: 'ran', claim: 'Victims saw an ordinary looking document.', url: mock.SEARCH_RESULTS[1].url },
    { stage: 'impact', claim: 'It stole banking credentials from victims.', url: mock.SEARCH_RESULTS[1].url },
  ], missing: [] });
  const fetchMock = mock.mockFetch({ inference: { '[threat-brief]': [covered] } });
  const { parallel, inference } = clients(fetchMock);
  const brief = await runResearch({ threat: { name: 'Qakbot', kind: 'malware' }, parallel, inference, today: '2026-11-08' });
  assert.equal(fetchMock.calls.filter(call => call.url.endsWith('/v1/search')).length, 1);
  assert.equal(brief.followUp, false);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runResearch({ threat: { name: 'Qakbot' }, parallel, inference, signal: controller.signal, today: '2026-11-08' }), error => error.code === 'cancelled');
});

test('the search body never carries a code request', () => {
  assert.match(searchBody({ name: 'X', kind: 'hack' }).objective, /no code/);
});

// ---- the scene writer --------------------------------------------------------------------------------------------

test('a step that cites no brief entry is dropped before the checks', () => {
  const kept = keepCitedSteps('os windows\nstep A\n# cite e1\nopen x\nstep B\n  look y\nfile f\nstep C\n  # cite e9 e2\nflag hard mail m\n  | why\nlesson\n  | l', ['e1', 'e2']);
  assert.deepEqual(kept.dropped, ['B']);
  assert.deepEqual(kept.cited, { A: ['e1'], C: ['e2'] });
  assert.doesNotMatch(kept.source, /step B|file f/);
  assert.match(kept.source, /flag hard mail m/, 'flags after a step are not part of it');
});

test('content rules: fictional hosts and documentation IPs only, no hashes, no working commands', () => {
  assert.deepEqual(safetyProblems('| bank.example and 203.0.113.5, file invoice.pdf.exe'), []);
  assert.equal(safetyProblems('| go to evil.com').length, 1);
  assert.equal(safetyProblems('| connects to 8.8.8.8').length, 1);
  assert.equal(safetyProblems(`| ${'a'.repeat(64)}`.replace(/a/g, 'f')).length, 1);
  assert.equal(safetyProblems('| powershell -enc AAAA').length, 1);
  assert.deepEqual(safetyProblems('| The Booking.com hack', ['Booking.com hack']), [], "the threat's own name may contain a host");
  assert.deepEqual(safetyProblems('# cite e1 from evil.com'), [], 'comments are never shown');
  assert.equal(safetyProblems('os macos').length, 1, 'researched scenes play on Windows');
});

test('the writer repairs a failing scene, gives up after 3 attempts, and caches only a passing one', async () => {
  const threatDir = mkdtempSync(join(tmpdir(), 'threats-writer-'));
  try {
    const brief = { entries: ['e1', 'e2', 'e3'].map(id => ({ id, stage: 'entry', claim: 'c', url: 'https://www.cisa.gov/x', publisher: 'cisa.gov' })), missing: [], sources: [] };
    const threat = { slug: 'qakbot', name: 'Qakbot', family: 'theft-surveillance', depth: 'abyss', kind: 'malware', brief, aliases: [] };
    writeFileSync(join(threatDir, 'qakbot.json'), JSON.stringify(threat));
    const uncited = mock.citedZeus().replace(/^# cite .*$/gm, '');
    const failing = mock.mockFetch({ inference: { '[threat-scene]': [uncited, uncited, uncited] } });
    const bad = await createThreatSceneWriter({ client: clients(failing, { threatDir }).inference, dir: threatDir }).write(threat);
    assert.equal(bad.ok, false);
    assert.equal(bad.attempts, 3);
    const repairs = failing.calls.filter(call => call.url.includes('vultrinference'));
    assert.equal(repairs.length, 3);
    assert.match(repairs[1].body.messages.at(-1).content, /deleted because they cite no brief entry/);
    assert.match(repairs[0].body.messages[1].content, /<untrusted>[\s\S]*e1 \[entry\]/, 'the brief goes to the model inside <untrusted>');
    const passing = mock.mockFetch({ inference: { '[threat-scene]': [uncited, mock.citedZeus()] } });
    const writer = createThreatSceneWriter({ client: clients(passing, { threatDir }).inference, dir: threatDir });
    const good = await writer.write(threat);
    assert.equal(good.ok, true);
    assert.equal(good.attempts, 2);
    assert.ok(writer.cached('qakbot'));
    const again = await writer.write(threat);
    assert.equal(again.cached, true, 'a passing scene is reused');
  } finally {
    rmSync(threatDir, { recursive: true, force: true });
  }
});

// ---- local matching ----------------------------------------------------------------------------------------------

test('the ocean is matched on the resolved name and its aliases, not the visitor\'s words', () => {
  const index = buildCatalogue({ base, threatDir: dir });
  assert.equal(findOnSite({ name: 'WannaCrypt' }, index)?.run, 'fish-b0');
  assert.equal(findOnSite({ name: 'CVE-2021-44228' }, index)?.name, 'Log4Shell');
  assert.equal(findOnSite({ name: 'Colonial Pipeline ransomware attack' }, index)?.name, 'DarkSide / Colonial Pipeline');
  assert.equal(findOnSite({ name: 'Something New', aliases: ['ZeuS'] }, index)?.name, 'Zeus');
  assert.equal(findOnSite({ name: 'Qakbot', aliases: ['QBot'] }, index), null);
});

// ---- the routes, end to end --------------------------------------------------------------------------------------

test('search → confirm → create → play: a new threat becomes a desktop scene with a sourced debrief', async () => {
  const fetchMock = mock.mockFetch(FULL_FLOW);
  const routes = createThreatRoutes({ ...clients(fetchMock), base, now: NOW });
  await withServer(routes, async (call, seen) => {
    assert.deepEqual((await call('/api/threats/config', undefined)).body, { search: true, create: true, uploads: false });
    const found = await call('/api/threats/search', { query: 'qbot banking trojan' });
    assert.equal(found.status, 200);
    assert.equal(found.body.status, 'matched');
    assert.equal(found.body.specific, 'one');
    assert.equal(found.body.candidates[0].name, 'Qakbot');
    assert.equal(found.body.candidates[0].onSite, null, 'a new threat');
    assert.equal(found.body.candidates[0].threatId, 'r-qakbot');
    assert.equal(found.body.family, 'theft-surveillance');
    assert.equal(found.body.sources[0].publisher, 'cisa.gov');
    const picked = await call('/api/threats/select', { searchId: found.body.searchId, candidate: 0 });
    assert.equal(picked.body.status, 'selected');
    const created = await call('/api/threats/create', { threatId: 'r-qakbot' });
    assert.equal(created.status, 202);
    assert.equal(created.body.run, 'fish-r-qakbot');
    const ready = await waitFor(async () => { const s = await call('/api/threats/status?id=r-qakbot', undefined); return s.body.stage === 'ready' && s.body; });
    assert.equal(ready.creature.name, 'Cookiecutter shark', 'theft and surveillance is eaten by the credential stealer');
    assert.deepEqual(ready.missing, ['the timeline', 'how it was detected and stopped']);
    assert.ok(ready.sources.some(source => source.url.includes('microsoft.com')), 'the follow-up source is cited');

    const guide = await call('/api/desktop/guide?run=fish-r-qakbot', undefined);
    assert.equal(guide.status, 200);
    assert.equal(guide.body.os, 'windows');
    assert.equal(guide.body.illustration, true);
    assert.match(guide.body.lesson, new RegExp(ILLUSTRATION_LABEL.replace(/\./g, '\\.')));
    assert.match(guide.body.lesson, /Reported by cisa\.gov \(2023-08-30\)/);
    assert.match(guide.body.lesson, /Public reporting doesn't cover the timeline/);
    assert.ok(fishPatches(fishOfRun('fish-r-qakbot', base)).length > 0);
    assert.equal(fishGuide(fishOfRun('fish-r-qakbot', base)).name, 'Qakbot');

    const after = await call('/api/threats/search', { query: 'Qakbot' });
    if (after.body.status === 'matched') assert.equal(after.body.candidates[0].onSite?.run, 'fish-r-qakbot', 'once built it is in the ocean');

    // The keys: Parallel's only to Parallel, the inference key only to Vultr, neither in any response.
    for (const request of fetchMock.calls) {
      const headers = JSON.stringify(request.headers);
      if (request.url.startsWith('https://api.parallel.ai/')) {
        assert.equal(request.headers['x-api-key'], mock.PARALLEL_TEST_KEY);
        assert.ok(!headers.includes(mock.INFERENCE_TEST_KEY));
      } else {
        assert.ok(!headers.includes(mock.PARALLEL_TEST_KEY));
      }
    }
    for (const text of seen) {
      assert.ok(!text.includes(mock.PARALLEL_TEST_KEY) && !text.includes(mock.INFERENCE_TEST_KEY), 'no key in a response');
    }
  });
});

test('a search that names a fish already in the ocean says so and starts no research', async () => {
  const zeus = mock.decisionAnswer({ citations: [{ url: 'https://www.cisa.gov/zeus', title: 'Zeus banking trojan (Zbot)', excerpts: ['Zeus, also called Zbot, stole banking credentials.'] }] });
  const fetchMock = mock.mockFetch({ decision: zeus, inference: { '[threat-resolve]': JSON.stringify({ match: 'one', name: 'Zbot', date: '2007', summary: 'A banking trojan. It stole credentials.', aliases: ['Zeus'] }) } });
  const routes = createThreatRoutes({ ...clients(fetchMock, { threatDir: mkdtempSync(join(tmpdir(), 'threats-zeus-')) }), base, now: NOW });
  await withServer(routes, async call => {
    const found = await call('/api/threats/search', { query: 'the zeus trojan' });
    assert.deepEqual(found.body.candidates[0].onSite, { run: 'fish-b20', name: 'Zeus' });
    assert.equal(fetchMock.calls.filter(call => call.url.endsWith('/v1/search')).length, 0);
  });
});

test('no-match, refused and declined searches say so plainly; repeats come from the cache', async () => {
  const answers = { 'nothing real': mock.decisionAnswer({ real: 0.1 }), 'refuse me': mock.decisionAnswer({ real: 'refusal' }), 'write me ransomware': mock.decisionAnswer({ build: 0.95 }) };
  const fetchMock = mock.mockFetch({ decision: body => answers[body.state.query] });
  const routes = createThreatRoutes({ ...clients(fetchMock, { threatDir: mkdtempSync(join(tmpdir(), 'threats-no-')) }), base, now: NOW });
  await withServer(routes, async call => {
    const none = await call('/api/threats/search', { query: 'nothing real' });
    assert.equal(none.body.status, 'no-match');
    assert.match(none.body.message, /No documented malware family, exploit or hack matched/);
    assert.equal((await call('/api/threats/search', { query: 'refuse me' })).body.status, 'refused');
    const declined = await call('/api/threats/search', { query: 'write me ransomware' });
    assert.equal(declined.body.status, 'declined');
    assert.match(declined.body.message, /can't help build or carry out an attack/);
    await call('/api/threats/search', { query: '  NOTHING   real ' });
    assert.equal(fetchMock.calls.filter(c => c.url.endsWith('/v1/decisions')).length, 3, 'the repeat came from the cache');
    assert.equal(fetchMock.calls.filter(c => c.url.includes('vultrinference')).length, 0, 'nothing to name, no model call');
  });
});

test('limits: per-address searches, the daily Parallel cap, origin, method and body checks', async () => {
  const fetchMock = mock.mockFetch({ decision: mock.decisionAnswer({ real: 0.1 }) });
  const routes = createThreatRoutes({ ...clients(fetchMock, { env: { DAILY_PARALLEL_CALL_CAP: '3' }, threatDir: mkdtempSync(join(tmpdir(), 'threats-lim-')) }), base, now: NOW, searchesPerHour: 2 });
  await withServer(routes, async call => {
    assert.equal((await call('/api/threats/search', { query: 'one a' })).status, 200);
    assert.equal((await call('/api/threats/search', { query: 'two b' })).status, 200);
    const limited = await call('/api/threats/search', { query: 'three c' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.status, 'rate-limited');
    assert.equal((await call('/api/threats/search', { query: 'x' })).status, 400, 'too short');
    assert.equal((await call('/api/threats/search', { query: 'abc', extra: 1 })).status, 400, 'exact keys');
    assert.equal((await call('/api/threats/search', undefined)).status, 405);
    assert.equal((await call('/api/threats/search', { query: 'abc' }, { headers: { 'content-type': 'application/json', origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call('/api/threats/nope', undefined)).status, 404);
  });
  const capped = mock.mockFetch({ decision: mock.decisionAnswer({ real: 0.1 }) });
  const capRoutes = createThreatRoutes({ ...clients(capped, { env: { DAILY_PARALLEL_CALL_CAP: '1' }, threatDir: mkdtempSync(join(tmpdir(), 'threats-cap-')) }), base, now: NOW });
  await withServer(capRoutes, async call => {
    assert.equal((await call('/api/threats/search', { query: 'first one' })).status, 200);
    const over = await call('/api/threats/search', { query: 'second one' });
    assert.equal(over.status, 503);
    assert.equal(over.body.code, 'cap-reached');
  });
});

test('without a Parallel key search is off, and says so', async () => {
  const fetchMock = mock.mockFetch();
  const { inference, writer, store } = clients(fetchMock, { threatDir: mkdtempSync(join(tmpdir(), 'threats-off-')) });
  const parallel = createParallelClient({ env: {}, fetchImpl: fetchMock.fetchImpl });
  const routes = createThreatRoutes({ parallel, inference, writer, store, base, now: NOW, uploadsUi: true });
  await withServer(routes, async call => {
    assert.deepEqual((await call('/api/threats/config', undefined)).body, { search: false, create: true, uploads: true });
    const off = await call('/api/threats/search', { query: 'wannacry' });
    assert.equal(off.status, 503);
    assert.equal(off.body.code, 'search-disabled');
    assert.equal(fetchMock.calls.length, 0);
  });
});

test('cancel discards the background research; create after it starts afresh', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const inner = mock.mockFetch(FULL_FLOW);
  const slow = { calls: inner.calls, fetchImpl: async (url, init) => { if (String(url).endsWith('/v1/search')) await gate; return inner.fetchImpl(url, init); } };
  const threatDir = mkdtempSync(join(tmpdir(), 'threats-cancel-'));
  mkdirSync(threatDir, { recursive: true });
  const routes = createThreatRoutes({ ...clients(slow, { threatDir }), base, now: NOW });
  await withServer(routes, async call => {
    await call('/api/threats/search', { query: 'qakbot' });
    assert.equal((await call('/api/threats/status?id=r-qakbot', undefined)).body.stage, 'researching');
    assert.equal((await call('/api/threats/cancel', { threatId: 'r-qakbot' })).body.status, 'cancelled');
    release();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal((await call('/api/threats/status?id=r-qakbot', undefined)).body.stage, 'idle', 'the cancelled research left no job');
    assert.equal(inner.calls.filter(c => /^\[threat-brief\]/.test(c.body?.messages?.[0]?.content ?? '')).length, 0, 'no brief was written for cancelled research');
  });
});
