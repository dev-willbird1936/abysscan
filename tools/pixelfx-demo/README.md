# pixelfx demo

Two small effects of ours, in the style of [pixelfx](https://github.com/patch-gg/pixelfx) (patch-gg, MIT; its `src/core` is vendored in
`vendor/core`, notices in `vendor/`), drawn over the ocean show. A record-only experiment: nothing here ships with the site or touches its files.

Each effect exists only where it says something true about what is on screen:

| effect | where | what it says |
|---|---|---|
| `fx/blocked.js` | beside a "Connection blocked" tag | a dashed line runs into a wall: the connection never left |
| `fx/scramble.js` | over an "Encrypted ..." or "Ransom note" tag | pixel noise corrupts the text in place |

Tags without a visual action (such as "Read ...") get nothing. Tried and cut: countdown, lightning, confetti, a check stamp, rings, and a scan bar. Do not re-add decoration.

- `node tools/pixelfx-demo/run.mjs [out.mp4]` plays the site end to end (landing, the ocean show, the report) and records it. It plays the
  `invoice-py` fixture, so it needs no upload and no sandbox. Needs the local site on `RECORD_BASE_URL` (default `http://127.0.0.1:4173`,
  `node tools/start-desktops.mjs`) and ffmpeg (`FFMPEG=<path>` if it is not on PATH).
- What the recording does (all in `run.mjs`; the site's files are untouched):
  - **1920x1080 at 30 fps.** The browser runs on the GPU (`lib.mjs`; `PFX_SOFTWARE=1` forces the software renderer, about 10 fps at this size).
    Frames come from Chrome's screencast as JPEGs, not Playwright's `recordVideo` (VP8, 1 Mbps, soft at 1080p), and are encoded with x264 CRF 16.
    About 3 GB of frames are written while recording: set `PFX_TMP` to a drive with room.
  - **Sound.** `audio-tap.js` sends everything the site plays to the speakers to a recorder as well; it is levelled to about -20 LUFS and muxed
    under the picture. The site makes no sound until the first click, so the recorder clicks empty water once the loader is gone. The report
    page has no sound.
  - **Pacing.** The 9 s loader (a fixed wait) plays 3x. The landing page is held for 4.5 s before the show starts, by holding back the one
    file (`mock.mjs`) the show imports. The Running step waits for all four observations. Everything else runs at the site's own speed.
  - **Matches live.** The local server enables the Windows and macOS training desktops; the live site hides them, so the status endpoint is
    answered as live does, and the Done card shows the two live buttons.
  - **The coral flash** just before the report is the site's own camera-bite transition, not a recording fault: it is kept.
  - **Report.** The page's own replay and bite play out, then the report is scrolled in eased steps (a wheel notch jumps in one frame).
- `node tools/pixelfx-demo/preview.mjs <outDir> own/blocked own/scramble` writes a row of stills per effect.
- `overlay.js` is one transparent 320x180 canvas drawn 4x with hard pixels; `window.__pfx.play('own/blocked', { x, y, palette, follow })` starts an
  effect (x, y in art pixels). Playwright injects it with `bypassCSP`, so the site's CSP is unchanged.
- To add an effect: write `fx/<name>.js` (see `docs/AUTHORING.md` in pixelfx for the contract), look at it with `preview.mjs`, then look at it
  in the recorded video, over the real page, before keeping it.
