// Job view state machine: no DOM, no network. Folds the event stream of docs/detonation/EVENTS.md into one object
// that the views read. Event fields are untrusted; coverage is shape-checked and receipt claims are evidence-scoped.
import { FINDING_ORDER } from './creatures.mjs';

export const DEPTHS = ['sunlight', 'twilight', 'midnight', 'abyss', 'trench'];

export const DEPTH_INFO = {
  sunlight: { name: 'Sunlight', range: '0–200 m', meaning: 'Clean', metres: 100 },
  twilight: { name: 'Twilight', range: '200–1,000 m', meaning: 'Risky', metres: 600 },
  midnight: { name: 'Midnight', range: '1,000–4,000 m', meaning: 'Steals', metres: 2500 },
  abyss: { name: 'Abyss', range: '4,000–6,000 m', meaning: 'Takes control', metres: 5000 },
  trench: { name: 'Trench', range: '6,000–11,000 m', meaning: 'Destroys', metres: 8500 },
};

export const depthRank = depth => DEPTHS.indexOf(depth);
export const isDeepDepth = depth => depthRank(depth) >= 2;

export function verdictHeading(state) {
  const depth = state.verdict?.depth ?? state.depth;
  if (!DEPTHS.includes(depth)) return 'Result inconclusive';
  if (isDeepDepth(depth)) return 'Harmful behaviour observed';
  if (state.failed || state.verdict?.complete === false || (state.receipt && !receiptView(state.receipt).ok)) return 'Result inconclusive';
  return depth === 'twilight' ? 'Suspicious or inconclusive' : 'No harmful behaviour observed';
}

// One presentation contract for the ocean, full report and downloaded report. Depth remains evidence, not clearance.
export function resultSummary(state) {
  const depth = state.verdict?.depth ?? state.depth;
  const info = DEPTH_INFO[depth];
  const integrity = Boolean(state.receipt && !receiptView(state.receipt).ok);
  const complete = Boolean(info && !state.failed && state.verdict?.complete !== false && receiptView(state.receipt).ok);
  const status = integrity ? 'integrity' : !info || state.failed || state.verdict?.complete === false ? 'incomplete' : !complete ? 'pending' : isDeepDepth(depth) ? 'harmful' : depth === 'twilight' ? 'suspicious' : 'observed';
  const badge = isDeepDepth(depth) ? `${info.name} · ${info.meaning}`
    : integrity ? 'Integrity check not confirmed'
      : status === 'incomplete' ? 'Inconclusive · checks incomplete'
        : status === 'pending' ? 'Verification pending'
          : depth === 'sunlight' ? 'Sunlight · No harmful behaviour observed' : `${info.name} · Suspicious or inconclusive`;
  const warning = integrity ? 'Sandbox integrity or cleanup could not be verified. Do not rely on this run as clearance; review the receipt.'
    : status === 'incomplete' ? 'Some checks did not finish. Treat the file as unknown rather than safe.'
      : status === 'pending' ? 'Waiting for cleanup and the host canary check. This is not a final clearance.' : '';
  return { status, heading: verdictHeading(state), badge, warning, complete };
}

export function executionText(typed) {
  switch (typed?.label) {
    case 'Inspected': return { title: 'Sealed in for inspection', detail: 'The file is inspected, not executed. Static checks can miss behaviour that only appears when a file runs.' };
    case 'Emulated': return { title: 'Sealed in for emulation', detail: 'The file is emulated in a network-less sandbox. This is not a real Windows or macOS machine; some behaviour may not be reproduced.' };
    case 'Executed on Linux': case 'Ran under Wine': return { title: 'Sealed in for execution', detail: 'The file runs in a network-less sandbox with a seeded home folder and time and resource limits. A separate canary check watches one host file, not the whole host.' };
    default: return { title: 'Preparing the sandbox checks', detail: 'Waiting for the recorded coverage. The report will distinguish execution, emulation and inspection.' };
  }
}

const STAGE_RANK = { received: 0, typed: 1, queued: 1, detonating: 2, collecting: 3, analysing: 4, explaining: 5, verdict: 5, tearing_down: 6, done: 7 };

// A row is active while the job's rank is in [from, to) and done once it reaches `to`.
const STAGE_ROWS = [
  { key: 'detected', label: 'Detected', from: 0, to: 2 },
  { key: 'detonating', label: 'Detonating', from: 2, to: 3 },
  { key: 'collecting', label: 'Checking changes', from: 3, to: 4 },
  { key: 'analysing', label: 'Analysing', from: 4, to: 5 },
  { key: 'explaining', label: 'Explaining', from: 5, to: 6 },
  { key: 'teardown', label: 'Destroying the sandbox', from: 6, to: 7 },
];

export const MAX_ATTEMPTS = 3;
const MAX_EVIDENCE = 2000;
const COVERAGE_STEPS = new Set(['identify', 'unwrap', 'run', 'wine', 'emulate', 'static', 'generic', 'parser']);
const COVERAGE_STATUSES = new Set(['done', 'stopped', 'skipped', 'failed']);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isItemIndex = value => Number.isSafeInteger(value) && value >= 0;

export function createJobState() {
  return {
    lastEventId: 0, stage: null, rank: -1, attempt: 0, failed: false, failedRow: null, finished: false,
    typed: null, depth: null, evidence: [], signals: [], findings: [], attempts: [], parserAttempts: [],
    coverage: [], coverageItems: [], verdict: null, explanation: null, receipt: null, report: null, error: null,
  };
}

const rowAtRank = rank => STAGE_ROWS.find(row => rank >= row.from && rank < row.to)?.key ?? null;

function raiseDepth(state, depth) {
  if (depthRank(depth) > depthRank(state.depth)) state.depth = depth;
}

// Applies one event. Returns false for a replayed event (id at or below the last one applied), true otherwise.
export function applyEvent(state, { id, event, data }) {
  if (Number.isInteger(id)) {
    if (id <= state.lastEventId) return false;
    state.lastEventId = id;
  }
  const body = data !== null && typeof data === 'object' ? data : {};
  switch (event) {
    case 'stage': {
      if (!(body.stage in STAGE_RANK) && body.stage !== 'failed') break;
      if (body.stage === 'failed') {
        state.failed = true;
        state.failedRow = rowAtRank(state.rank);
        break;
      }
      state.stage = body.stage;
      state.rank = Math.max(state.rank, STAGE_RANK[body.stage]);
      if (body.stage === 'analysing' && Number.isInteger(body.attempt)) state.attempt = Math.max(state.attempt, body.attempt);
      if (body.stage === 'done') state.finished = true;
      break;
    }
    case 'typed': state.typed = body; break;
    case 'evidence':
      if (state.evidence.length < MAX_EVIDENCE) state.evidence.push(body);
      break;
    case 'signal':
      state.signals.push(body);
      raiseDepth(state, 'twilight');
      break;
    case 'finding':
      state.findings.push(body);
      raiseDepth(state, body.depth);
      break;
    case 'analysis-attempt': upsertAttempt(state.attempts, body); state.attempt = Math.max(state.attempt, body.n | 0); break;
    case 'parser-attempt': upsertAttempt(state.parserAttempts, body); break;
    case 'coverage':
      upsertCoverage(state.coverageItems, body);
      state.coverage = state.coverageItems.flatMap(item => item.steps);
      break;
    case 'verdict':
      state.verdict = body;
      if (DEPTHS.includes(body.depth)) state.depth = body.depth;
      break;
    case 'explanation': state.explanation = body; break;
    case 'receipt': state.receipt = body; break;
    case 'report':
      state.report = body;
      if (Object.hasOwn(body, 'coverage')) {
        state.coverageItems = normaliseCoverage(body.coverage);
        state.coverage = state.coverageItems.flatMap(item => item.steps);
      }
      state.finished = true;
      break;
    case 'error':
      state.error = typeof body.message === 'string' ? body.message : 'The job failed.';
      state.failed = true;
      state.failedRow ??= rowAtRank(state.rank);
      break;
    default: break; // unknown events are ignored so the stream can grow
  }
  return true;
}

// First arrival fixes item order; later updates replace that item. Itemless legacy names/statuses stay display-only text.
function upsertCoverage(list, body) {
  if (!isRecord(body) || (body.item != null && !isItemIndex(body.item))) return;
  const item = body.item ?? null;
  const steps = (Array.isArray(body.steps) ? body.steps : []).filter(step => isRecord(step)
    && typeof step.step === 'string' && step.step.trim() && typeof step.status === 'string' && step.status.trim()
    && (item === null || COVERAGE_STEPS.has(step.step) && COVERAGE_STATUSES.has(step.status))).map(step => ({
    step: step.step, status: step.status, ...(typeof step.detail === 'string' ? { detail: step.detail } : {}),
  }));
  const entry = { item, parent: isItemIndex(body.parent) ? body.parent : null, steps };
  const at = list.findIndex(entry => entry.item === item);
  if (at >= 0) list[at] = entry;
  else list.push(entry);
}

// Terminal reports carry the same per-item records as coverage events, not a list of inferred checks.
export function normaliseCoverage(value) {
  const items = [];
  if (Array.isArray(value)) for (const body of value) upsertCoverage(items, body);
  return items;
}

function upsertAttempt(list, attempt) {
  const at = list.findIndex(item => item.n === attempt.n);
  if (at >= 0) list[at] = attempt;
  else list.push(attempt);
}

export function stageRows(state) {
  return STAGE_ROWS.map(row => {
    let status = state.rank >= row.to ? 'done' : state.rank >= row.from ? 'active' : 'todo';
    if (state.failed && state.failedRow === row.key) status = 'failed';
    if (row.key === 'teardown' && state.finished && state.receipt?.teardownConfirmed !== true) status = 'failed';
    let label = row.label;
    if (row.key === 'detonating' && state.typed?.label === 'Inspected') label = 'Inspecting';
    if (row.key === 'detonating' && state.typed?.label === 'Emulated') label = 'Emulating';
    if (row.key === 'analysing' && status !== 'todo' && state.attempts.length) label = `Analysing (${Math.min(Math.max(state.attempt, 1), MAX_ATTEMPTS)}/${MAX_ATTEMPTS})`;
    if (['analysing', 'explaining'].includes(row.key) && !state.attempts.length && (state.finished || state.explanation?.modelAvailable === false)) {
      status = 'skipped';
      label = row.key === 'analysing' ? 'Model analysis' : 'Model explanation';
    }
    return { key: row.key, label, status };
  });
}

// Metres the fish is shown at. Before any signal the fish is at the surface; a finished clean run settles in Sunlight.
export const depthMetres = state => (state.depth ? DEPTH_INFO[state.depth].metres : 0);

// Deepest tier wins; within a tier the first row of the design table wins; ties after that go to the earliest arrival.
export function deepestFinding(findings) {
  let best = null;
  for (const finding of findings) {
    if (depthRank(finding.depth) < 2) continue;
    const rank = depthRank(finding.depth);
    const order = FINDING_ORDER.indexOf(finding.id);
    if (!best || rank > best.rank || (rank === best.rank && (order < 0 ? 99 : order) < best.order)) {
      best = { finding, rank, order: order < 0 ? 99 : order };
    }
  }
  return best?.finding ?? null;
}

const yesNo = value => (value === true ? 'yes' : value === false ? 'no' : 'unknown');
const shortText = (value, max = 40) => (typeof value === 'string' && value ? value : 'unknown').slice(0, max);

// Confirmed teardown and an unchanged canary are not proof that the whole host was untouched.
export function receiptView(receipt) {
  if (!isRecord(receipt)) {
    return { ok: false, headline: 'Sandbox teardown pending', lines: [] };
  }
  const destroyed = receipt.teardownConfirmed === true;
  const canary = ['unchanged', 'changed'].includes(receipt.hostCanary) ? receipt.hostCanary : 'unknown';
  const headline = `${destroyed ? 'Sandbox destroyed' : 'Sandbox teardown not confirmed'} · Host canary ${canary}`;
  const containers = Array.isArray(receipt.containers) ? receipt.containers : [];
  const lines = [
    `Teardown confirmed: ${yesNo(receipt.teardownConfirmed)}`,
    `Host canary: ${canary}`,
    'The host canary result applies only to the canary file; it is not proof that the whole host was untouched.',
    `Containers removed: ${containers.filter(item => isRecord(item) && typeof item.removedAt === 'string' && item.removedAt).length} of ${containers.length}`,
    `Volumes removed: ${yesNo(receipt.volumesRemoved)}`,
    `Upload deleted: ${yesNo(receipt.uploadDeleted)}`,
  ];
  containers.forEach((item, index) => {
    if (!isRecord(item) || item.role !== 'wine') return;
    const armor = item.appArmor === 'docker-default' ? 'docker-default (recorded profile)'
      : item.appArmor === 'unavailable' ? 'unavailable (no AppArmor protection)' : 'unknown (protection not confirmed)';
    lines.push(`Wine container (receipt entry ${index + 1}): runtime ${shortText(item.runtime)}; AppArmor: ${armor}`);
  });
  if (Array.isArray(receipt.notes)) for (const note of receipt.notes) if (typeof note === 'string' && note) lines.push(`Note: ${note}`);
  if (Array.isArray(receipt.limitsHit) && receipt.limitsHit.length) lines.push(`Limits hit: ${receipt.limitsHit.map(item => shortText(item)).join(', ')}`);
  if (isRecord(receipt.inference)) lines.push(`Model calls: ${Number.isInteger(receipt.inference.calls) ? receipt.inference.calls : 'unknown'}`);
  return { ok: destroyed && canary === 'unchanged' && receipt.uploadDeleted !== false, headline, lines };
}

// "Will run under Wine" before the run, the recorded label after it.
export function pathText(typed, rank) {
  if (!typed) return '';
  const past = typed.label ?? '';
  if (rank >= STAGE_RANK.collecting) return past;
  const future = { 'Executed on Linux': 'Will run on Linux', 'Ran under Wine': 'Will run under Wine', Emulated: 'Will be emulated', Inspected: 'Will be inspected' };
  return future[past] ?? past;
}

export function reportFromJobResponse(body) {
  if (body && typeof body === 'object') {
    if (body.verdict && body.jobId) return body;
    if (body.report && typeof body.report === 'object') return body.report;
  }
  return null;
}
