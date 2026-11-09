// Indicators of compromise from a job's evidence: the hosts it contacted and the files and programs it touched. Used for
// the report's "What to do now" lists and its JSON download. Pure; the evidence fields are the ones trace.mjs writes
// (`host`/`port`, `path`, `argv`, rename `to`) and collect.py's diff kinds (added, changed, deleted, renamed).
const unique = values => [...new Set(values.filter(Boolean))];

export function indicators(evidence) {
  const items = Array.isArray(evidence) ? evidence : [];
  const paths = test => unique(items.filter(test).map(item => (typeof item.path === 'string' ? item.path : null)));
  return {
    hosts: unique(items.filter(item => typeof item.host === 'string' && item.host !== 'unknown')
      .map(item => (Number(item.port) > 0 ? `${item.host}:${item.port}` : item.host))),
    filesWritten: unique([
      ...paths(item => item.kind === 'file-write' || (item.source === 'diff' && (item.kind === 'added' || item.kind === 'changed'))),
      ...items.filter(item => (item.kind === 'rename' || item.kind === 'renamed') && typeof item.to === 'string').map(item => item.to),
    ]),
    filesDeleted: paths(item => item.kind === 'unlink' || item.kind === 'rmdir' || (item.source === 'diff' && item.kind === 'deleted')),
    filesRead: paths(item => item.kind === 'file-read'),
    programsRun: unique(items.filter(item => item.kind === 'execve')
      .map(item => (Array.isArray(item.argv) && item.argv.length ? item.argv.join(' ') : item.path))),
  };
}

export const hasIndicators = found => Object.values(found).some(list => list.length > 0);
