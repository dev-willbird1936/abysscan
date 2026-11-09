#!/bin/bash
# Wine-in-gVisor probes (SPEC open item 11). Run inside the WSL distro after:
#   docker build -t do-test-wine -f Dockerfile.wine .
# usage: [WINEDEBUG=err+all] wine-tests.sh <runtime> <step>...      (runtime: runsc | runc)
# steps: see wine-inner.sh. Each step is one container with the SPEC 6.3 flags and a persistent prefix volume.
set -u
RT="$1"; shift
HERE="$(cd "$(dirname "$0")" && pwd)"
VOL="do-wine-home-$RT${VOLSUFFIX:-}"
docker volume create "$VOL" >/dev/null
docker run --rm --user 0 -v "$VOL":/h debian:bookworm-slim chown 10001:10001 /h
FLAGS="--read-only --cap-drop ALL --security-opt no-new-privileges:true --user 10001:10001 --pids-limit 128 --memory 512m --memory-swap 512m --cpus 1 --network none --tmpfs /tmp:rw,nosuid,nodev,size=64m"
ENVV="-e HOME=/home/dana -e WINEPREFIX=/home/dana/.wine -e WINEARCH=win64 -e WINEDEBUG=${WINEDEBUG:--all} -e WINEDLLOVERRIDES=mscoree,mshtml=,winemenubuilder.exe=d"
OUT=$(mktemp)
for step in "$@"; do
  echo "##### [$RT] $step"
  s=$(date +%s)
  timeout 100 docker run --rm --runtime "$RT" $FLAGS $ENVV -v "$VOL":/home/dana -v "$HERE/wine-inner.sh":/in/wine-inner.sh:ro \
    do-test-wine sh /in/wine-inner.sh "$step" > "$OUT" 2>&1
  ec=$?
  echo "exit=$ec wall=$(( $(date +%s) - s ))s output_lines=$(wc -l < "$OUT") bytes=$(wc -c < "$OUT")"
  echo "--- distinct lines (count x text, first 12):"
  sed -E 's/^[0-9a-f]{4}:/PID:/' "$OUT" | sort | uniq -c | sort -rn | head -12 | cut -c1-240
done
rm -f "$OUT"
