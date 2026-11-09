// Parallel Web Systems client: Decisions (typed questions answered from the live web) and Search. Server-side only.
// The key comes from PARALLEL_API_KEY and is sent in the x-api-key header; it never appears in an error, a log line or a
// return value. Every call counts against DAILY_PARALLEL_CALL_CAP, kept in a ledger file like the inference client's.
import { appendFileSync, readFileSync } from 'node:fs';

export const PARALLEL_BASE = 'https://api.parallel.ai';
const TIMEOUT_MS = { decisions: 60_000, search: 90_000 };
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_DAILY_CAP = 100;

export class ParallelError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function readBounded(body) {
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new ParallelError('response-too-large');
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    throw error instanceof ParallelError ? error : new ParallelError('request-failed');
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return Buffer.concat(chunks, size);
}

// { available(), decide(body), search(body), calls }. decide and search resolve to the parsed JSON response or throw
// ParallelError: disabled | cap-reached | request-too-large | request-failed | http-error | response-too-large | invalid-response.
export function createParallelClient({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date(), capFile } = {}) {
  const key = env.PARALLEL_API_KEY;
  const enabled = typeof key === 'string' && key.trim().length > 0;
  const cap = Number.parseInt(env.DAILY_PARALLEL_CALL_CAP ?? '', 10);
  const dailyCap = Number.isInteger(cap) && cap >= 0 ? cap : DEFAULT_DAILY_CAP;
  let day = '';
  let used = 0;
  let ledgerOk = true;

  function today() {
    const current = now().toISOString().slice(0, 10);
    if (current !== day) {
      day = current;
      used = 0;
      if (capFile) {
        try {
          const log = readFileSync(capFile, 'utf8');
          if (log.length > 2 * 1024 * 1024 || (log && !log.endsWith('\n'))) throw new Error('bad ledger');
          const entries = log ? log.trimEnd().split('\n') : [];
          if (entries.some(entry => !/^\d{4}-\d{2}-\d{2}$/.test(entry))) throw new Error('bad ledger');
          used = entries.filter(entry => entry === current).length;
        } catch (error) {
          if (error.code !== 'ENOENT') ledgerOk = false;
        }
      }
    }
    return current;
  }

  const available = () => { today(); return enabled && ledgerOk && typeof fetchImpl === 'function' && used < dailyCap; };
  // Why calls are refused (null while they are allowed): disabled, cap-reached or request-failed (a damaged ledger).
  const reason = () => (available() ? null : !enabled || typeof fetchImpl !== 'function' ? 'disabled' : !ledgerOk ? 'request-failed' : 'cap-reached');

  async function call(path, kind, payload) {
    if (!available()) throw new ParallelError(reason());
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) throw new ParallelError('request-too-large');
    if (capFile) {
      try { appendFileSync(capFile, `${day}\n`, { mode: 0o600 }); }
      catch { ledgerOk = false; throw new ParallelError('request-failed'); }
    }
    used += 1;
    let response;
    try {
      response = await fetchImpl(`${PARALLEL_BASE}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key.trim() },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS[kind]),
      });
    } catch {
      throw new ParallelError('request-failed');
    }
    if (!response || response.status !== 200) throw new ParallelError('http-error');
    if (!response.body || typeof response.body.getReader !== 'function') throw new ParallelError('invalid-response');
    const bytes = await readBounded(response.body);
    try {
      const parsed = JSON.parse(bytes.toString('utf8'));
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      return parsed;
    } catch {
      throw new ParallelError('invalid-response');
    }
  }

  return {
    available,
    reason,
    decide: body => call('/v1/decisions', 'decisions', body),
    search: body => call('/v1/search', 'search', body),
    get calls() { today(); return used; },
  };
}
