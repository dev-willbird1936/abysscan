# File coverage and interpretation

**A file type recognized by the controller is not necessarily executed.** The report's coverage list is authoritative for that specific upload. These notes describe the implementation in this checkout, not a benchmark of the currently deployed images.

| Input | Intended path | Material limitation |
|---|---|---|
| Python, shell, Node.js and other supported scripts | Run with their available interpreter in a network-disabled gVisor container | A script may fail because an interpreter or dependency is missing; a stopped step is not a clean result. |
| HTML and SVG | Open in the sandbox's headless browser | Network requests are blocked. A page that needs a remote resource or interaction may remain inconclusive. |
| PDFs and Office documents | Extract, render or inspect; some operations are attempted in a sandbox | A document exploiting a specific external application cannot necessarily trigger here. LibreOffice does not prove that a macro executed. |
| Archives and email | Inspect or unpack bounded children, then handle each recognized child separately | Limits on size, depth, entries and job time can stop analysis; consult per-item coverage. |
| Linux ELF | Attempt execution in gVisor, with static evidence as available | In the [retained 2026-10-23 corpus](evidence/detonation-live-corpus-2026-10-23.md), five real ELF jobs crashed and were marked incomplete. |
| Windows PE (`.exe`, `.dll`) | Identify, emulate and statically inspect | Wine is disabled. In the same retained corpus, seven Windows samples remained incomplete; emulation stopped or could not supply their runtime APIs. This is not native Windows execution. |
| Shortcuts, Android bytecode and unrecognized types | Inspect only where possible | No native Windows shell or Android runtime is provided for `.lnk`, `.url` or `.dex`. |
| Files over 10 MB | Static tier only | Upload limit is 100 MB; a static-tier result does not establish runtime behaviour. |

The model writes bounded analysis code and may explain the evidence, but fixed rules assign findings. Results are **observations within the checks that completed**, not a declaration that an unflagged file is safe. Historical fish in the ocean and their training-desktop scenes illustrate known incidents; they are not sandbox results for those historical binaries.

The recorded corpus is a small development sample, not a measured detection-accuracy study. It does not support general false-positive or false-negative rates. The current source and any future rebuilt images need their own runtime verification before their coverage is claimed.
