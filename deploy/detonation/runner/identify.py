"""Identify, then unwrap (SPEC 6.6 "Identify", "Unwrap") a Windows PE (ELF and Mach-O get their headers only).

Reads the headers, imports, sections, resources and entropy with pefile (LIEF for ELF and Mach-O, and as the fallback when pefile cannot
read a PE), names the packer, installer or framework from section names and byte markers, and checks the Authenticode signature with
osslsigncode. When the file is a UPX, Inno Setup, NSIS, self-extracting, PyInstaller or Electron wrapper, it is unwrapped in the same
container (unwrap.py) and its parts are listed for the controller as children. A .NET assembly gets its metadata read with dnfile
(static only; it is not run).

Prints {"identify": {...}, "unwrap": {...} | null, "dotnet": {...} | null}; mapped by backend/detonation/identify.mjs and unwrap.mjs.
The file is parsed, never executed.
"""
import collections
import math
import os
import re

import unwrap
import unpack

# pefile, LIEF and dnfile are imported where they are used: the parsers in this file (LNK, DEX, Java class) stay testable and
# importable without the static venv, and a host without them can still read a shell link or a Dalvik header.

from runnerlib import finish, libmagic, parse_args, run, tail

TEXT = 200
MAX_SECTIONS = 40
MAX_IMPORT_DLLS = 40
MAX_IMPORT_NAMES = 300
ENTROPY_SAMPLE = 4 * 1024 * 1024
SECTION_SAMPLE = 1024 * 1024
MAX_READ = 128 * 1024 * 1024
OSSLSIGNCODE = "osslsigncode"

PACKER_SECTIONS = {
    "upx0": "UPX", "upx1": "UPX", "upx2": "UPX", "upx!": "UPX", ".aspack": "ASPack", ".adata": "ASPack", ".petite": "Petite", ".mpress1": "MPRESS",
    ".mpress2": "MPRESS", ".themida": "Themida", ".vmp0": "VMProtect", ".vmp1": "VMProtect", ".vmp2": "VMProtect", ".enigma1": "Enigma",
    ".enigma2": "Enigma", ".nsp0": "NsPack", ".nsp1": "NsPack", ".packed": "generic packer", ".perplex": "Perplex",
}
MACHINES = {0x14C: "x86", 0x8664: "x64", 0x1C0: "arm", 0xAA64: "arm64", 0x200: "ia64"}
SUBSYSTEMS = {1: "native", 2: "gui", 3: "console", 5: "os2", 7: "posix", 9: "wince", 10: "efi", 14: "xbox"}
DOTNET_DIRECTORY = 14
OVERLAY_ARCHIVES = ((b"7z\xbc\xaf\x27\x1c", "7z"), (b"Rar!\x1a\x07", "RAR"), (b"PK\x03\x04", "ZIP"))
# Byte markers of installers and frameworks; searched in the whole file (<= 128 MB).
INNO_MARKER = b"Inno Setup Setup Data"
NSIS_MARKERS = (b"NullsoftInst", b"Nullsoft Install System")
PYINSTALLER_COOKIE = b"MEI\x0c\x0b\x0a\x0b\x0e"
ELECTRON_MARKERS = (b"ELECTRON_RUN_AS_NODE", b"Electron Framework", b"app.asar")
# Wrappers whose parts are analysed as children, in the order the markers are trusted.
UNWRAPPABLE = {"upx": "upx", "inno": "inno", "nsis": "nsis", "sfx": "sfx", "pyinstaller": "pyinstaller"}
SUSPICIOUS_PINVOKE = re.compile(r"^(VirtualAlloc(Ex)?|VirtualProtect(Ex)?|WriteProcessMemory|ReadProcessMemory|CreateRemoteThread|NtUnmapViewOfSection|SetWindowsHookEx[AW]?|GetAsyncKeyState|URLDownloadToFile[AW]?|WinExec|ShellExecute[AW]?|LoadLibrary[AW]?|GetProcAddress|IsDebuggerPresent|CheckRemoteDebuggerPresent|AdjustTokenPrivileges)$")


def text(value, size=TEXT):
    return value if isinstance(value, str) and len(value) <= size else str(value)[:size]


def entropy_of(data):
    if not data:
        return 0.0
    total = len(data)
    return round(-sum(count / total * math.log2(count / total) for count in collections.Counter(data).values()), 3) + 0.0


def signature_status(path):
    """Authenticode through osslsigncode: no signature is `unsigned`; one that does not verify against the system roots is `invalid`."""
    done = run([OSSLSIGNCODE, "verify", path], 15)
    output = done["stdout"] + done["stderr"]
    if done["timedOut"] or done["code"] == 127:
        return {"status": "error", "detail": "The signature check did not run."}
    if "No signature found" in output:
        return {"status": "unsigned", "detail": "No Authenticode signature."}
    if "Signature verification: ok" in output:
        if done["code"] == 0:
            return {"status": "valid", "detail": "The Authenticode signature verifies."}
        return {"status": "invalid", "detail": f"The signature checker exited with code {done['code']}."}
    return {"status": "invalid", "detail": text(tail(output) or "The signature does not verify.", 200)}


EMBEDDED_MARKERS = [
    bytes([0x4D, 0x5A]),                      # MZ: a PE inside
    bytes([0x50, 0x4B, 0x03, 0x04]),          # a zip, jar or docx
    bytes([0x7F, 0x45, 0x4C, 0x46]),          # an ELF
    bytes([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]),  # 7-Zip
    bytes([0x52, 0x61, 0x72, 0x21]),          # RAR
    bytes([0x1F, 0x8B]),                      # gzip
    bytes([0xD0, 0xCF, 0x11, 0xE0]),          # an OLE document
]
EMBEDDED_TEXT = [b"#!", b"<?php", b"<script", b"<html", b"{\rtf", b"powershell", b"cmd.exe"]
OVERLAY_MIN = 128  # a staged script is small: the marker check below decides, not the size
OVERLAY_MAX = 64 * 1024 * 1024


def looks_embedded(blob):
    """True when the blob starts like something the sandbox can analyse in its own right."""
    if not blob or len(blob) < 8:
        return False
    if any(blob.startswith(marker) for marker in EMBEDDED_MARKERS):
        return True
    head = blob[:64].lstrip().lower()
    return any(head.startswith(marker) for marker in EMBEDDED_TEXT)


def overlay_payload(path, dest, max_entries, max_bytes):
    """Data appended after the last PE section: droppers and self-extractors put the next stage there.

    Pure header arithmetic, no library: the section table gives the end of the mapped image, everything after it is overlay.
    The bytes are stored as a child so they are typed, inspected and emulated in turn.
    """
    try:
        with open(path, "rb") as handle:
            data = handle.read(OVERLAY_MAX + 1024)
    except OSError:
        return None
    if len(data) < 0x40 or data[:2] != bytes([0x4D, 0x5A]):
        return None
    e_lfanew = int.from_bytes(data[0x3C:0x40], "little")
    if e_lfanew + 24 > len(data) or data[e_lfanew:e_lfanew + 4] != bytes([0x50, 0x45, 0x00, 0x00]):
        return None
    sections = int.from_bytes(data[e_lfanew + 6:e_lfanew + 8], "little")
    optional = int.from_bytes(data[e_lfanew + 20:e_lfanew + 22], "little")
    table = e_lfanew + 24 + optional
    end = 0
    for index in range(min(sections, 96)):
        entry = table + index * 40
        if entry + 40 > len(data):
            return None
        raw_size = int.from_bytes(data[entry + 16:entry + 20], "little")
        raw_offset = int.from_bytes(data[entry + 20:entry + 24], "little")
        end = max(end, raw_offset + raw_size)
    overlay = data[end:]
    if len(overlay) < OVERLAY_MIN or not looks_embedded(overlay):
        return None
    if len(overlay) > max_bytes:
        overlay = overlay[:max_bytes]
    out = unwrap.result("payload", offset=end, size=len(overlay))
    out["entries"].append(unpack.store(dest, 0, "overlay.bin", overlay))
    return out


def pe_facts(path, data):
    import pefile

    """Header, section, import, export and resource facts of a PE from pefile; raises on a file pefile cannot read."""
    pe = pefile.PE(data=data)
    try:
        sections = []
        for section in pe.sections[:MAX_SECTIONS]:
            name = section.Name.rstrip(b"\x00").decode("latin1")
            chunk = section.get_data()[:SECTION_SAMPLE]
            flags = section.Characteristics
            sections.append({
                "name": text(name, 16), "virtualSize": int(section.Misc_VirtualSize), "rawSize": int(section.SizeOfRawData), "entropy": entropy_of(chunk),
                "executable": bool(flags & 0x20000000), "writable": bool(flags & 0x80000000),
            })
        dlls, names = [], []
        for entry in getattr(pe, "DIRECTORY_ENTRY_IMPORT", []):
            dlls.append(entry.dll.decode("latin1").lower())
            names.extend(imp.name.decode("latin1") for imp in entry.imports if imp.name)
        exports = [symbol.name.decode("latin1") for symbol in getattr(getattr(pe, "DIRECTORY_ENTRY_EXPORT", None), "symbols", []) if symbol.name][:20]
        resource_types = []
        for entry in getattr(getattr(pe, "DIRECTORY_ENTRY_RESOURCE", None), "entries", []):
            resource_types.append(pefile.RESOURCE_TYPE.get(entry.id, str(entry.id)))
        optional = pe.OPTIONAL_HEADER
        entry_rva = int(optional.AddressOfEntryPoint)
        entry_section = next((s["name"] for s, raw in zip(sections, pe.sections) if raw.contains_rva(entry_rva)), "")
        overlay_start = pe.get_overlay_data_start_offset()
        directories = optional.DATA_DIRECTORY
        facts = {
            "format": "pe", "parser": "pefile", "arch": MACHINES.get(pe.FILE_HEADER.Machine, hex(pe.FILE_HEADER.Machine)),
            "subsystem": SUBSYSTEMS.get(optional.Subsystem, str(optional.Subsystem)), "isDll": bool(pe.FILE_HEADER.Characteristics & 0x2000),
            "dotnet": len(directories) > DOTNET_DIRECTORY and directories[DOTNET_DIRECTORY].VirtualAddress != 0,
            "entryPoint": entry_rva, "entrySection": entry_section, "imageBase": int(optional.ImageBase), "sizeOfImage": int(optional.SizeOfImage),
            "timestamp": int(pe.FILE_HEADER.TimeDateStamp), "sections": sections,
            "imports": {"count": len(names), "dlls": sorted(set(dlls))[:MAX_IMPORT_DLLS], "names": names[:MAX_IMPORT_NAMES]},
            "exports": exports, "resources": {"types": resource_types[:20], "count": len(resource_types)},
            "overlay": {"offset": overlay_start, "size": len(data) - overlay_start} if overlay_start else None,
        }
        return facts, overlay_start
    finally:
        pe.close()


def lief_facts(path):
    import lief

    """Header facts from LIEF: the whole story for ELF and Mach-O, and the fallback when pefile cannot read a PE."""
    binary = lief.parse(path)
    if binary is None:
        return None
    if isinstance(binary, lief.PE.Binary):
        kind = "pe"
    elif isinstance(binary, lief.ELF.Binary):
        kind = "elf"
    else:
        kind = "macho"
    sections = [{"name": text(section.name, 16), "virtualSize": int(getattr(section, "virtual_size", section.size)), "rawSize": int(section.size),
                 "entropy": round(float(section.entropy), 3), "executable": False, "writable": False} for section in list(binary.sections)[:MAX_SECTIONS]]
    libraries = [text(name) for name in getattr(binary, "libraries", [])][:MAX_IMPORT_DLLS]
    functions = [text(getattr(function, "name", function)) for function in list(getattr(binary, "imported_functions", []))[:MAX_IMPORT_NAMES]]
    signatures = len(getattr(binary, "signatures", []) or [])
    return {
        "format": kind, "parser": "lief", "arch": "", "subsystem": "", "isDll": False, "dotnet": False, "entryPoint": int(getattr(binary, "entrypoint", 0) or 0),
        "entrySection": "", "sections": sections, "imports": {"count": len(functions), "dlls": libraries, "names": functions},
        "exports": [], "resources": {"types": [], "count": 0}, "overlay": None, "signatures": signatures,
    }


def packers_of(sections, data):
    found = {PACKER_SECTIONS[section["name"].lower()] for section in sections if section["name"].lower() in PACKER_SECTIONS}
    if b"UPX!" in data[:4096] or b"UPX!" in data[-4096:]:
        found.add("UPX")
    high = [section["name"] for section in sections if section["executable"] and section["entropy"] >= 7.2]
    return sorted(found), high


def wrapper_of(facts, data, packers):
    """`{kind, evidence}` of the first marker that fits, or kind None. Order: UPX, Inno Setup, NSIS, PyInstaller, Electron, self-extracting archive, .NET."""
    if "UPX" in packers:
        return {"kind": "upx", "evidence": "UPX section names or the UPX! marker"}
    if INNO_MARKER in data:
        return {"kind": "inno", "evidence": "Inno Setup setup data marker"}
    if any(marker in data for marker in NSIS_MARKERS):
        return {"kind": "nsis", "evidence": "Nullsoft installer header"}
    if PYINSTALLER_COOKIE in data[-(4 * 1024 * 1024):]:
        return {"kind": "pyinstaller", "evidence": "PyInstaller archive cookie"}
    if sum(marker in data for marker in ELECTRON_MARKERS) >= 2:
        return {"kind": "electron", "evidence": "Electron runtime strings"}
    overlay = facts.get("overlay")
    if overlay and overlay["size"] > 0:
        # Offset 0 would be the PE itself; look in the first megabyte of the data appended after the last section.
        head = data[overlay["offset"]:overlay["offset"] + 1024 * 1024]
        for marker, label in OVERLAY_ARCHIVES:
            if marker in head:
                return {"kind": "sfx", "evidence": f"{label} archive appended to the program"}
    if facts.get("dotnet"):
        return {"kind": "dotnet", "evidence": "CLR header in the PE"}
    return {"kind": None, "evidence": ""}


def dotnet_facts(path):
    import dnfile

    """Metadata of a .NET assembly with dnfile: names, references, P/Invoke imports and resources. Never loads or runs it."""
    dn = dnfile.dnPE(path)
    tables = dn.net.mdtables

    def rows(table):
        node = getattr(tables, table, None)
        return list(node.rows) if node is not None else []

    def name_of(value):
        return text(str(value) if value is not None else "", 120)

    types = rows("TypeDef")
    methods = rows("MethodDef")
    names = [name_of(row.TypeName) for row in types[:500]] + [name_of(row.Name) for row in methods[:500]]
    printable = [name for name in names if name]
    odd = sum(1 for name in printable if not name.isascii() or len(name) <= 2 or not re.search(r"[A-Za-z]{3}", name))
    pinvoke = []
    for row in rows("ImplMap")[:200]:
        function = name_of(getattr(row, "ImportName", ""))
        module = name_of(getattr(getattr(getattr(row, "ImportScope", None), "row", None), "Name", ""))
        pinvoke.append({"dll": module, "function": function})
    assembly = rows("Assembly")
    # The runtime version arrives as bytes (sometimes as a bytes repr), so it is decoded and trimmed before it reaches a report.
    raw_runtime = getattr(dn.net.metadata.struct, "Version", "")
    if isinstance(raw_runtime, bytes):
        raw_runtime = raw_runtime.decode("utf-8", "replace")
    runtime = re.sub(r"[\x00-\x1f]", "", str(raw_runtime)).strip()
    runtime = re.sub(r"^b['\"]|['\"]$", "", runtime)[:40]
    return {
        "assembly": name_of(assembly[0].Name) if assembly else "", "version": f"{assembly[0].MajorVersion}.{assembly[0].MinorVersion}" if assembly else "",
        "runtime": runtime, "typeCount": len(types), "methodCount": len(methods),
        "references": [name_of(row.Name) for row in rows("AssemblyRef")[:30]], "pinvoke": pinvoke[:40],
        "suspiciousPinvoke": sorted({item["function"] for item in pinvoke if SUSPICIOUS_PINVOKE.match(item["function"])})[:20],
        "resources": [name_of(row.Name) for row in rows("ManifestResource")[:20]],
        "oddNameRatio": round(odd / len(printable), 3) if printable else 0.0, "namesChecked": len(printable),
    }


LNK_MAGIC = bytes([0x4C, 0x00, 0x00, 0x00])


def lnk_facts(path):
    """Target, arguments and network path of a Windows shell link. Reads the structures only; the link is never followed.

    Phishing attachments are shell links whose target is a host tool or a script host, so the strings they carry are the
    evidence. Nothing here resolves the target or touches the path it names.
    """
    def ansi(at, limit=520):
        stop = data.find(bytes([0]), at, at + limit)
        return data[at:stop if stop != -1 else at + limit].decode("latin1", "replace")[:200]

    def wide(at, limit=520):
        stop = at
        while stop + 1 < len(data) and stop < at + limit and data[stop:stop + 2] != bytes([0, 0]):
            stop += 2
        return data[at:stop].decode("utf-16-le", "replace")[:200]

    data = open(path, "rb").read(1024 * 1024)
    if len(data) < 0x4C or data[:4] != LNK_MAGIC:
        return None
    flags = int.from_bytes(data[0x14:0x18], "little")
    unicode_strings = bool(flags & 0x80)
    at = 0x4C
    if flags & 0x1:
        size = int.from_bytes(data[at:at + 2], "little")
        at += 2 + size
    facts = {"target": "", "arguments": "", "workingDir": "", "relativePath": "", "iconLocation": "", "networkPath": ""}
    if flags & 0x2 and at + 0x1C <= len(data):
        start = at
        info_size = int.from_bytes(data[start:start + 4], "little")
        header_size = int.from_bytes(data[start + 4:start + 8], "little")
        info_flags = int.from_bytes(data[start + 8:start + 12], "little")
        local_offset = int.from_bytes(data[start + 16:start + 20], "little")
        network_offset = int.from_bytes(data[start + 20:start + 24], "little")
        if info_flags & 0x1 and local_offset and start + local_offset < len(data):
            facts["target"] = ansi(start + local_offset) if header_size < 0x24 else (wide(start + local_offset) or ansi(start + local_offset))
        if info_flags & 0x2 and network_offset and start + network_offset + 12 <= len(data):
            net = start + network_offset
            name_offset = int.from_bytes(data[net + 8:net + 12], "little")
            if name_offset:
                facts["networkPath"] = ansi(net + name_offset)
        at = start + info_size
    for bit, key in ((0x4, "name"), (0x8, "relativePath"), (0x10, "workingDir"), (0x20, "arguments"), (0x40, "iconLocation")):
        if not flags & bit or at + 2 > len(data):
            continue
        count = int.from_bytes(data[at:at + 2], "little")
        at += 2
        width = 2 if unicode_strings else 1
        length = count * width
        if at + length > len(data):
            break
        value = data[at:at + length].decode("utf-16-le" if unicode_strings else "latin1", "replace")[:400]
        at += length
        if key in facts:
            facts[key] = value
    # ExtraData blocks: the environment-variable block carries the expanded target as a fixed ANSI and Unicode string.
    while at + 8 <= len(data):
        block_size = int.from_bytes(data[at:at + 4], "little")
        signature = int.from_bytes(data[at + 4:at + 8], "little")
        if block_size < 4:
            break
        if signature == 0xA0000001 and at + 8 + 260 <= len(data):
            extra = data[at + 8:at + 8 + 260].split(bytes([0]), 1)[0].decode("latin1", "replace")
            if extra and not facts["target"]:
                facts["target"] = extra[:200]
        at += block_size
    return {key: value for key, value in facts.items() if value}


DEX_APIS = [
    ("exec", re.compile(r"Ljava/lang/(?:Runtime;->exec|ProcessBuilder);?")),
    ("sms", re.compile(r"SmsManager|sendTextMessage|sendMultipartTextMessage")),
    ("identifiers", re.compile(r"getDeviceId|getSubscriberId|getSimSerialNumber|getLine1Number|getAccounts")),
    ("loader", re.compile(r"DexClassLoader|PathClassLoader|InMemoryDexClassLoader|Ldalvik/system/BaseDexClassLoader")),
    ("network", re.compile(r"Ljava/net/Socket;|HttpURLConnection|OkHttpClient|Ljava/net/URL;")),
    ("crypto", re.compile(r"Ljavax/crypto/|Landroid/util/Base64;")),
    ("admin", re.compile(r"DeviceAdminReceiver|setComponentEnabledSetting|Landroid/app/admin/")),
    ("reflection", re.compile(r"Ljava/lang/reflect/|getDeclaredMethod")),
]


def dex_facts(data):
    """What a Dalvik executable carries: version, class and method counts, and the API names that say what it can do.

    Only the header and the string table are read; no instruction is decoded and nothing is loaded.
    """
    def uleb(at):
        result = shift = 0
        while at < len(data):
            byte = data[at]
            at += 1
            result |= (byte & 0x7F) << shift
            if not byte & 0x80:
                break
            shift += 7
            if shift > 28:
                break
        return result, at

    string_ids_size = int.from_bytes(data[0x38:0x3C], "little")
    string_ids_off = int.from_bytes(data[0x3C:0x40], "little")
    method_ids_size = int.from_bytes(data[0x58:0x5C], "little")
    class_defs_size = int.from_bytes(data[0x60:0x64], "little")
    read, found = 0, {name: [] for name, _ in DEX_APIS}
    for index in range(min(string_ids_size, 4000)):
        entry = string_ids_off + index * 4
        if entry + 4 > len(data):
            break
        at = int.from_bytes(data[entry:entry + 4], "little")
        _, at = uleb(at)
        stop = data.find(bytes([0]), at, at + 512)
        if stop == -1:
            continue
        value = data[at:stop].decode("utf-8", "replace")
        read += 1
        for name, pattern in DEX_APIS:
            if len(found[name]) < 6 and pattern.search(value):
                found[name].append(value[:120])
    return {
        "version": data[4:7].decode("ascii", "replace"), "strings": string_ids_size, "methods": method_ids_size,
        "classes": class_defs_size, "readStrings": read, "apis": {name: values for name, values in found.items() if values},
    }


def class_facts(data):
    """Name, bytecode version and carried strings of a compiled Java class: the constant pool only, nothing is loaded."""
    major = int.from_bytes(data[6:8], "big")
    count = int.from_bytes(data[8:10], "big")
    at, next_index = 10, 1
    pool = {}
    while next_index < count and at + 1 < len(data):
        tag = data[at]
        at += 1
        if tag == 1:
            length = int.from_bytes(data[at:at + 2], "big")
            at += 2
            pool[next_index] = (tag, data[at:at + length])
            at += length
        elif tag in (7, 8, 16, 19, 20):
            pool[next_index] = (tag, int.from_bytes(data[at:at + 2], "big"))
            at += 2
        elif tag == 15:
            at += 3
        elif tag in (3, 4, 9, 10, 11, 12, 17, 18):
            at += 4
        elif tag in (5, 6):
            at += 8
            next_index += 1
        else:
            break
        next_index += 1
    # `at` sits on access_flags, so this_class is the next u2.
    this_index = int.from_bytes(data[at + 2:at + 4], "big") if at + 3 < len(data) else 0
    entry = pool.get(this_index)
    name = ""
    if entry and entry[0] == 7:
        raw = pool.get(entry[1])
        if raw and raw[0] == 1:
            name = raw[1].decode("utf-8", "replace")
    readable = []
    for tag, value in pool.values():
        if tag != 1:
            continue
        shown = text(value.decode("utf-8", "replace") if isinstance(value, bytes) else str(value))
        if 4 <= len(shown) <= 120 and re.search(r"[A-Za-z]{3}", shown) and shown not in readable:
            readable.append(shown)
    return {
        "name": name.replace("/", "."), "path": name, "major": major,
        "version": {45: "1.1", 46: "1.2", 47: "1.3", 48: "1.4", 49: "5", 50: "6", 51: "7", 52: "8", 53: "9", 54: "10", 55: "11",
                    56: "12", 57: "13", 58: "14", 59: "15", 60: "16", 61: "17", 62: "18", 63: "19", 64: "20", 65: "21"}.get(major, str(major)),
        "strings": readable[:20],
    }


def main():
    args = parse_args(("ext", "max-entries", "max-bytes"))
    max_entries, max_bytes = unpack.clamp_budgets(int(args.max_entries or 50), int(args.max_bytes or 52428800))
    size = os.path.getsize(args.file)
    with open(args.file, "rb") as handle:
        data = handle.read(MAX_READ)
    identify = {"size": size, "entropy": entropy_of(data[:ENTROPY_SAMPLE]), "parsers": [], "errors": []}
    facts, overlay_start = None, 0
    try:
        facts, overlay_start = pe_facts(args.file, data)
        identify["parsers"].append("pefile")
    except Exception as error:  # pefile raises many types on hostile headers
        identify["errors"].append(f"pefile: {error.__class__.__name__}")
    try:
        other = lief_facts(args.file)
        if other:
            identify["parsers"].append("lief")
            identify["lief"] = {"format": other["format"], "signatures": other.get("signatures", 0)}
            if facts is None:
                facts = other
    except Exception as error:
        identify["errors"].append(f"lief: {error.__class__.__name__}")
    if facts is None:
        # Not a PE or an ELF: libmagic still names it, which is all the report has for a script or a data file.
        identify["magic"] = libmagic(args.file)
        classinfo = None
        if data[:4] == bytes([0xCA, 0xFE, 0xBA, 0xBE]):
            identify["format"] = "class"
            try:
                classinfo = class_facts(data)
            except Exception as error:  # a hostile or truncated pool must not fail the whole pass
                identify["errors"].append(f"classfile: {error.__class__.__name__}")
        finish(args, identify={**identify, "format": identify.get("format", "unknown")}, unwrap=None, dotnet=None, classinfo=classinfo)
    identify.update(facts)
    packers, high = packers_of(facts["sections"], data)
    identify["packers"], identify["highEntropyCode"] = packers, high
    identify["wrapper"] = wrapper_of(facts, data, packers)
    identify["signature"] = signature_status(args.file) if facts["format"] == "pe" else {"status": "not-checked", "detail": "Authenticode applies to PE files."}

    kind = identify["wrapper"]["kind"]
    unwrapped = None
    if kind in UNWRAPPABLE:
        if max_entries == 0 or max_bytes == 0:
            unwrapped = unwrap.result(UNWRAPPABLE[kind], format=kind, stopped="entries" if max_entries == 0 else "bytes")
        else:
            unwrapped = unwrap.unwrap(UNWRAPPABLE[kind], args.file, unpack.destination(), max_entries, max_bytes, label=kind)
    if unwrapped is None:
        # Nothing recognisable as a wrapper: the payload may simply be appended after the last section.
        unwrapped = overlay_payload(args.file, unpack.destination(), max_entries, max_bytes)
    dotnet = None
    if facts.get("dotnet"):
        try:
            dotnet = dotnet_facts(args.file)
        except Exception as error:
            dotnet = {"error": error.__class__.__name__}
    identify["magic"] = libmagic(args.file)
    finish(args, identify=identify, unwrap=unwrapped, dotnet=dotnet)


if __name__ == "__main__":
    main()
