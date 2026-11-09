// Local placeholder art as data: SVG URLs (CSP img-src allows data:). No network, no real photos.
const svg = (body, w = 640, h = 420) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;

const hash = (s) => [...String(s || "x")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const PALETTES = [
  ["#0b3d91", "#1e90ff", "#9be7ff", "#ffd27f"],
  ["#2d1b4e", "#7b3fa0", "#f08bb4", "#ffe3a3"],
  ["#063b2f", "#178f6b", "#7fe0b5", "#f4f1c9"],
  ["#4a1c0c", "#c2521b", "#f7a35c", "#fff0c2"],
  ["#10202e", "#29506d", "#6aa6c8", "#e8f1f8"],
];

// Named scenes for seeded assets; anything else gets a deterministic landscape.
const SCENES = {
  offsite: (p) => `
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb46b"/><stop offset="0.55" stop-color="#ff7e7e"/><stop offset="1" stop-color="#5b3c88"/></linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f4f8f"/><stop offset="1" stop-color="#0f1f3d"/></linearGradient></defs>
    <rect width="640" height="420" fill="url(#s)"/><circle cx="470" cy="210" r="56" fill="#ffe4a8" opacity="0.9"/>
    <path d="M0 250 L120 190 L210 235 L330 170 L450 240 L560 200 L640 230 L640 420 L0 420Z" fill="#3b2a5c" opacity="0.8"/>
    <rect y="270" width="640" height="150" fill="url(#w)"/>
    <g fill="#ffe4a8" opacity="0.5"><rect x="420" y="290" width="100" height="3"/><rect x="440" y="310" width="60" height="3"/><rect x="455" y="330" width="30" height="3"/></g>
    <g fill="#151026"><circle cx="160" cy="300" r="12"/><rect x="150" y="310" width="20" height="40" rx="8"/><circle cx="200" cy="296" r="12"/><rect x="190" y="306" width="20" height="44" rx="8"/><circle cx="240" cy="302" r="11"/><rect x="231" y="311" width="18" height="39" rx="8"/><circle cx="278" cy="298" r="12"/><rect x="268" y="308" width="20" height="42" rx="8"/></g>
    <rect y="348" width="640" height="72" fill="#0b1428" opacity="0.6"/>`,
};

const landscape = (key) => {
  const h = hash(key);
  const p = PALETTES[h % PALETTES.length];
  const peak = 140 + (h % 80);
  return `
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[2]}"/><stop offset="1" stop-color="${p[3]}"/></linearGradient></defs>
    <rect width="640" height="420" fill="url(#g)"/><circle cx="${120 + (h % 400)}" cy="${90 + (h % 40)}" r="${30 + (h % 25)}" fill="${p[3]}" opacity="0.9"/>
    <path d="M0 300 L160 ${peak} L300 280 L420 ${peak + 30} L640 290 L640 420 L0 420Z" fill="${p[1]}"/>
    <path d="M0 350 L200 290 L380 340 L520 300 L640 340 L640 420 L0 420Z" fill="${p[0]}"/>`;
};

export const artFor = (asset) => svg((SCENES[asset] || landscape)(asset));

// Square cover art for media entries.
export const coverFor = (key) => {
  const h = hash(key);
  const p = PALETTES[h % PALETTES.length];
  return svg(
    `<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient></defs>
    <rect width="300" height="300" fill="url(#c)"/><circle cx="150" cy="150" r="${70 + (h % 30)}" fill="none" stroke="${p[2]}" stroke-width="10" opacity="0.7"/>
    <circle cx="150" cy="150" r="22" fill="${p[3]}"/>`,
    300,
    300,
  );
};

// To Do has no Win11React icon: a blue check tile drawn here.
export const TODO_ICON = svg(
  `<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4fa3ff"/><stop offset="1" stop-color="#1f5fd1"/></linearGradient></defs>
  <rect x="6" y="6" width="52" height="52" rx="12" fill="url(#t)"/><path d="M20 33 L29 42 L45 23" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  64,
  64,
);
