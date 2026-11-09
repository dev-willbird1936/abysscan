#!/bin/bash
# Put one public sample into quarantine on the analysis host — never on a workstation — and prove its hash before it is stored.
#
#   bash quarantine-fetch.sh <url> <expected-sha256|-> <name>
#
# The file lands in /root/quarantine (0700), is made unreadable (chmod 000) so nothing can execute or open it by accident, and
# its hash, name and source URL are appended to manifest.txt. Nothing here runs the sample: it is only stored and hashed.
set -euo pipefail
url="${1:?url}"; want="${2:--}"; name="${3:?name}"
dir=/root/quarantine
umask 077; mkdir -p "$dir"; cd "$dir"
curl -fsSL --max-time 180 -o "$name.part" "$url"
got="$(sha256sum "$name.part" | cut -d' ' -f1)"
if [ "$want" != '-' ] && [ "$got" != "$want" ]; then
  rm -f "$name.part"
  echo "hash mismatch: got $got, expected $want" >&2
  exit 3
fi
mv "$name.part" "$name"
chmod 000 "$name"
printf '%s  %s  %s  %s\n' "$(date -u +%FT%TZ)" "$got" "$name" "$url" >> manifest.txt
echo "$got  $name"
