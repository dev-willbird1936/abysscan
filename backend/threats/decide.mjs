// Step 1 of threat search: one Parallel Decisions call checks the visitor's query against the live web. Decisions searches
// the web itself and answers typed questions with probabilities and shared citations, never free text. The thresholds and
// the refusal rule live here, so the route only reads an outcome.

export const FAMILIES = ['deception', 'intrusion', 'network-abuse', 'trusted-source', 'theft-surveillance', 'extortion-destruction'];
export const KINDS = ['malware', 'exploit', 'hack'];
export const DEPTHS = ['sunlight', 'twilight', 'midnight', 'abyss', 'trench'];
export const REAL_THRESHOLD = 0.8;
export const BUILD_THRESHOLD = 0.5;
const MAX_CITATIONS = 12;
const MAX_EXCERPTS = 4;
const MAX_EXCERPT_CHARS = 1200;

// The cache key and the text sent: lower case, one space between words.
export const normaliseQuery = query => String(query ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

export function decisionBody(query, today) {
  return {
    state: { query: String(query), today },
    questions: {
      is_real_threat: {
        type: 'noul',
        instructions: '`query` was typed by a visitor to a security-awareness site. Does it name or describe a real malware family, exploit or hacking incident that credible public sources (government advisories, CERTs, security vendors, the affected company, established news) document? A description such as "recent <company> hack" counts when current reporting, as of `today`, shows such an incident.',
        criteria: {
          true: 'Credible public sources document a real malware family, exploit or hacking incident that the query names or describes.',
          false: 'The query names nothing real, is fiction, a joke or a product, or no credible source documents such an incident.',
        },
      },
      specific_match: {
        type: 'choice',
        instructions: 'How many distinct real incidents or families does the evidence match for `query`, read against `today` for words like "recent" or "last week"?',
        criteria: {
          one: 'The evidence points to a single incident or malware family.',
          several: 'More than one documented incident or family plausibly matches, for example two different hacks of the same company.',
          none: 'No documented incident or family matches.',
        },
      },
      kind: {
        type: 'choice',
        instructions: 'What is the best match for `query`?',
        criteria: {
          malware: 'A malware family or strain: a virus, worm, trojan, ransomware, stealer, spyware or similar.',
          exploit: 'A software vulnerability and its exploitation, for example a CVE.',
          hack: 'An intrusion or breach of an organisation, a scam campaign or another incident not defined by one malware family.',
          unknown: 'The evidence does not establish which.',
        },
      },
      family: {
        type: 'choice',
        instructions: 'Which family of attack best describes the main harm of the match for `query`?',
        criteria: {
          deception: 'Tricks a person: phishing, scareware, fake pages, scams, impersonation.',
          intrusion: 'Breaks into a system: an exploited flaw, stolen access, a remote-control trojan.',
          'network-abuse': 'Abuses networks at scale: worms, botnets, denial of service, traffic hijacking.',
          'trusted-source': 'Comes through something trusted: a poisoned update, package, supplier or app store.',
          'theft-surveillance': 'Steals data or watches the victim: credentials, banking details, documents, spyware.',
          'extortion-destruction': 'Encrypts, wipes or destroys data, or extorts the victim: ransomware, wipers.',
          unknown: 'The evidence does not establish which.',
        },
      },
      depth: {
        type: 'choice',
        instructions: 'How harmful was the match for `query` to its victims?',
        criteria: {
          sunlight: 'Harmless: a hoax, a test file or a false alarm.',
          twilight: 'A nuisance: adware, unwanted bundled software, risky but little harm.',
          midnight: 'Steals: credentials, money, personal data or surveillance.',
          abyss: 'Takes control: persistent access, remote control, a foothold for more attacks.',
          trench: 'Destroys: encryption for ransom, wiping, physical damage, mass disruption.',
          unknown: 'The evidence does not establish which.',
        },
      },
      seeks_build_instructions: {
        type: 'noul',
        instructions: 'Does `query` ask how to build, obtain, deploy or carry out an attack (code, payloads, step-by-step instructions, targets), rather than what a known attack is and how it behaved?',
        criteria: {
          true: 'The query asks for attack code, a working exploit, how to carry out an attack, or where to get malware.',
          false: 'The query names or describes a known threat to learn what it did.',
        },
      },
    },
  };
}

const isRefusal = answer => !answer || answer.type === 'refusal';
const noul = answer => (answer?.type === 'noul' && Number.isFinite(answer.noul) ? answer.noul : null);
function choice(answer, allowed) {
  if (isRefusal(answer) || answer.type !== 'choice') return 'unknown';
  return allowed.includes(answer.choice) ? answer.choice : 'unknown';
}

function citationsOf(response) {
  const list = Array.isArray(response?.citations) ? response.citations : [];
  return list.filter(item => typeof item?.url === 'string' && /^https?:\/\//i.test(item.url)).slice(0, MAX_CITATIONS).map(item => ({
    url: item.url.slice(0, 500),
    title: typeof item.title === 'string' ? item.title.slice(0, 200) : '',
    excerpts: (Array.isArray(item.excerpts) ? item.excerpts : []).filter(text => typeof text === 'string').slice(0, MAX_EXCERPTS).map(text => text.slice(0, MAX_EXCERPT_CHARS)),
  }));
}

// { outcome: 'accepted' | 'no-match' | 'refused' | 'declined', specific, kind, family, depth, citations, decisionId, scores }.
// A refusal on the gate questions is its own outcome; on kind, family or depth it reads as unknown. Never as yes, no or a first choice.
export function readDecision(response) {
  const answers = response?.answers ?? {};
  const citations = citationsOf(response);
  const decisionId = typeof response?.decision_id === 'string' ? response.decision_id.slice(0, 80) : null;
  const base = { specific: 'none', kind: 'unknown', family: 'unknown', depth: 'unknown', citations, decisionId };
  const real = noul(answers.is_real_threat);
  const build = noul(answers.seeks_build_instructions);
  const scores = { isRealThreat: real, seeksBuildInstructions: build };
  if (isRefusal(answers.is_real_threat) || isRefusal(answers.seeks_build_instructions) || isRefusal(answers.specific_match)
    || real === null || build === null || answers.specific_match.type !== 'choice') {
    return { ...base, outcome: 'refused', scores };
  }
  if (build >= BUILD_THRESHOLD) return { ...base, outcome: 'declined', scores };
  const specific = ['one', 'several'].includes(answers.specific_match.choice) ? answers.specific_match.choice : 'none';
  if (real < REAL_THRESHOLD || specific === 'none' || !citations.length) return { ...base, outcome: 'no-match', scores };
  return {
    ...base, outcome: 'accepted', specific, scores,
    kind: choice(answers.kind, KINDS), family: choice(answers.family, FAMILIES), depth: choice(answers.depth, DEPTHS),
  };
}
