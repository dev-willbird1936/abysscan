# lablab submission form: copy-ready text

## Submission Title
Abyss: Threat Simulator on Vultr

## Short Description
Search a famous malware and play it as a short training game: do an ordinary job on a simulated Windows or Mac desktop, get hit by a replay of the real attack, flag the signs and get graded. Built on Vultr with sandboxed analysis and Serverless Inference.

## Long Description
Most people only meet malware as headlines, so they never learn what an attack looks like while it happens. Abyss turns famous malware into short training games. Each one plays as a quest on a simulated Windows or macOS desktop. A story card says who you are and what you were doing when the malware really struck, such as matching supplier statements with 9 of 10 done. You do one normal task first, so you see what normal looks like. Then the lure arrives as more of the same work: an invoice, a video, an update. The desktop shows what the malware really did, in the OS's own windows: the unknown-publisher warning, Task Manager rows, start-up items, locked files, a hijacked home page. You flag what looks wrong, and a grade card shows which real signs you found, why each mattered and how to stay safe.

A guide shows the next step and follows you. Take the safe path and it says so, then shows what happens to someone who doesn't. Search a known threat such as Zeus and Abyss shows whether it is in the ocean yet; if not, DeepSeek V4.1 Flash on Vultr Serverless Inference writes the quest script, which is checked before it plays.

Containment comes first. One Vultr Cloud Compute VM runs the controller. Anything that executes runs in throwaway gVisor containers with no network, no secrets and hard limits. Fixed rules, not the model, decide verdicts, and every container is destroyed and confirmed gone. In the demo, a test script's fork bomb stops at the process limit and the host stays unchanged.

For security-awareness trainers, IT helpdesks and small teams with no security staff. Threat search is live: known families open their quest; a new name is researched and written into a scene.

## Participation Mode
Online

## Event Tracks
Blast Radius Zero

## Categories
Cybersecurity, AI Agents, Education / Training (pick whichever the form offers)

## Technologies Used
Vultr Cloud Compute, Vultr Serverless Inference, DeepSeek, Docker, gVisor, Node.js, Caddy, Playwright

## Files to upload
- Video: `detonation-ocean-demo.mp4`
- Slides: `detonation-ocean-slides.pdf`
- Cover image: `cover-16x9.png`

## Application (step 3)

### GitHub Repository
https://github.com/dev-willbird1936/abysscan

### Demo Application Platform
Vultr (or Other, if Vultr isn't listed)

### Demo Application URL
https://demo.abysscan.com

### Additional Information
Live on one Vultr Cloud Compute VM (Los Angeles), no login needed. Try: search "Zeus" or "WannaCry" (already in the ocean) and play the quest on Windows or macOS. A new name is checked by Parallel Decisions, researched by Parallel Search and written into a scene by DeepSeek V4.1 Flash on Vultr Serverless Inference; queries that ask for build instructions are refused. Public file upload is retired (`POST /api/jobs` 410). Containment: the sandbox pipeline still runs selected files in throwaway gVisor containers (no network, read-only root, no capabilities, non-root, no secrets, memory/CPU/process/time limits); each run ends with a receipt confirming every container was removed and the host canary unchanged. Model: DeepSeek V4.1 Flash on Vultr Serverless Inference writes analysis code and scene scripts; fixed rules, not the model, decide verdicts. All scenarios are fictional illustrations based on public reporting, not observed malware.

Public repository: https://github.com/dev-willbird1936/abysscan (current search, quests and retired uploads).
