#!/bin/bash
# Wine built-ins only (cmd, reg, notepad, wineboot), WineHQ 64-bit-only image. Tested 2026-10-08, see PIDS-AND-WINE.md section B.
# Run inside the WSL distro or on the VM after: docker build -t do-inv-wine -f Dockerfile.winehq .
# usage: [IMG=do-inv-wine] [W=/opt/wine-stable/bin/wine] [WINEDEBUG=err+all] [EXTRA="--security-opt seccomp=/path/seccomp-wine.json"]
#        [ARCH=win64|wow64] winehq-tests.sh <runtime> <step>...
#   runtime: runsc | runsc-kvm | runsc-ptrace | runc      (runsc-kvm / runsc-ptrace: see PIDS-AND-WINE.md section B)
#   steps:   version | boot | cmd | reg | notepad | cmd32 | reg32 | notepad32   (*32 run the 32-bit programs from syswow64)
#   Wine 10.0 stable has no `wine` loader in the 64-bit-only install: use IMG=do-inv-wine10 W=/opt/wine-stable/bin/wine64.
# Each step is one container named do-inv-wine-<runtime>-<step> with the SPEC 6.3 flags (+ EXTRA) and a persistent
# 64-bit prefix volume do-inv-wine-home-<runtime> (WINEARCH=win64). Containers are removed afterwards.
# PIDS=<n> overrides --pids-limit (default 512, the gVisor value; use 128 for runc).
# Output is the unique lines of stdout+stderr with counts (top 14), so line order is lost; use RAW=1 for the raw stream.
set -u
RT="$1"; shift
ARCH="${ARCH:-win64}"
TMO="${TMO:-90}"   # seconds per step; a first-time wow64 prefix needs about 300 (boot step)
VOL="do-inv-wine-home-$RT"; [ "$ARCH" = win64 ] || VOL="$VOL-$ARCH"
IMG="${IMG:-do-inv-wine}"
W="${W:-/opt/wine-stable/bin/wine}"
docker volume create "$VOL" >/dev/null
docker run --rm --user 0 -v "$VOL":/h debian:bookworm-slim chown 10001:10001 /h
FLAGS="--read-only --cap-drop ALL --security-opt no-new-privileges:true --user 10001:10001 --pids-limit ${PIDS:-512} --ulimit nproc=128:128 --memory 512m --memory-swap 512m --cpus 1 --network none --tmpfs /tmp:rw,nosuid,nodev,size=64m"
ENVV="-e HOME=/home/dana -e WINEPREFIX=/home/dana/.wine -e WINEARCH=$ARCH -e WINEDEBUG=${WINEDEBUG:--all} -e WINEDLLOVERRIDES=mscoree,mshtml=,winemenubuilder.exe=d"
X='xvfb-run -a -s "-screen 0 1280x800x24"'
for step in "$@"; do
  case "$step" in
    version) CMD="$W --version" ;;
    boot)    CMD="timeout $TMO $X sh -c '$W wineboot --init; echo wineboot_exit=\$?; wineserver -w; echo wineserver_wait_exit=\$?'" ;;
    cmd)     CMD="timeout $TMO $X sh -c '$W cmd /c echo hi; echo cmd_exit=\$?; wineserver -k; true'" ;;
    reg)     CMD="timeout $TMO $X sh -c '$W reg query HKCU\\\\Software\\\\Wine; echo reg_exit=\$?; wineserver -k; true'" ;;
    notepad) CMD="timeout $TMO $X sh -c '$W notepad & sleep 5; echo processes at +5 s:; ps -eo pid,stat,comm | grep -iE \"wine|notepad|Xvfb\"; kill %1; sleep 1; wineserver -k; echo killed'" ;;
    cmd32)   CMD="timeout $TMO $X sh -c '$W C:\\\\windows\\\\syswow64\\\\cmd.exe /c echo hi32; echo cmd32_exit=\$?; wineserver -k; true'" ;;
    reg32)   CMD="timeout $TMO $X sh -c '$W C:\\\\windows\\\\syswow64\\\\reg.exe query HKCU\\\\Software\\\\Wine; echo reg32_exit=\$?; wineserver -k; true'" ;;
    notepad32) CMD="timeout $TMO $X sh -c '$W C:\\\\windows\\\\syswow64\\\\notepad.exe & sleep 5; echo processes at +5 s:; ps -eo pid,stat,comm | grep -iE \"wine|notepad|Xvfb\"; kill %1; sleep 1; wineserver -k; echo killed'" ;;
  esac
  echo "##### [$RT] $step"
  if [ -n "${RAW:-}" ]; then
    timeout $((TMO + 30)) docker run --name "do-inv-wine-$RT-$step" --runtime "$RT" $FLAGS $ENVV ${EXTRA:-} \
      -e PATH=/opt/wine-stable/bin:/usr/local/bin:/usr/bin:/bin -v "$VOL":/home/dana "$IMG" sh -c "$CMD" 2>&1 | head -60 | cut -c1-240
  else
    timeout $((TMO + 30)) docker run --name "do-inv-wine-$RT-$step" --runtime "$RT" $FLAGS $ENVV ${EXTRA:-} \
      -e PATH=/opt/wine-stable/bin:/usr/local/bin:/usr/bin:/bin -v "$VOL":/home/dana "$IMG" sh -c "$CMD" 2>&1 | sort | uniq -c | sort -rn | head -14 | cut -c1-240
  fi
  docker rm -f "do-inv-wine-$RT-$step" >/dev/null 2>&1
done
