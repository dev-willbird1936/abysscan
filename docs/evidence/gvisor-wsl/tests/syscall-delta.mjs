// Compares the syscalls measured with `strace -f -c` against a seccomp profile and against Docker's default profile.
// usage: node syscall-delta.mjs <wine-profile.json> <docker-default.json> <strace-c-output>...
// Prints: used but not allowed by the wine profile (profile bugs), allowed by Docker default but not by the wine
// profile (the delta), and allowed by the wine profile but never used in the measured runs (tighten candidates).
// Conditional entries (args) count as allowed. Entries gated on capabilities (includes.caps) are ignored: the job
// containers run with --cap-drop ALL, so they never apply. strace -c shows only syscalls that returned, so exit_group
// and vDSO calls (clock_gettime, gettimeofday, time) show as "unused"; read the unused list as a candidate list only.
import { readFileSync } from "node:fs";

const [wineFile, dockerFile, ...traces] = process.argv.slice(2);
const names = (file) => {
  const p = JSON.parse(readFileSync(file, "utf8"));
  return new Set(p.syscalls.filter((e) => e.action === "SCMP_ACT_ALLOW" && !e.includes?.caps && !(e.excludes?.arches && e.excludes.arches.includes("amd64"))).flatMap((e) => e.names));
};
const wine = names(wineFile);
const docker = names(dockerFile);

const used = new Set();
for (const t of traces) {
  for (const line of readFileSync(t, "utf8").split("\n")) {
    const cols = line.trim().split(/\s+/);
    // strace -c rows: % time, seconds, usecs/call, calls, [errors], syscall
    if (cols.length >= 5 && /^[\d.]+$/.test(cols[0]) && cols[cols.length - 1] !== "total") used.add(cols[cols.length - 1]);
  }
}
const sorted = (s) => [...s].sort();
const usedMissing = sorted(new Set([...used].filter((n) => !wine.has(n))));
const dockerOnly = sorted(new Set([...docker].filter((n) => !wine.has(n))));
const unused = sorted(new Set([...wine].filter((n) => !used.has(n))));
console.log(`used by Wine+Xvfb: ${used.size}; wine profile allows ${wine.size} names; docker default allows ${docker.size} names`);
console.log(`USED BUT NOT ALLOWED (${usedMissing.length}): ${usedMissing.join(" ")}`);
console.log(`DOCKER-ONLY (delta, ${dockerOnly.length}): ${dockerOnly.join(" ")}`);
console.log(`ALLOWED BUT UNUSED (${unused.length})`);
if (process.env.LIST_UNUSED) console.log(unused.join(" "));
