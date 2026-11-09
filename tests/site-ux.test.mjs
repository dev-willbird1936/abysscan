import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCanary, receiptAllowsDone } from '../backend/detonation/receipts.mjs';
import { createJobState, resultSummary, receiptView } from '../ui/job/state.mjs';
import { exportReport } from '../ui/job/report.mjs';

const stateFor = (depth, receipt, extra = {}) => ({ ...createJobState(), finished: true, depth, verdict: { depth, complete: true, findings: [], statement: 'Observed checks only.' }, receipt, ...extra });
const cleanReceipt = { teardownConfirmed: true, hostCanary: 'unchanged', uploadDeleted: true };

test('unreadable canary evidence is unknown, not a confirmed change or an unchanged file', () => {
  assert.equal(compareCanary(null, null), 'unknown');
  assert.equal(compareCanary('before', null), 'unknown');
  assert.equal(compareCanary(null, 'after'), 'unknown');
  assert.equal(compareCanary('same', 'same'), 'unchanged');
  assert.equal(compareCanary('before', 'after'), 'changed');
  assert.equal(receiptAllowsDone({ hostCanary: 'unknown' }), false);
});

test('integrity, incomplete coverage and stopped jobs never receive a Clean badge', () => {
  for (const state of [stateFor('sunlight', { ...cleanReceipt, hostCanary: 'unknown' }), stateFor('sunlight', { ...cleanReceipt, hostCanary: 'changed' }), stateFor('sunlight', { ...cleanReceipt, teardownConfirmed: false }), stateFor('sunlight', { ...cleanReceipt, uploadDeleted: false }), stateFor('sunlight', cleanReceipt, { failed: true }), stateFor('sunlight', cleanReceipt, { verdict: { depth: 'sunlight', complete: false } })]) {
    const summary = resultSummary(state);
    assert.doesNotMatch(summary.badge, /clean|safe/i);
    assert.equal(summary.complete, false);
    assert.match(summary.heading, /inconclusive/i);
  }
  assert.equal(resultSummary(stateFor('sunlight', cleanReceipt)).complete, true);
});

test('harmful findings remain primary even when integrity cannot be confirmed', () => {
  const summary = resultSummary(stateFor('trench', { ...cleanReceipt, hostCanary: 'unknown' }));
  assert.match(summary.heading, /Harmful behaviour/);
  assert.match(summary.warning, /integrity|cleanup/i);
  assert.equal(summary.complete, false);
});

test('report export matches the visible integrity/incomplete status without exposing secrets', () => {
  const state = stateFor('sunlight', { ...cleanReceipt, hostCanary: 'unknown' });
  const output = exportReport({ report: {}, state, jobId: 'j-review' });
  assert.equal(output.verdict.complete, false);
  assert.equal(output.result.status, 'integrity');
  assert.match(output.result.warning, /integrity|cleanup/i);
  assert.match(output.actions.join(' '), /unknown|rely/i);
  assert.match(receiptView(state.receipt).headline, /unknown|not verified/i);
});
