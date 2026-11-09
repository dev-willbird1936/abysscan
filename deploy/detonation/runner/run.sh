#!/bin/bash
# Detonation runner (docs/SPEC.md 6.6, DETONATION-DESIGN.md 2): copies the sample to ~/Downloads/sample.<ext> and runs the
# tool for JOB_KIND (argument 1, else env). The last stdout line is always one JSON status line; the tools below print it
# themselves. The controller owns the 30 s wall clock and the container flags; this script only picks and runs.
#
#   run.sh <kind> [--ext EXT] [--canary TOKEN] [--from PATH --source-size N] [--max-entries N] [--max-bytes N] [--method M] [--format F]
#
#   py sh node perl php ruby lua  run the file for real with python3, bash, node, perl, php, ruby or lua
#   elf              run the binary itself for real: chmod +x, then exec it (static or dynamic, it needs no interpreter)
#   ps1              pwsh, after a static scan
#   html svg pdf     Playwright Chromium harness (browser.mjs); pdf also gets pdfid and pdf-parser (pdf_static.py)
#   office           olevba, then LibreOffice headless with macros enabled (office.py); --ext is the Office extension
#   exe              Speakeasy emulation, 30 s and 5 M instructions (emulate.py); the file never runs natively
#   zip eml rtf msg  unpack with 7zz, python email, oletools' rtfobj or olefile under the SPEC 5.3 caps (unpack.py)
#   identify         M4b: headers, packer, signature of a PE; unwraps UPX, Inno Setup, NSIS, self-extractors, PyInstaller (identify.py)
#   unwrap           M4b: --method asar|msi|7z for a file that is not a PE (unwrap.py)
#   static           M4b: capa (--format pe) and YARA signature-base (static.py)
#   generic          M4b: strings, entropy, binwalk and YARA for any file (generic.py)
#
# --from names a gzip file this job's earlier unpack wrote under ~/Downloads/.unpacked (a child item); the default is /in/sample.
# Scratch for the tools is /tmp/dt, never the home volume, so a tool's own files stay out of the file diff. The same holds for
# the copy of the file: scripts, Office files, html, svg and pdf from /in/sample are copied to ~/Downloads/sample.<ext> (the
# collector skips the copy of py, sh and js), but exe, zip and eml, and every child, stay in /tmp/dt/sample.<ext>. Unpacked children
# are stored gzipped as <n>.dat so that neither they nor the copy look like an executable or an archive to the file diff, which
# would read as a second stage or a staged archive.
set -u

kind="${1:-${JOB_KIND:-}}"
[ $# -gt 0 ] && shift
from=/in/sample
source_size=""
ext=""
canary=""
max_entries=50
max_bytes=52428800
method=""
format=""

invalid() { printf '{"detonationRunner":1,"kind":"invalid","started":false}\n'; exit 64; }
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || invalid
  case "$1" in
    --from) from="$2" ;;
    --source-size) source_size="$2" ;;
    --ext) ext="$2" ;;
    --canary) canary="$2" ;;
    --max-entries) max_entries="$2" ;;
    --max-bytes) max_bytes="$2" ;;
    --method) method="$2" ;;
    --format) format="$2" ;;
    *) invalid ;;
  esac
  shift 2
done

case "$kind" in
  py)   ext=${ext:-py} ;;
  sh)   ext=${ext:-sh} ;;
  node) ext=${ext:-js} ;;
  elf)  ext=${ext:-bin} ;;
  perl) ext=${ext:-pl} ;;
  php) ext=${ext:-php} ;;
  java) ext=${ext:-class} ;;
  ruby) ext=${ext:-rb} ;;
  lua) ext=${ext:-lua} ;;
  ps1|html|svg|pdf|exe|zip|eml) ext=${ext:-$kind} ;;
  identify|static|generic|unwrap) ext=${ext:-bin} ;;
  office) case "$ext" in docx|docm|xlsx|xlsm|doc|xls|pptx) ;; *) invalid ;; esac ;;
  rtf) ext=${ext:-rtf} ;;
  msg) ext=${ext:-msg} ;;
  *) invalid ;;
esac
[[ "$ext" =~ ^[a-z0-9]{1,8}$ ]] || invalid
[[ "$canary" =~ ^[A-Z0-9]{0,16}$ ]] || invalid
[[ "$max_entries" =~ ^[0-9]{1,4}$ && "$max_bytes" =~ ^[0-9]{1,10}$ ]] || invalid
[[ "$method" =~ ^(asar|msi|7z)?$ && "$format" =~ ^(pe|elf|macho|other)?$ ]] || invalid
[ "$kind" != unwrap ] || [ -n "$method" ] || invalid
[ "$from" = /in/sample ] || [[ "$from" =~ ^/home/dana/Downloads/\.unpacked/(0|[1-9][0-9]*)/(0|[1-9][0-9]*)\.dat$ ]] || invalid
[ -z "$source_size" ] || [[ "$source_size" =~ ^[0-9]{1,9}$ ]] || invalid
[ "$from" = /in/sample ] || [ -n "$source_size" ] || invalid

home="${HOME:-/home/dana}"
downloads="$home/Downloads"
scratch=/tmp/dt
scratch_kind=no
case "$kind" in exe|zip|eml|identify|unwrap|static|generic) scratch_kind=yes ;; esac
if [ "$from" = /in/sample ] && [ "$scratch_kind" = no ]; then
  target="$downloads/sample.$ext"
  shown="Downloads/sample.$ext"
else
  target="$scratch/sample.$ext"
  shown="tmp/dt/sample.$ext"
fi
status() { printf '{"detonationRunner":1,"kind":"%s","started":%s,"file":"%s"%s}\n' "$kind" "$1" "$shown" "${2:-}"; }

# A crashing sample (or an emulated one whose children fault) must not write core files into the home tree: they are not the
# sample's doing and would fill the artifact budget.
ulimit -c 0 2>/dev/null || true
mkdir -p "$scratch/tmp" "$scratch/xdg/config" "$scratch/xdg/cache" "$scratch/xdg/data"
size_args=()
[ -z "$source_size" ] || size_args=(--size "$source_size")
if ! python3 /opt/detonation/runnerlib.py --source "$from" --target "$target" "${size_args[@]}"; then
  status false
  exit 65
fi

cd "$downloads" || exit 65

tool_env() {
  export TMPDIR="$scratch/tmp" XDG_CONFIG_HOME="$scratch/xdg/config" XDG_CACHE_HOME="$scratch/xdg/cache" XDG_DATA_HOME="$scratch/xdg/data"
  export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
}

case "$kind" in
  py|sh|node|perl|php|ruby|lua|java|elf)
    case "$kind" in py) interpreter=(python3) ;; sh) interpreter=(bash) ;; node) interpreter=(node) ;; perl) interpreter=(perl) ;; php) interpreter=(php) ;; ruby) interpreter=(ruby) ;; lua) interpreter=(lua5.4) ;; elf) chmod 0755 "$target"; interpreter=($(/opt/venv/bin/python /opt/detonation/elfarch.py "$target")) ;; esac
    # A static pass in the same container, before the file runs: libmagic's description, the header facts (imports, libraries,
    # packers, signature) and the .NET check. It costs a second and is what names the file when the run says nothing.
    # Keep the whole line: the run needs the class name the identify pass read out of a Java class file.
    identify_line=$(/opt/static-venv/bin/python /opt/detonation/identify.py --kind identify --file "$target" --ext "${ext:-bin}" --max-entries 0 --max-bytes 0 2>/dev/null | tail -1)
    identified=$(printf %s "$identify_line" | /opt/venv/bin/python -c "import sys,json
try: print(json.dumps(json.load(sys.stdin).get('identify') or {}))
except Exception: print('null')")
    case "$identified" in ''|null|*[!\"{}:,\ -~]*) identify_field="" ;; *) identify_field=",\"identify\":$identified" ;; esac
    # Read before the sample runs: a tool started after it would be recorded as part of the sample's own activity.
    classinfo_field=""
    if [ "$kind" = java ]; then
      classinfo=$(printf %s "$identify_line" | /opt/venv/bin/python -c "import sys,json
try: print(json.dumps(json.load(sys.stdin).get('classinfo') or {}))
except Exception: print('null')")
      case "$classinfo" in ''|null|*[!\"{}:,\ -~]*) ;; *) classinfo_field=",\"classinfo\":$classinfo" ;; esac
    fi
    # The JVM takes a class name, not a path, so run it from the sample's directory.
    if [ "$kind" = elf ]; then "${interpreter[@]}" "$target"
    elif [ "$kind" = java ]; then
      # The JVM resolves a class by the name recorded inside the file, not by the file name, so stage it under that name first.
      mainclass=$(printf %s "$identify_line" | /opt/venv/bin/python -c "import sys,json
try: print((json.load(sys.stdin).get('classinfo') or {}).get('name') or '')
except Exception: print('')")
      case "$mainclass" in ''|*[!A-Za-z0-9_.$]*) mainclass=sample ;; esac
      rundir=$scratch/java
      relative=$(printf %s "$mainclass" | tr . /)
      mkdir -p "$rundir/$(dirname "$relative")"
      cp "$target" "$rundir/$relative.class"
      (cd "$rundir" && java -XX:-UsePerfData -XX:TieredStopAtLevel=1 -XX:+UseSerialGC -cp "$rundir" "$mainclass")
    else "${interpreter[@]}" "$target"; fi
    code=$?
    # A binary that forks and exits leaves its real work in a child (every botnet and dropper does this). Keep PID 1 alive for a
    # few seconds so those processes run inside the traced container, then stop them. The controller's wall clock stays the
    # outer bound; a sample that exits without children adds no time.
    survivors=0
    if [ "$kind" = elf ]; then
      for ((dwell = 0; dwell < 8; dwell++)); do
        set -- /proc/[0-9]*
        [ "$#" -gt 1 ] || break
        read -t 1 -r _ < /dev/zero || true
      done
      set -- /proc/[0-9]*
      survivors=$(($# - 1))
      [ "$survivors" -gt 0 ] || survivors=0
    fi
    extra=",\"exitCode\":$code$identify_field$classinfo_field"
    [ "$kind" = elf ] && extra="$extra,\"surviving\":$survivors"
    status true "$extra"
    exit "$code"
    ;;
  ps1)
    tool_env
    export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 DOTNET_EnableDiagnostics=0 DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 \
      POWERSHELL_TELEMETRY_OPTOUT=1 POWERSHELL_UPDATECHECK=Off DOTNET_BUNDLE_EXTRACT_BASE_DIR="$scratch/tmp"
    static="$(/opt/venv/bin/python /opt/detonation/ps1_static.py "$target" 2>/dev/null)"
    [ -n "$static" ] || static='{}'
    pwsh -NoLogo -NoProfile -NonInteractive -File "$target"
    code=$?
    status true ",\"exitCode\":$code,\"static\":$static"
    exit "$code"
    ;;
  html|svg|pdf)
    tool_env
    static='{}'
    if [ "$kind" = pdf ]; then
      static="$(/opt/venv/bin/python /opt/detonation/pdf_static.py "$target" 2>/dev/null)"
      [ -n "$static" ] || static='{}'
    fi
    printf '%s' "$static" > "$scratch/static.json"
    exec node /opt/detonation/browser.mjs --kind "$kind" --file "$target" --canary "$canary" --static "$scratch/static.json"
    ;;
  office)
    tool_env
    exec /opt/venv/bin/python /opt/detonation/office.py --kind "$kind" --file "$target" --ext "$ext"
    ;;
  exe)
    tool_env
    exec /opt/venv/bin/python /opt/detonation/emulate.py --kind "$kind" --file "$target"
    ;;
  zip|eml|rtf|msg)
    tool_env
    ulimit -f 65536
    exec /opt/venv/bin/python /opt/detonation/unpack.py --kind "$kind" --file "$target" --ext "$ext" --max-entries "$max_entries" --max-bytes "$max_bytes"
    ;;
  identify|unwrap|static|generic)
    tool_env
    ulimit -f 65536
    case "$kind" in
      identify) extra=(--max-entries "$max_entries" --max-bytes "$max_bytes") ;;
      unwrap)   extra=(--method "$method" --max-entries "$max_entries" --max-bytes "$max_bytes") ;;
      static)   extra=(--format "${format:-pe}") ;;
      generic)  extra=() ;;
    esac
    exec /opt/static-venv/bin/python "/opt/detonation/$kind.py" --kind "$kind" --file "$target" --ext "$ext" "${extra[@]}"
    ;;
esac
