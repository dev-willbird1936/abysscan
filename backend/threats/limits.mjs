// Sliding one-hour windows per client address, the rule jobs.mjs uses for uploads.
const HOUR_MS = 60 * 60 * 1000;
const MAX_TRACKED = 10_000;

export function createLimiter({ perHour, now = () => Date.now() }) {
  const hits = new Map();
  return {
    // true and counted when this address may go on; false when it has used its hour.
    take(ip) {
      const at = now();
      const recent = (hits.get(ip) ?? []).filter(time => at - time < HOUR_MS);
      if (recent.length >= perHour) { hits.set(ip, recent); return false; }
      recent.push(at);
      hits.set(ip, recent);
      if (hits.size > MAX_TRACKED) for (const [key, list] of hits) if (!list.some(time => at - time < HOUR_MS)) hits.delete(key);
      return true;
    },
  };
}
