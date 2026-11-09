# Contributing

This is a hackathon snapshot of Abysscan (Detonation Ocean). The live demo is https://demo.abysscan.com.

## Before you send a change

- Read [`README.md`](README.md) and [`THIRD-PARTY.md`](THIRD-PARTY.md). Win11React artwork is withheld; do not add it.
- Do not commit API keys, `.env` files, or real malware samples.
- British spelling in user-facing copy.
- Tests: `node --test "tests/*.test.mjs"` (Docker, gVisor and Playwright tests skip on a bare machine).

## What belongs here

Fixes and honest documentation for search, quests, the ocean UI, and the sandbox *containment story* (the pipeline is in the tree; public upload is off).

Do not add a public upload UI, exploit payloads, or instructions for building malware. Threat search already refuses queries that ask for build instructions.

## Licence

MIT. See [`LICENSE`](LICENSE). Third-party terms stay in [`THIRD-PARTY.md`](THIRD-PARTY.md).
