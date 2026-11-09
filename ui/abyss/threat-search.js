// Threat search on the main menu (docs/threat-search/CONTRACT.md, docs/QUEST-GAME.md): name a real malware family, exploit or
// hack. The server checks it on the live web (Parallel Decisions), names the match and says whether the ocean already has it.
// A new one gets a confirmation; Create plays the ocean show while the server researches it (Parallel Search) and writes a
// simulated Windows scene (Vultr Serverless Inference). Nothing is uploaded, downloaded or run: file upload is retired.
// Every string from the server goes in with textContent.
(() => {
  const premise = document.querySelector('.hero .premise');
  if (!premise || document.getElementById('threat-search')) return;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const form = el('form', 'drop glass ts');
  form.id = 'threat-search';
  form.noValidate = true;
  form.setAttribute('role', 'search');
  form.setAttribute('aria-labelledby', 'ts-h');
  const title = el('h2', 'drop-title', 'Search a threat');
  title.id = 'ts-h';
  const label = el('label', 'ts-label mono', 'A real malware family, exploit or hack');
  label.htmlFor = 'ts-q';
  const row = el('div', 'ts-row');
  const input = el('input', 'ts-input');
  input.id = 'ts-q';
  Object.assign(input, { type: 'search', name: 'q', maxLength: 200, placeholder: 'Try: Zeus, WannaCry, recent Binance hack', autocomplete: 'off', spellcheck: false });
  const go = el('button', 'drop-go ts-go', 'Search');
  go.type = 'submit';
  row.append(input, go);
  const out = el('div', 'ts-out');
  out.setAttribute('aria-live', 'polite');
  const note = el('p', 'drop-note mono', 'We check public reporting, then build a simulated Windows desktop. Nothing is downloaded or run.');
  form.append(title, label, row, note, out);
  premise.after(form);

  // The skip link, the loader's "Go straight to search" link and a #threat-search address all land on the search box at the
  // surface. Capture the click before the renderer's own anchor handler can send the camera past the hero.
  function openSearch(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (event?.target.closest?.('.loader-search')) {
      const loader = document.querySelector('.loader');
      if (loader) loader.hidden = true;
      document.body.classList.add('titled');
    }
    if (location.hash === '#threat-search') history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    document.body.classList.remove('past-hero');
    input.focus({ preventScroll: true });
  }
  document.addEventListener('click', event => {
    if (event.target.closest?.('a[href="#threat-search"], a[href="/#threat-search"]')) openSearch(event);
  }, true);
  const wantsSearch = () => location.hash === '#threat-search';
  window.addEventListener('hashchange', () => { if (wantsSearch()) { openSearch(); requestAnimationFrame(() => openSearch()); } });
  window.addEventListener('pageshow', () => { if (wantsSearch()) openSearch(); });
  if (wantsSearch()) {
    openSearch();
    (async () => { for (let waited = 0; !(window.__lenis && window.__ocean) && waited < 30000; waited += 100) await wait(100); openSearch(); })();
  }

  const KIND = { malware: 'Malware', exploit: 'Exploit', hack: 'Hack', unknown: 'Threat' };
  const FAMILY = {
    deception: 'Deception', intrusion: 'Intrusion', 'network-abuse': 'Coordinated abuse', 'trusted-source': 'Trusted-source compromise',
    'theft-surveillance': 'Theft / surveillance', 'extortion-destruction': 'Extortion / destruction', unknown: 'Unclassified',
  };
  const DEPTH = { sunlight: 'Sunlight · harmless', twilight: 'Twilight · risky', midnight: 'Midnight · steals', abyss: 'Abyss · takes control', trench: 'Trench · destroys' };
  const facts = result => [KIND[result.kind] ?? 'Threat', FAMILY[result.family] ?? FAMILY.unknown, DEPTH[result.depth]].filter(Boolean).join(' · ');
  const safeUrl = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };

  async function post(path, body, signal) {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal });
    let data = {};
    try { data = await response.json(); } catch { /* an old server without these routes */ }
    return { status: response.status, body: data };
  }
  const say = (text, bad = false) => {
    if (!text) { out.replaceChildren(); return; }
    const line = el('p', 'ts-status mono', text);
    line.classList.toggle('bad', bad);
    out.replaceChildren(line);
  };

  function sourcesList(sources) {
    const list = el('ul', 'ts-sources');
    for (const source of (sources ?? []).slice(0, 6)) {
      const href = safeUrl(source.url);
      if (!href) continue;
      const item = el('li');
      const link = el('a', '', source.publisher || new URL(href).hostname);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
      if (source.title) item.append(` · ${source.title}`);
      if (source.reportedAt) item.append(` (${source.reportedAt})`);
      list.append(item);
    }
    return list.children.length ? list : null;
  }

  // A new search replaces one still in flight: the older request is aborted and only the latest answer is drawn, so a slow
  // reply never lands under a newer query (and Enter always searches what is in the box).
  let searching = null;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const query = input.value.replace(/\s+/g, ' ').trim();
    if (query.length < 2) { say('Type a name, for example Zeus or WannaCry.', true); input.focus(); return; }
    searching?.abort();
    const mine = searching = new AbortController();
    form.setAttribute('aria-busy', 'true');
    say('Checking public reporting…');
    try {
      const { status, body } = await post('/api/threats/search', { query }, mine.signal);
      if (mine !== searching) return;
      if (body.status === 'matched') showResults(body);
      else say(body.message ?? body.error ?? (status === 404 ? "Threat search isn't available on this server." : 'The search failed. Try again.'), true);
    } catch {
      if (mine === searching) say("The search didn't reach the server. Try again.", true);
    } finally {
      if (mine === searching) { searching = null; form.removeAttribute('aria-busy'); }
    }
  });

  function showResults(result) {
    const list = el('ol', 'ts-list');
    list.setAttribute('aria-label', 'Search results');
    for (const candidate of result.candidates) {
      const card = el('li', 'ts-card');
      const head = el('div', 'ts-head');
      head.append(el('strong', 'ts-name', `${candidate.name}${candidate.date ? ` (${candidate.date.slice(0, 4)})` : ''}`));
      const badge = el('span', 'ts-badge mono', candidate.onSite ? 'In the ocean' : 'New');
      badge.classList.toggle('ts-in', Boolean(candidate.onSite));
      head.append(badge);
      card.append(head, el('p', 'ts-meta mono', facts(result)));
      if (candidate.summary) card.append(el('p', 'ts-sum', candidate.summary));
      if (candidate.onSite) {
        const open = el('a', 'drop-go ts-open', 'Play it on Windows');
        open.href = `/desktop.html?job=${encodeURIComponent(candidate.onSite.run)}&os=windows`;
        card.append(open);
      } else {
        const build = el('button', 'drop-go ts-create', 'Simulate it');
        build.type = 'button';
        build.addEventListener('click', () => pick(result, candidate, build));
        card.append(build);
      }
      list.append(card);
    }
    const nodes = [list];
    if (result.specific === 'several') nodes.unshift(el('p', 'ts-status mono', 'More than one match. Pick the one you meant.'));
    out.replaceChildren(...nodes);
  }

  async function pick(result, candidate, button) {
    button.disabled = true;
    try {
      const { body } = await post('/api/threats/select', { searchId: result.searchId, candidate: candidate.id });
      if (body.status !== 'selected') { say(body.error ?? 'That search has expired. Search again.', true); return; }
      confirmCreate(result, body.candidate ?? candidate, body.threatId);
    } catch {
      say("The server didn't answer. Try again.", true);
    } finally {
      button.disabled = false;
    }
  }

  function confirmCreate(result, candidate, threatId) {
    const dialog = el('dialog', 'glass ts-dialog');
    dialog.setAttribute('aria-labelledby', 'ts-c-name');
    const name = el('h2', 'ts-c-name', candidate.name);
    name.id = 'ts-c-name';
    const message = el('p', 'ts-status mono');
    const create = el('button', 'drop-go', 'Create');
    const cancel = el('button', 'ts-cancel mono', 'Cancel');
    create.type = cancel.type = 'button';
    const actions = el('div', 'ts-actions');
    actions.append(create, cancel);
    dialog.append(
      el('p', 'ts-kicker mono', facts(result)), name,
      ...(candidate.date ? [el('p', 'ts-meta mono', `Reported date: ${candidate.date}`)] : []),
      el('p', 'ts-sum', candidate.summary || ''),
      ...[el('p', 'ts-meta mono', 'Sources'), sourcesList(result.sources)].filter(Boolean),
      el('p', 'ts-q', `Create a simulated environment for ${candidate.name}?`),
      el('p', 'ts-meta mono', 'A fictional Windows desktop, written from public reporting. Nothing real is downloaded or run.'),
      message, actions,
    );
    let created = false;
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (!created) post('/api/threats/cancel', { threatId }).catch(() => {}); // discards the background research
      dialog.remove();
      input.focus({ preventScroll: true });
    });
    create.addEventListener('click', async () => {
      create.disabled = true;
      message.textContent = 'Starting…';
      try {
        const { status, body } = await post('/api/threats/create', { threatId });
        if (status !== 202 && status !== 200) { message.textContent = body.message ?? body.error ?? 'It could not be started.'; create.disabled = false; return; }
        created = true;
        dialog.close();
        play(result, candidate, threatId);
      } catch {
        message.textContent = "The server didn't answer. Try again.";
        create.disabled = false;
      }
    });
    document.body.append(dialog);
    dialog.showModal();
    create.focus();
  }

  async function play(result, candidate, threatId) {
    say(`Building ${candidate.name}…`);
    let storage = null;
    try { storage = window.localStorage; } catch { /* names last for the visit */ }
    try {
      const [{ openOceanShow }, { threatSource, threatStory }] = await Promise.all([import('/ui/job/ocean-show.mjs'), import('/ui/job/threat-source.mjs')]);
      const threat = { name: candidate.name, date: candidate.date, summary: candidate.summary, kind: result.kind, family: result.family, depth: result.depth };
      await openOceanShow({
        jobId: threatId, token: 'threat', fileName: candidate.name, storage, source: threatSource({ threatId }), story: threatStory(threat),
        onFail: () => say("The simulation couldn't be followed. Search again in a minute.", true),
        onClose: () => say(''),
      });
    } catch {
      say("The simulation couldn't be shown in this browser.", true);
    }
  }
})();
