"""pdfid and pdf-parser over a PDF (read only). Prints {"pdfid": {name: count}, "header", "parser": {...}, "errors": [...]}."""
import json
import re
import sys

sys.path.insert(0, "/opt/detonation")
from runnerlib import run, tail

TOOLS = "/opt/pdftools"
BINWALK = "/usr/local/bin/binwalk"
TEXT = 200
EMBEDDED_EXECUTABLE = re.compile(r"executable|ELF|PE32|Mach-O|script", re.I)
EMBEDDED_ARCHIVE = re.compile(r"archive|zip|gzip|7-zip|rar|tar|compress", re.I)


def carve(path):
    """What binwalk finds after the PDF header: `{ok, found, executables, archives}`. Only scans; nothing is extracted."""
    log = "/tmp/dt/binwalk-pdf.json"
    done = run([BINWALK, "--quiet", "--log", log, path], 20)
    found = []
    try:
        with open(log, encoding="utf-8") as handle:
            for analysis in json.load(handle):
                for entry in (analysis.get("Analysis") or {}).get("file_map") or []:
                    found.append({"offset": int(entry.get("offset", 0)), "description": str(entry.get("description", ""))[:TEXT]})
    except (OSError, ValueError, AttributeError):
        pass
    return {"ok": done["code"] == 0, "found": found[:30],
            "executables": sum(1 for entry in found if entry["offset"] > 0 and EMBEDDED_EXECUTABLE.search(entry["description"])),
            "archives": sum(1 for entry in found if entry["offset"] > 0 and EMBEDDED_ARCHIVE.search(entry["description"]))}
PDFID_LINE = re.compile(r"^\s+(/?[A-Za-z0-9_ ]+?)\s+(\d+)(?:\(\d+\))?\s*$")


def pdfid(path):
    done = run(["/opt/venv/bin/python", f"{TOOLS}/pdfid.py", path], 15)
    counts = {}
    header = ""
    for line in done["stdout"].splitlines():
        if line.startswith(" PDF Header:"):
            header = line.split(":", 1)[1].strip()[:16]
            continue
        match = PDFID_LINE.match(line)
        if match:
            counts[match.group(1).strip()] = int(match.group(2))
    return counts, header, None if done["code"] == 0 and counts else tail(done["stderr"]) or "pdfid produced no counts"


def parser_stats(path):
    done = run(["/opt/venv/bin/python", f"{TOOLS}/pdf-parser.py", "--stats", path], 15)
    types = {}
    for line in done["stdout"].splitlines():
        match = re.match(r"^\s*(/\w+)\s+(\d+)\s*(?:\(.*\))?$", line)
        if match:
            types[match.group(1)] = int(match.group(2))
    return types, None if done["code"] == 0 else tail(done["stderr"]) or "pdf-parser failed"


def main():
    path = sys.argv[1]
    counts, header, pdfid_error = pdfid(path)
    types, parser_error = parser_stats(path)
    errors = [error for error in (pdfid_error, parser_error) if error]
    print(json.dumps({"pdfid": counts, "header": header, "parser": types, "carve": carve(path), "errors": errors}, separators=(",", ":")))


main()
