# Licence and maintenance evidence (SPEC §14 items 3, 10, 12, 13)

Checked 2026-10-07. Verdicts and the decision list are in [TOOLS.md](../../../deploy/detonation/TOOLS.md).

## 1. Method

- Repo metadata came from the GitHub REST API (unauthenticated), GitHub Atom feeds (`releases.atom`, `commits/<branch>.atom`) and `releases/tag/<tag>` pages. Latest stable tags came from the `releases/latest` redirect.
- Licence text came from `raw.githubusercontent.com`, read in full or by the clauses that decide the licence. Hashes below are the first 12 hex digits of SHA-256 over the fetched bytes.
- Other sources: PyPI JSON, npm registry, NuGet search API, GitLab API (WineHQ, GNOME, freedesktop), Debian copyright files and `packages.debian.org/bookworm`.
- Only metadata and licence text were fetched. No tool archive, binary, rule package, sample or malware was downloaded or run. No credentials were used.
- "Maintained" means a commit or release on or after 2025-10-07.
- Every URL below was read on 2026-10-07.

## 2. Sources

| Tool | Licence text read (URL; sha256/12) | Other metadata read |
|---|---|---|
| Speakeasy | `raw.githubusercontent.com/mandiant/speakeasy/master/LICENSE.txt` (97005b940b06) | `api.github.com/repos/mandiant/speakeasy`; `github.com/mandiant/speakeasy/releases.atom`; `commits/master.atom`; `releases/tag/v1.6.1`, `releases/tag/v2.0.0b8`; `pypi.org/pypi/speakeasy-emulator/json`; `api.github.com/repos/mandiant/speakeasy/git/trees/master?recursive=1` |
| ViperMonkey | `raw.githubusercontent.com/decalage2/ViperMonkey/master/README.md`, "License" section (BSD text; no file hash) | API; `commits/master.atom`; `pypi.org/pypi/vipermonkey/json` returned an HTTP error (treated as not on PyPI) |
| box-js | `raw.githubusercontent.com/CapacitorSet/box-js/master/LICENSE` (65155133e537) | API; `commits/master.atom`; `registry.npmjs.org/box-js` |
| capa | `raw.githubusercontent.com/mandiant/capa/master/LICENSE.txt` (Apache header read; not hashed) | API; `releases.atom`; `commits/master.atom`; `pypi.org/pypi/flare-capa/json` |
| capa-rules | `raw.githubusercontent.com/mandiant/capa-rules/master/LICENSE.txt` (cfc7749b96f6); README badge | API; `releases.atom`; `commits/master.atom` |
| oletools / olevba / rtfobj | `raw.githubusercontent.com/decalage2/oletools/master/LICENSE.md` (558732356f0c); `oletools/rtfobj.py` header | API; `releases.atom`; `commits/master.atom`; `pypi.org/pypi/oletools/json` |
| pdfid, pdf-parser | Source headers of `raw.githubusercontent.com/DidierStevens/DidierStevensSuite/master/pdfid.py` and `pdf-parser.py`. No licence file found in the repo root. | API; `commits/master.atom` |
| pefile | `raw.githubusercontent.com/erocarrera/pefile/master/LICENSE` (b44409c067c6) | API; `releases.atom`; `commits/master.atom`; PyPI |
| LIEF | `raw.githubusercontent.com/lief-project/LIEF/main/LICENSE` (998dc6a9d251) | API; `releases.atom`; `commits/main.atom`; PyPI |
| LnkParse3 | `raw.githubusercontent.com/Matmaus/LnkParse3/master/LICENSE` (f87b93b2508c) | API; `releases.atom`; `commits/master.atom`; PyPI |
| extract-msg (msg-extractor) | `raw.githubusercontent.com/TeamMsgExtractor/msg-extractor/master/LICENSE.txt` (8ceb4b9ee5ad, GPL-3.0 text) | API; `releases.atom`; `commits/master.atom`; PyPI |
| Playwright, Chromium | `raw.githubusercontent.com/microsoft/playwright/main/LICENSE` (45873d00a0dd). Chromium: `chromium.googlesource.com/chromium/src/+/refs/heads/main/LICENSE?format=TEXT` (base64, decoded; not hashed) | API; `releases.atom`; `registry.npmjs.org/playwright`; PyPI `playwright` |
| PowerShell 7 | `raw.githubusercontent.com/PowerShell/PowerShell/master/LICENSE.txt` (7c77a44a8acd) | API; `releases/tag/v7.6.6`; `releases.atom`; `commits/master.atom` |
| OpenJDK | `raw.githubusercontent.com/openjdk/jdk/master/LICENSE` (4b9abebc4338, GPLv2 text); `ADDITIONAL_LICENSE_INFO` (Classpath exception) | API; `releases.atom` |
| 7-Zip | `raw.githubusercontent.com/ip7z/7zip/main/DOC/License.txt` (dac8389b6bc3) | API; `releases.atom`; `commits/main.atom` |
| p7zip | `raw.githubusercontent.com/p7zip-project/p7zip/master/License.txt` (452bed3621e0) | API; `releases.atom`; `commits/master.atom` |
| XLMMacroDeobfuscator | `raw.githubusercontent.com/DissectMalware/XLMMacroDeobfuscator/master/LICENSE` (2ff92ebb4424) | API; `releases.atom`; `commits/master.atom` |
| Xvfb (xserver) | `gitlab.freedesktop.org/xorg/xserver/-/raw/master/COPYING` (MIT/X11 header; not hashed) | GitLab API `projects/xorg%2Fxserver`, `tags`, `commits` |
| Wine | `gitlab.winehq.org/wine/wine/-/raw/master/COPYING.LIB` (LGPL-2.1 text; not hashed) | GitLab API `projects/wine%2Fwine`, `tags`, `commits` |
| Wine Mono | `raw.githubusercontent.com/wine-mono/wine-mono/main/COPYING` (0265443ffc97) | API; `releases/latest` redirect; `releases/tag/wine-mono-11.3.0` |
| LibreOffice | `libreoffice.org/about-us/licenses/` (MPL 2.0 statement). Repo root `COPYING` is GPL-3.0 text (8ceb4b9ee5ad). | `releases.atom` (libreoffice-26.8.1.1); `commits/master.atom` |
| Node.js | `raw.githubusercontent.com/nodejs/node/main/LICENSE` (3ebb7123f4d2) | API; `releases.atom` |
| CPython | `raw.githubusercontent.com/python/cpython/main/LICENSE` (b0e25a78cffb) | `releases.atom`; `commits/main.atom` |
| Detect It Easy (GUI, db) | `raw.githubusercontent.com/horsicq/Detect-It-Easy/master/LICENSE` (be0fe2d727cd); README (no "Qt" match) | API; `github.com/horsicq/Detect-It-Easy/releases` page tags |
| DIE-engine (numbered releases; `diec` build not checked) | `raw.githubusercontent.com/horsicq/DIE-engine/master/LICENSE` (MIT 2012–2026; not hashed) | `releases/tag/3.21`; `commits/master.atom`; `releases` page tags |
| innoextract | `raw.githubusercontent.com/dscharrer/innoextract/master/LICENSE` (7cd6f3bf0c83, zlib text) | API; `releases.atom`; `commits/master.atom` |
| UPX | `raw.githubusercontent.com/upx/upx/devel/LICENSE` (905d4a66d532) | API; `releases/latest` redirect; `releases.atom` |
| msitools | Debian copyright `metadata.ftp-master.debian.org/changelogs/main/m/msitools/msitools_0.101+repack-1_copyright`. Upstream `COPYING`/`COPYING.LIB` not retrieved. | GitLab API `projects/GNOME%2Fmsitools`, `commits`, `tags` |
| osslsigncode | `raw.githubusercontent.com/mtrojnar/osslsigncode/master/LICENSE.txt` (e8ee078b1f25, full text read) | API; `releases/latest` redirect; `releases.atom` |
| cabextract | `cabextract.org.uk/` (GNU GPL statement; 1.11 released 2023-02-24); Debian copyright `metadata.ftp-master.debian.org/changelogs/main/c/cabextract/cabextract_1.9-3_copyright` | — |
| pyinstxtractor | `raw.githubusercontent.com/extremecoders-re/pyinstxtractor/master/LICENSE` (3972dc9744f6, GPLv3 text); README | API; `releases.atom`; `commits/master.atom` |
| pyinstxtractor-ng | `raw.githubusercontent.com/pyinstxtractor/pyinstxtractor-ng/main/LICENSE` (GPLv3 text; not hashed) | `pypi.org/pypi/pyinstxtractor-ng/json`; `pypi.org/pypi/xdis/json`; `raw.githubusercontent.com/rocky/python-xdis/master/COPYING` (GPLv2 text) |
| asar (@electron/asar) | `raw.githubusercontent.com/electron/asar/main/LICENSE.md` (d5af8fc171f6) | API; `registry.npmjs.org/%40electron%2Fasar`; `releases.atom` |
| ILSpy, ilspycmd | `raw.githubusercontent.com/icsharpcode/ILSpy/master/LICENSE` (5527fe802347) | API; `releases.atom`; `azuresearch-usnc.nuget.org/query?q=packageid:ilspycmd` |
| dnfile | `raw.githubusercontent.com/malwarefrank/dnfile/master/LICENSE` (6bd13c3c732c) | API; `releases.atom`; `commits/master.atom` |
| Qiling | `raw.githubusercontent.com/qilingframework/qiling/master/COPYING` (6f04ae8364d0, GPLv2 text); README | API; `releases.atom`; `commits/master.atom`; `pypi.org/pypi/qiling/json`; rootfs repo `api.github.com/repos/qilingframework/rootfs/git/trees/master?recursive=1`; `raw.githubusercontent.com/qilingframework/rootfs/master/README.md` |
| Unicorn | `raw.githubusercontent.com/unicorn-engine/unicorn/master/COPYING` (GPLv2 text; not hashed) | `releases.atom` (2.1.4, 2025-09-11); `commits/master.atom`; `pypi.org/pypi/unicorn/json` |
| YARA | `raw.githubusercontent.com/VirusTotal/yara/master/COPYING` (efdabc1c1f65; clause 3 read) | API; `releases.atom`; `commits/master.atom` |
| YARA-Forge | Tool: `raw.githubusercontent.com/YARAHQ/yara-forge/master/LICENSE` (3972dc9744f6, GPLv3 text); README; `docs/architecture.md`. Packages: `yarahq.github.io/` (example package header lists Elastic License 2.0) | API; `releases.atom` |
| signature-base | `raw.githubusercontent.com/Neo23x0/signature-base/master/LICENSE` (8a959b2413d0, DRL 1.1 full text read); README licence section | API; `releases.atom` (v2.0, 2021-08-03); `commits/master.atom` |
| binwalk (v3) | `raw.githubusercontent.com/ReFirmLabs/binwalk/master/LICENSE` (479efc8ae548) | API; `releases.atom` (v3.1.0, 2024-10-31); `commits/master.atom`; `pypi.org/pypi/binwalk/json` (2.1.0, 2015) |
| androguard | `raw.githubusercontent.com/androguard/androguard/master/LICENCE` (0d542e0c8804) | API; `releases.atom`; `commits/master.atom`; PyPI |
| CFR | `raw.githubusercontent.com/leibnitz27/cfr/master/LICENSE` (d0b36fd26541) | API; `releases.atom`; `commits/master.atom` |
| pyOneNote | `raw.githubusercontent.com/DissectMalware/pyOneNote/main/license` (Apache-2.0 text; lowercase file name; not hashed) | API; `pypi.org/pypi/pyOneNote/json` (0.0.2, 2023-03-19); `commits/main.atom` |
| Win11React (code) | `raw.githubusercontent.com/blueedgetechno/win11React/master/LICENSE` (CC0 1.0 Universal, 7048 chars; not hashed); README | API `repos/blueedgetechno/win11React/contents/public/img`, `.../public/img/icon`, `.../public/img/wallpaper`; `commits/master.atom` (2024-08-11); `releases.atom` (v0.2.9, 2022-06-09) |
| Font Awesome | `raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/LICENSE.txt` (icons CC BY 4.0; fonts SIL OFL 1.1) | `github.com/FortAwesome/Font-Awesome/commits/6.x.atom` (2025-08-21); `releases.atom` (7.3.1, 2026-07-15) |
| Python, Node, base versions | `packages.debian.org/bookworm/<package>` | — |
| Local repo | `desktop-comparison/README.md` line 25; `desktop-comparison/win11-final/public/img/` listing | `docs/desktop-parity/win11react.md` §8 (an internal note, not upstream evidence) |

## 3. Item 3: SPEC §6.1 tools

- Most permissive tools are clean: capa and capa-rules (Apache-2.0), pefile (MIT), LnkParse3 (MIT), oletools (BSD-2-Clause; its olevba code also carries an MIT notice), PowerShell 7 (MIT), Playwright (Apache-2.0), and pdfid/pdf-parser (public domain by the author's statement).
- Speakeasy (MIT) is maintained (commit 2026-10-07). The PyPI build is 1.5.11 from 2022-06-08, so pin from GitHub. Its `unicorn==1.0.2` dependency is GPL-2.0 (Unicorn COPYING); a newer GitHub build may pin a different Unicorn, which was not checked.
- ViperMonkey (BSD-2-Clause) has had no commit since 2024-04-25 and is not on PyPI, so it falls back to Inspect.
- box-js (MIT) is maintained: npm 1.9.29 published 2026-07-02, matching the last commit. npm dependency licences were not audited.
- OpenJDK is GPL-2.0 with the Classpath exception (`ADDITIONAL_LICENSE_INFO`). The mainline tag jdk-28+18 is not a chosen line; Debian bookworm ships OpenJDK 17.0.20.1.
- 7-Zip (LGPL, with the unRAR restriction for Rar files) is maintained (26.04). p7zip (last commit 2025-05-20, last release 2024-10-17) is not, so it is replaced by 7-Zip.
- Node.js 22 is named by the SPEC, but the latest upstream line checked is 26.11.0. The 22.x line was not checked. Debian bookworm ships 18.20.4, which does not meet the SPEC.
- Xvfb is maintained by commits (2026-10-06), but the tags are development snapshots (26.0.99.903). COPYING is MIT/X11 plus other notices.
- Version gaps: PyPI and Debian versions lag upstream (speakeasy-emulator 1.5.11 from 2022, qiling 1.4.6 from 2023, binwalk 2.1.0 from 2015, playwright 1.63.0 vs GitHub 1.64.0, Debian bookworm pins listed in TOOLS.md decision 8).

## 4. Item 10: compatibility tools and Windows DLLs

Findings by tool:

- Detect It Easy: the repo and DIE-engine are both MIT (verified). The `diec` console and the db licence are unverified. The DIE README has no Qt mention, so the Qt dependency is unverified. Detect-It-Easy's GitHub releases are database and 2022 Beta entries; the numbered engine releases are on DIE-engine (3.21, 2026-04-21).
- innoextract: zlib text read in full. The last commit is 2025-02-06 and the last release is 1.9 (2020-08-09), so it falls back to Inspect.
- UPX: GPL with the special exception that "free usage of UPX for all executables, including commercial programs" is granted. The exception is for compressed output; the upx binary itself carries GPL obligations.
- osslsigncode: GPL-3.0-or-later with the OpenSSL linking exception (full text read).
- msitools: Debian copyright says LGPL-2.1+ (with GPL-2+ and GPL-3+ helper scripts). The upstream COPYING could not be retrieved from the GitLab raw or API paths tried.
- cabextract: the site says GNU GPL and gives 1.11 (2023-02-24). The GPL version is not stated, and no commit date was found, so it is not maintained by the 12-month rule. SPEC §6.6 already lists 7z for CAB files.
- pyinstxtractor (GPL-3.0, verified) can ship with a note. pyinstxtractor-ng (GPL-3.0, verified) depends on xdis 6.3.0, which PyPI and COPYING give as GPL-2.0. Whether xdis is "GPL-2.0-only" or "or later" was not verified, so combining the two stays blocked.
- asar (MIT), ILSpy (MIT), dnfile (MIT): verified. ilspycmd's NuGet licence expression and the .NET runtime licence were not checked.
- Qiling (GPL-2.0, COPYING verified): see the Windows DLL conclusion below.
- YARA engine: BSD-3-Clause (clause 3 read).
- YARA-Forge: the tool is GPL-3.0, but the packaged rules carry per-source licences. The site's example package header lists "Elastic License 2.0" for the Elastic source. The site also says some sources are awaiting a licence decision. The package files were not downloaded, so whether ELv2 rules are in the current packages is unverified.
- signature-base: DRL 1.1 since 2021-08-13 (README; LICENSE text read in full). The DRL requires keeping author attribution, a link to the rule set and the DRL text when the rules are shared. Rules whose meta names another licence are excluded from DRL. The v2.0 release (2021-08-03) is CC BY-NC and must not be used.
- binwalk: MIT for v3 (LICENSE read). The PyPI package is v2.1.0 from 2015 with licence UNKNOWN; Debian bookworm ships 2.3.4 (v2). Use v3 only.
- androguard: Apache-2.0 (LICENCE read). The PyPI classifier says "Other/Proprietary", which conflicts with the text; the LICENCE file governs.
- Unicorn (dependency of Speakeasy and Qiling): COPYING is GPL-2.0. PyPI classifies the package as BSD for bindings. The engine/binding split was not verified.

### Windows DLLs and Qiling (conclusion)

- SPEC §6.6 says Windows targets need Windows DLLs, which cannot be redistributed, and that the team must "use only DLLs we are licensed to use, or skip Qiling for PE".
- The Qiling rootfs repo (`qilingframework/rootfs`, master; 781 files) contains 0 `.dll` files. Its Windows trees (`x8664_windows` 16 files, `x86_windows` 24 files) hold 34 PE files (.exe and .sys test samples) and no .dll files.
- The Qiling README says "Example binaries and rootfs files must be downloaded separately". No licence for any Windows DLL was found in the repos read.
- Conclusion: Qiling cannot run PE files in the image without Windows DLLs that cannot be redistributed. PE falls back to Inspect (decision 3). Microsoft's EULA was not fetched; the conclusion rests on SPEC §6.6 and on the absence of any licensed DLL source.
- Mach-O: the rootfs repo has `x8664_macos/System/Library/Kernels/kernel.development`, `x8664_macos/usr/lib/libobjc.A.dylib` and `x8664_macos/kext/SuperRootkit.kext.zip`. The first two are Apple system files whose redistribution rights were not checked. The third is a test archive that was not downloaded or used. Mach-O therefore falls back to Inspect too (decision 3).
- Speakeasy's repo holds four PE files under `speakeasy/winenv/decoys/` (`default_driver.sys`, `default_exe.exe`, amd64 and x86). Their names are not Microsoft DLL names, but their provenance was not verified. They sit inside the repo under MIT.

## 5. Item 12: Wine, Wine Mono, LibreOffice

- Wine: COPYING.LIB is LGPL-2.1 (text read). The "or later" wording was not checked. The latest upstream tag is wine-11.19 (2026-10-02); Debian bookworm ships 8.0~repack-4. The SPEC prefix must hold only Wine's built-in DLLs. Any native Microsoft DLLs, or any winetricks step that downloads them, would bring a separate licence question (decision 4).
- Wine Mono: COPYING lists mixed licences. Most parts are LGPL or MIT X11. ICSharpCode.SharpZipLib is GPL with an exception. FNA parts are MSPL. The TimeZoneInfo Android code is Apache-2.0 and not used. Whether the GPL or MSPL parts are in the built package was not checked. Ship COPYING with the package.
- LibreOffice: the official licence page states MPL 2.0. The repo root COPYING is GPL-3.0 text (the same hash as the msg-extractor LICENSE). The verdict follows the official page. Third-party components were not listed.
- SPEC §6.1 also names Xvfb: its licence is MIT/X11 plus other notices (COPYING, gitlab).

## 6. Item 13: Win11React artwork

- Code: `LICENSE` in the upstream repo is CC0 1.0 Universal (text read, 7048 chars). This covers the author's code.
- Artwork: the upstream README says "This project is **not in anyway affiliated with Microsoft**". It names "Icons - fontawesome" for part of the icon set. It states CC0-1.0 for the project. It does not name a licence or source for any Windows icon or wallpaper. Its `public/img/icon` folder has 63 entries, including `cortana.png`, `defender.png`, `edge.png`, `excel.png`, `discord.png`, `buyme.png`. Its `public/img/wallpaper` folder has `ThemeA` to `ThemeD`, `dark`, `default`, and `lock.jpg`.
- The source tree `desktop-comparison/win11-final/public/img/` (the Windows 11 build input) has Windows and Microsoft product icons (`defender.png`, `edge.png`, `teams.png`, `outlook.png`, `oneDrive.png`, `onenote.png`, `store.png`, `settings/Windows Update.webp`) and wallpaper folders including `ThemeC` and `ThemeD`.
- `desktop-comparison/README.md` line 25 says: "Included libraries, fonts, Microsoft branding and artwork retain their own rights."
- CC0 cannot license artwork the author does not own. No upstream statement gives a licence for these icons or wallpapers, so the artwork is not cleared for redistribution.
- An internal note in `docs/desktop-parity/win11react.md` §8 names "Bloom" wallpapers. The upstream folder names do not match that, so the note is not used as evidence.
- Font Awesome: icons CC BY 4.0 and fonts SIL OFL 1.1 (6.x LICENSE.txt). Attribution is required. The 7.x licence text was not read.
- Verdict: code ships with a note. Artwork falls back (replace it before public deployment, decision 6). SPEC §14 item 13 stays open until that is done.

## 7. Unverified or not checked

- DIE: the Qt dependency of `diec`, and the licence of the signature db.
- pyinstxtractor-ng: the xdis version clause and the GitHub commit date.
- ilspycmd: NuGet licence expression and publish date; .NET runtime licence.
- box-js: npm dependency licences.
- msitools: upstream COPYING (only Debian's copyright file was read).
- cabextract: GPL version, last commit date.
- Speakeasy: provenance of the four decoy PE files; licence of the Unicorn version a newer build pins.
- Wine: "or later" wording; Wine Mono: whether GPL or MSPL parts are in the built MSI.
- Playwright Chromium: the third-party notice list (only the Chromium LICENSE header was read).
- Qiling rootfs repo: licence (no LICENSE file was looked for).
- Node 22.x line status; CPython stable line; OpenJDK LTS line.
- Font Awesome 7.x licence; the 6.x "code" licence line.
- Microsoft EULA for Windows DLLs (not fetched).

## 8. Limits

- The GitHub API was used unauthenticated. Several repos were checked through Atom feeds only.
- No package contents were downloaded (YARA-Forge rule packages, Speakeasy or Qiling wheels, Win11React built files, Debian packages). Claims about what those packages contain come only from the repo files and the site text quoted above.
