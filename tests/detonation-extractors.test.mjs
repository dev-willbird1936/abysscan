// Runs the runner's new parsers with the host Python against fixtures built in the test itself (no Docker, no image).
// Pins the extractors the live checks exercised: Java-free LNK/DEX readers in identify.py, the RTF and MSG unpackers in
// unpack.py, and the OOXML external-reference scan in office.py. Cases whose third-party module is absent are skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = join(dirname(fileURLToPath(import.meta.url)), '..', 'deploy', 'detonation', 'runner');
const python = ['python3', 'python'].find(name => spawnSync(name, ['--version']).status === 0);

// The driver builds its own fixtures so the test needs no binary blobs and the format is readable here.
const DRIVER = String.raw`
import json, sys, zipfile
sys.path.insert(0, sys.argv[1])
dest = sys.argv[2]
import os
import identify, unpack, office

B = chr(92)

def lnk(target, arguments, workdir):
    header = bytearray(0x4C)
    header[0:4] = bytes([0x4C, 0, 0, 0])
    header[4:20] = bytes([0x01, 0x14, 0x02, 0x00, 0, 0, 0, 0, 0xC0, 0, 0, 0, 0, 0, 0, 0x46])
    flags = 0x2 | 0x10 | 0x20 | 0x80          # HasLinkInfo, HasWorkingDir, HasArguments, IsUnicode
    header[0x14:0x18] = flags.to_bytes(4, "little")
    local = target.encode("latin1") + bytes([0])
    info = bytearray()
    info += (0x1C + len(local) + 1).to_bytes(4, "little") + (0x1C).to_bytes(4, "little") + (0x1).to_bytes(4, "little")
    info += (0).to_bytes(4, "little") + (0x1C).to_bytes(4, "little") + (0).to_bytes(4, "little")
    info += (0x1C + len(local)).to_bytes(4, "little") + local + bytes([0])
    body = bytearray()
    for value in (workdir, arguments):
        body += len(value).to_bytes(2, "little") + value.encode("utf-16-le")
    return bytes(header) + bytes(info) + bytes(body)

def dex():
    strings = [b"Ljava/lang/Runtime;->exec", b"Landroid/telephony/SmsManager;", b"getDeviceId", b"Lcom/example/Main;"]
    header = bytearray(0x70)
    header[0:8] = b"dex" + bytes([10]) + b"035" + bytes([0])
    body = bytearray()
    offsets = []
    base = 0x70 + 4 * len(strings)
    for value in strings:
        offsets.append(base + len(body))
        body += bytes([len(value)]) + value + bytes([0])
    header[0x38:0x3C] = len(strings).to_bytes(4, "little")
    header[0x3C:0x40] = (0x70).to_bytes(4, "little")
    header[0x58:0x5C] = (12).to_bytes(4, "little")
    header[0x60:0x64] = (3).to_bytes(4, "little")
    return bytes(header) + b"".join(offset.to_bytes(4, "little") for offset in offsets) + bytes(body)

def rtf():
    payload = b"#!/bin/sh\ncat /home/dana/.aws/credentials > /tmp/rtf-leak\n"
    hexed = payload.hex()
    return ("{" + B + "rtf1" + B + "ansi{" + B + "object" + B + "objemb{" + B + "*" + B + "objclass script}{" + B + "*"
            + B + "objdata " + hexed + "}}").encode("latin1")

def msg():
    # A one-stream compound file: header, FAT, directory, then the attachment bytes (kept above the 4096 mini cutoff).
    payload = b"#!/bin/sh\ncat /home/dana/.aws/credentials > /tmp/msg-leak\n" + b"# pad\n" * 900
    size = len(payload)
    sectors = (size + 511) // 512
    header = bytearray(512)
    header[0:8] = bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
    header[0x18:0x1C] = bytes([62, 0, 3, 0])
    header[0x1C:0x20] = bytes([0xFE, 0xFF, 9, 0])
    header[0x20:0x22] = (6).to_bytes(2, "little")
    header[0x2C:0x30] = (1).to_bytes(4, "little")
    header[0x30:0x34] = (1).to_bytes(4, "little")
    header[0x38:0x3C] = (4096).to_bytes(4, "little")
    header[0x3C:0x48] = (0xFFFFFFFE).to_bytes(4, "little") + (0).to_bytes(4, "little") + (0xFFFFFFFE).to_bytes(4, "little")
    header[0x4C:0x50] = (0).to_bytes(4, "little")
    for i in range(1, 109):
        header[0x4C + 4 * i:0x50 + 4 * i] = (0xFFFFFFFF).to_bytes(4, "little")
    fat = bytearray(512)
    fat[0:4] = (0xFFFFFFFD).to_bytes(4, "little")
    fat[4:8] = (0xFFFFFFFE).to_bytes(4, "little")
    for i in range(sectors):
        nxt = 0xFFFFFFFE if i == sectors - 1 else 2 + i + 1
        fat[4 * (2 + i):4 * (2 + i) + 4] = nxt.to_bytes(4, "little")
    def entry(name, kind, child=0xFFFFFFFF, start=0xFFFFFFFE, size=0):
        raw = bytearray(128)
        encoded = name.encode("utf-16-le") + bytes([0, 0])
        raw[0:len(encoded)] = encoded
        raw[0x40:0x42] = len(encoded).to_bytes(2, "little")
        raw[0x42] = kind
        raw[0x43] = 1
        raw[0x44:0x4C] = (0xFFFFFFFF).to_bytes(4, "little") * 2
        raw[0x4C:0x50] = child.to_bytes(4, "little")
        raw[0x74:0x78] = start.to_bytes(4, "little")
        raw[0x78:0x80] = size.to_bytes(8, "little")
        return bytes(raw)
    directory = (entry("Root Entry", 5, child=1) + entry("__substg1.0_37010102", 2, start=2, size=size) + bytes(256))[:512]
    return bytes(header) + bytes(fat) + directory + payload + bytes(sectors * 512 - size)

def docx(path):
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" '
            'Target="http://203.0.113.44/template.dotm" TargetMode="External"/></Relationships>')
    settings = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:attachedTemplate r:id="rId5"/></w:settings>')
    with zipfile.ZipFile(path, "w") as package:
        package.writestr("word/_rels/document.xml.rels", rels)
        package.writestr("word/settings.xml", settings)

result = {}
result["lnk"] = identify.lnk_facts(sys.argv[3]) if False else None
path = sys.argv[3]
open(path, "wb").write(lnk("C:" + B + "Windows" + B + "System32" + B + "WindowsPowerShell" + B + "v1.0" + B + "powershell.exe",
                           "-NoP -W Hidden -EncodedCommand SQBFAFgA", "C:" + B + "Windows" + B + "System32"))
result["lnk"] = identify.lnk_facts(path)
open(path, "wb").write(b"not a link at all")
result["lnk_garbage"] = identify.lnk_facts(path)

open(path, "wb").write(dex())
result["dex"] = identify.dex_facts(open(path, "rb").read())

carrier = rtf()
open(path, "wb").write(carrier)
# The carrier markers are read with no dependency at all; the object reader needs oletools and a POSIX read helper.
from runnerlib import rtf_scan
result["rtf"] = {"markers": [hit["id"] for hit in rtf_scan(carrier)["hits"]]}
if os.name != "posix":
    result["rtf"]["unavailable"] = "posix"
else:
    unpacked = unpack.unpack_rtf(path, dest, 10, 1 << 20)
    result["rtf"]["entries"] = [(e["name"], e["size"]) for e in unpacked["entries"]]
    if unpacked.get("stopped") == "unavailable":
        result["rtf"]["unavailable"] = "oletools"

message = msg()
open(path, "wb").write(message)
unpacked = unpack.unpack_msg(path, dest, 10, 1 << 20)
result["msg"] = {"entries": [(e["name"], e["size"]) for e in unpacked["entries"]], "attachmentBytes": len(message) - 512 * 3}
if unpacked.get("stopped") == "unavailable":
    result["msg"]["unavailable"] = "olefile"

docx(path)
result["ooxml"] = office.ooxml(path)

# A payload appended after the last section of a real PE from the repository's samples.
pe = open(sys.argv[4], "rb").read()
import io as _io, zipfile as _zip
buf = _io.BytesIO()
with _zip.ZipFile(buf, "w") as archive:
    archive.writestr("payload.sh", "#!/bin/sh" + chr(10) + "cat /home/dana/.aws/credentials > /tmp/overlay" + chr(10))
    archive.writestr("pad.txt", "x" * 1500)
appended = buf.getvalue()
open(path, "wb").write(pe + appended)
found = identify.overlay_payload(path, dest, 10, 1 << 20)
open(path, "wb").write(pe)
clean = identify.overlay_payload(path, dest, 10, 1 << 20)
result["overlay"] = {
    "carried": bool(found and found.get("entries")),
    "size": (found or {}).get("size"),
    "appended": len(appended),
    "entries": [(e["name"], e["size"]) for e in (found or {}).get("entries", [])],
    "clean": clean,
}
print(json.dumps(result))
`;

const run_driver = () => {
  const dir = mkdtempSync(join(tmpdir(), 'extractors-'));
  try {
    const script = join(dir, 'driver.py');
    writeFileSync(script, DRIVER);
    const peFixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'bin', 'runkey.exe');
    const done = spawnSync(python, [script, runner, dir, join(dir, 'fixture.bin'), peFixture], { encoding: 'utf8' });
    assert.equal(done.status, 0, `driver failed: ${done.stderr?.slice(0, 400)}`);
    return JSON.parse(done.stdout.trim().split('\n').at(-1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('python is available for the extractor tests', () => assert.ok(python, 'python3 or python must be on PATH'));

test('the runner parsers are importable without the static venv, and each extractor reads what it says it reads', () => {
  const out = run_driver();
  // identify.lnk_facts: LinkInfo local base path, then the string data in flag order.
  assert.equal(out.lnk.target, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(out.lnk.arguments, '-NoP -W Hidden -EncodedCommand SQBFAFgA');
  assert.equal(out.lnk.workingDir, 'C:\\Windows\\System32');
  assert.equal(out.lnk_garbage, null, 'a file without the shell-link magic is not a link');
  // identify.dex_facts: header counts and the API groups read from the string table.
  assert.equal(out.dex.version, '035');
  assert.deepEqual([out.dex.classes, out.dex.methods, out.dex.strings], [3, 12, 4]);
  assert.deepEqual(out.dex.apis.exec, ['Ljava/lang/Runtime;->exec']);
  assert.deepEqual(out.dex.apis.sms, ['Landroid/telephony/SmsManager;']);
  // unpack.unpack_rtf: the carrier markers and the objdata payload as one child.
  // The markers never need oletools, so they are asserted even where the object reader or POSIX is unavailable.
  assert.ok(out.rtf.markers.includes('rtf-embedded-object'), JSON.stringify(out.rtf.markers));
  if (out.rtf.unavailable) assert.equal(out.rtf.unavailable, out.rtf.unavailable === 'posix' ? 'posix' : 'oletools');
  else {
    assert.equal(out.rtf.entries.length, 1);
    assert.equal(out.rtf.entries[0][1], 58, 'the script inside objdata is the child');
  }
  // unpack.unpack_msg: the attachment stream becomes a child above the mini-stream cutoff.
  if (out.msg.unavailable) assert.equal(out.msg.unavailable, 'olefile');
  else assert.deepEqual([out.msg.entries.length, out.msg.entries[0][1]], [1, out.msg.attachmentBytes]);
  // identify.overlay_payload: bytes after the last section that start like a zip become one child; a clean PE has none.
  assert.deepEqual([out.overlay.carried, out.overlay.size, out.overlay.clean], [true, out.overlay.appended, null]);
  assert.deepEqual(out.overlay.entries, [['overlay.bin', out.overlay.appended]]);
  // office.ooxml: an external relationship and the attached template are both seen.
  assert.deepEqual(out.ooxml.external.map(link => link.target), ['http://203.0.113.44/template.dotm']);
  assert.equal(out.ooxml.attachedTemplate, true);
});

test('the runner sources the extractors live in are the ones this test imported', () => {
  assert.ok(readFileSync(join(runner, 'identify.py'), 'utf8').includes('def lnk_facts'));
  assert.ok(readFileSync(join(runner, 'unpack.py'), 'utf8').includes('def unpack_msg'));
  assert.ok(readFileSync(join(runner, 'office.py'), 'utf8').includes('def ooxml'));
});
