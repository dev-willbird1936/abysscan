# Third-party licences

This file records third-party code, tools, fonts and art used or proposed for the project, with their recorded obligations. It is not yet a complete installed-component or redistribution-compliance inventory. The licence for the project's own code is set separately (SPEC §15.6).

Sources: [`deploy/detonation/TOOLS.md`](deploy/detonation/TOOLS.md) (upstream checks), [`docs/evidence/licence-check/REPORT.md`](docs/evidence/licence-check/REPORT.md) (including its decisions of 2026-10-08), `ui/abyss/` notice and provenance files, and `desktop-comparison/win11-final/`.

## 1. Detonation tools (sandbox images)

The table includes both approved candidates and tools named in current image recipes. Planned entries are marked below. Each released image must carry the required licence texts and corresponding-source references under `/usr/share/doc/detonation-ocean/` (REPORT decision 7); complete per-image packaging has not been established. Version-pin and dependency-integrity gaps remain open.

| Tool | Licence | Obligations |
|---|---|---|
| Speakeasy 1.6.1 (pinned) | MIT | Keep the MIT notice. Its repository holds four decoy PE files of unverified provenance; check them before shipping. |
| Unicorn (Speakeasy dependency) | GPL-2.0 (COPYING); bindings reported as BSD | GPL-2.0 text and source offer. The engine and binding split is not verified. |
| capa, capa-rules | Apache-2.0 | Apache-2.0 notice |
| file / libmagic 5.44 (`libmagic1`) | BSD-2-Clause | Identification of every uploaded file, description and MIME type. |
| python-magic 0.4.27 (`python3-magic`) | MIT | Calls libmagic from the runner (`runnerlib.libmagic`). |
| oletools (olevba, rtfobj) | BSD-2-Clause; MIT for officeparser code in olevba | Keep `LICENSE.md` and per-file headers |
| pdfid, pdf-parser | Public domain (author statement); pdf-parser includes an MIT-style notice | Keep the notice in `pdf-parser.py` |
| pefile | MIT | MIT notice |
| LIEF | Apache-2.0 | Apache-2.0 notice |
| LnkParse3 | MIT | MIT notice |
| olefile | BSD-2-Clause | Reads the OLE container of an Outlook `.msg` (oletools uses it too). `extract-msg` (GPL-3.0) was removed from the image: the attachment streams are read directly with olefile instead, which keeps GPL code out of the runtime. |
| Playwright and Chromium | Apache-2.0 (Playwright); Chromium BSD-style and others | Apache-2.0 notice; pin both versions. Chromium's third-party notice list has not been read. |
| PowerShell 7 | MIT | MIT notice |
| OpenJDK 17 (`default-jre-headless`) | GPL-2.0 with Classpath exception | Shipped: a `.class` upload or a class unpacked from a jar runs on the JVM. GPL-2.0 text and source offer. |
| QEMU user-mode (`qemu-user-static`) | GPL-2.0 | Runs i386, ARM, AArch64, MIPS, PowerPC and SPARC binaries the sandbox kernel cannot execute (gVisor has no 32-bit compatibility). GPL-2.0 text and source offer required. |
| PHP CLI 8.2 (`php-cli`) | PHP-3.01 | Runs `.php` uploads. Keep the PHP licence notice. |
| Ruby 3.1 (`ruby`) | Ruby licence (BSD-2-Clause style) or GPL-2.0, chosen by the distributor | Runs `.rb` uploads. Keep the Ruby licence file. |
| Lua 5.4 (`lua5.4`) | MIT | Runs `.lua` uploads. MIT notice. |
| bzip2 (`bzip2`) | bzip2-1.0.6 (BSD-like) | Decompresses `.bz2` members and streams. Keep the licence text. |
| zstd (`zstd`) | BSD-3-Clause for the CLI and library; GPL-2.0 for some bundled programs | Decompresses `.zst` members and streams. Keep the BSD notice. |
| xz-utils | Public domain (xz, xzdec, lzmainfo); LGPL-2.1 for liblzma | Decompresses `.xz` members and streams. LGPL notice for liblzma. |
| glibc 32-bit runtime (`libc6:i386`) | LGPL-2.1 | Needed for a 32-bit sample run under qemu-i386. LGPL notice and source offer. |
| libstdc++ 32-bit (`libstdc++6:i386`) | GPL-3.0 with GCC Runtime Library Exception | Same reason. Keep the exception notice. |
| zlib 32-bit (`zlib1g:i386`) | Zlib | Same reason. Keep the notice. |
| 7-Zip | LGPL with unRAR restriction; BSD-3-Clause for some files | LGPL source offer. The unRAR restriction bars using the code to rebuild a RAR encoder. |
| Xvfb (X.Org xserver) | MIT/X11 and other notices in COPYING | Keep COPYING |
| Wine | LGPL-2.1 | LGPL source offer. Wine's own DLLs only; no Microsoft redistributables (decision 4). |
| Wine Mono (planned; not installed by the current Wine recipe) | Mixed: MIT X11, LGPL, GPL with exception, MSPL (FNA parts) | Ship COPYING if included. Package-specific obligations remain to be checked. |
| LibreOffice | MPL-2.0 | MPL notices and source for MPL files. Third-party components are not listed. |
| Mono runtime (`mono-runtime`) | LGPL-2.1 for the runtime libraries, MIT for the compiler and class libraries it ships | Confirmation on 2026-10-23: Debian 12 `mono-runtime` 6.8.0.105. The runtime is used only to execute managed .NET assemblies inside the detonation container; no Mono source is modified or linked into our code. Notices: `/usr/share/doc/mono-runtime/copyright` in the image. |
| Node.js | MIT | Full LICENSE file |
| Python 3 | PSF-2.0 (some parts 0BSD) | PSF notice |
| innoextract | zlib | zlib notice. Upstream unmaintained since 2025-02-06; ships with a stale-upstream note (decision 2). |
| UPX | GPL-2.0 with UPX exception | GPL-2.0 text and source offer |
| osslsigncode | GPL-3.0-or-later with OpenSSL linking exception | GPL-3.0 text and source offer; keep the exception |
| pyinstxtractor | GPL-3.0 | GPL-3.0 text and source offer. Use this, not pyinstxtractor-ng (decision 2). |
| @electron/asar | MIT | MIT notice |
| dnfile | MIT | MIT notice |
| YARA | BSD-3-Clause | BSD-3-Clause notice |
| signature-base (YARA rules) | Detection Rule License 1.1 | Keep author attribution, a link to the rule set and the DRL text. Drop rules whose meta licence differs. Never use v2.0 or earlier (decision 5). |
| binwalk v3 | MIT | MIT notice. Use v3 only. |
| androguard (planned; absent from current recipes) | Apache-2.0 | Apache-2.0 notice if shipped |
| CFR (planned; absent from current recipes) | MIT | MIT notice if shipped |

### Pinned in the M4b build (`Dockerfile.detonate`, `Dockerfile.wine`)

Direct tool-download recipes contain SHA-256 verification gates; npm installs use integrity-locked dependency graphs. Signed APT repositories and version-only Python pins are different trust mechanisms, not universal project artifact-hash locks. Analyse-image transitives, Python artifact hashes, the separate Playwright browser download and several APT support-package pins remain unresolved. Selected notices are copied into the images, but the complete per-image licence/source-offer inventory is still pending.

No tests, downloads, builds or runtime checks were performed for the current source-only audit. Source verification gates are not evidence that downloaded bytes were checked in this session.

| Tool | Pin | Note |
|---|---|---|
| UPX | 5.2.1, static `amd64_linux` release | `LICENSE` and `COPYING` copied. Used only for `upx -d`. |
| innoextract | git `6e9e34e` (2025-02-06, the last upstream commit), built from source | Reads Inno Setup up to 6.3.3. Debian's 1.9 stops at 6.0.5. Neither reads Inno Setup 6.4 or later; such an installer is a failed unwrap step. innoextract does not expose `[Run]` entries. |
| osslsigncode | Debian 12 package 2.5-4 | |
| pyinstxtractor | commit `815d31cf` | Run with the image's Python; parts are inspect-only. |
| @electron/asar | 4.3.1 with the lock file's integrity hashes | Its eight packages are MIT or BlueOak-1.0.0. Parts are inspect-only. |
| binwalk | 3.1.0, built with `cargo install --locked` | The Rust toolchain stays in the build stage. |
| capa, capa-rules | 9.4.0 | Run in its own virtualenv with a rule cache built at image build time. **Without the FLIRT library signatures:** they raised its peak memory from 223 MB to 868 MB on a 14 KB program, over the 512 MB container limit. |
| YARA (yara-python), LIEF, dnfile, pefile | 4.5.4, 1.0.0, 0.18.0, 2024.8.26 | Pinned in `runner/static-requirements.txt` with every dependency. |
| signature-base | commit `94a1c48d` | Compiled at build time by `runner/yara_build.py`. Rules whose meta licence is not the Detection Rule License 1.1 are dropped (44 of 5 954 in this build; one file does not compile and is skipped). `ATTRIBUTION.txt` and the DRL text ship with the compiled rules. |
| WineHQ (stable) | 11.0.0.0~bookworm-1, from the WineHQ apt repository (key checked by SHA-256) | LGPL-2.1. The image keeps `runner/wine_NOTICE.txt`. **Wine Mono is not installed** (too large for the image); .NET programs are read statically with dnfile and are not run. |

### Not shipped

- **Fall-back to Inspect, or not used:** ViperMonkey, XLMMacroDeobfuscator, pyOneNote, p7zip (replaced by 7-Zip), cabextract (7-Zip covers CAB), pyinstxtractor-ng, Qiling (decision 3), and the YARA-Forge rule bundle (decision 5).
- **Unchecked, so excluded until checked (decision 10):** Detect It Easy (Qt and database licences), box-js (npm dependency licences), msitools (upstream COPYING), ILSpy and ilspycmd (NuGet licence and .NET runtime).

## 2. Desktop shells

| Component | Licence | Status |
|---|---|---|
| Win11React code (`desktop-comparison/win11-final/`) | CC0 1.0 Universal (`desktop-comparison/win11-final/LICENSE`) | Code is cleared. |
| Win11React artwork (`public/img`: icons, wallpapers, logos) | No licence in the upstream repo | **Not cleared, and withheld from this repository** (`desktop-comparison/win11-final/public/img/` and the built copy `desktop-comparison/previews/win11-final/img/`). It includes icons named after Microsoft products and Windows-style wallpapers; CC0 on the code does not cover it. Without it the Windows desktop built from a clone shows missing icons and wallpapers. The live demo site serves its own copy. |
| Font Awesome 6.6.0 (`@fortawesome/*` in the Windows shell) | Icons CC BY 4.0; fonts SIL OFL 1.1 | Attribution required. The 6.x licence was read; the 7.x licence was not, and 7.x is not used. |
| macOS shell (`desktop-comparison/make-macos-final.mjs`, `previews/macos-final/`) | Owned by the project owner | Published with this repository under its MIT licence. Its build input (`desktop-comparison/sources/kimi-macos27/`) is not in this repository, so the built result in `previews/macos-final/` is included but `make-macos-final.mjs` cannot be re-run from a clone. |

Public source availability and AI-assisted creation do not establish a licence for third-party material, which is why the Win11React artwork is withheld until its status is settled.

Other npm dependencies of the desktop shells are not audited in this file.

## 3. Renderer libraries (`ui/abyss/`)

Notices are in the named files. Retain each upstream licence text.

| Library | Licence | Notice file | Copyright |
|---|---|---|---|
| three.js | MIT | `ui/abyss/LICENSE-three.txt` | © 2010–2026 three.js authors |
| GSAP | GreenSock standard "no charge" licence | `ui/abyss/LICENSE-gsap.txt` | © 2008–2026 GreenSock |
| Lenis | MIT | `ui/abyss/LICENSE-lenis.txt` | © 2024 darkroom.engineering |
| postprocessing | zlib | `ui/abyss/LICENSE-postprocessing.txt` | © 2015 Raoul van Rüschen |
| Dioramas engine | MIT | `ui/abyss/LICENSE-dioramas.txt` | © 2026 Blendi. Includes local Detonation Timeline modifications (`ui/abyss/NOTICE.txt`). |

## 4. Fonts

| Font | Licence | Notice file | Copyright |
|---|---|---|---|
| Jersey 10 (`ui/abyss/fonts/Jersey10-Regular.woff`) | SIL OFL 1.1 | `ui/abyss/fonts/OFL-Jersey10.txt` | © 2023 The Soft Type Project Authors (https://github.com/scfried/soft-type-jersey) |

`AbyssPixelArrows.woff` was drawn for this project (`ui/abyss/NOTICE.txt`), so it is not third-party.

## 5. Art

| Asset | Licence or terms | Record | Obligations |
|---|---|---|---|
| Anglerfish 3D model (Dioramas project) | CC BY 4.0 | `ui/abyss/textures/abyss/legend/provenance.json`; footer of `ui/abyss/index.html` | The footer credits the Dioramas project and the licence. It does not name the model's creator or link to the licence. Check this against CC BY 4.0 before public deployment. |
| Skin, rock and sediment textures (ambientCG Leather037, Rock035, Ground054) | CC0 1.0 | `ui/abyss/index.html` footer | None |
| RetroDiffusion sprites (family stills, menu legend, Detonation hackathon set) | Provider terms apply; no open licence is claimed | `ui/abyss/pixel/provenance.json`, `licence` fields | The provider terms are not in this repository. Do not treat these sprites as CC0. |
| Pixel normal maps (`ui/abyss/pixel/normals/`, one per pixel PNG) | Generated with Sprite Fusion Sprite Normals (Hugo Duprez, MIT, https://github.com/Hugo-Dz/spritefusion-sprite-normals); each derives from its sprite, so that sprite's terms apply | `python tools/build-pixel-normals.py` | Loaded by `ui/abyss/pixel-lit.js` and `ui/abyss/retro-pixel.js`. Normal PNGs are data: never colour-convert them. |
| Lit ocean creatures (`ocean-style-prototypes/lit-ocean/`: 30 creature GIFs, 30 depth-colour PNGs, and their normal maps) | Derived from the RetroDiffusion creature animations and the codex depth-colour images, so their provider terms apply; the normal maps come from Sprite Fusion Sprite Normals (MIT) | `python tools/build-lit-ocean-sprites.py`; `lit-manifest.json` links each file to its source hash | Served by `backend/ocean-profiles.mjs` in place of the originals. |
| Flocking model | Inspiration only (wasm-boids by tokachi269, MIT); `ui/abyss/NOTICE.txt` records no copied code | `ui/abyss/NOTICE.txt` | None recorded |
| Procedural creature sculpts, `AbyssPixelArrows.woff`, schooling-fish bitmaps | Project-authored | `ui/abyss/NOTICE.txt` | None |
