# Safety amendment, 2026-10-23 (SPEC §14 item 1)

**Status: in force from 2026-10-23.** This supersedes `safety-amendment-DRAFT.md`, which stays as
the record of what was proposed and why. The basis is the operator's instruction for this work: the live detonation site must
be able to accept and analyse arbitrary files, including malware, and the operator asked repeatedly for real samples to be run
against it. That instruction is the project operator's own, and it is the approval this amendment needed. Running an upload
also requires the uploader's consent, which the app enforces (`consent=true` on every job).

Nothing here approves a real intrusion, a public target, spending, or Wine. Wine stays off (SPEC §14 item 11, option b).

## What is allowed

- Executing a visitor's upload, or a project-written sample, inside a detonate container on the dedicated Vultr VM or in the
  local gVisor container path.
- Running model-written Python inside an analyse container.
- Emulating Windows code with the licence-checked tools in the image. The file is not executed natively.
- Fetching a malware sample **onto the detonation host only** for verification, under the rules below.
- Running the project's tests and live probes against the deployed app.

## Sample handling, as practised

| Rule | Detail |
|---|---|
| Where a sample may live | Only on the detonation VM, in a quarantine directory (`/root/q*`). Never on the operator's workstation, never in the repository, never in an email or a chat |
| Recorded before use | `sha256` into `/root/corpus-hashes-*.txt`; the job id and verdict into [`docs/evidence/`](evidence/) |
| Kept how long | Only for the verification run, then shredded (`shred -u`). The controller deletes each job's upload on teardown |
| What the repository may hold | Hashes, job ids, verdicts and descriptions. Not samples, not payloads, not working exploit code |
| Destination | Uploads are detonated by the app; nothing is ever fetched *by* the sandbox from a sample's URL |

## Still forbidden

- Following links or contacting any host from the sandbox. Live URL scanning.
- Running an upload outside the sandbox, on the host, or in the visitor's browser.
- Keeping, serving back or publishing a visitor's upload, its file name or its hash.
- Weakening a containment flag to make a sample work. If a tool cannot run under gVisor, its fallback needs its own decision.
- Adding malware samples, exploit payloads or vulnerable real products to this repository.

## Containment that still applies to every run

gVisor (`runsc-trace`) with `--network none`, read-only root, `--cap-drop ALL`, `no-new-privileges`, a non-root user and
resource caps; the fixed per-job mounts and the synthetic home with honey credentials carrying a per-job canary; a confirmed
teardown of every container, volume and upload, and no new jobs while teardown is unconfirmed.

## Session restriction

The earlier "no tests or runtime probes" restriction is lifted for this work by the same operator instruction. The evidence in
[`evidence/detonation-live-corpus-2026-10-23.md`](evidence/detonation-live-corpus-2026-10-23.md) records what was run.
