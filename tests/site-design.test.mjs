import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pages = ['index.html', 'ui/abyss/index.html', 'about.html', 'bestiary.html', 'job.html', 'ui/scene-studio/index.html', 'ui/scene-studio/help.html', 'ui/desktop/ocean-profiles.html', 'ui/desktop/ocean-entry.html', 'ui/desktop/index.html', 'src/index.template.html', 'chamber.html'];
for (const path of pages) test(`shared scoped design is connected: ${path}`, () => {
  const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.match(source, /<body data-site="[a-z]+"/);
  assert.match(source, /href="\/ui\/abyss\/site\.css"/);
});
test('thematic reading fonts are local, licensed and registered with the correct MIME type', () => {
  const css = readFileSync(new URL('../ui/abyss/site.css', import.meta.url), 'utf8');
  assert.match(css, /--ui-font: "Chakra Petch", system-ui/);
  assert.match(css, /--sans: var\(--ui-font\)/);
  assert.match(css, /\.pg-lede[^}]+var\(--ui-pixel\)/);
  assert.match(css, /--ui-raised:/);
  assert.match(css, /\.studio textarea[^}]+font-family: var\(--mono/);
  const manifest = JSON.parse(readFileSync(new URL('../ui/abyss/manifest.json', import.meta.url), 'utf8'));
  for (const weight of ['Regular', 'SemiBold']) {
    const path = `ui/abyss/fonts/ChakraPetch-${weight}.woff2`;
    assert.equal(readFileSync(new URL('../' + path, import.meta.url)).subarray(0, 4).toString(), 'wOF2');
    assert.equal(manifest.files.find(file => file.path === path)?.mime, 'font/woff2');
  }
  assert.match(readFileSync(new URL('../ui/abyss/fonts/OFL-ChakraPetch.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/);
});
test('shared design preserves local art, narrow-screen navigation and reduced motion', () => {
  const css = readFileSync(new URL('../ui/abyss/site.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /https?:|pixel\/.*\.png/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /nav:not\(\[data-open\]\)/);
  const nav = readFileSync(new URL('../ui/abyss/site-nav.js', import.meta.url), 'utf8');
  assert.match(nav, /aria-current/);
  assert.match(nav, /if \(open\).*focus/);
});
