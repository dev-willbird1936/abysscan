// Derives ui/abyss/assets/index-retro.js from the packaged renderer bundle (left untouched) with two sets of hooks.
// Sprite hooks (ui/abyss/retro-pixel.js): draw billboarded pixel-art sprites in place of the 3D creature meshes and
// the 3D schooling fish. Menu hooks (ui/abyss/detonation-menu.js): feed the renderer the shared ocean from
// GET /api/ocean instead of its 50 historical attacks, label the dive with the five harm tiers, and send a click to
// the Bestiary. Each replacement must match exactly once, so a repackaged renderer fails loudly instead of silently.
// Usage: node tools/patch-abyss-sprites.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../ui/abyss/assets');
const source = join(dir, 'index-D8CplD1t.js');
const target = join(dir, 'index-retro.js');

const hooks = [
  // 1. Hand the renderer's own three.js classes and its shared light uniforms (sun, torch) to the theme (module scope,
  //    before the first creature is built).
  ['function UO(e){let t=qD(e.c);',
    'window.__retro?.init?.({Sprite:ci,SpriteMaterial:Jr,ShaderMaterial:cs,Texture:Zt,InstancedMesh:$i,PlaneGeometry:Xo,MeshBasicMaterial:hi,lights:pT});function UO(e){let t=qD(e.c);'],
  // 2. Every frame, for every creature: swap its 3D meshes for its sprite.
  ['e.c.group.visible=e.out<.985,',
    'e.c.group.visible=e.out<.985,window.__retro?.creature?.(e,$,n),'],
  // 3. After the schooling-fish instance matrices are written: mirror them as billboards and hide the 3D fish.
  ['fk.geometry.attributes.position.needsUpdate=!0}function bk(e){',
    'fk.geometry.attributes.position.needsUpdate=!0,window.__retro?.flock?.(uk,$)}function bk(e){'],

  // 4. The creature list: the shared ocean (plus ghosts that keep the camera framing), not the 50 attacks.
  ['var $C=JSON.parse(', 'var $C=await window.__menu.creatures(),__legacy=JSON.parse('],
  // 5. Creature size grows with what it has eaten.
  ['sizeMul:mO*(', 'sizeMul:(e.sizeMul??1)*mO*('],
  // 6. Tier names and meanings replace the user-action ladder.
  ['var rO={1:', 'var rO=window.__menu.meaning,__ladder={1:'],
  [',aO={5:{y:', ',iO=window.__menu.tiers,aO={5:{y:'],
  // 7. Gauge labels: tier name, depth and meaning at the middle of the band (fixed, so an empty ocean still has a gauge).
  //    Hook 17 then moves each label to its zone's camera stop.
  ['n=t.reduce((e,t)=>e+t.base.y,0)/t.length,r=Zk(`li`,null,`SEV${e}`)',
    'n=(aO[e===1?`up`:e].y[0]+aO[e===1?`up`:e].y[1])/2,r=window.__menu.gaugeItem(e)'],
  // 8. Zone cards, legend text and ending are written from the tiers once the renderer has built them.
  ['var tA=document.querySelector(`.forms`)', 'window.__menu.zones();var tA=document.querySelector(`.forms`)'],
  // 9. Sections hidden by the menu (production) leave the dive.
  ['Sk=[...document.querySelectorAll(`.stage`)]', 'Sk=[...document.querySelectorAll(`.stage:not([hidden])`)]'],
  // 10. Ghosts are never listed or pickable.
  ['p=[...a].sort((e,t)=>e.a.year-t.a.year)', 'p=[...a].filter(e=>!e.a.ghost).sort((e,t)=>e.a.year-t.a.year)'],
  ['let t=xO(e).sort((e,t)=>e.a.year-t.a.year||e.a.name.localeCompare(t.a.name))', 'let t=xO(e).filter(e=>!e.a.ghost).sort((e,t)=>e.a.year-t.a.year||e.a.name.localeCompare(t.a.name))'],
  ['let n=yO.filter(t=>t.a.vector===e);if(!n.length)continue;', 'let n=yO.filter(t=>t.a.vector===e&&!t.a.ghost);if(!n.length)continue;'],
  ['let t=xO(e).length,n=Zk(`li`,`vec`)', 'let t=xO(e).filter(e=>!e.a.ghost).length,n=Zk(`li`,`vec`)'],
  ['for(let s of yO){if(!s.live||', 'for(let s of yO){if(s.a.ghost||!s.live||'],
  // 11. Lists show how much a creature has eaten where they showed a year.
  ['Zk(`span`,`nb-year mono`,String(e.a.year))', 'Zk(`span`,`nb-year mono`,window.__menu.badge(e.a))'],
  ['Zk(`span`,`row-year mono`,String(e.a.year))', 'Zk(`span`,`row-year mono`,window.__menu.badge(e.a))'],
  // 11b. A zone-card row shows which fish a creature ate under its name.
  ['Zk(`span`,`nb-name`,e.a.name)', 'window.__menu.rowName(e.a)'],
  // 11c. Pointing at a creature pings, at most once every 3 s (the hook keeps the clock).
  //      It also gets the pointed-at creature, so the sound can follow the zone it lives in.
  ['T&&pE.ping()', 'T&&window.__menu.ping(pE,y)'],
  // 11e. The renderer's audio object lends out its audio context and master output, so the menu can voice the deep zones itself.
  ['var pE={get on(){return cE},', 'var pE={get ctx(){return sE},get out(){return lE},get on(){return cE},'],
  // 11d. Fish schools sit at the back of their zone: `back` units further from the camera and `spread` times wider across it, so
  //      each school is its own cluster behind the octopus (mobile keeps the width).
  ['base:Q(gO(e)+(n()-.5)*.6*mO,', 'base:Q((gO(e)+(n()-.5)*.6*mO)*(X?1:e.spread??1),'],
  ['km(i.z[0],i.z[1],n())*(X?.6:1))', 'km(i.z[0],i.z[1],n())*(X?.6:1)-(e.back??0))'],
  // 11e. A school stays where it is when a featured creature (or the invisible ghost that holds the first slot) is pulled forward
  //      in front of it: it is behind that creature, so it does not dodge.
  [':Rk(o.filter(e=>!a.includes(e)),e,d)', ':Rk(o.filter(e=>!a.includes(e)&&e.a.kind!==`school`),e,d)'],
  // 11f. A featured creature is drawn at a fixed share of the screen whatever its size, so its share shrinks with what it ate.
  ['*innerWidth*c);Fk.set(', '*innerWidth*c*window.__menu.fit(i.a));Fk.set('],
  // 11g. Accessible list metadata describes the actual fish/behaviour, not the hidden legacy renderer family.
  ['Zk(`span`,`row-meta mono`,`${e.name} · impact ${e.a.impact} · ${uO[e.a.vector]?.[0]??e.a.vector}`)',
    'Zk(`span`,`row-meta mono`,window.__menu.meta(e.a))'],
  ['n.setAttribute(`aria-label`,`${e.a.name}, ${e.a.year}, ${e.name}, SEV${e.sev} ${rO[e.sev]}, impact ${e.a.impact} of 5. Open details.`)',
    'n.setAttribute(`aria-label`,`${e.a.name}. ${window.__menu.meta(e.a)}. ${window.__menu.tier(e.sev).name}. Open details.`)'],
  // 11h. No blanket download of all hidden 3D proxies. Build the nearest band on demand, preserving geometry/picking.
  ['FM=(async()=>{tD(nO,VD);', 'FM=(async()=>{'],
  [';t.length;){t.sort((t,n)=>', ';t.length;){await window.__menu.waitForNearby(t,e);t.sort((t,n)=>'],
  // 12. Click (canvas, list or panel) opens the Bestiary card instead of the attack demo.
  ['function bA(e,t=document.activeElement){let n=e.a;', 'function bA(e,t=document.activeElement){if(window.__menu.open(e.a))return;let n=e.a;'],
  ['fA=t,hA?.enter(t,document.activeElement)});', 'fA=t,window.__menu.open(t.a)||hA?.enter(t,document.activeElement)});'],
  // 13. Hover tag: name, what it means, how many files it has eaten.
  ['uA.textContent=`${e.a.year} · SEV${e.sev} · ${rO[e.sev]}`,dA.textContent=pA===e?e.name:`${e.name} · ${gA?`tap`:`click`} to enter the attack demo`',
    'uA.textContent=window.__menu.meta(e.a),dA.textContent=window.__menu.hint(e.a)'],
  // 14. Wording.
  ['Scroll to dive. Tap a creature to enter its attack demo. Use the list for historical details.', 'Scroll to dive. Tap a creature to see the fish inside it.'],
  ['Underwater attack timeline. Use the attack list for keyboard selection.', 'Underwater ocean of file results. The Bestiary page lists every creature.'],
  ['SEV1 “Nothing”', 'the Trench'],
  // 15. Creatures keep clear of the hero search panel as they do of the hero text.
  ['.hero .eyebrow, .hero h1 .l, .premise, .hint`', '.hero .eyebrow, .hero h1 .l, .premise, .hero .drop, .hint`'],
  // 16. Zone colours follow the site's severity scale (Trench to Sunlight): red, orange, yellow, light blue, white.
  ['fO=[``,`#ff4f6d`,`#ff9a5a`,`#ffd166`,`#b6a6ff`,`#7fe8ff`]', 'fO=[``,`#ff4f6d`,`#ff9a5a`,`#ffd166`,`#8fd3ff`,`#f4f8fc`]'],
  // 17. The gauge dot follows the camera height, and the camera parks below some bands (the Abyss stop sits under the
  //     Abyss creatures). Each label moves to its zone's camera stop (Tk[1..5] = Sunlight..Trench), so the dot rests on
  //     the label of the zone on screen, spaced so crowded stops never overlap (detonation-menu.js placeGauge). Re-run
  //     with the stops on every resize.
  ['Tk=n,zk()}', 'Tk=n,zk(),window.__menu.placeGauge(Tk,oA)}'],
  // 17b. Fade the hero only as its bottom leaves the viewport. Using the heading's top made the entire mobile form
  // nearly transparent at scroll zero, and washed desktop controls out even after the intro finished.
  ['let O=Math.min(Om((qk-scrollY-84)/170),Om(1-scrollY/(innerHeight*.4)));',
    'let O=Om((document.querySelector(`.hero`).getBoundingClientRect().bottom-84)/170);'],
  // 18. Depth readout (HUD metres): camera height to the five tier ranges. The old table was the 0-6,000 m attack ladder,
  //     so the Trench stop read 4,976 m. Now the Abyss stop reads 5,000 m (as the job view does) and the Trench 6,000 m and
  //     more; the deepest stop stays under 10,000 m, which the 4-digit odometer can show.
  ['var NO=[[0,0],[-14,200],[-25.5,1e3],[-33,2e3],[-54,4e3],[-104,6e3]];', 'var NO=[[0,0],[-14,200],[-25.5,1e3],[-40,4e3],[-73.8,6e3],[-104,11e3]];'],
  ['return 6e3}var FO=', 'return 9999}var FO='],
];

let text = readFileSync(source, 'utf8');
for (const [from, to] of hooks) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one match, found ${count}: ${from.slice(0, 60)}`);
  text = text.replace(from, () => to);
}
// Remaining SEV labels (list rows, aria labels) become tier names.
text = text.replace(/SEV\$\{([^}]+)\}/g, (_, sev) => `\${window.__menu.tier(${sev}).name}`);
writeFileSync(target, text);
console.log(`wrote ${target} (${text.length} bytes)`);
