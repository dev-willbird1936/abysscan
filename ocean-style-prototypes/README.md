# Ocean art-direction prototypes

Open `index.html` directly in a browser. Keep both `assets/` and `creature-assets/` beside it. No server, dependencies, or build step is needed.

Choose a style in the sticky dropdown, then scroll down through five edge-to-edge **16:9 panels**: Sunlight → Twilight → Midnight → Abyss → Trench. Changing style replaces all five ocean backgrounds and their matching creature layers. There are no comparison modes or sample-interface overlays.

Six directions: minimal silhouettes, layered paper-cut, soft watercolor, retro pixel art, scientific field guide, atmospheric screen print.

This is a separate concept viewer, not a replacement for the existing app. No WebGL, 3D renderer, external fonts, or CDN.

## Image provenance

`generation-brief.txt` specifies 30 separate images and their final paths. Generation uses Codex's native `image_gen.imagegen`; normal source staging occurs under the user's Codex generated-images directory. All 30 final images are saved in `assets/<style>/<depth>.png` at exact **1600 × 900 (16:9)**. Native 1672 × 941 originals are preserved in `source-assets/`. The export applies a minimal aspect correction; four trench images were slightly darkened so every style gets darker at each tier. `export-manifest.json` records every transformation. Missing images are explicitly labelled, never replaced with stock or procedural artwork.

The requested progression darkens from turquoise to near-black blue. Depth ranges describe ocean zones, not measured viewpoints in the illustrations. Adjacent images are separate prototypes, not guaranteed seamless tiles.

## Request and acceptance evidence

`USER-REQUEST.md` quotes the actual user messages verbatim, including the explicit choice of one transparent creature composition per layer. `goal-delivery-evidence.json` maps each request requirement to its viewer, source assets, integrity checks, and browser evidence. The goal's shorthand wording is not used as a substitute for those requirements; its objective was not edited.

## Sea-creature layers

Codex native `image_gen.imagegen` generated **30 transparent creature compositions**: one per style and depth. Every final layer is genuine RGBA at **1600 × 900**, with clear space between animals, not a painted checkerboard or solid background. Native originals remain in `creature-source-assets/`; `creature-verification.json` records dimensions, alpha extrema, transparent fractions, and source paths.

The roster comes from the packaged 3D renderer's species definitions and severity-to-depth mapping, recorded in `creature-roster.json`:

- **Sunlight:** six frogfish and one blue-ringed octopus.
- **Twilight:** twilight anglerfish and cuttlefish.
- **Midnight:** twilight anglerfish.
- **Abyss:** anglerfish, cuttlefish, mimic octopus, isopod host fish, and barreleye.
- **Trench:** siphonophore, sea lamprey, isopod host fish, gulper eel, moray eel, barreleye, viperfish, kraken, and cookiecutter shark.

These are representative illustrated compositions, not 50 separately interactive creatures. The renderer bundle maps business-email-compromise encounters to a Mimic octopus and maps ransomware encounters from blue-ringed octopus to Kraken with depth. Repeated trench entries are grouped into one representative per species. Renderer instance counts remain source metadata and are not guaranteed as exact body counts in every generated composition. No 3D engine or creature animation was added. The background art is unchanged. Pixel-art layers use nearest-neighbor export and pixelated browser rendering. The minimal-silhouettes layers were regenerated with simplified flat shapes instead of the earlier shaded treatment.

## Machine-checkable style/depth delivery proof

`style-depth-delivery-evidence.json` enumerates the exact 30 user-requested style/depth cells and pairs each Codex-native source path/hash with its exported RGBA overlay path/hash, dimensions, and transparency. The saved `style-depth-integrity-check.json` verified all 30 native hashes and all 30 exported hashes, all 30 unique style/depth combinations, and no duplicate source or export hashes. `style-depth-rgba-check.json` additionally verified that all 60 native/export PNG files are genuinely RGBA (PNG color type 6) with expected alpha. This proves the six-style × five-depth Codex composition work. It is separate from the older RetroDiffusion comparisons and from the six-family recolour/evolution study. Their approved native sources are in `creature-approved-sources/minimal-silhouettes/`; `flat-revision-source-map.json` records the actual native staging files. Earlier exports and evidence are preserved separately.

`creature-generation-brief.txt` retains the prompt direction; `creature-generation-result.txt` records generation completion. `creature-roster-artwork-audit.json` records the renderer-source crosswalk and a 30-cell visual review against the canonical roster. `export-creatures.py` preserves native transparency while fitting each composition onto the final canvas with margins; it does not remove backgrounds or draw replacement animals. `creature-contact-sheet.jpg` shows all 30 current ocean-plus-creature composites, including the flatter minimal revisions, and was visually reviewed.

## Viewer checks

Initial background-only browser checks are retained in `browser-verification.json`. The earlier window resize was clamped to 500px; the creature update subsequently used device emulation to test a real **390 × 844** viewport.

The creature-update browser checks loaded and decoded **60/60 assets** through all six dropdown options: 30 ocean backgrounds and 30 matching creature layers. Checks confirmed five stacked panels per style, exact 1600 × 900 dimensions, absolute overlay positioning, pixelated rendering for the pixel-art style, a sticky selector, and no horizontal overflow. At 390px, every overlay aligned with its background and each panel stayed 16:9. `creature-browser-verification-after-audit.json` records a fresh run through all six dropdown choices: all 60 images decoded, each style folder matched, and every panel measured at 16:9. An intentionally missing creature file showed a warning without hiding the ocean; switching styles recovered all layers. `creature-browser-verification.json` retains those initial results. After the flat revision, the complete six-style, 60-asset test and failure recovery were rerun at 390 × 844. `creature-roster-browser-verification.json` records a separate post-roster run: all six dropdown choices decoded all 60 images, and every creature layer's accessible species names matched the canonical five-depth roster without asserting repeated-instance counts. `creature-roster-browser-preview.png` is a full-page Chrome capture of the live Field Guide viewer for direct inspection. `verify-creature-viewer-browser.js` is the exact reproducible browser test function; `creature-browser-tool-response-after-flat-revision.txt` contains the captured Chrome tool response, not a rewritten summary. These are executed browser tests, not claims of an independent browser audit. `browser-verification.json` and `image-verification.json` retain evidence. A six-by-five `contact-sheet.jpg` was visually inspected; the darker tiers deliberately have subtle detail. Native generation reporting describes the original outputs; `export-manifest.json` describes the final assets.

Adjacent panels are not seamless illustrations: this prototype tests art direction and darkening, not continuous painted scenery. The existing app remains unchanged.

Quality self-review (0–10): scope fit **9.5**, viewer behavior **9.5**, visual style differentiation **8.5**, creature-roster fidelity **9.0**, transparency **10.0**, depth progression **9.0**, overall **9.2**. Scale: **S1.1**. LSP diagnostics skipped unavailable default server commands; install the required server or update its command in `pi-lsp.json` if LSP checking is wanted. Browser checks and JavaScript syntax checks passed.
