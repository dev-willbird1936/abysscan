#!/bin/bash
# Investigation A: run forkloop.py under one configuration and print what happened.
# Run inside the WSL distro. Needs the do-test-py image from REPORT.md (python:3.12-slim based).
# usage: pids-matrix.sh <label> <runtime> fork|spawn|threads|cfork <max> [extra docker run flags...]
#   cfork needs: mkdir -p /tmp/do-inv-bin && gcc -O2 -static -o /tmp/do-inv-bin/forkloop forkloop.c
#   RUNSC_FLAGS is not settable per container with Docker; platform/network flags go in a
#   per-label runtime registered in /etc/docker/daemon.json (see PIDS-AND-WINE.md).
# Output: exit code, OOMKilled, the program's JSON counters, and (runsc-trace) the matching
# lines of the sandbox boot log. Container name: do-inv-<label>.
set -u
LABEL=$1; RT=$2; MODE=$3; MAX=$4; shift 4
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME="do-inv-$LABEL"
PIDS=${PIDS:-128}
BASE="--read-only --cap-drop ALL --security-opt no-new-privileges:true --user 10001:10001 --memory 512m --memory-swap 512m --cpus 1 --network none --tmpfs /tmp:rw,nosuid,nodev,size=64m"
docker rm -f "$NAME" >/dev/null 2>&1
s=$(date +%s)
timeout 120 docker run --name "$NAME" --runtime "$RT" --pids-limit "$PIDS" $BASE "$@" \
  -v "$HERE/forkloop.py":/in/forkloop.py:ro -v /tmp/do-inv-bin:/in/bin:ro do-test-py   sh -c "if [ \"$MODE\" = cfork ]; then /in/bin/forkloop $MAX; else python3 /in/forkloop.py $MODE $MAX; fi" > /tmp/do-inv-$LABEL.out 2>&1
ec=$?
ID=$(docker inspect -f '{{.Id}}' "$NAME")
echo "##### $LABEL runtime=$RT pids-limit=$PIDS mode=$MODE max=$MAX extra=[$*]"
echo "exit=$ec wall=$(( $(date +%s) - s ))s $(docker inspect -f 'oom={{.State.OOMKilled}} err={{printf "%q" .State.Error}}' "$NAME")"
echo "--- program output:"; head -c 1500 /tmp/do-inv-$LABEL.out
if [ "$RT" = runsc-trace ] || [ -n "${LOGDIR:-}" ]; then
  LOG=$(ls /var/log/runsc/$ID/*boot.txt 2>/dev/null | head -1)
  if [ -n "$LOG" ]; then
    echo "--- boot log: $(wc -l < "$LOG") lines; vfork/clone/fork X lines: $(grep -cE ' X (clone|clone3|fork|vfork)\(' "$LOG"); errno on them: $(grep -E ' X (clone|clone3|fork|vfork)\(' "$LOG" | grep -c 'errno=')"
    echo "--- non-strace lines mentioning clone/memory/panic (first 8):"
    grep -vE ' strace\.go:' "$LOG" | grep -iE 'clone|memory manager|panic|EAGAIN|NPROC|limit' | head -8 | cut -c1-300
    echo "--- strace error lines on process-creation syscalls (first 5):"
    grep -E ' X (clone|clone3|fork|vfork|execve)\(.*errno=' "$LOG" | head -5 | cut -c1-300
    echo "--- last 3 strace lines:"; grep ' strace\.go:' "$LOG" | tail -3 | cut -c1-300
  fi
fi
docker rm -f "$NAME" >/dev/null 2>&1
