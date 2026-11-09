// Bestiary page: fetches the rosters and the shared ocean, fills the four sections, and opens the card named in
// the URL fragment (the main menu links to /bestiary#<finding id>). A failed /api/ocean leaves every creature unfound.
(() => {
  'use strict';
  const getJson = (url) => fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const fill = (id, html) => { document.getElementById(id).innerHTML = html; };

  // Reveal-all is for local development only; the production flag is the server's <meta name="do-env">.
  const flag = document.querySelector('meta[name="do-env"]')?.content;
  const production = flag === 'production' || (flag !== 'development' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
  const reveal = !production && /[?&]reveal\b/.test(location.search);

  const search = document.getElementById('bestiary-search');
  const depth = document.getElementById('bestiary-depth');
  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const card of document.querySelectorAll('[data-bestiary-section] .card')) {
      card.hidden = !card.textContent.toLocaleLowerCase().includes(query) || Boolean(depth.value && card.dataset.depth !== depth.value);
      if (!card.hidden) count++;
    }
    for (const section of document.querySelectorAll('[data-bestiary-section]')) section.hidden = !section.querySelector('.card:not([hidden])');
    document.getElementById('bestiary-results').textContent = count ? `${count} matching cards` : 'No matches. Try another word or clear the filters.';
  }
  search.addEventListener('input', filter);
  depth.addEventListener('change', filter);
  search.form.addEventListener('submit', event => event.preventDefault());
  search.form.addEventListener('reset', () => { search.value = ''; depth.value = ''; filter(); });

  function markFocus() {
    let target;
    try { target = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const card = target && document.getElementById(target);
    if (!card?.classList?.contains('card')) return;
    search.value = ''; depth.value = ''; filter();
    document.querySelectorAll('.card.picked').forEach(item => item.classList.remove('picked'));
    card.classList.add('picked');
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'center' });
  }

  // A species without sheet art (see FISH_ART in render.js) gets the stand-in pixel fish.
  function standIns() {
    for (const holder of document.querySelectorAll('.sprite.fish[data-stand-in]')) {
      const flat = window.PixelFish.canvas(holder.dataset.species);
      const canvas = window.PixelLit.bake(flat, window.PixelLit.normalFromAlpha(flat));
      canvas.className = 'sprite stand-in';
      canvas.setAttribute('aria-hidden', 'true');
      holder.replaceWith(canvas);
    }
  }

  async function start() {
    const [roster, fish, ocean] = await Promise.all([getJson('/data/creatures.json'), getJson('/data/fish.json'), getJson('/api/ocean')]);
    if (!roster || !fish) {
      document.getElementById('status').textContent = 'The creature lists could not be loaded. Try again in a moment.';
      return;
    }
    const parts = window.BestiaryRender.render(roster, fish, ocean, { reveal });
    fill('depths', parts.depths);
    fill('fish', parts.fish);
    fill('creatures', parts.creatures);
    fill('system', parts.system);
    const found = (ocean?.creatures ?? []).filter((item) => item.eaten > 0).length;
    const observed = (ocean?.creatures ?? []).filter((item) => (item.observed ?? item.eaten) > 0).length;
    document.getElementById('status').textContent = ocean
      ? `${found} of ${roster.creatures.length} behaviours illustrated or observed; ${observed} observed in uploads. Historical examples are illustrations, not sandbox results.`
      : 'The shared ocean is not available, so the observed results cannot be shown.';
    standIns();
    filter();
    markFocus();
    const templates = await getJson('/api/desktop-templates/status');
    const training = document.getElementById('training-link');
    if (training) training.hidden = templates?.enabled !== true;
  }

  window.addEventListener('hashchange', markFocus);
  start();
})();
