# Original user request and completion scope

Source: the user's messages in this active Pi conversation. Quoted verbatim below; this file does not modify the goal objective.

## Current request

> add the sea creatures in like we have in real 3d version, but for these art styles, so maybe ask codex image gen to either generate an image per mosnter per art style per layer or just 1 new layer with mobs ins and transparent backjground and voe rlay it

## Existing viewer layout requirement (preceding user message)

> make the images 16:9 and juist have them displayed one on top of another so it simualtes the actual scrolling depthj, like the top oceann aprt at top, thenunder it next depth etc, then just a dropdown or buttons toi swtich style at top which switches the 5 shown images

## Original art-direction request

> i think the 3d ocean animal style ui is too much, i like the deeper it gets darker asthetic and the ocean concept in general, but the 3d rendering and models is too much for this projects scope, think of some more 2d or 2.5d styles, different art styles, some simple, some psecfic idk, then for eahc, use codex image generation to create 5 images for each styyle, each being a depth tier of the ocean, then at the end create me a html where i can switch between each art style. so we are just using codex image gen to basically prototyle these styles

## Chosen allowed implementation

The user explicitly offered one new transparent layer containing creatures as an alternative to individual images per monster. This implementation uses one composition per art style per depth, over the existing ocean background: six styles × five depths = 30 native Codex-generated transparent layers. The original request explicitly rejects a 3D rendering/model implementation for this prototype's scope.

No message requests animation, gameplay, creature click-through, a sprite per historical record, or every duplicate individual instance. Species and depth grouping come from the real packaged renderer, not a newly invented sea-life list. Repeated trench entries are represented once per species; this limitation is disclosed rather than presented as a full 50-entry interactive replacement.

## Observable checks

1. Existing five 16:9 depths remain vertically stacked with a sticky style dropdown.
2. Every style/depth displays an actual Codex-generated creature layer over the matching background.
3. Final layer PNGs have genuine alpha transparency, including empty areas and corners, rather than a solid or painted checkerboard background.
4. Species families follow the real renderer's roster and depth mapping; see creature-roster.json and the identified packaged source.
5. Switching style replaces all five backgrounds and creature layers together.
6. Native sources and generation provenance are retained. The main app and ocean backgrounds remain unchanged.
7. The minimal-silhouettes direction uses simplified flat shapes; other styles retain their own generated artwork.

The native browser tool responses from this conversation directly verified decoding, alignment, mobile layout, and failure recovery. Summary JSON files describe those performed checks; they are not claimed to be an independent browser audit. The reviewer can reproduce them from the standalone index.html and inspect the actual PNGs and contact sheet.
