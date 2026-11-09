#!/bin/bash
# Detonate one quarantined file on the live controller and prove the sandbox cleaned up.
#
#   bash detonate.sh /root/quarantine/<name> [upload-name]
#
# Runs on the VM, against 127.0.0.1:4173, so the sample never crosses the network and no credential is typed anywhere.
# Pre-flight: the controller must be accepting jobs and no other container or volume may exist. After the run it asserts that
# nothing is left, reads the receipt, and wipes the file.
set -euo pipefail
file="${1:?file}"; name="${2:-$(basename "$file")}"; base=http://127.0.0.1:4173; xff="${3:-}"
health="$(curl -fsS --max-time 5 "$base/api/health")"
case "$health" in
  *'"acceptingJobs":true'*) ;;
  *) echo "controller is not accepting jobs: $health" >&2; exit 4 ;;
esac
[ "$(docker ps -aq | wc -l)" -eq 0 ] || { echo "pre-flight: containers already exist" >&2; exit 5; }
[ "$(docker volume ls -q | wc -l)" -eq 0 ] || { echo "pre-flight: volumes already exist" >&2; exit 5; }
size="$(stat -c %s "$file")"
[ "$size" -le 104857600 ] || { echo "pre-flight: over the 100 MB upload cap" >&2; exit 6; }
echo "uploading $name ($size bytes)"

xff_args=(); [ -z "$xff" ] || xff_args=(-H "X-Forwarded-For: $xff")
resp="$(curl -sS --max-time 300 -F "file=@$file;filename=$name" -F 'consent=true' -H "Origin: $base" "${xff_args[@]}" "$base/api/jobs")"
job="$(printf '%s' "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin)["jobId"])')"
token="$(printf '%s' "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')"
echo "job $job"
curl -sN --max-time 420 -H "Authorization: Bearer $token" -H 'Accept: text/event-stream' "$base/api/jobs/$job/events" > "/tmp/events-$job.txt" || true
curl -sS --max-time 60 -H "Authorization: Bearer $token" "$base/api/jobs/$job" > "/tmp/job-$job.json"

python3 - "$job" <<'PY'
import json, re, sys
job = sys.argv[1]
raw = open(f'/tmp/events-{job}.txt', encoding='utf-8', errors='replace').read()
for block in raw.split('\n\n'):
    m = re.search(r'^event: (\S+)$', block, re.M)
    if not m:
        continue
    data = '\n'.join(l[6:] for l in block.splitlines() if l.startswith('data: '))
    try:
        d = json.loads(data)
    except Exception:
        continue
    if m.group(1) == 'typed':
        print('type      ', d.get('detectedType'), '| path', d.get('path'), '| species', d.get('species'))
    elif m.group(1) == 'verdict':
        print('verdict   ', d.get('depth'), '|', ','.join(d.get('signals') or []) or '-', '|', ', '.join(f.get('id') for f in d.get('findings') or []) or 'no findings', '| complete', d.get('complete'))
    elif m.group(1) == 'receipt':
        keep = ('containers', 'volumes', 'uploadDeleted', 'hostCanary', 'limitsHit', 'modelCalls')
        print('receipt   ', {k: d.get(k) for k in keep if k in d})
d = json.load(open(f'/tmp/job-{job}.json'))
report = d.get('report') or {}
print('evidence  ', len(report.get('evidence') or []), 'item(s)')
for ev in (report.get('evidence') or [])[:12]:
    print('   -', ev.get('source'), ev.get('kind'), '|', str(ev.get('detail'))[:110])
PY

left_containers="$(docker ps -aq | wc -l)"
left_volumes="$(docker volume ls -q | wc -l)"
echo "after run: $left_containers container(s), $left_volumes volume(s)"
[ "$left_containers" -eq 0 ] && [ "$left_volumes" -eq 0 ] || { echo "TEARDOWN INCOMPLETE: inspect docker ps -a and journalctl -u detonation-ocean" >&2; exit 7; }
[ "${KEEP:-0}" = 1 ] || shred -u "$file" 2>/dev/null || rm -f "$file"
rm -f "/tmp/events-$job.txt" "/tmp/job-$job.json"
[ "${KEEP:-0}" = 1 ] || echo "sample wiped"
