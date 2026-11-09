// Step 2 of threat search: Decisions returns probabilities and citations, not names. One short model call reads the
// citation excerpts and names the match. Every name must occur in the citations, or it is dropped.
import { clip, isDate, nameKey, parseJsonReply, untrusted, UNTRUSTED_NOTE } from './text.mjs';

export const RESOLVE_MARKER = '[threat-resolve]';
const MAX_CANDIDATES = 3;

function citationText(citations) {
  return citations.map((item, n) => [`[${n + 1}] ${item.title}`, item.url, ...item.excerpts].join('\n')).join('\n\n');
}

export function resolveMessages({ query, specific, citations, today }) {
  const shape = specific === 'one'
    ? '{"match":"one","name":"<canonical name>","date":"<YYYY, YYYY-MM or YYYY-MM-DD>","summary":"<two short sentences>","aliases":["<other names in the sources>"]}'
    : '{"match":"several","candidates":[{"name":"<canonical name>","date":"<YYYY, YYYY-MM or YYYY-MM-DD>","line":"<one short sentence>","aliases":["<other names>"]}]}';
  return [
    { role: 'system', content: `${RESOLVE_MARKER} You name the malware family, exploit or hacking incident that web sources describe. ${UNTRUSTED_NOTE} Reply with one JSON object only. Every field must come from the sources: never invent a name, date or fact. Use the name the sources use most; put other names they use in aliases. Name no attacker unless the sources do, and then attribute it ("reported by").` },
    { role: 'user', content: [
      `Today is ${today}. A visitor searched for:`,
      untrusted('Visitor query', query),
      untrusted('Sources', citationText(citations)),
      specific === 'one' ? 'The sources point to one incident or family. Reply in this shape:' : `The sources point to several. List up to ${MAX_CANDIDATES}, most likely first, in this shape:`,
      shape,
    ].join('\n\n') },
  ];
}

// Each name, and each alias, must appear in the citations' titles or excerpts.
function grounded(name, haystack) {
  const key = nameKey(name);
  return key.length >= 2 && haystack.includes(key);
}

function candidateOf(raw, haystack, line) {
  const name = clip(raw?.name, 80);
  if (!name || !grounded(name, haystack)) return null;
  const aliases = [...new Set((Array.isArray(raw?.aliases) ? raw.aliases : []).map(alias => clip(alias, 60)).filter(alias => alias && grounded(alias, haystack) && nameKey(alias) !== nameKey(name)))].slice(0, 6);
  return { name, date: isDate(raw?.date) ? raw.date : '', summary: clip(line, 320), aliases };
}

// { specific: 'one' | 'several', candidates: [{ name, date, summary, aliases }] } or null when nothing survives the checks.
export function readResolve(reply, citations) {
  const parsed = parseJsonReply(reply);
  if (!parsed) return null;
  const haystack = ` ${nameKey(citations.map(item => [item.title, ...item.excerpts].join(' ')).join(' '))} `;
  if (parsed.match === 'one') {
    const one = candidateOf(parsed, haystack, parsed.summary);
    return one ? { specific: 'one', candidates: [one] } : null;
  }
  const seen = new Set();
  const candidates = (Array.isArray(parsed.candidates) ? parsed.candidates : []).map(raw => candidateOf(raw, haystack, raw?.line))
    .filter(item => item && !seen.has(nameKey(item.name)) && seen.add(nameKey(item.name))).slice(0, MAX_CANDIDATES);
  if (!candidates.length) return null;
  return { specific: candidates.length === 1 ? 'one' : 'several', candidates };
}

export async function resolveMatch({ inference, query, specific, citations, today }) {
  const reply = await inference.complete(resolveMessages({ query, specific, citations, today }), { model: 'threat', maxTokens: 900 });
  return readResolve(reply, citations);
}
