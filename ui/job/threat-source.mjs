// Drives the ocean show (ocean-show.mjs) from a threat search instead of a sandbox job: the clam seals the threat's name in,
// opens to its fish, the research and the scene writing stand in for the checks and the analysis, and the dive and the creature
// follow the depth and family the web check found. It polls GET /api/threats/status and turns each stage into the events the
// show already reads. No file exists: nothing is uploaded, downloaded or run.
import { DEPTH_INFO } from './state.mjs';

const POLL_MS = 1500;
const DEPTHS = ['sunlight', 'twilight', 'midnight', 'abyss', 'trench'];
// The fish a threat is born as, by the family of its harm (species with swim art, ui/job/creatures.mjs).
const SPECIES = {
  deception: 'flounder', intrusion: 'snake-eel', 'network-abuse': 'mackerel', 'trusted-source': 'remora',
  'theft-surveillance': 'barracuda', 'extortion-destruction': 'lionfish',
};
const FAMILY_WORDS = {
  deception: 'deception', intrusion: 'intrusion', 'network-abuse': 'coordinated abuse', 'trusted-source': 'trusted-source compromise',
  'theft-surveillance': 'theft and surveillance', 'extortion-destruction': 'extortion and destruction', unknown: 'an unclassified attack',
};
const KIND_WORDS = { malware: 'a malware family', exploit: 'an exploit', hack: 'a hack', unknown: 'a documented threat' };

const pause = (ms, signal) => new Promise(resolve => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});

export function threatSource({ threatId, fetchImpl = fetch, pollMs = POLL_MS }) {
  let id = 0;
  return {
    jobId: threatId,
    async stream(onEvent, signal) {
      const emit = (event, data) => onEvent({ id: ++id, event, data });
      const seen = new Set();
      let typed = null; // the show keeps this object as state.typed: its .threat follows the latest status
      let analysing = false;
      while (!signal?.aborted) {
        const response = await fetchImpl(`/api/threats/status?id=${encodeURIComponent(threatId)}`, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const status = await response.json();
        if (typed) typed.threat = status;
        else {
          typed = { species: SPECIES[status.family] ?? 'sole', detectedType: 'threat', claimedExtension: '', replayId: status.run, threat: status };
          emit('stage', { stage: 'received' });
          emit('typed', typed);
          emit('stage', { stage: 'typed' });
          emit('stage', { stage: 'detonating' });
        }
        // Each source the research finds comes out of the clam as a bubble.
        for (const source of status.sources ?? []) {
          if (seen.has(source.url)) continue;
          seen.add(source.url);
          emit('evidence', { id: `s${seen.size}`, source: 'research', kind: 'source', detail: `Reported by ${source.publisher || 'a source'}${source.reportedAt ? ` (${source.reportedAt})` : ''}` });
        }
        if (!analysing && ['writing', 'ready'].includes(status.stage)) {
          analysing = true;
          emit('stage', { stage: 'analysing', attempt: 1 });
        }
        if (status.stage === 'ready') {
          const depth = DEPTHS.includes(status.depth) ? status.depth : null;
          const finding = { id: status.findingId, family: status.family, creature: status.creature?.name, evidenceIds: [], ...(depth ? { depth } : {}) };
          emit('finding', finding);
          emit('verdict', { depth: depth ?? undefined, family: status.family, findings: [finding], signals: [] });
          emit('stage', { stage: 'done' });
          emit('threat', status);
          return;
        }
        if (['failed', 'cancelled'].includes(status.stage)) {
          emit('error', { message: status.message || 'The simulation could not be built.' });
          emit('stage', { stage: 'failed' });
          return;
        }
        await pause(pollMs, signal);
      }
    },
    async fetchJob() { return { status: 'running' }; },
    async fetchArtifact() { throw new Error('A threat has no artifacts.'); },
  };
}

// The show's words for a threat (openOceanShow({ story })).
export function threatStory(threat) {
  const name = threat.name;
  const depthName = depth => DEPTH_INFO[depth]?.name ?? 'the deep';
  return {
    anchor: 'threat-search',
    play: 'Play it on Windows ▶',
    catch: { title: `The octopus takes ${name}`, text: 'Nothing is downloaded or run: the octopus carries only the name, down to the giant clam.' },
    sealed: { title: 'Sealed in the clam', text: `Inside, ${name} is checked against public reporting.` },
    reveal: () => ({
      title: `${name} is ${KIND_WORDS[threat.kind] ?? KIND_WORDS.unknown}`,
      text: [
        threat.summary || `${name}${threat.date ? ` (${threat.date})` : ''}.`,
        `Its harm: ${FAMILY_WORDS[threat.family] ?? FAMILY_WORDS.unknown}. Every threat is born an innocent fish; what it did decides where it ends up.`,
      ],
    }),
    run: () => ({ title: 'Researching how it worked', detail: 'Parallel Search reads public reporting: how it got in, what ran and what the victim saw, what it took or destroyed, and how it was stopped. Government advisories and security vendors come first.' }),
    count: n => `${n} ${n === 1 ? 'source' : 'sources'} so far.`,
    analyse: state => ({
      title: 'Writing the scene',
      text: ['DeepSeek on Vultr Serverless Inference writes a Windows desktop scene from the research. Every step must cite a source, or it is cut; the scene is checked and repaired up to three times.'],
      lines: [
        [`read ${state.evidence.length} ${state.evidence.length === 1 ? 'source' : 'sources'}`],
        ...(state.typed?.threat?.missing ?? []).map(stage => [`not in the reporting: ${stage}`, 'twilight']),
        ['every step cites a source ✓'],
      ],
    }),
    dive: () => (DEPTHS.includes(threat.depth) ? `Public reporting puts its harm in the ${depthName(threat.depth)}.` : 'Its depth is how much harm it did.'),
    verdict: state => ({
      title: `${name}: ${depthName(state.depth)}`,
      badge: `${depthName(state.depth)} · ${DEPTH_INFO[state.depth]?.meaning ?? ''}`,
      text: ['The simulation is ready. Illustration based on public reporting, not observed malware.'],
    }),
    done: state => {
      const missing = state.typed?.threat?.missing ?? [];
      const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} or ${missing.at(-1)}` : missing[0];
      return {
        title: 'Your simulation is ready',
        text: [
          `${name} plays on a simulated Windows desktop. Everything in it is fictional: the people, the company and the websites.`,
          ...(missing.length ? [`Public reporting doesn't cover ${list}, so the scene leaves ${missing.length > 1 ? 'them' : 'it'} out.`] : []),
        ],
      };
    },
    // Shown in place of the Play button where this site does not serve the training desktops.
    noDesktop: "The training desktops aren't served on this site, so the scene can't be played here.",
    waiting: state => (state.rank >= 4 ? 'Writing the scene… this takes a minute or two.' : state.rank >= 2 ? 'Researching… this takes a minute or two.' : 'Waiting…'),
    failed: state => state.error || 'The simulation could not be built.',
  };
}
