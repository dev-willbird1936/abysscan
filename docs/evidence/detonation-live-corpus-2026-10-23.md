# Live corpus run, 2026-10-23

Every row below is one job on the deployed app (`https://demo.abysscan.com`, VM `<vm-ip>`, build `d12fdd6e85f330a8`),
recorded from `GET /api/jobs/<id>` after the job finished. The samples are not kept: only this record, the hashes and
the job ids survive, and each job's upload was deleted by the controller on teardown.

The two real families come from theZoo (`Linux.Mirai.B`, `Linux.Wirenet`); the files are named by their sha256 inside
the archive, so the hash is the archive's own label. The crafted files are the project's own test fixtures.

| File | sha256 (first 16) | Size | Job | Depth | Family | Complete | Findings |
|---|---|---|---|---|---|---|---|
| `update-agent.deb` | `c57b715300cfd8ec` | 646 | `j-33b10fc27402c364` | midnight | theft-surveillance | yes | steal-credentials |
| `invoice.msg` | `a4ff187051e95d83` | 7168 | `j-52fe98984d1816bd` | midnight | theft-surveillance | yes | steal-credentials |
| `carrier.rtf` | `d8d140362b32c211` | 172 | `j-f219298ac1ff00ad` | midnight | theft-surveillance | yes | steal-credentials |
| `app.jar` | `be90794ef76ca420` | 1927 | `j-9669065399ee2639` | midnight | theft-surveillance | yes | steal-credentials |
| `packaged.class` | `46fcfcb0133ce5e2` | 1384 | `j-f14592714ad48238` | midnight | theft-surveillance | yes | steal-credentials |
| `shell.php` | `57e71d2e8c6ff823` | 149 | `j-eb3fd8479545afd5` | midnight | theft-surveillance | yes | steal-credentials |
| `drop.rb` | `fc308207e0d188d3` | 188 | `j-e8610c46d06070e1` | midnight | theft-surveillance | yes | steal-credentials |
| `loader.lua` | `1e8c2bd407374bb0` | 211 | `j-8cbd5a73f87732c7` | midnight | theft-surveillance | yes | steal-credentials |
| `invoice.docx` | `d62fdcf7c4fd3638` | 693 | `j-0771c3e2af4d3e93` | twilight | file-changes | yes | — |
| `invoice.lnk` | `ef3ebc1629341ade` | 283 | `j-f2c3355c947b7e18` | twilight | drifter | yes | — |
| `invoice.url` | `a8176581025d8255` | 66 | `j-6661afdbe36bbdfe` | twilight | drifter | yes | — |
| `classes.dex` | `32c2a0fc5bfb11a7` | 220 | `j-e24df14fe40b460c` | twilight | drifter | yes | — |
| `notice.eml` | `dc0ae22c16d5c55d` | 1441 | `j-baca5e323a04fca4` | sunlight | file-changes | yes | — |
| `budget.docm` | `f630f63444b6b242` | 3223 | `j-9f9cba650d59eaf8` | twilight | disguise | yes | — |
| `report.pdf` | `c3df2fd40ad21ff3` | 781 | `j-bba9b2704cb1a1fe` | twilight | disguise | yes | — |
| `mirai-arm.bin` | `f60b29cfb7eab3ae` | 283000 | `j-7af091150518226f` | abyss | coordinated-abuse | no | remote-control |
| `wirenet-i386.bin` | `35ff79dd456fe305` | 64400 | `j-4e1cb8d2d3a2a1ac` | twilight | file-changes | yes | — |

## What each row proves

- `update-agent.deb` — a Debian package whose `postinst` reads the honey credential: deb → `control.tar.zst` → tar → script executed. The
  nested stream no longer stops on the compression-ratio guard, and the family is `theft-surveillance`, which is what the finding says.
- `invoice.msg` — an Outlook message: the attachment stream is extracted and the script inside runs.
- `carrier.rtf` — an RTF carrier: `objdata` is extracted with oletools and the script runs; the carrier also reports the embedded object.
- `app.jar` / `packaged.class` — Java: the class (packaged as `com.acme.Runner`) is named from its constant pool and runs on the JVM.
- `shell.php`, `drop.rb`, `loader.lua` — the three interpreters added this session all run and read the honey credential.
- `invoice.docx` — template injection: the package points at `http://203.0.113.44/template.dotm`, reported as `suspicious`.
- `invoice.lnk`, `invoice.url` — a shell link and an Internet Shortcut: the target and the URL are named. Neither can be followed on
  Linux, and both are reported as inspected-only (complete coverage) rather than as an analysis gap.
- `classes.dex` — a Dalvik header: version, class/method counts and the API groups (`Runtime.exec`, `SmsManager`) are read.
- `notice.eml`, `budget.docm`, `report.pdf` — the project's own fixtures: an email, a macro document and a PDF, all unchanged in behaviour.
- `mirai-arm.bin` (ARM ELF, 283,000 bytes) — **Abyss**, `remote-control`, 40 `connect` items and `daemonised`. It runs under qemu-arm
  inside gVisor, which has no ARM support of its own. `complete: false` is the trace item cap being reached, which the report says.
- `wirenet-i386.bin` (i386 ELF, 64,400 bytes) — Twilight with its `WIFIADAPT` drop as a `file-write` trace item. It runs under qemu-i386.
- `dropper.exe` (the repository's own `samples/bin/runkey.exe` with a zip appended) — **Midnight**, `steal-credentials`: the appended
  payload is unpacked and its script runs. `complete: false` because the PE emulation stopped at `msvcrt._ismbblead`, which the
  coverage step says. A second job on the same file after the replay fix (`j-79e4ba4807795679`) completed with no replay error.

## Fixes this run found, and their regression tests

| Defect | Evidence it was real | Fix | Test |
|---|---|---|---|
| A job's family was taken from the diff and trace, so a credential stealer was labelled `extortion-destruction` | job `j-d2405998a6d4144d` in the first audit | only findings vote for the family; weak evidence steers the neutral name below Midnight | `detonation-findings.test.mjs` "the family is named by the findings" |
| An ordinary `.deb` reported `complete: false` | the same job, and every package holding a text file | a type that is identified and inspected is `inspected-only`, not `unsupported-type`; only unidentified content keeps the verdict incomplete | `detonation-children.test.mjs`, `detonation-m4b-jobs.test.mjs` |
| Every job logged `replay: DesktopWorldError` | 23 lines in three hours of the service log | each patch is validated against the world the earlier patches left, not the bare seed | `detonation-replay.test.mjs` "publish judges each patch against the world the earlier ones left" |


## How to reproduce

```bash
# from the VM, with the file already quarantined there (never on the workstation)
curl -sS -F "file=@$FILE;filename=$NAME" -F consent=true -H "Origin: http://127.0.0.1:4173" http://127.0.0.1:4173/api/jobs
# then GET /api/jobs/<jobId> with `Authorization: Bearer <token>` from the same response
```

`tools/quarantine-fetch.sh` and `tools/detonate-sample.sh` wrap those two steps, verify the hash and shred the file afterwards.

## Run of 2026-10-23 (after the family and completeness fixes, plus managed .NET execution)

Seventeen jobs (deb, html and rtf re-run after the Mono deployment, so their ids are the later ones), every one retained in this directory as `job-<tag>.json` (the whole `GET /api/jobs/<id>` response, including the
coverage steps, the evidence list and the container receipt). The five real ELFs were unpacked from `ytisf/theZoo` archives
(password `infected`) into `/root/ev/w3` on the VM; each row names the size and the libmagic line the job recorded.

| Tag | Job | File | Depth | Family | Complete | Signals | Findings |
|---|---|---|---|---|---|---|---|
| deb | `j-98dc4aec90e1ac1e` | crafted `update-agent.deb` (646 B) | midnight | theft-surveillance | yes | - | steal-credentials |
| msg | `j-df21ae6964646e4f` | crafted `phish.msg` | midnight | theft-surveillance | yes | - | steal-credentials |
| rtf | `j-c978c011ca178607` | crafted `carrier.rtf` | midnight | theft-surveillance | yes | other-suspicious | steal-credentials |
| jar | `j-5faa57db2735c8a5` | crafted `app.jar` | midnight | theft-surveillance | yes | - | steal-credentials |
| php | `j-2660218c504c06fb` | crafted `shell.php` | midnight | theft-surveillance | yes | unknown-hosts | steal-credentials |
| html | `j-15adec6e8c2f4688` | crafted `invoice.pdf.html` | midnight | deception | yes | type-mismatch, unknown-hosts | fake-login, exfil-attempt |
| docx | `j-70085964fb6cc907` | crafted `invoice.docx` (remote template) | twilight | file-changes | yes | type-mismatch, other-suspicious | - |
| docm | `j-63ccb934a1ff70eb` | crafted `budget.docm` | twilight | disguise | yes | exploit-unproven, other-suspicious | - |
| dotnet | `j-673edfa8f2794db1` | crafted `dotnet-check.exe` (.NET, mcs 6.8) | twilight | disguise | yes | unsigned, other-suspicious | - |
| lnk | `j-3107059e141f93ac` | crafted `invoice.lnk` | twilight | unclassified | yes | other-suspicious | - |
| url | `j-5affb78c26a39da1` | crafted `invoice.url` | twilight | unclassified | yes | other-suspicious | - |
| dex | `j-8beab78f618b8e7c` | crafted `classes.dex` | twilight | unclassified | yes | other-suspicious | - |
| real1 | `j-e07a5e213d74cd7f` | `03254e62…` 179 383 B, ARM EABI4 ELF | twilight | network | no | unknown-hosts, incomplete | - |
| real2 | `j-b1c9bf2e23112440` | `18884936…` 317 530 B, x86-64 static ELF | twilight | unclassified | no | incomplete | - |
| real3 | `j-a9021638770bd98d` | `ee21378a…` 1 438 592 B, x86-64 FreeBSD ELF | twilight | unclassified | no | incomplete | - |
| real4 | `j-eee9c3d07f2e4fe7` | `f5ca1277…` 129 908 B, i386 ELF | twilight | unclassified | no | incomplete | - |
| real5 | `j-a7febb38e2b2127e` | `cfca38c4…` 278 198 B, i386 ELF, UPX | twilight | disguise | no | obfuscated, incomplete | - |

What the run changed, and why each change was made:

- **Managed .NET runs (job `j-673edfa8f2794db1`).** The `emulate` step now executes a managed assembly under `mono-runtime` 6.8:
  the step says `Executed under Mono; exit code 0`, the address the program printed is reported as program-controlled text, and
  the file it wrote (`Desktop/dotnet-report.txt`) arrives as `diff added` from the collector. Before this, a `.NET` file was read
  statically and the step said "not run".
- **A crash is not a clean run (jobs real1–real5).** All five real ELFs died on `SIGSEGV` (exit 139) inside the hardened runtime,
  which is normal for old botnet code under gVisor. The run step now reports `died on SIGSEGV`, the item carries
  `emulation-stopped / run-crashed`, and the verdict is `complete: false` with the `incomplete` signal. The same jobs previously
  read `sunlight / drifter / complete: true` and the statement "No harmful behaviour observed" — a claim about a run that never
  finished. real1 still shows the DNS `connect` the program managed before it faulted.
- **The staged copy is not a self-copy (jobs msg, rtf, php, html, docm).** The collector counted the runner's own staging path
  (`Downloads/sample.<ext>`) as the sample copying itself, so an ordinary document reached Midnight. `RUNNER_COPY_NAME` excludes
  the staging names; `self-copy` now fires only on a copy the program made somewhere else.
- **An unclassified result is not a drifter (jobs lnk, url, dex, real2–real4).** A file that raised a signal but no finding used
  to borrow the Sunlight "Drifter" creature; above Sunlight it is now the `unclassified` family, and the display resolves the
  attack names (`theft-surveillance`) as well as the family keys.
- **The crafted `.deb` completes (job `j-98dc4aec90e1ac1e`).** It is `complete: true`, family `theft-surveillance`, finding
  `steal-credentials` — the two defects the auditor named (an `unpack-ratio` stop on an ordinary nested `data.tar.zst`, and a
  family of `extortion-destruction` despite a single credential finding) are gone.

## Windows corpus, 2026-10-23 (real PE samples, never on the workstation)

Seven real Windows samples were fetched and unpacked on the VM (`ytisf/theZoo`, zip password `infected`), then detonated through
the live API. Every job's full response is retained as `job-<tag>.json`. Nothing ran outside a container: receipts show `runsc`,
`network: none`, read-only root and uid 10001.

| Tag | Sample | Size | sha256 | Job | Depth | Family | Complete | What the run reached |
|---|---|---|---|---|---|---|---|---|
| tesla | Win32.AgentTesla (VB.NET stealer) | 460 800 | `699ec052…` | `j-42c29d28b2ddc858` | twilight | disguise | no | Mono executed it and stopped at `System.IO.FileNotFoundException: Microsoft.VisualBasic` — that assembly is non-free and not packaged in Debian, so a VB.NET sample cannot run under Mono. Reported as `mono-failed`, not as a quiet run. |
| cridex | Win32.Cridex (native, UPX) | 86 528 | `e369031b…` | `j-36155982ee9b5d88` | twilight | disguise | no | UPX unwrapped, the unpacked part emulated: `InitCommonControls`, then `Stopped at SHLWAPI.StrChrA after 0.4 s`. |
| zeus | Win32.ZeusVM (native, packed) | 414 720 | `b04637c1…` | `j-663f8a554987463b` | twilight | disguise | no | Packed: obfuscation signal, emulation stopped. |
| zerocleare | Win32.ZeroCleare (native, 4 files) | 66–332 KB | `17cc26eb…`, `44100c73…`, `f07b0c79…`, `becb74a8…` | `j-1d9392b88075f2d3` | twilight | disguise | no | Static only; emulation stopped on the first API. |
| luckycat | Win32.LuckyCat | 213 711 | `ff301b32…` | `j-a54785831b7ef7ff` | twilight | disguise | no | Type mismatch (data named `.exe`), static only, emulation stopped. |
| kerrdown | Win32.KerrDown (3 DLLs) | 111 616 | `eac776c3…` | `j-78dbb23f1609ff07` | twilight | disguise | no | DLL: exports read, emulation stopped. |
| mylobot | Win32.MyLobot (LokiBot) | 180 224 | `f4ba5e8f…` | `j-07e979434e3f69f2` | twilight | disguise | no | Static only; emulation stopped. |

**Measured conclusion.** With Wine switched off, every native Windows PE ends at "inconclusive": Speakeasy emulates a few
instructions and stops on the first shell or driver-level API, and the report says so instead of claiming a clean file. Two
concrete levers would change this, in order of cost:

1. `DETONATION_WINE_RUNC=true` (USER-DECISIONS #2, option a): the `detonation-ocean/wine` image (WineHQ 11.0 WoW64, Xvfb,
   `WINEDEBUG=+pid,+loaddll,+process,+relay`, `wine_evidence.py`) already exists and the chain already knows how to run
   `msiexec /i`, `cmd /c`, `wscript` and a bare `.exe`; it is gated behind that flag because those jobs run on `runc` with
   `deploy/detonation/seccomp-wine.json` instead of gVisor, and they lose the syscall trace (evidence becomes relay log + home diff
   + screenshots).
2. A VB.NET runtime assembly. `Microsoft.VisualBasic` is non-free and absent from Debian (`libmono-microsoft-visualbasic10.0-cil`
   has no candidate in bookworm), so VB.NET samples cannot run under Mono at all; Wine's built-in mono would cover them.
