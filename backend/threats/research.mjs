// Step 4 of threat search: research a new threat for its scene. A Parallel Search aimed at each stage a scene needs, then one
// model call turns the excerpts into a brief: one claim per stage, each with its source and the date of the reporting. If a
// stage the scene needs is missing, one follow-up search aims at the gaps; still missing, the scene leaves it out and says so.
// Never an invented stage: an entry whose source is not a search result is dropped.
import { clip, isDate, parseJsonReply, publisherOf, untrusted, UNTRUSTED_NOTE } from './text.mjs';

export const BRIEF_MARKER = '[threat-brief]';
export const STAGES = ['entry', 'ran', 'persistence', 'impact', 'timeline', 'response'];
export const REQUIRED_STAGES = ['entry', 'ran', 'impact'];
export const STAGE_LABELS = {
  entry: 'how it got in', ran: 'what ran and what the victim saw', persistence: 'how it stayed and spread',
  impact: 'what was taken, changed or destroyed', timeline: 'the timeline', response: 'how it was detected and stopped',
};
const STAGE_QUERIES = {
  entry: name => `${name} initial access infection vector`,
  ran: name => `${name} what victims saw`,
  persistence: name => `${name} persistence lateral spread`,
  impact: name => `${name} impact data stolen encrypted`,
  timeline: name => `${name} incident timeline`,
  response: name => `${name} detection mitigation advisory`,
};
// Social media, video and forums: not sources a debrief should cite.
const EXCLUDE = ['reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'quora.com', 'pinterest.com', 'linkedin.com', 'medium.com'];
// Primary and established sources first: government, CERTs, vendors' research, the established security and general press.
const CREDIBLE = [/\.gov(\.[a-z]{2})?$/, /\.mil$/, /(^|\.)cert\./, /(^|\.)ncsc\.gov\.uk$/, /(^|\.)enisa\.europa\.eu$/, /(^|\.)nvd\.nist\.gov$/,
  /(^|\.)(microsoft|mandiant|crowdstrike|sophos|securelist|welivesecurity|paloaltonetworks|unit42\.paloaltonetworks|talosintelligence|symantec|broadcom|trendmicro|checkpoint|kaspersky|eset|malwarebytes|proofpoint|secureworks|fortinet|cloudflare|google|blog\.google|cisco|ibm|redcanary|huntress|sentinelone)\.com$/,
  /(^|\.)(bleepingcomputer|therecord\.media|krebsonsecurity|securityweek|darkreading|theregister|wired|arstechnica|reuters|apnews|bbc|theguardian|nytimes|washingtonpost|ft|bloomberg|zdnet|techcrunch)\.(com|co\.uk|media)$/,
  /(^|\.)wikipedia\.org$/];
const MAX_CHARS_TOTAL = 30_000;
const MAX_FOLLOW_UP_CHARS = 15_000;
const MAX_ENTRIES = 24;

const credible = url => CREDIBLE.some(re => re.test(publisherOf(url)));

export function searchBody(threat, stages = STAGES, maxChars = MAX_CHARS_TOTAL) {
  const name = clip(threat.name, 60);
  const when = threat.date ? ` (${threat.date})` : '';
  return {
    objective: `Factual public reporting on ${name}${when}, the ${threat.kind === 'unknown' ? 'cybersecurity incident' : threat.kind}: ${stages.map(stage => STAGE_LABELS[stage]).join('; ')}. Prefer government advisories, CERTs, security vendors' incident reports, the affected organisation's own statements and established security press. Behaviour and impact only; no code.`,
    search_queries: stages.map(stage => STAGE_QUERIES[stage](name)),
    mode: 'advanced',
    max_chars_total: maxChars,
    advanced_settings: { source_policy: { exclude_domains: EXCLUDE }, max_results: 10 },
  };
}

// The search's results, credible sources first, as { url, title, publisher, reportedAt, excerpts }.
export function resultsOf(response) {
  const list = (Array.isArray(response?.results) ? response.results : []).filter(item => typeof item?.url === 'string' && /^https?:\/\//i.test(item.url)).map(item => ({
    url: item.url.slice(0, 500), title: clip(item.title, 200), publisher: publisherOf(item.url),
    reportedAt: isDate(item.publish_date) ? item.publish_date : null,
    excerpts: (Array.isArray(item.excerpts) ? item.excerpts : []).filter(text => typeof text === 'string'),
  }));
  return list.map((item, n) => ({ item, n })).sort((a, b) => Number(credible(b.item.url)) - Number(credible(a.item.url)) || a.n - b.n).map(({ item }) => item);
}

export function briefMessages(threat, results, today) {
  const sources = results.map((item, n) => [`[${n + 1}] ${item.title} (${item.publisher}${item.reportedAt ? `, ${item.reportedAt}` : ''})`, item.url, ...item.excerpts].join('\n')).join('\n\n');
  return [
    { role: 'system', content: `${BRIEF_MARKER} You write research briefs for a security-awareness simulation. ${UNTRUSTED_NOTE} Reply with one JSON object only. Every claim must be stated by the source you cite: never invent or infer a step. Describe behaviour and impact in plain words; no code, commands, hashes, file paths of real malware, or exploit details. Name no attacker unless the source does, and then attribute it ("reported by <publisher>"). Facts about recent incidents may still be changing: keep to what the source says.` },
    { role: 'user', content: [
      `Today is ${today}. The threat: ${threat.name}${threat.date ? ` (${threat.date})` : ''}.`,
      untrusted('Search results', sources),
      `Stages: ${STAGES.map(stage => `${stage} = ${STAGE_LABELS[stage]}`).join('; ')}.`,
      'Give one to three entries per stage the sources cover, each one plain sentence of at most 40 words, with the exact URL of the source that states it. List the stages no source covers in "missing". Shape:',
      '{"entries":[{"stage":"entry","claim":"…","url":"https://…","reportedAt":"YYYY-MM-DD or null"}],"missing":["persistence"]}',
    ].join('\n\n') },
  ];
}

// The brief's entries from a model reply, kept only when the stage is known and the URL is one of the results.
export function readBrief(reply, results) {
  const parsed = parseJsonReply(reply);
  const byUrl = new Map(results.map(item => [item.url, item]));
  const entries = [];
  for (const raw of Array.isArray(parsed?.entries) ? parsed.entries : []) {
    const source = byUrl.get(typeof raw?.url === 'string' ? raw.url.trim() : '');
    const claim = clip(raw?.claim, 320);
    if (!source || !STAGES.includes(raw?.stage) || claim.length < 8) continue;
    entries.push({ stage: raw.stage, claim, url: source.url, publisher: source.publisher, reportedAt: source.reportedAt ?? (isDate(raw.reportedAt) ? raw.reportedAt : null) });
  }
  return entries;
}

const missingOf = entries => STAGES.filter(stage => !entries.some(entry => entry.stage === stage));
const aborted = signal => { if (signal?.aborted) { const error = new Error('research cancelled'); error.code = 'cancelled'; throw error; } };

async function briefFrom(results, { threat, inference, today }) {
  if (!results.length) return [];
  return readBrief(await inference.complete(briefMessages(threat, results, today), { model: 'threat', maxTokens: 2400 }), results);
}

// Brief: { name, date, reportedAsOf, entries: [{ id, stage, claim, url, publisher, reportedAt }], missing, followUp, sources }.
export async function runResearch({ threat, parallel, inference, signal, today }) {
  aborted(signal);
  let results = resultsOf(await parallel.search(searchBody(threat)));
  aborted(signal);
  let entries = await briefFrom(results, { threat, inference, today });
  let followUp = false;
  const gaps = REQUIRED_STAGES.filter(stage => missingOf(entries).includes(stage));
  if (gaps.length) {
    aborted(signal);
    followUp = true;
    const extra = resultsOf(await parallel.search(searchBody(threat, gaps, MAX_FOLLOW_UP_CHARS))).filter(item => !results.some(seen => seen.url === item.url));
    aborted(signal);
    const more = (await briefFrom(extra, { threat, inference, today })).filter(entry => gaps.includes(entry.stage));
    results = [...results, ...extra];
    entries = [...entries, ...more];
  }
  aborted(signal);
  entries = STAGES.flatMap(stage => entries.filter(entry => entry.stage === stage)).slice(0, MAX_ENTRIES).map((entry, n) => ({ id: `e${n + 1}`, ...entry }));
  const cited = new Set(entries.map(entry => entry.url));
  return {
    name: threat.name, date: threat.date ?? '', reportedAsOf: today, entries, missing: missingOf(entries), followUp,
    sources: results.filter(item => cited.has(item.url)).map(({ url, title, publisher, reportedAt }) => ({ url, title, publisher, reportedAt })),
  };
}
