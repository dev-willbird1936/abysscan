// The creature panel (surface page). Clicking a creature or a fish school in the ocean opens this panel over the ocean
// instead of the Bestiary page: the fish inside it (GET /api/ocean `recent`, or a school's well-known members), and for each
// fish a button that loads it into the Windows / macOS training desktop in the panel (/desktop.html?job=fish-…, an illustration
// of what such a file does: backend/detonation/fish-replays.mjs). The desktops are private local assets: where the server does
// not serve them (/api/desktop-templates/status, never on the public site) the fish are listed without the button.
// All text goes in via textContent.
(() => {
  'use strict';

  const desktops = fetch('/api/desktop-templates/status', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null)).then((s) => s?.enabled === true).catch(() => false);
  const titleCase = (slug) => String(slug).replace(/-/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
  const RUN_PART = /^[a-z0-9-]{1,30}$/;
  const OSES = new Set(['windows', 'macos']);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  let root = null, returnFocus = null;

  // The fish of a creature or a school: { label, detail, run, os, why } (run: the desktop scene's run id, or null; os: the desktop it
  // starts on; why: why a well-known fish has no desktop scene).
  function fishOf(a) {
    if (a.kind === 'creature') {
      return (a.recent ?? []).map((fish) => {
        const type = fish.type && RUN_PART.test(fish.type) ? fish.type : null;
        if (fish.base) {
          const os = OSES.has(fish.os) ? fish.os : null;
          return { label: `${fish.name}${fish.year ? ` (${fish.year})` : ''}`, detail: `${type ? `.${type} · ` : ''}a ${titleCase(fish.species).toLowerCase()}`, run: os && /^b\d{1,3}$/.test(fish.ref ?? '') ? `fish-${fish.ref}` : null, os, why: os ? null : fish.noDesktop ?? null };
        }
        const day = fish.day ? new Date(`${fish.day}T00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
        return { label: `An uploaded ${type ? `.${type} file` : titleCase(fish.species).toLowerCase()}`, detail: `eaten ${day}`.trim(), run: RUN_PART.test(a.id) ? `fish-f-${a.id}-${type ?? 'any'}` : null };
      });
    }
    const known = a.school.known ?? [], refs = a.school.knownRefs ?? [], oses = a.school.knownOs ?? [], whys = a.school.knownWhy ?? [];
    const list = known.map((name, n) => {
      const os = OSES.has(oses[n]) ? oses[n] : null;
      return { label: name, detail: titleCase(a.school.species).toLowerCase(), run: os && /^b\d{1,3}$/.test(refs[n] ?? '') ? `fish-${refs[n]}` : null, os, why: os ? null : whys[n] ?? null };
    });
    const uploads = a.school.count - known.length, type = a.school.types?.find((t) => RUN_PART.test(t));
    const depth = a.sev === 5 ? 'sunlight' : 'twilight';
    if (uploads > 0) list.push({ label: `${uploads} uploaded ${uploads === 1 ? 'file' : 'files'}`, detail: type ? `.${type}` : '', run: type ? `fish-s-${depth}-${type}` : null });
    return list;
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('message', onFrameMessage);
    window.__lenis?.start?.();
    returnFocus?.focus?.({ preventScroll: true });
  }

  function onKey(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    // Esc leaves the desktop first, then the panel.
    if (root?.classList.contains('cp-on-desktop')) root.querySelector('.cp-back')?.click();
    else close();
  }

  // Esc pressed inside the desktop (ui/desktop/desktop.js) arrives as a message from the panel's own frame.
  function onFrameMessage(event) {
    const frame = root?.querySelector('.cp-frame');
    if (event.origin !== window.location.origin || !frame || event.source !== frame.contentWindow || event.data?.type !== 'ocean-desktop-escape') return;
    onKey({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  }

  // a: the ocean record (detonation-menu.js creatureRecord / schoolRecord); tier: { name, meaning } of its depth.
  async function open(a, tier) {
    if (a?.kind !== 'creature' && a?.kind !== 'school') return false;
    close();
    returnFocus = document.activeElement;
    root = make('div', 'cp');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'cp-title');
    root.addEventListener('click', (event) => { if (event.target === root) close(); });
    const box = make('section', 'cp-box glass');
    const shut = make('button', 'cp-close', '✕');
    shut.type = 'button';
    shut.setAttribute('aria-label', 'Close');
    shut.addEventListener('click', close);
    const eyebrow = make('p', 'cp-eyebrow', tier ? `${tier.name} · ${tier.meaning}` : '');
    const title = make('h2', 'cp-title', a.name);
    title.id = 'cp-title';
    const lede = make('p', 'cp-lede', a.kind === 'creature' ? a.plainWords ?? '' : `${(a.school.types ?? []).map((t) => `.${t}`).join(' ') || 'File fish'} · ${a.school.count} in this school`);

    const listView = make('div', 'cp-list-view');
    const head = make('h3', 'cp-head', a.kind === 'creature' ? 'The fish inside it' : 'Fish in this school');
    const list = make('ul', 'cp-list');
    const canLoad = await desktops;
    if (!root) return true;
    for (const fish of fishOf(a)) {
      const row = make('li', 'cp-fish');
      const text = make('span', 'cp-fish-text');
      text.append(make('b', 'cp-fish-name', fish.label), make('small', 'cp-fish-detail', fish.detail));
      row.append(text);
      if (fish.why) text.append(make('small', 'cp-fish-why', `No desktop demo: ${fish.why}`));
      else if (canLoad && fish.run) {
        const load = make('button', 'cp-load', `Load into ${fish.os === 'macos' ? 'macOS' : 'Windows'} ▶`);
        load.type = 'button';
        load.addEventListener('click', () => showDesktop(fish));
        row.append(load);
      }
      list.append(row);
    }
    if (!list.children.length) list.append(make('li', 'cp-fish cp-empty', 'No fish yet.'));
    const foot = make('p', 'cp-foot');
    if (!canLoad) foot.append(make('span', 'cp-note', 'The Windows and macOS desktops run in the local build only. '));
    const card = make('a', 'cp-card', 'Open its Bestiary card →');
    card.href = `/bestiary#${encodeURIComponent(a.anchor)}`;
    foot.append(card);
    listView.append(head, list, foot);

    const deskView = make('div', 'cp-desk-view');
    deskView.hidden = true;
    const back = make('button', 'cp-back', '← Back to the fish');
    back.type = 'button';
    const deskTitle = make('p', 'cp-desk-title');
    const deskBar = make('div', 'cp-desk-bar');
    deskBar.append(back, deskTitle);
    deskView.append(deskBar);
    let frame = null;
    back.addEventListener('click', () => {
      frame?.remove();
      frame = null;
      deskView.hidden = true;
      listView.hidden = false;
      root.classList.remove('cp-on-desktop');
      shut.focus({ preventScroll: true });
    });
    function showDesktop(fish) {
      deskTitle.textContent = `${fish.label}: an illustration of what it does. Nothing here is real.`;
      frame = make('iframe', 'cp-frame');
      frame.title = `${fish.label} on a training desktop`;
      frame.referrerPolicy = 'no-referrer';
      frame.src = `/desktop.html?job=${fish.run}${fish.os ? `&os=${fish.os}` : ''}`;
      deskView.append(frame);
      listView.hidden = true;
      deskView.hidden = false;
      root.classList.add('cp-on-desktop');
      back.focus({ preventScroll: true });
    }

    box.append(shut, eyebrow, title, lede, listView, deskView);
    root.append(box);
    document.body.append(root);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('message', onFrameMessage);
    window.__lenis?.stop?.();
    shut.focus({ preventScroll: true });
    return true;
  }

  window.__creaturePanel = Object.freeze({ open, close });
})();
