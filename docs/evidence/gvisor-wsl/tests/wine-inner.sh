#!/bin/sh
# Runs inside the container. Only Wine's own built-in programs (cmd, notepad, reg, wineboot).
# usage: wine-inner.sh version | loader32 | boot | cmd | notepad | reg
W=/usr/lib/wine/wine64
step=$1
case "$step" in
  version)  $W --version ;;
  loader32) /usr/lib/wine/wine --version ;;
  boot)     timeout 90 xvfb-run -a -s "-screen 0 1280x800x24" sh -c "$W wineboot --init; echo wineboot_exit=\$?; wineserver -w; echo wineserver_wait_exit=\$?" ;;
  cmd)      timeout 90 xvfb-run -a -s "-screen 0 1280x800x24" sh -c "$W cmd /c echo hi; echo cmd_exit=\$?; wineserver -k; true" ;;
  reg)      timeout 90 xvfb-run -a -s "-screen 0 1280x800x24" sh -c "$W reg query 'HKCU\\Software\\Wine'; echo reg_exit=\$?; wineserver -k; true" ;;
  notepad)  timeout 90 xvfb-run -a -s "-screen 0 1280x800x24" sh -c "$W notepad & sleep 5; echo 'processes at +5 s:'; ps -eo pid,stat,comm | grep -iE 'wine|notepad|Xvfb'; kill %1; sleep 1; wineserver -k; echo killed" ;;
esac
