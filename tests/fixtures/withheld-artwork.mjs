import { existsSync } from 'node:fs';

// The upstream Win11React artwork (desktop-comparison/previews/win11-final/img/) is not cleared for redistribution, so the public
// repository leaves it out (THIRD-PARTY.md). A Windows wallpaper under that folder cannot be checked on disk there.
const artworkFolder = new URL('../../desktop-comparison/previews/win11-final/img/', import.meta.url);

export const withheldWallpaper = url => url.startsWith('/previews/win11-final/img/') && !existsSync(artworkFolder);
