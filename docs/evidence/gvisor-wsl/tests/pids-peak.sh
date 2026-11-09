#!/bin/bash
# Investigation A: peak host-thread count (cgroup pids.peak, polled until the scope disappears) of the sandbox while cfork runs, for one pids-limit.
# Run inside the WSL distro (cgroup v2, systemd driver). Needs /tmp/do-inv-bin/forkloop (see pids-matrix.sh).
# usage: pids-peak.sh <label> <runtime> <pids-limit> <max-children> [extra docker run flags...]
# Prints: exit code, OOMKilled, the last pids.peak seen (20 ms polling) and forkloop's JSON line. Runs shorter than
# about 1 s finish before the first poll and print 0.
set -u
LABEL=$1; RT=$2; PIDS=$3; MAX=$4; shift 4
NAME="do-inv-$LABEL"
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --runtime "$RT" --pids-limit "$PIDS" --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --user 10001:10001 --memory 512m --memory-swap 512m --cpus 1 --network none \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m -v /tmp/do-inv-bin:/in/bin:ro "$@" do-test-py /in/bin/forkloop "$MAX" >/dev/null
ID=$(docker inspect -f '{{.Id}}' "$NAME")
CG=/sys/fs/cgroup/system.slice/docker-$ID.scope
peak=0
while [ -d "$CG" ]; do
  c=$(cat $CG/pids.peak 2>/dev/null || echo 0)
  [ "$c" -gt "$peak" ] && peak=$c
  sleep 0.02
done
echo "##### $LABEL runtime=$RT pids-limit=$PIDS max=$MAX extra=[$*]"
echo "exit=$(docker inspect -f '{{.State.ExitCode}}' "$NAME") oom=$(docker inspect -f '{{.State.OOMKilled}}' "$NAME") host-threads-peak(pids.peak)=$peak"
docker logs "$NAME" 2>&1 | head -c 400
docker rm -f "$NAME" >/dev/null 2>&1
