// Lit pixel sprites. Every pixel sprite is drawn with its normal map from ui/abyss/pixel/normals/ (same path; made by
// tools/build-pixel-normals.py). One lighting model serves every view: the renderer lights sprites per frame with LIT_FRAG
// (retro-pixel.js), the ocean show relights its sprites per frame with relight(), and the DOM gets a baked copy from bake().
// The model: colour x (ambient + key x lambert(key direction) + point colour x lambert(towards the point) x falloff), per
// channel. The default rig (no point light) is the original fixed light. Keep LIT_FRAG and shade() in step.
// Normal maps are data: they are never colour-converted.
(() => {
  'use strict';
  const LIGHT = [-0.45, 0.6, 0.66]; // upper left, in front: x right, y up, z towards the viewer
  const len = Math.hypot(...LIGHT);
  const UNIT_LIGHT = LIGHT.map((v) => v / len);
  // The default rig. point: { x, y, z, range, colour } in the drawn image's pixels (y down, z towards the viewer), or null.
  const RIG = Object.freeze({ ambient: [0.28, 0.28, 0.28], key: [1.35, 1.35, 1.35], dir: UNIT_LIGHT, point: null });

  // Billboard vertex shader for the renderer's sprites: the placement three.js uses for a Sprite. vView: view-space position.
  const VERT = `varying vec2 vUv;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
  // uUv = (scale.x, offset.x, scale.y, offset.y): one frame of a sheet; a negative scale.x mirrors it.
  // uPoint: the point light in view space (xyz) and its range (w); uPointCol black means no point light.
  const LIT_FRAG = `varying vec2 vUv;
varying vec3 vView;
uniform sampler2D map;
uniform sampler2D normalMap;
uniform vec4 uUv;
uniform vec3 uLight;
uniform vec3 uAmbient;
uniform vec3 uKey;
uniform vec4 uPoint;
uniform vec3 uPointCol;
uniform vec3 uTint;
uniform float uOpacity;
void main() {
  vec2 uv = vec2(vUv.x * uUv.x + uUv.y, vUv.y * uUv.z + uUv.w);
  vec4 c = texture2D(map, uv);
  if (c.a < 0.5) discard;
  vec3 m = texture2D(normalMap, uv).rgb * 2.0 - 1.0;
  vec3 n = normalize(vec3(m.x * sign(uUv.x), m.y, m.z));
  vec3 k = uAmbient + uKey * max(dot(n, uLight), 0.0);
  vec3 v = uPoint.xyz - vView;
  float d = max(length(v), 1e-3);
  k += uPointCol * max(dot(n, v / d), 0.0) / (1.0 + d * d / max(uPoint.w * uPoint.w, 1e-6));
  gl_FragColor = vec4(c.rgb * uTint * k, uOpacity);
}`;
  // Uniforms for one lit material, at the default rig. Several materials may share one object to share a rig.
  const uniforms = () => ({ uLight: { value: UNIT_LIGHT.slice() }, uAmbient: { value: RIG.ambient.slice() }, uKey: { value: RIG.key.slice() },
    uPoint: { value: [0, 0, 0, 1] }, uPointCol: { value: [0, 0, 0] } });

  // Frame `frame` of a sheet of `frames` cells, mirrored when the sprite faces the other way.
  const uvFor = (frame = 0, frames = 1, mirror = false) => (mirror ? [-1 / frames, (frame + 1) / frames, 1, 0] : [1 / frames, frame / frames, 1, 0]);

  const normalUrl = (url) => url.replace(/(^|\/)ui\/abyss\/pixel\//, (_, lead) => `${lead}ui/abyss/pixel/normals/`);

  const loadImage = (src) => new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => fail(new Error(`cannot load ${src}`));
    img.src = src;
  });
  const toCanvas = (source) => {
    const cv = document.createElement('canvas');
    cv.width = source.naturalWidth ?? source.width;
    cv.height = source.naturalHeight ?? source.height;
    cv.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0);
    return cv;
  };

  // Height from the silhouette, as a rounded bevel: for a sprite that has no normal map of its own (the code-drawn stand-ins).
  function normalFromAlpha(cv) {
    const { width: w, height: h } = cv;
    const a = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const H = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[(y * w + x) * 4 + 3] / 255);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const og = out.getContext('2d', { willReadFrequently: true }), img = og.createImageData(w, h), o = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const nx = -(H(x + 1, y) - H(x - 1, y)) * 2, ny = (H(x, y + 1) - H(x, y - 1)) * 2;
      const l = Math.hypot(nx, ny, 1);
      o[i] = ((nx / l) * 0.5 + 0.5) * 255; o[i + 1] = ((ny / l) * 0.5 + 0.5) * 255; o[i + 2] = ((1 / l) * 0.5 + 0.5) * 255; o[i + 3] = a[i + 3];
    }
    og.putImageData(img, 0, 0);
    return out;
  }

  // Colour and normal map for a pixel sprite, as images or canvases (three.js takes either). A missing normal map is
  // derived from the silhouette and reported, so a new sprite without one still renders lit.
  const pairs = new Map();
  function pair(url) {
    if (!pairs.has(url)) pairs.set(url, (async () => {
      const color = await loadImage(url);
      const normal = await loadImage(normalUrl(url)).catch(() => {
        console.warn(`pixel-lit: no normal map for ${url}; deriving one from its silhouette`);
        return null;
      });
      return { color, normal: normal ?? normalFromAlpha(toCanvas(color)) };
    })());
    return pairs.get(url);
  }

  const pixels = (cv) => cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;

  // The model of LIT_FRAG on the CPU. Draws the region (sx, sy, sw, sh) of `sheet` ({ w, color, normal } RGBA arrays) at
  // dw x dh (nearest pixel, as the canvas draws pixel art), mirrored or not, under `rig`, into `out` (a reused canvas by
  // default: draw it before the next call). Pixels below half alpha are dropped. The point light is in `out`'s pixels.
  const scratch = new Map();
  function relight(sheet, sx, sy, sw, sh, dw, dh, rig = RIG, mirror = false, out = null) {
    dw = Math.max(1, Math.round(dw)); dh = Math.max(1, Math.round(dh));
    if (!out) {
      const key = `${dw}x${dh}`;
      if (!scratch.has(key)) { const cv = document.createElement('canvas'); cv.width = dw; cv.height = dh; scratch.set(key, { cv, img: cv.getContext('2d').createImageData(dw, dh) }); }
      out = scratch.get(key);
    } else out = { cv: out, img: out.getContext('2d').createImageData(dw, dh) };
    const { color: c, normal: n, w } = sheet, o = out.img.data;
    const [ar, ag, ab] = rig.ambient, [kr, kg, kb] = rig.key, [lx, ly, lz] = rig.dir, p = rig.point, flip = mirror ? -1 : 1;
    const r2 = p ? Math.max(p.range * p.range, 1e-6) : 1, [pr, pg, pb] = p ? p.colour : [0, 0, 0];
    for (let y = 0; y < dh; y++) {
      const row = (sy + Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh))) * w;
      for (let x = 0; x < dw; x++) {
        const col = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
        const i = (row + sx + (mirror ? sw - 1 - col : col)) * 4, j = (y * dw + x) * 4;
        if (c[i + 3] < 127.5) { o[j + 3] = 0; continue; }
        let mx = (n[i] / 127.5 - 1) * flip, my = n[i + 1] / 127.5 - 1, mz = n[i + 2] / 127.5 - 1;
        const l = Math.hypot(mx, my, mz) || 1;
        mx /= l; my /= l; mz /= l;
        const key = Math.max(mx * lx + my * ly + mz * lz, 0);
        let r = ar + kr * key, g = ag + kg * key, b = ab + kb * key;
        if (p) {
          const vx = p.x - x - 0.5, vy = y + 0.5 - p.y, vz = p.z, d = Math.hypot(vx, vy, vz) || 1e-3;
          const k = Math.max((mx * vx + my * vy + mz * vz) / d, 0) / (1 + (d * d) / r2);
          r += pr * k; g += pg * k; b += pb * k;
        }
        o[j] = c[i] * r; o[j + 1] = c[i + 1] * g; o[j + 2] = c[i + 2] * b; o[j + 3] = 255;
      }
    }
    out.cv.getContext('2d').putImageData(out.img, 0, 0);
    return out.cv;
  }

  // The default rig over a whole image (frame 0 of 1, not mirrored), into a new canvas.
  function bake(colorCv, normalCv) {
    const { width: w, height: h } = colorCv, out = document.createElement('canvas');
    out.width = w; out.height = h;
    return relight({ w, color: pixels(colorCv), normal: pixels(normalCv) }, 0, 0, w, h, w, h, RIG, false, out);
  }

  // Colour and normal pixels of a sheet, for relight(), cached per URL.
  const sheets = new Map();
  function sheet(url) {
    if (!sheets.has(url)) sheets.set(url, pair(url).then(({ color, normal }) => {
      const cv = toCanvas(color);
      return { w: cv.width, h: cv.height, color: pixels(cv), normal: pixels(toCanvas(normal)) };
    }));
    return sheets.get(url);
  }

  // Lit copy of a pixel sprite (whole sheet, all frames), cached per URL.
  const baked = new Map();
  function image(url) {
    if (!baked.has(url)) baked.set(url, pair(url).then(({ color, normal }) => bake(toCanvas(color), toCanvas(normal))));
    return baked.get(url);
  }

  // Lit data URL for CSS backgrounds and <img> elements.
  const dataUrls = new Map();
  function dataUrl(url) {
    if (!dataUrls.has(url)) dataUrls.set(url, image(url).then((cv) => cv.toDataURL('image/png')));
    return dataUrls.get(url);
  }

  // Elements that name a pixel sprite get its lit copy: <el data-pixel-bg="/ui/abyss/pixel/...">.
  const paint = (el) => {
    const url = el.dataset.pixelBg;
    if (!url) return;
    dataUrl(url).then((src) => { if (el.dataset.pixelBg === url && el.isConnected) el.style.backgroundImage = `url("${src}")`; }, () => {});
  };
  // Load colour and normal data together only near the viewport. Hidden/deep cards must not hold up the surface.
  const visible = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { visible.unobserve(entry.target); paint(entry.target); }
  }, { rootMargin: '240px' }) : null;
  const hydrateOne = el => visible ? visible.observe(el) : paint(el);
  const hydrate = (root = document) => {
    if (root.matches?.('[data-pixel-bg]')) hydrateOne(root);
    root.querySelectorAll?.('[data-pixel-bg]').forEach(hydrateOne);
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') hydrateOne(record.target);
      else record.addedNodes.forEach((node) => { if (node.nodeType === 1) hydrate(node); });
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pixel-bg'] });
  hydrate();

  window.PixelLit = { LIGHT: UNIT_LIGHT, RIG, VERT, LIT_FRAG, uniforms, uvFor, normalUrl, pair, bake, image, dataUrl, normalFromAlpha, hydrate, sheet, relight };
})();
