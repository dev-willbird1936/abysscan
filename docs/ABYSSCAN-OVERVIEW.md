# Abysscan

**A fun, visual way to understand what files do—and how malware behaves.**

## What it does

- **Searches a known threat** and plays it as a short training quest on a simulated Windows or macOS desktop.
- **Collects evidence:** file changes, launched programs and attempted network connections.
- **Uses Vultr AI** to write analysis code and explain findings.
- **Uses fixed rules—not AI opinions—to determine the verdict.**
- **Shows the result as an ocean:** files are fish, harmful behaviours are creatures, and deeper water means greater harm.

## The five depths

| Depth | Meaning |
|---|---|
| **Sunlight** | No harmful behaviour observed |
| **Twilight** | Suspicious or inconclusive |
| **Midnight** | Steals information |
| **Abyss** | Takes control |
| **Trench** | Encrypts, destroys or spreads |

## What users can explore

- **The ocean:** animated fish, creatures and accumulated activity.
- **The Bestiary:** explanations of creatures, behaviours and historical examples.
- **Reports:** findings, evidence, analysis coverage, recommended actions and cleanup receipts.
- **Desktop simulations:** Windows and macOS versions of the same fictional computer, with **21 app categories**.
- **Quests:** 59 historical `.scene` scripts play as training games (story card, flags, grade). File upload is retired on the public site.

Switching desktops preserves the shared files, messages, windows and scenario progress.

## Scene Studio

An easy editor for creating guided scenarios:

1. Choose an example.
2. Edit a readable `.scene` script.
3. Check it for errors.
4. Preview on either desktop.
5. Download the script to reuse it.

Scripts can create fictional emails, files, pages, processes and visible effects. **They never execute programs or change real files.**

Studio uses the same pixel theme as the main app. It currently supports guided steps, not editing arbitrary branching scenarios.

## Technology and safeguards

- **Vultr Cloud Compute** hosts the application.
- **Vultr Serverless Inference** provides optional AI analysis.
- **Node.js, Docker and gVisor** handle orchestration and isolation.
- Network restrictions, resource limits, synthetic data, cleanup checks and host-canary checks reduce risk.
- Public ocean records use aggregate information rather than uploaded filenames or hashes.

## Important limits

- Recognising a file type does not mean it ran successfully.
- Windows files are emulated or inspected; Wine is disabled.
- The desktop simulations are **not real Windows/macOS execution environments**.
- Historical and scripted scenes are **illustrations, not observed malware results**.
- “No harmful behaviour observed” does **not** mean “guaranteed safe.”

## Current status

**Live** at [demo.abysscan.com](https://demo.abysscan.com), public, no login. Threat search is on; public file upload is retired (`POST /api/jobs` 410). All 59 historical quests are deployed.

The live VM is a selective deploy, not an exact copy of this repository. Scene Studio stays local unless enabled.

### Local links

- [Scene Studio](http://127.0.0.1:4175/scene-studio)
- [macOS desktop](http://127.0.0.1:4189/)
- [Windows desktop](http://127.0.0.1:4191/)
