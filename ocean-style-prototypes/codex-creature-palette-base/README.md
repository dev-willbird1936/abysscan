# Six recolourable creature bases / 30 depth variants

> **Current page vs legacy.** `index.html` is now the 6×5 evolution grid: 30 depth-coloured candidate stills from `../codex-creature-depth-evolution/depth-colors/` (QVL pass recorded in `evolution-grid-status.json`). Animation playback is pending: no reviewed animation manifest exists, so the grid has no Play controls. Everything below describes the **legacy** flat-palette study and the RetroDiffusion loops, which animate earlier sprites that do not match the evolution forms. They remain available in the page's `Legacy` section (`legacy-archive.js`) and are unchanged. Serve the `ocean-style-prototypes` folder over HTTP (`start-viewer.bat`); `file://` cannot fetch the manifests. See `docs/evidence/evolution-grid-integration.md` and `docs/evolution-depth-grid.md`.

This delivery adds six independent Codex-native base sprites, one per family, and produces 30 offline depth-color PNGs (six families × five tiers) by exact RGB replacement of their semantic primary/secondary/tertiary regions. The six base PNGs are the only new creature generations in this package. The 30 variants keep the same silhouette and alpha within each family. They are local recolour derivatives, not thirty newly generated images and not RetroDiffusion model outputs.

## Palette and workflow

The indexed bases use exact, flat marker colours:

- Primary: magenta `#FF00A8`.
- Secondary: cyan `#00E5FF`.
- Tertiary: lime `#B6FF00`.
- Neutral outline/detail: `#101820`, `#080D10`, `#F4F0D8`.

Each role also has a binary mask: `masks/<family>-<role>.png`. Change one swatch once to recolour its whole semantic region. An offline smoke test swapped all three roles on all six sprites while preserving alpha and neutral details.

`depth-palettes.json` defines five ocean-lighting themes. `tools/apply-codex-depth-palettes.py` makes one exact RGB replacement for each of 30 combinations. It does not change anatomy, generate new creatures or make API calls. This preserves creature identity across depth. Depth represents victim interaction, not severity or monster power.

## Actual RetroDiffusion evidence from the broader creature work

The original `ocean-style-prototypes/retrodiffusion-family-depth-study/manifest.json` records **30 RetroDiffusion still images**, six families × five depth values. Their native files and hash checks remain in that directory. They were an earlier candidate study, not the currently selected/refined 30: `retrodiffusion-family-depth-study/review.md` records that four were kept and 26 required replacement/refinement.

The sibling `ocean-style-prototypes/retrodiffusion-creature-animation/manifest.json` records **six genuine RetroDiffusion animation masters** and 30 locally recoloured family/depth animation exports. That separate, user-authorized $1.50 batch and its untouched native GIFs remain available from its own viewer and ZIP. This base-palette operation made no new RetroDiffusion requests or spend.

Thus the project retains both the genuine earlier RetroDiffusion results and a newly easy-to-recolour set of six bases with **30 coherent still-depth variants**. Do not mislabel the local PNG palette variants as newly generated RetroDiffusion output.

## Files

- `index.html`: current 6×5 evolution grid (30 candidate stills, animation pending), with the legacy table, six source bases and role masks inside `<details id="legacy">`.
- `evolution-grid.js`, `evolution-grid-status.json`: grid join logic and the recorded QVL / animation / integration status. `legacy-archive.js`: the legacy section's loader.
- `*-base-native.png`: untouched native Codex originals.
- `indexed/`: limited six-color, 128×128 role-coded base sprites and nearest-neighbour 256×256 display copies.
- `masks/`: 18 one-role masks (three each for six families).
- `depth-variants/`: 30 exact-swapped 128×128 sprites and 256×256 display copies.
- `depth-palettes.json`, `depth-variants.json`: five palette definitions and per-file hashes/source provenance.
- `contact-sheet.png`, `depth-contact-sheet.png`: base-region key and all 30 depth treatments.
- `generation-report.json`: six Codex prompts, native staging/reference paths and hashes, alpha/color metrics.
- `indexed-manifest.json`, `region-analysis.json`: indexed base/mask hashes, role coverage, margins and exact colors.
- `browser-verification.json`: responsive 6×5 table/download checks.
- `goal-delivery-evidence.json`: hash-checked count/cost evidence linking the 30-output RD still study, six-master/30-variant RD animation set, and current six bases plus 30 local depth derivatives.
- `all-six-palette-bases.zip`: complete six-base plus 30-variant package.

## Review and constraints

The parent visually reviewed all six native images: forehead lure and toothed jaw; slim toothed viperfish; one connected siphonophore chain; segmented mouth parasite; collar and circular cookiecutter mouth; eight separate octopus arms. The original native model files themselves contain many near-colours and partial transparency, and some do not meet the requested 15% margin. Their bytes are retained untouched. The derived indexed bases normalize the visible crop, enforce at least 16 logical pixels of empty frame, threshold alpha, and map every interior pixel to one of the six stated colors. They provide the exact replaceable regions; they are explicitly derived files, not untouched model output. These illustrative sprites are not scientific specimens.

Codex image-generation did not report monetary prices or remaining quota; no zero-cost claim is made. No additional RetroDiffusion, purchases, provider fallback or main-app changes were made for these bases/variants.
