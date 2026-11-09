# Training desktops

There is **one Windows 11 desktop and one macOS desktop**. There are no alternative shells or skins.

| Desktop | Served from | Source | Build |
|---|---|---|---|
| Windows 11 | `previews/win11-final/` | `win11-final/` (Win11React, CC0, React 18 + Redux, Vite) | `cd win11-final && npm run build` |
| macOS | `previews/macos-final/` | `make-macos-final.mjs` over the build input in `sources/kimi-macos27/` (not in this repository), plus `previews/macos-final/src/` | `node make-macos-final.mjs` |

Start everything with `node tools/start-desktops.mjs` from the project root (app on 4173, shells on 4189). `start.bat` here starts only the shell server; `http://127.0.0.1:4189/` shows both desktops side by side. The architecture, rules and checks are in [`docs/desktop-parity/README.md`](../docs/desktop-parity/README.md).

## What the server serves

`server.mjs` binds only 127.0.0.1:4189 and serves a fixed static inventory: `index.html`, `previews/win11-final/`, `previews/macos-final/`, `previews/ocean-scenes.js` and `previews/ocean-fx.js`. Everything else returns 404, including `sources/`. It has no training or cloud backend.

The shells get a strict CSP (`connect-src 'self'`, `frame-src 'none'`, `frame-ancestors 'self' http://127.0.0.1:4173`) and a permissions policy that denies camera, microphone, geolocation, display capture and clipboard access. This is browser/local evaluation isolation, not a VM or a general-purpose hostile-code sandbox.

## Folders

- `sources/kimi-macos27/`: build input for `macos-final`. It is not part of this repository (the project owner holds it), so `make-macos-final.mjs` cannot be re-run from a clone. The built result, `previews/macos-final/`, is included and is what the app serves.
- `archive/`: the superseded comparison shells and skins. Not in this repository.

## Licences

- Windows 11: Win11React project code is CC0-1.0. Included libraries and fonts keep their own licences. The upstream Win11React artwork (`win11-final/public/img/` and its built copy `previews/win11-final/img/`: icons, wallpapers, logos) has no recorded licence and is **withheld from this repository**; the Windows desktop here shows missing icons until artwork is supplied. See [`THIRD-PARTY.md`](../THIRD-PARTY.md).
- macOS: the shell is the project owner's own work and ships under this repository's MIT licence.
