"""Office document: olevba (static), then LibreOffice headless with macros enabled for this profile (SPEC 6.6 "Run Office macros").

LibreOffice opens the document and converts it to PDF in /tmp/dt/out. The macro engine runs VBA it can run; calls it cannot
run fail inside LibreOffice and are not seen here. File effects of a macro land in the home volume and show in the file diff;
the syscall trace shows what the LibreOffice process (and any process a macro starts) did after it opened the document.
"""
import json
import os
import re
import sys
import time
import zipfile

from runnerlib import finish, parse_args, run, tail

PROFILE = "/tmp/dt/lo"
OUTPUT = "/tmp/dt/out"
SOFFICE_SECONDS = 24
MAX_ANALYSIS = 60
MAX_XML = 2 * 1024 * 1024
MAX_EXTERNAL = 20
PART_NAME = re.compile(r"^[A-Za-z0-9_./-]+\.(?:xml|rels)$")
EXTERNAL_TARGET = re.compile(r'Target="(?P<one>[^"]+)"[^>]*?TargetMode="External"|TargetMode="External"[^>]*?Target="(?P<two>[^"]+)"', re.I)
ATTACHED_TEMPLATE = re.compile(r"<w:attachedTemplate[^>]*r:id=", re.I)

# Macro security Low and VBA "Load" plus "Executable code" for Writer, Calc and Impress, in the profile this run uses.
XCU = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Filter/Import/VBA"><prop oor:name="Load" oor:op="fuse"><value>true</value></prop><prop oor:name="Executable" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Filter/Import/VBA"><prop oor:name="Load" oor:op="fuse"><value>true</value></prop><prop oor:name="Executable" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Impress/Filter/Import/VBA"><prop oor:name="Load" oor:op="fuse"><value>true</value></prop><prop oor:name="Executable" oor:op="fuse"><value>true</value></prop></item>
</oor:items>
"""


def olevba(path):
    # No --no-deobfuscate: this olevba has no such option, and passing one made every Office document report "olevba could not
    # read the document". Deobfuscation is off unless --deobf is given, which is what the report wants.
    done = run([sys.executable, "-m", "oletools.olevba", "--json", path], 20)
    text = done["stdout"]
    error = tail(done["stderr"])
    if not error:
        if done["timedOut"]:
            error = "olevba timed out"
        elif done["code"] != 0:
            error = f"olevba exited with code {done['code']}"
    start = text.find("[")
    try:
        records = json.loads(text[start:]) if start >= 0 else None
    except ValueError:
        records = None
    if not isinstance(records, list):
        return {"ok": False, "error": error or "olevba output was not JSON"}

    analysis, macros, kind, malformed = [], 0, None, False
    for record in records:
        if not isinstance(record, dict) or "analysis" not in record and "macros" not in record:
            continue
        kind = kind or record.get("type")
        record_invalid = False
        macro_records = record.get("macros")
        if macro_records is not None:
            if isinstance(macro_records, list):
                macros += len(macro_records)
            else:
                record_invalid = True
        analysis_records = record.get("analysis")
        if analysis_records is not None:
            if not isinstance(analysis_records, list):
                record_invalid = True
            else:
                for item in analysis_records:
                    if not isinstance(item, dict):
                        record_invalid = True
                        break
                    analysis.append({key: str(item.get(key, ""))[:200] for key in ("type", "keyword", "description")})
        if record_invalid:
            malformed = True
            break
    success = done["code"] == 0 and not done["timedOut"] and not malformed
    result = {"ok": success, "type": kind, "macroCount": macros, "analysis": analysis[:MAX_ANALYSIS]}
    if not success:
        if malformed and done["code"] == 0 and not done["timedOut"]:
            result["error"] = "olevba returned an invalid report"
        else:
            result["error"] = error or "olevba did not finish"
    return result


def ooxml(path):
    """External references of an OOXML package: a template, image or OLE target pulled from the network when it is opened.

    This is template injection: the document holds only a link, so a scanner that reads the package sees a clean body while
    the victim's Word fetches and runs whatever the link serves. Only the package parts are read; nothing is opened here.
    """
    if not zipfile.is_zipfile(path):
        return {"ok": True, "external": [], "attachedTemplate": False, "parts": 0}
    external, attached, parts = [], False, 0
    try:
        package = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile):
        return {"ok": False, "external": [], "attachedTemplate": False, "parts": 0}
    with package:
        for info in package.infolist()[:500]:
            name = info.filename
            if not PART_NAME.match(name) or info.file_size > MAX_XML:
                continue
            parts += 1
            try:
                body = package.read(info).decode("utf-8", "replace")
            except (OSError, RuntimeError, zipfile.BadZipFile):
                continue
            for found in EXTERNAL_TARGET.finditer(body):
                target = (found.group("one") or found.group("two") or "").strip()
                if target and re.match(r"[A-Za-z][A-Za-z0-9+.-]*://", target) and len(external) < MAX_EXTERNAL:
                    external.append({"part": name[:120], "target": target[:300]})
            if name.endswith("settings.xml") and ATTACHED_TEMPLATE.search(body):
                attached = True
    return {"ok": True, "external": external, "attachedTemplate": attached, "parts": parts}


def libreoffice(path):
    os.makedirs(f"{PROFILE}/user", exist_ok=True)
    os.makedirs(OUTPUT, exist_ok=True)
    with open(f"{PROFILE}/user/registrymodifications.xcu", "w", encoding="utf-8") as handle:
        handle.write(XCU)
    started = time.monotonic()
    done = run([
        "timeout", "-k", "2", str(SOFFICE_SECONDS), "soffice", "--headless", "--norestore", "--nologo", "--nodefault", "--nolockcheck",
        "--nofirststartwizard", f"-env:UserInstallation=file://{PROFILE}", "--convert-to", "pdf", "--outdir", OUTPUT, path,
    ], SOFFICE_SECONDS + 4)
    seconds = round(time.monotonic() - started, 1)
    converted = any(name.endswith(".pdf") for name in os.listdir(OUTPUT))
    return {
        "opened": converted, "exitCode": done["code"], "timedOut": done["timedOut"] or done["code"] in (124, 137),
        "seconds": seconds, "stderr": tail(done["stderr"]),
    }


def main():
    args = parse_args(("ext",))
    result = {"olevba": olevba(args.file), "ooxml": ooxml(args.file), "libreoffice": libreoffice(args.file)}
    finish(args, office=result)


if __name__ == "__main__":
    main()
