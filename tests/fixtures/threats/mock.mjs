// Mocked Parallel and Vultr inference for threat-search tests. No live call is ever made: every client in a test takes the
// fetch this returns. Keys are the literal test strings below; nothing real belongs in a fixture.
import { sceneSource } from '../../../backend/detonation/fish-scenes.mjs';

export const PARALLEL_TEST_KEY = 'test-parallel-key-not-real';
export const INFERENCE_TEST_KEY = 'test-inference-key-not-real';
export const INFERENCE_ENV = { DETONATION_INFERENCE_ENABLED: 'true', VULTR_INFERENCE_API_KEY: INFERENCE_TEST_KEY };

const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
const completion = content => json({ choices: [{ message: { content } }] });

// A Decisions answer. Pass overrides per question; a value of 'refusal' makes that answer a refusal.
export function decisionAnswer({ real = 0.97, build = 0.02, specific = 'one', kind = 'malware', family = 'theft-surveillance', depth = 'abyss', citations } = {}) {
  const noul = value => (value === 'refusal' ? { type: 'refusal' } : { type: 'noul', noul: value });
  const pick = (value, options) => (value === 'refusal' ? { type: 'refusal' } : { type: 'choice', choice: value, probabilities: Object.fromEntries(options.map(o => [o, o === value ? 0.9 : 0.1 / (options.length - 1)])) });
  return {
    mode: 'fast', decision_id: 'decisions_test', usage: { input_tokens: 100, output_tokens: 0 },
    answers: {
      is_real_threat: noul(real), seeks_build_instructions: noul(build),
      specific_match: pick(specific, ['one', 'several', 'none']),
      kind: pick(kind, ['malware', 'exploit', 'hack', 'unknown']),
      family: pick(family, ['deception', 'intrusion', 'network-abuse', 'trusted-source', 'theft-surveillance', 'extortion-destruction', 'unknown']),
      depth: pick(depth, ['sunlight', 'twilight', 'midnight', 'abyss', 'trench', 'unknown']),
    },
    citations: citations ?? [
      { url: 'https://www.cisa.gov/news-events/alerts/example-qakbot', title: 'Qakbot malware advisory', excerpts: ['Qakbot, also known as QBot or Pinkslipbot, is a banking trojan first seen in 2007 that spreads through phishing email.'] },
      { url: 'https://www.bleepingcomputer.com/news/security/qakbot-takedown/', title: 'Qakbot botnet dismantled', excerpts: ['The Qakbot (QBot) malware infected over 700,000 computers before its 2023 takedown.'] },
    ],
  };
}

export const SEARCH_RESULTS = [
  { url: 'https://www.cisa.gov/news-events/alerts/example-qakbot', title: 'Qakbot malware advisory', publish_date: '2023-08-30', excerpts: ['Qakbot arrives through phishing email with a malicious attachment or link.', 'Once run it adds a scheduled task to persist.'] },
  { url: 'https://www.bleepingcomputer.com/news/security/qakbot-takedown/', title: 'Qakbot botnet dismantled', publish_date: '2023-08-29', excerpts: ['The malware stole banking credentials and was later used to deliver ransomware.'] },
  { url: 'https://www.reddit.com/r/sysadmin/qakbot', title: 'forum thread', publish_date: '2023-08-29', excerpts: ['someone said things'] },
];
export const FOLLOW_UP_RESULTS = [
  { url: 'https://www.microsoft.com/security/blog/qakbot-impact', title: 'Qakbot impact', publish_date: '2023-09-01', excerpts: ['Victims lost banking credentials; infections were often followed by ransomware.'] },
];

// A passing researched quest: the reference Zeus quest with a cite line under every step.
export function citedZeus(ids = ['e1', 'e2', 'e3']) {
  let n = 0;
  return sceneSource('zeus').split('\n').flatMap(line => (/^step\s/.test(line) ? [line, `# cite ${ids[n++ % ids.length]}`] : [line])).join('\n');
}

/**
 * fetch for Parallel (/v1/decisions, /v1/search) and Vultr inference (routed by the system marker).
 * opts.decision: a Decisions body or a function (requestBody) → body. opts.search: [results per call]. opts.inference:
 * { '[threat-resolve]': reply | fn, '[threat-brief]': [replies per call], '[threat-scene]': [replies per call] }.
 * calls records every request: { url, headers, body }.
 */
export function mockFetch({ decision = decisionAnswer(), search = [SEARCH_RESULTS, FOLLOW_UP_RESULTS], inference = {} } = {}) {
  const calls = [];
  const counters = {};
  const next = (key, list) => {
    counters[key] = (counters[key] ?? 0) + 1;
    const items = Array.isArray(list) ? list : [list];
    return items[Math.min(counters[key], items.length) - 1];
  };
  async function fetchImpl(url, init = {}) {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), headers: { ...(init.headers ?? {}) }, body });
    if (String(url) === 'https://api.parallel.ai/v1/decisions') return json(typeof decision === 'function' ? decision(body) : decision);
    if (String(url) === 'https://api.parallel.ai/v1/search') return json({ search_id: 'search_test', session_id: 'session_test', results: next('search', search) ?? [] });
    if (String(url).startsWith('https://api.vultrinference.com/')) {
      const system = body.messages[0].content;
      const marker = /^\[threat-[a-z]+\]/.exec(system)?.[0];
      const reply = next(marker, inference[marker]);
      return completion(typeof reply === 'function' ? reply(body) : reply ?? '');
    }
    throw new Error(`unexpected fetch ${url}`);
  }
  return { fetchImpl, calls };
}

export const RESOLVE_ONE = JSON.stringify({ match: 'one', name: 'Qakbot', date: '2007', summary: 'Qakbot is a banking trojan first seen in 2007. It spread through phishing email and was dismantled in 2023.', aliases: ['QBot', 'Pinkslipbot', 'Made Up Alias'] });
export const BRIEF_WITHOUT_IMPACT = JSON.stringify({ entries: [
  { stage: 'entry', claim: 'It arrived through phishing email with a malicious attachment or link.', url: 'https://www.cisa.gov/news-events/alerts/example-qakbot', reportedAt: '2023-08-30' },
  { stage: 'persistence', claim: 'Once run it added a scheduled task to stay on the computer.', url: 'https://www.cisa.gov/news-events/alerts/example-qakbot', reportedAt: null },
  { stage: 'ran', claim: 'Invented claim from a source that was never returned.', url: 'https://evil.invalid/made-up', reportedAt: null },
  { stage: 'ran', claim: 'Victims saw an ordinary looking document while it ran.', url: 'https://www.bleepingcomputer.com/news/security/qakbot-takedown/', reportedAt: null },
], missing: ['impact'] });
export const BRIEF_FOLLOW_UP = JSON.stringify({ entries: [
  { stage: 'impact', claim: 'Victims lost banking credentials, and infections were often followed by ransomware.', url: 'https://www.microsoft.com/security/blog/qakbot-impact', reportedAt: '2023-09-01' },
], missing: [] });
