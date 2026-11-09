# Containment remediation: source-only record

## Status

**Containment corrections, coverage/receipt transparency and the follow-up Wine documentation alignment have completed their scoped source reviews. Final rechecks returned `ACCEPT-CODE-ONLY`. Not accepted for runtime use, release or milestone completion.** The current user instruction prohibits tests. No tests, runtime probes, application imports, builds, installs, Docker or WSL operations are authorized in this session. Source edits and read-only review do not establish runtime containment.

Runner source edits have not been rebuilt into sandbox images in this session. Existing image locks identify earlier builds, not the current edited runner source. Image rebuilding, lock refresh and runtime acceptance remain separate pending work; do not claim the new runner guards are active in those earlier images.

The inspected Git baseline is `master` at `dd4141a8c8f72cecc8c324f42b1d25f94e808313`. Existing uncommitted installer changes (`Dockerfile.builder`, `samples/README.md`, `samples/bin/setup-demo.exe`) are preserved and are not part of this remediation.

The prior worker failed before persisting a resumable child session. Its resume attempt was rejected because the session file was missing. A new native workflow uses one source writer and read-only auditors; no CLI fallback was used.

## Source corrections and scoped review

| Area | Required correction | Current evidence |
|---|---|---|
| Wine admission | Explicit approval at both stage and container creation; trusted seccomp and image-verification inputs | Final containment reviewer accepted the named source guards and trusted verification boundaries. Runtime verification remains pending |
| Wine concurrency | Cancellation-aware serialization within one controller process; truthful handling of unconfirmed stop | Final containment reviewer accepted cancellation/deadline handling and unconfirmed-stop quarantine at source level. This does not serialize unrelated host processes; runtime behavior remains unverified |
| AppArmor | Require and inspect `docker-default` when supported; fail closed on unreadable capability data; record unavailable protection honestly | Source correction only; no daemon capability lookup performed |
| Seed path | Close the obsolete unverified argument-builder path | Parent read the retained export: it now throws and directs callers to verified seeding. Existing assertions may need later changes; none were edited or run this session |
| Archive admission | Controller checks for producer ownership, count, cumulative bytes, depth and duplicate paths across all child-producing branches | Final containment reviewer accepted the named controller admission guards at source level. Runtime boundary verification remains pending |
| Child staging | Bounded no-follow opening and consistent guards for shell and Wine paths | Final containment reviewer accepted the shared bounded/no-follow staging contract and admitted-size callers. File races and actual Wine behavior remain unverified |
| Extraction and email | Literal-name extraction, truthful partial/error reporting, attachment budgets checked before decoding beyond allowances | Final archive reviewer accepted lexical local-path normalization with original literal selection names and no-follow guards preserved. Earlier source reads covered extraction/attachment bounds; actual extraction, email decoding and resource behavior remain unmeasured |
| Large wrappers | Preserve budgeted unwrap for static-tier MSI/ASAR without executing the large wrapper | Source reviewers confirmed actual wrapper stops remain explicit and ordinary PE leaves avoid false unwrap-limit evidence. Runtime behavior remains pending |
| Artifacts | Reserve capacity for analysis; bound detonation screenshots; do not silently claim success after output rejection | Final trace/artifact reviewer accepted quota accounting, explicit failure fields and removal of destructive artifact-only coverage emissions at source level |
| Rule engine | Executable creation alone must not trigger `second-stage`; attempted execution evidence is also required | Parent and final containment reviewer read the normalized-path attempted-execution conjunction. The separate download-followed-by-run branch remains unchanged; verdict behavior was not executed |

Reading existing tests for caller contracts is permitted. Their assertions have not been run or changed in this session; any compatibility updates remain separate pending work.

## Writer handoff

The writer reports targeted source corrections in fourteen files: `containers.mjs`, `stages.mjs`, `chain.mjs`, `jobs.mjs`, `runner-result.mjs`, `receipts.mjs`, `findings.mjs`, `unwrap.mjs` and runner `unpack.py`, `wine_run.py`, `identify.py`, `run.sh`, `runnerlib.py`, `unwrap.py`.

The first independent review round is complete:

- Containment: `ACCEPT-CODE-ONLY`, with stale caller assertions and runtime evidence still pending.
- Archive handling: `CHANGES` for ordinary PE leaves receiving incorrect unwrap-limit signals and accepted relative archive names conflicting with canonical-file opening.
- Trace/artifact handling: `CHANGES` for suppressed root trace overrides and artifact-rejection coverage events replacing the existing execution coverage.

The corrective writer made seven targeted replacements in four already-modified files: `chain.mjs`, `jobs.mjs`, `stages.mjs` and runner `unpack.py`. The four reported regressions are corrected in source: ordinary PE leaves retain null unwrap results without false limit evidence; local extraction read paths are lexically normalized without changing literal selection names; root trace overrides remain callable; artifact rejection no longer replaces execution coverage or adds an undocumented step.

All three fresh final reviewers returned `ACCEPT-CODE-ONLY`, with no new issues found in their requested scopes:

| Final review | Bound artifact | Scope |
|---|---|---|
| Archives | `no-tests-corrections/recheck-archives.md` | Leaf/wrapper disposition and canonical local reads with literal/no-follow protections |
| Trace/artifacts | `no-tests-corrections/recheck-trace-artifacts.md` | Root overrides, refused children, coverage preservation, quotas and explicit failure fields |
| Containment | `no-tests-corrections/recheck-containment.md` | Corrections and the named approval, verification, serialization, seeding, child-admission and rule-engine guards |

The parent then read the corrected source seams and performed read-only Git inspection: no changes under `tests/`, no staged paths and the same HEAD. These are source/repository observations, not passing test evidence. Scoped reviewer acceptance does not certify the entire working tree, deployed images or runtime containment.

Known compatibility and evidence limits:

- Existing tests and fixtures were intentionally not changed or run. Seed-builder, Wine approval/AppArmor, child-size, producer-path and admission-limit expectations may be stale.
- The new `--source-size` contract requires matched controller and runner versions. Current source changes are not present in rebuilt images.
- No-follow file opening does not authenticate child contents: same-length regular files remain mutable on the writable home volume.
- Whole-directory extraction tools still rely on existing container resource limits before retention checks; the implementation does not establish streaming per-entry extraction for every tool.
- The MIME parser remains non-streaming. The new attachment checks are source-only and unmeasured.
- The Wine queue protects one controller process, not unrelated host processes using the same UID. Measurement-dependent syscall tightening was deferred rather than guessed.

## Coverage and receipt transparency: scoped source review complete

Two pre-existing transparency gaps were corrected separately from the four containment regressions:

- Private terminal reports now retain each item's coverage. The UI retains grouped item/parent records plus its flat compatibility list, replaces repeated item updates in place, and renders authoritative report coverage without requiring earlier SSE coverage. Older reports without coverage retain the legacy fallback. No new event or execution step was added.
- Receipt presentation now uses “Host canary unchanged” rather than an unqualified whole-host claim, includes an explicit canary-only limitation, and shows supplied Wine notes plus recorded runtime/AppArmor facts. Missing protection remains unknown; unavailable AppArmor is described as no protection. Backend approval and completion gates were not changed.

The coverage and containment-invariant reviews returned `ACCEPT-CODE-ONLY`. The receipt/privacy review found no implementation defect in its inspected seams but requested a two-document Wine-isolation correction. That correction is now complete: all three fresh rechecks returned `ACCEPT-CODE-ONLY`, resolving the reported documentation finding.

| Final documentation recheck | Bound artifact | Observed scope |
|---|---|---|
| Wine/source claims | `no-tests-doc-alignment/recheck-wine-doc-claims.md` | Default gVisor, conditional runc Wine, weaker evidence and historical/current boundaries |
| Unmodified code | `no-tests-doc-alignment/recheck-unmodified-code.md` | Source-text comparison of jobs/UI state/report against pre-pass copies; no differences observed |
| Approval/proof wording | `no-tests-doc-alignment/recheck-approval-proof-wording.md` | Unchanged active safety policy and explicit pending upload/Wine/spend/publication/test decisions |

The parent also read the implemented source seams. The code preserves token-private reports and text-only rendering; coverage is not used to authorize execution or determine verdicts. Source inspection and text comparisons do not verify SSE behavior, DOM rendering, visual/accessibility behavior, arbitrary uploads or runtime containment. Existing exact-headline/report-schema assertions remain unchanged and may be stale. No tests were run.

## Dependency and redistribution gaps

The dependency audit is read-only and reports these unresolved release issues:

- `runner/requirements.txt` and `runner/static-requirements.txt` have exact versions but no artifact-hash enforcement. The analyse recipe also lacks a complete transitive dependency lock.
- Playwright's npm integrity lock does not by itself authenticate its separately downloaded Chromium shell.
- Several APT compiler, runtime and support packages remain unversioned. Signed repositories are not equivalent to project-level artifact-hash locks or a retained repository snapshot.
- Selected image notices do not establish a complete licence and corresponding-source inventory. Node/binwalk notices, Python/browser transitives and exact Wine corresponding-source references need closure.
- `images.lock.json` records local image IDs. Runtime identity checks are useful, but those IDs are not registry manifest digests or signed build provenance.

Do not invent checksums or claim that these gaps are closed. `THIRD-PARTY.md` and `TOOLS.md` now distinguish requirements, planned components, recipe evidence and unresolved packaging.

The completed official-metadata research adds concrete findings, not an installed or verified lock:

- Detonate's declared target is CPython 3.11; analyse/collect declare CPython 3.12. Linux amd64 is inferred from downloaded tool choices but not enforced or inspected.
- Published dependencies identify `flare-capa` → `ida-settings` → `ida-hcli` → `pip>=25.2`; static cleanup removes pip. The final declared graph is therefore unresolved. Retention or deliberate graph revision needs a separate source/security decision, not silent dependency omission.
- `lznt1==0.2` and `red-black-tree-mod==1.22` publish only source distributions. Speakeasy is installed from a local verified-archive source directory. A blanket wheel-only or hash-mode switch cannot close these source-build boundaries; build requirements and generated-wheel identities remain unknown.
- The researcher inspected official metadata for 83 distinct existing pins and transcribed 31 selected published artifact digests, including a 14-distribution analyse candidate. Those facts are not resolved compatibility, byte verification, a complete lock or signed source-to-image provenance.
- Official metadata associates pinned Unicorn 1.0.2 with CVE-2021-44078, and pinned setuptools 80.9.0 with a macOS source-distribution advisory. Runtime applicability was not assessed; an engine advisory does not prove escape from the outer container. No reproduction was followed or run, and no silent version replacement was made.
- Primary licence/source lookups produced a recipe-derived inventory candidate. Node/binwalk/PowerShell notice packaging, exact Wine source-package mapping, Chromium notices and complete Python/APT/image closures remain open. No actual image inventory or redistribution compliance is established.

The authoritative `dependency-lock-metadata.md` and `licence-source-metadata.md` reports retain source URLs, candidate selections, provenance limits and blocked sidecar reads. No source repository files were changed by those researchers, and no execution was scheduled.

The later notice-candidate integrity audit accepts the JSON only as unverified recipe-derived data. Before reuse as a complete candidate record, split Speakeasy's separate Dockerfile source-install provenance from the requirements file, include the stated XLMMacroDeobfuscator/pyOneNote exclusions, preserve the blanket-download-verification contradiction, and clarify Wine Mono's absent-versus-allowed-policy wording. These are recorded non-blocking candidate corrections; no corrected or verified inventory is claimed.

## Documentation corrections completed

`README.md`, `SPEC.md`, `SPEC-SIMPLE.md`, `VISION.md` and `USER-DECISIONS.md` now distinguish partial implementation, earlier run evidence, the current no-tests restriction and pending acceptance. The plain-English document no longer promises safe execution or treats an unchanged host canary as proof about the entire server.

## Continuation references

- Current goal: `mv2wcgxm-9x7l6g`. The direct user instruction is **"dont do any tests for this session"**; retrieve omitted goal requirements after compaction, but do not treat older test commands as renewed authorization.
- Completed first native workflow: `9880c169-f8eb-4191-827b-11f3cdb3426a`. Its bound `no-tests-containment/` artifacts contain the writer report, two scouts and three independent reviews.
- Completed corrective native workflow: `98433e39-be29-4102-9203-821c56fa201f`; latest retained correction writer: `7c905dda-eb1e-4f12-b101-6cc2bbb516c6`. Its bound `no-tests-corrections/` artifacts contain the writer, two contract scouts and three final scoped reviews. Inspect current status before any later resume; use the latest returned run identity, not an older writer.
- Completed release-metadata workflow: `8c66c004-3054-4c1a-b538-c66793abd072`. Its bound `no-tests-release-metadata/` reports contain official dependency-lock and licence/source candidates plus the decision-message action review. No repository changes or gap closure are claimed.
- Completed transparency workflow: `67ce90d0-35ae-46f0-8edf-f210a4b7a201`; latest retained writer: `4d599ce0-3029-4369-bdd9-96458666beeb`. Coverage and containment-invariant reviews are `ACCEPT-CODE-ONLY`; the receipt/privacy implementation review reported no defect but requested the Wine documentation correction subsequently completed under workflow `5cac4e82-37d3-42b8-9133-51ccc54c2c0a`. Outputs are bound under `no-tests-transparency/`; no runtime acceptance is implied.
- Completed documentation-alignment workflow: `5cac4e82-37d3-42b8-9133-51ccc54c2c0a`; latest retained writer: `ac6c3e4b-adbf-4a29-b46e-6eb6afa6108b`. The two-document correction and all three fresh final rechecks are complete; the rechecks returned `ACCEPT-CODE-ONLY`. Bound outputs include the recipe-derived, unverified notice candidate under `no-tests-doc-alignment/`.
- Textual pre-pass copies of SPEC, DESIGN and the three transparency source files were captured under `no-tests-transparency/pre-doc-alignment-2026-10-10T23-04-28-079Z/`. The initial generated SPEC copy was truncated by the read tool; it was replaced with a complete four-page capture before the writer made project edits. These copies support scoped source-text comparison, not whole-repository byte identity.
- Completed final read-only evidence workflow: `831cac7c-6561-42dc-8d3a-349bb23d9995`. Its `acceptance-readiness.md` supports the named-user-blocker alternative, not full milestone completion. `notice-candidate-integrity.md` accepts only an unverified recipe-derived candidate with non-blocking data corrections; `slack-action-review.json` allowed the exact reviewed decision update. Outputs are bound under `no-tests-final-evidence/`.
- Native completion notifications provide the authoritative output references. Do not replace the workflow with a CLI/foreground fallback, or use test runs to recover context. Do not stage or commit the existing changes without authorization.

## Project update

A fresh read-only action review allowed the exact text-only source-remediation update. Its missing output artifact was recovered through the same native subagent protocol without re-judging or executing the action. The update was then queued for `vultr-phishing-sandbox`; the receipt is pending, not proof of delivery. The message explicitly preserves the no-tests restriction, earlier image builds and closed approval gates.

A second fresh action review allowed the exact scoped source-review decision update. That message was also queued with a pending receipt; it reports the four corrected regressions and reviewer scopes while retaining stale fixture, dependency/licence, earlier-image and user-approval limitations. Neither queue receipt establishes delivery.

A third fresh action review allowed the exact completed coverage/receipt/Wine-wording source decision update. It was queued with a pending receipt, explicitly preserving the no-tests restriction, older images, stale fixture contracts, engineering gaps and missing user approvals. Delivery is not established.

## Gates still closed

The safety amendment is unapproved. Upload/sample execution, Wine activation, public resources, paid deployment and publishing remain gated. The direct no-tests instruction prevents the current goal's acceptance-test condition from being established this session. Only the user can change that authorization or approve the pending operational decisions; older goal test commands are not permission to execute them now. The independent final readiness audit confirms that these are valid named user-only blockers under the goal's stop condition. The same no-tests/safety blockers have remained through consecutive goal continuations while source corrections, documentation and metadata work proceeded.

Engineering release work also remains open: complete target-specific artifact/source-build locks, the static-pip dependency decision, browser/APT input closure, per-image licence/corresponding-source packaging and matched rebuilt controller/runner images. This report does not claim those tasks are complete or that they are all user-only blockers. No milestone is marked complete on the strength of source-only reviews.
