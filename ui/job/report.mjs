// Report card (SPEC §9.5 step 8). Built from the final report object; every string is set with textContent.
// Artifacts (chart, diff, decoded text) are fetched with the bearer token as blobs and shown as pixels or text only:
// images become data: URLs (allowed by the site's img-src), tables and text become text nodes.
import { append, el, safeId } from './dom.mjs';
import { DEPTH_INFO, depthRank, normaliseCoverage, receiptView, resultSummary } from './state.mjs';
import { ACTIONS, familyName, findingFacts, signalLabel } from './creatures.mjs';
import { hasIndicators, indicators } from './indicators.mjs';

const MAX_TEXT = 20000;
const MAX_ROWS = 200;
const ARTIFACT_NAME = /^[A-Za-z0-9._-]{1,80}$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const ch = text[at];
    if (quoted) {
      if (ch === '"' && text[at + 1] === '"') { cell += '"'; at += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[at + 1] === '\n') at += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
      if (rows.length > MAX_ROWS) return rows;
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(item => item.some(value => value !== ''));
}

// Analysis code often decodes payloads with errors='replace'; show undecodable runs and control bytes legibly, not as boxes.
export const printableText = text => text.replace(/\uFFFD+/g, '[binary]')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ch => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`);

// Models answer in Markdown even when asked not to: **x** becomes bold, other markers (stray asterisks, backticks,
// heading hashes) go. The text stays text nodes; nothing is parsed as HTML.
export function richText(doc, node, text) {
  const plain = String(text).replace(/^#{1,6}\s+/gm, '').replace(/`+/g, '');
  plain.split(/\*\*(.+?)\*\*/g).forEach((part, at) => {
    const clean = part.replace(/\*+/g, '');
    if (clean) node.append(at % 2 ? el(doc, 'b', '', clean) : clean);
  });
  return node;
}

const readDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

async function artifactNode(doc, source, name) {
  const figure = el(doc, 'figure', 'jv-artifact');
  figure.dataset.name = name;
  figure.append(el(doc, 'figcaption', '', name));
  try {
    const { blob } = await source.fetchArtifact(name);
    if (/\.png$/i.test(name)) {
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (!PNG_SIGNATURE.every((byte, at) => head[at] === byte)) throw new Error('not a PNG');
      const img = el(doc, 'img', 'jv-chart');
      img.alt = `Chart produced by the analysis code: ${name}`;
      img.src = await readDataUrl(new Blob([blob], { type: 'image/png' }));
      figure.append(img);
    } else if (/\.svg$/i.test(name)) {
      const img = el(doc, 'img', 'jv-chart');
      img.alt = `Chart produced by the analysis code: ${name}`;
      img.src = await readDataUrl(new Blob([blob], { type: 'image/svg+xml' }));
      figure.append(img);
    } else if (/\.csv$/i.test(name)) {
      const table = el(doc, 'table', 'jv-diff');
      parseCsv((await blob.text()).slice(0, MAX_TEXT * 4)).forEach((cells, at) => {
        const tr = el(doc, 'tr');
        for (const value of cells) tr.append(el(doc, at === 0 ? 'th' : 'td', '', value));
        table.append(tr);
      });
      figure.append(table);
    } else {
      figure.append(el(doc, 'pre', 'jv-code', printableText((await blob.text()).slice(0, MAX_TEXT))));
    }
  } catch {
    figure.append(el(doc, 'p', 'jv-muted', 'This output is not available.'));
  }
  return figure;
}

function section(doc, title, ...children) {
  const box = el(doc, 'section', 'jv-report-part');
  box.append(el(doc, 'h3', '', title));
  return append(box, ...children);
}

function list(doc, items, className, tag = 'ul') {
  const node = el(doc, tag, className);
  for (const item of items) node.append(item);
  return node;
}

const IOC_SHOWN = 8;
const IOC_LISTS = [
  ['hosts', 'Hosts it contacted: block these'],
  ['filesWritten', 'Files it wrote or changed'],
  ['filesDeleted', 'Files it deleted'],
  ['filesRead', 'Files it read'],
  ['programsRun', 'Programs it ran'],
];

// Steps first (one per finding kind, in the design's order), then the indicators they refer to, then the JSON download.
function actionsSection(doc, { findings, depth, complete, found, download }) {
  const ids = [...new Set(findings.map(finding => String(finding?.id ?? '')))].filter(id => ACTIONS[id]);
  const steps = ids.map(id => el(doc, 'li', '', ACTIONS[id]));
  if (!steps.length) {
    steps.push(el(doc, 'li', '', depth === 'sunlight'
      ? 'No harmful behaviour was observed in the checks completed. This does not establish that the file is safe.'
      : 'No harmful behaviour was proven, but this file remains suspicious. Do not treat this result as proof of safety.'));
  }
  if (complete === false) steps.push(el(doc, 'li', '', 'Some checks did not finish, so treat the file as unknown rather than safe.'));
  const box = section(doc, 'What to do now', list(doc, steps, 'jv-actions', 'ol'));
  box.id = 'jv-actions';
  for (const [key, title] of IOC_LISTS) {
    const values = found[key];
    if (!values.length) continue;
    const rows = values.slice(0, IOC_SHOWN).map(value => el(doc, 'li', 'jv-ioc-item', value));
    if (values.length > IOC_SHOWN) rows.push(el(doc, 'li', 'jv-muted', `and ${values.length - IOC_SHOWN} more in the download`));
    append(box, el(doc, 'h4', '', title), list(doc, rows, 'jv-ioc'));
  }
  if (download) box.append(download);
  return box;
}

export function exportReport({ report, state, jobId }) {
  const verdict = report.verdict ?? state.verdict ?? {};
  const findings = verdict.findings?.length ? verdict.findings : state.findings;
  const result = resultSummary({ ...state, verdict, receipt: report.receipt ?? state.receipt });
  const complete = result.complete;
  const actions = [...new Set(findings.map(item => ACTIONS[item.id]).filter(Boolean))];
  if (!actions.length) actions.push(verdict.depth === 'sunlight'
    ? 'No harmful behaviour was observed in the completed checks. This is not proof that the file is safe.'
    : 'Treat this file as suspicious or unknown. No harmful behaviour was proven by the completed checks.');
  if (!complete) actions.push('Some checks did not finish. Treat the file as unknown rather than safe.');
  const receipt = receiptView(report.receipt ?? state.receipt);
  return {
    format: 'abysscan-report-1', jobId,
    result,
    verdict: { depth: verdict.depth ?? null, family: verdict.family ?? null, complete,
      statement: verdict.statement ?? 'No verdict was reported.',
      findings: findings.map(item => ({ id: item.id, label: findingFacts(item).label, evidenceIds: item.evidenceIds ?? [] })),
      signals: verdict.signals ?? state.signals.map(item => item.id) },
    explanation: report.explanation ?? state.explanation?.text ?? null,
    actions,
    coverage: normaliseCoverage(Object.hasOwn(report, 'coverage') ? report.coverage : state.coverageItems),
    receipt: { confirmed: receipt.ok, headline: receipt.headline, checks: receipt.lines },
    indicators: indicators(report.evidence?.length ? report.evidence : state.evidence),
    evidence: (report.evidence?.length ? report.evidence : state.evidence).map(item => ({ id: item.id, source: item.source, kind: item.kind, detail: item.detail })),
    limits: 'Observations from a network-less sandbox, not a safety guarantee. The canary checks one file, not the entire host. Uploaded bytes and the private report token are not included.',
  };
}

function downloadLink(doc, fileName, data, label = 'Download indicators (JSON)', id = 'jv-ioc-download') {
  const url = doc.defaultView?.URL;
  if (typeof url?.createObjectURL !== 'function') return null;
  const link = el(doc, 'a', 'jv-button jv-download', label);
  link.id = id;
  link.download = fileName;
  link.href = url.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  return link;
}

export async function renderReport(doc, root, { report, state, source, reduced }) {
  const verdict = report.verdict ?? state.verdict ?? {};
  const depth = depthRank(verdict.depth) >= 0 ? verdict.depth : null;
  const info = depth ? DEPTH_INFO[depth] : null;
  const evidence = Array.isArray(report.evidence) && report.evidence.length ? report.evidence : state.evidence;
  const attempts = report.analysis?.attempts ?? state.attempts;
  const lastOk = [...attempts].reverse().find(attempt => attempt.exitCode === 0);

  for (const link of root.querySelectorAll('a[download]')) doc.defaultView?.URL?.revokeObjectURL?.(link.href);
  root.replaceChildren();
  root.hidden = false;
  root.dataset.depth = depth ?? 'unknown';
  const result = resultSummary({ ...state, verdict, receipt: report.receipt ?? state.receipt });
  root.dataset.result = result.status;
  root.append(el(doc, 'h1', 'jv-result-heading', result.heading));
  if (result.warning) {
    const warning = el(doc, 'p', 'jv-integrity-alert', result.warning);
    warning.setAttribute('role', 'status');
    root.append(warning);
  }
  const badge = el(doc, 'p', 'jv-badge', `${result.badge}${info ? ` · ${info.range}` : ''}`);
  badge.id = 'jv-depth-badge';
  badge.dataset.depth = depth ?? 'unknown';
  root.append(badge);
  if (verdict.family) root.append(el(doc, 'p', 'jv-family', `Family: ${familyName(verdict.family, depth)}`));
  const statement = el(doc, 'p', 'jv-statement', String(verdict.statement ?? 'No verdict statement was reported.'));
  statement.id = 'jv-verdict';
  root.append(statement);
  if (verdict.complete === false) root.append(el(doc, 'p', 'jv-warn', 'Incomplete: some checks did not finish, so this result is inconclusive.'));

  // Read order: the verdict, the model's plain-words summary, what to do, then the proof (findings, receipt, evidence).
  const explanation = report.explanation ?? state.explanation?.text;
  const explained = richText(doc, el(doc, 'p', 'jv-explanation'), explanation ?? 'No explanation was produced.');
  explained.id = 'jv-explanation';
  const note = state.explanation?.modelAvailable === false
    ? el(doc, 'p', 'jv-warn', 'Model unavailable. This text is a template; the verdict above comes from the sandbox evidence alone.')
    : el(doc, 'p', 'jv-muted', 'The model wrote this text. The verdict above comes from the sandbox evidence and cannot be changed by it.');
  root.append(section(doc, 'Explanation', explained, note));

  const reported = verdict.findings?.length ? verdict.findings : state.findings;
  const found = indicators(evidence);
  const jobId = String(report.jobId ?? source?.jobId ?? 'job');
  const fullDownload = downloadLink(doc, `${safeId(jobId)}-report.json`, exportReport({ report, state, jobId }), 'Download full report (JSON)', 'jv-report-download');
  if (fullDownload) root.append(fullDownload);
  root.append(el(doc, 'p', 'jv-muted', 'Private link: anyone with the full URL can read this report. It expires about one hour after completion or when the controller restarts. Download a copy to keep it. The receipt below records upload deletion and sandbox cleanup.'));
  const download = hasIndicators(found) || reported.length ? downloadLink(doc, `${safeId(jobId)}-indicators.json`, {
    jobId, depth, family: verdict.family ?? null, complete: verdict.complete !== false,
    findings: reported.map(finding => ({ id: finding.id, label: findingFacts(finding).label, evidenceIds: finding.evidenceIds ?? [] })),
    signals: Array.isArray(verdict.signals) ? verdict.signals : state.signals.map(signal => signal.id),
    ...found,
    note: 'Observed in a network-less sandbox: connections were blocked, not completed. The service keeps no copy or hash of the file.',
  }) : null;
  root.append(actionsSection(doc, { findings: reported, depth, complete: result.complete, found, download }));

  const findings = reported.map(finding => {
    const facts = findingFacts(finding);
    const item = el(doc, 'li', 'jv-finding');
    item.dataset.finding = facts.id;
    append(item, el(doc, 'b', '', facts.creature), el(doc, 'span', '', ` · ${facts.label} · ${DEPTH_INFO[facts.depth]?.name ?? facts.depth}`));
    for (const evidenceId of Array.isArray(finding.evidenceIds) ? finding.evidenceIds : []) {
      const link = el(doc, 'a', 'jv-evlink', String(evidenceId));
      link.href = `#rep-${safeId(evidenceId)}`;
      item.append(' ', link);
    }
    return item;
  });
  root.append(section(doc, 'Findings', findings.length ? list(doc, findings, 'jv-findings') : el(doc, 'p', 'jv-muted', 'No findings.')));

  const signals = (Array.isArray(verdict.signals) && verdict.signals.length ? verdict.signals : state.signals.map(signal => signal.id)).map(id => el(doc, 'li', '', signalLabel(id)));
  if (signals.length) root.append(section(doc, 'Signals', list(doc, signals, 'jv-signals')));

  const receipt = receiptView(report.receipt ?? state.receipt);
  const receiptBox = section(doc, 'Receipt', el(doc, 'p', 'jv-receipt-headline', receipt.headline), list(doc, receipt.lines.map(line => el(doc, 'li', '', line)), 'jv-receipt-lines'));
  receiptBox.dataset.ok = String(receipt.ok);
  root.append(receiptBox);

  const coverageItems = normaliseCoverage(Object.hasOwn(report, 'coverage') ? report.coverage
    : state.coverageItems?.length ? state.coverageItems : Array.isArray(state.coverage) && state.coverage.length ? [{ steps: state.coverage }] : []);
  const coverageBox = section(doc, 'Coverage');
  for (const item of coverageItems) {
    if (item.item !== null) coverageBox.append(el(doc, 'h4', '', item.item === 0 ? 'Upload (item 0)'
      : `Item ${item.item} · Parent: ${item.parent ?? 'not reported'}`));
    const steps = item.steps.map(step => el(doc, 'li', 'jv-cover', `${step.status}: ${step.step}${step.detail ? ` — ${step.detail}` : ''}`));
    coverageBox.append(steps.length ? list(doc, steps, 'jv-coverage') : el(doc, 'p', 'jv-muted', 'No coverage steps were reported for this item.'));
  }
  if (!coverageItems.length) coverageBox.append(el(doc, 'p', 'jv-muted', 'No coverage steps were reported.'));
  root.append(coverageBox);

  const names = (lastOk?.artifacts ?? []).filter(name => ARTIFACT_NAME.test(name));
  const outputs = el(doc, 'div', 'jv-artifacts');
  root.append(section(doc, 'What the analysis code produced', names.length ? outputs : el(doc, 'p', 'jv-muted', 'The analysis code produced no output.')));

  if (lastOk) {
    const code = el(doc, 'pre', 'jv-code', String(lastOk.code ?? ''));
    code.tabIndex = 0;
    const details = el(doc, 'details', 'jv-details');
    append(details, el(doc, 'summary', '', `Analysis code (attempt ${lastOk.n})`), code);
    root.append(details);
  }

  const rows = evidence.map(item => {
    const row = el(doc, 'li', 'jv-log-row');
    row.id = `rep-${safeId(item.id)}`;
    append(row, el(doc, 'span', 'jv-log-src', String(item.id)), el(doc, 'span', 'jv-log-text', `[${item.source}] ${item.detail ?? item.kind ?? ''}`));
    return row;
  });
  root.append(section(doc, 'Evidence', rows.length ? list(doc, rows, 'jv-evidence-list') : el(doc, 'p', 'jv-muted', 'No evidence items.')));

  const back = el(doc, 'a', 'jv-button', 'Back to the ocean');
  back.href = '/';
  root.append(back);

  if (!reduced) root.scrollIntoView({ block: 'start' });
  for (const name of names) outputs.append(await artifactNode(doc, source, name));
}
