// Programs, views and OS dialogs, drawn the same way in both training shells (docs/desktop-parity/PROGRAMS.md).
// DOM only, no framework: each shell mounts these into an element it owns and sends the returned actions as world intents.
//   fileIcon(type, os, { encrypted, shortcut })                    -> data: URL of an SVG file icon (by FILE_KINDS type)
//   renderView(el, { view, page, os, dark }, onAction(action))     -> draws a program window's content (data.views[id])
//   renderDialog(el, { dialog, world, os, dark }, onAnswer(answer)) -> draws one OS dialog (world.dialogs[n])
//   dialogFrame(dialog, world)                                     -> { modal, width, dim } placement hints for a shell
// Nothing here has an input field: views and prompts are buttons and display-only text, as the project rules require.
(() => {
  'use strict';

  const WM = typeof window !== 'undefined' && window.OceanWorldModel ? window.OceanWorldModel
    : typeof require === 'function' ? require('./world-model.js') : null;

  // ---- file icons -------------------------------------------------------------------------------------------

  // [colour, label, glyph] per type. Glyphs are small SVG fragments drawn in a 48×48 box.
  const ICON_STYLE = {
    program: ['#2b6cb0', '', 'window'], script: ['#5b5b5b', '', 'scroll'], installer: ['#7b4bb7', '', 'box'], macapp: ['#3c7be0', '', 'app'],
    diskimage: ['#8a8f98', '', 'disc'], archive: ['#c9a227', 'ZIP', 'zip'], shortcut: ['#2b6cb0', '', 'link'], library: ['#6b7280', 'DLL', 'gear'],
    data: ['#6b7280', 'DAT', 'page'], java: ['#d9480f', 'JAR', 'cup'], word: ['#2b579a', 'W', 'letter'], 'word-macro': ['#2b579a', 'W', 'letter-macro'],
    sheet: ['#217346', 'X', 'letter'], 'sheet-macro': ['#217346', 'X', 'letter-macro'], slides: ['#c43e1c', 'P', 'letter'], pdf: ['#d93025', 'PDF', 'band'],
    text: ['#6b7280', '', 'lines'], web: ['#0b7a75', '', 'globe'], mail: ['#1a73e8', '', 'envelope'], image: ['#0f9d58', '', 'picture'],
    audio: ['#e8710a', '', 'note'], video: ['#a142f4', '', 'film'], certificate: ['#b8860b', '', 'seal'], calendar: ['#e8453c', 'ICS', 'band'], contact: ['#5f6368', 'VCF', 'band'], folder: ['#e8b339', '', 'folder'],
    unknown: ['#9aa0a6', '', 'blank'],
  };
  const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svgUrl = body => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">${body}</svg>`)}`;
  function glyphOf(kind, colour, label) {
    switch (kind) {
      case 'window': return `<rect x="9" y="12" width="30" height="24" rx="2.5" fill="#fff" stroke="${colour}" stroke-width="2"/><rect x="9" y="12" width="30" height="6" rx="2.5" fill="${colour}"/><rect x="13" y="22" width="9" height="2" fill="${colour}" opacity=".6"/><rect x="13" y="27" width="16" height="2" fill="${colour}" opacity=".4"/>`;
      case 'scroll': return `<path d="M13 9h20a3 3 0 0 1 3 3v24a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V12" fill="#f4f1e8" stroke="#6b6b6b" stroke-width="1.6"/><circle cx="31" cy="32" r="7" fill="${colour}"/><path d="M31 27.5v2m0 5v2m-4.5-4.5h2m5 0h2" stroke="#fff" stroke-width="1.6"/><circle cx="31" cy="32" r="2" fill="#fff"/><path d="M17 16h14M17 20h14M17 24h8" stroke="#8a8a8a" stroke-width="1.4"/>`;
      case 'box': return `<path d="M24 8l15 7v18l-15 7-15-7V15z" fill="${colour}"/><path d="M9 15l15 7 15-7M24 22v18" stroke="#fff" stroke-width="1.6" fill="none" opacity=".8"/>`;
      case 'app': return `<rect x="8" y="8" width="32" height="32" rx="8" fill="${colour}"/><path d="M16 30l8-14 8 14z" fill="#fff" opacity=".9"/>`;
      case 'disc': return `<circle cx="24" cy="24" r="15" fill="#e8eaed" stroke="${colour}" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="#fff" stroke="${colour}" stroke-width="2"/>`;
      case 'zip': return `<path d="M6 14a3 3 0 0 1 3-3h9l4 4h17a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#f3c74d" stroke="#c9a227" stroke-width="1.2"/><path d="M24 15v21" stroke="#555" stroke-width="3" stroke-dasharray="2 2"/>`;
      case 'link': return `<rect x="9" y="9" width="30" height="30" rx="4" fill="#fff" stroke="#9aa0a6"/><path d="M15 33l14-14m-8 0h8v8" stroke="${colour}" stroke-width="3" fill="none"/>`;
      case 'folder': return `<path d="M5 13a3 3 0 0 1 3-3h10l4 4h18a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="${colour}"/><path d="M5 19h38v16a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="#f6ca5a"/>`;
      default: {
        const page = `<path d="M12 5h17l9 9v27a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="#fff" stroke="#b8bcc2" stroke-width="1.2"/><path d="M29 5v7a2 2 0 0 0 2 2h7" fill="#e8eaed" stroke="#b8bcc2" stroke-width="1.2"/>`;
        const extra = {
          band: `<rect x="10" y="27" width="28" height="11" fill="${colour}"/><text x="24" y="35.5" font-family="Arial" font-weight="700" font-size="8.5" fill="#fff" text-anchor="middle">${esc(label)}</text>`,
          letter: `<rect x="6" y="19" width="19" height="19" rx="2" fill="${colour}"/><text x="15.5" y="33" font-family="Arial" font-weight="700" font-size="13" fill="#fff" text-anchor="middle">${esc(label)}</text><path d="M28 22h7M28 27h7M28 32h7" stroke="${colour}" stroke-width="1.6" opacity=".5"/>`,
          'letter-macro': `<rect x="6" y="19" width="19" height="19" rx="2" fill="${colour}"/><text x="15.5" y="33" font-family="Arial" font-weight="700" font-size="13" fill="#fff" text-anchor="middle">${esc(label)}</text><circle cx="33" cy="33" r="6" fill="#f9ab00"/><text x="33" y="36.5" font-family="Arial" font-weight="700" font-size="9" fill="#fff" text-anchor="middle">!</text>`,
          lines: `<path d="M16 18h16M16 23h16M16 28h16M16 33h10" stroke="#9aa0a6" stroke-width="1.6"/>`,
          globe: `<circle cx="24" cy="27" r="9" fill="none" stroke="${colour}" stroke-width="1.8"/><path d="M15 27h18M24 18c-4 5-4 13 0 18M24 18c4 5 4 13 0 18" stroke="${colour}" stroke-width="1.4" fill="none"/>`,
          envelope: `<rect x="14" y="21" width="20" height="14" rx="1.5" fill="none" stroke="${colour}" stroke-width="1.8"/><path d="M14 22l10 7 10-7" stroke="${colour}" stroke-width="1.8" fill="none"/>`,
          picture: `<rect x="14" y="19" width="20" height="16" rx="1.5" fill="#e6f4ea" stroke="${colour}" stroke-width="1.4"/><path d="M15 33l6-7 4 4 3-3 5 6z" fill="${colour}"/><circle cx="29" cy="23.5" r="2" fill="#fbbc04"/>`,
          note: `<path d="M21 34V20l10-2v13" stroke="${colour}" stroke-width="2" fill="none"/><circle cx="19" cy="34" r="3" fill="${colour}"/><circle cx="29" cy="31" r="3" fill="${colour}"/>`,
          film: `<rect x="14" y="19" width="20" height="16" rx="1.5" fill="${colour}"/><path d="M22 23v8l6-4z" fill="#fff"/>`,
          seal: `<circle cx="24" cy="26" r="7" fill="${colour}"/><path d="M20 32l-2 7 6-3 6 3-2-7" fill="${colour}"/>`,
          gear: `<circle cx="24" cy="28" r="7" fill="none" stroke="${colour}" stroke-width="3" stroke-dasharray="3 2"/><circle cx="24" cy="28" r="2.5" fill="${colour}"/>${label ? `<text x="24" y="17" font-family="Arial" font-weight="700" font-size="6.5" fill="${colour}" text-anchor="middle">${esc(label)}</text>` : ''}`,
          cup: `<path d="M17 24h12v6a6 6 0 0 1-12 0z" fill="${colour}"/><path d="M29 26h2a2 2 0 0 1 0 4h-2" stroke="${colour}" stroke-width="1.6" fill="none"/><path d="M21 16c-1 2 1 3 0 5M25 16c-1 2 1 3 0 5" stroke="${colour}" stroke-width="1.2" fill="none"/>`,
          page: `<text x="24" y="33" font-family="Arial" font-weight="700" font-size="8" fill="${colour}" text-anchor="middle">${esc(label)}</text>`,
          blank: '',
        }[kind] ?? '';
        return page + extra;
      }
    }
  }
  const iconCache = new Map();
  function fileIcon(type, os = 'windows', flags = {}) {
    const key = `${type}|${os}|${flags.encrypted ? 1 : 0}|${flags.shortcut ? 1 : 0}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const [colour, label, glyph] = ICON_STYLE[type] ?? ICON_STYLE.unknown;
    let body = glyphOf(glyph, colour, label);
    if (flags.shortcut && type !== 'shortcut') body += '<rect x="4" y="30" width="14" height="14" rx="2" fill="#fff" stroke="#9aa0a6"/><path d="M8 40l6-6m-4 0h4v4" stroke="#1a73e8" stroke-width="2" fill="none"/>';
    if (flags.encrypted) body += '<rect x="28" y="29" width="16" height="13" rx="2" fill="#d93025"/><path d="M31.5 29v-3a4.5 4.5 0 0 1 9 0v3" stroke="#d93025" stroke-width="2.2" fill="none"/><circle cx="36" cy="35.5" r="1.8" fill="#fff"/>';
    const url = svgUrl(body);
    iconCache.set(key, url);
    return url;
  }

  // ---- small DOM helpers ------------------------------------------------------------------------------------

  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'style') Object.assign(node.style, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      // A true data-* flag reads "true" (CSS matches [data-x=true]); other true attributes are bare (hidden, disabled).
      else node.setAttribute(key, value === true ? (key.startsWith('data-') ? 'true' : '') : value);
    }
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return node;
  }
  // Element.append(null) would print "null": optional parts (a bar, a button row) are skipped.
  const put = (node, ...kids) => node.append(...kids.flat(Infinity).filter(kid => kid !== null && kid !== undefined && kid !== false));
  const paras = text => String(text ?? '').split(/\n{2,}/).map(block => h('p', { class: 'opv-p' }, block));
  // Status icons: a circle or shield with a mark, drawn inline.
  const STATUS = {
    error: ['#d93025', 'M17 17l14 14M31 17L17 31', 'circle'], warning: ['#f9ab00', 'M24 15v12m0 5v2', 'triangle'], info: ['#1a73e8', 'M24 22v12m0-18v2', 'circle'],
    question: ['#1a73e8', 'M19 19a5 5 0 1 1 7 4.5c-1.5.8-2 1.8-2 3.5m0 4v1', 'circle'], shield: ['#1a73e8', 'M24 16v10m0 4v2', 'shield'],
    'shield-ok': ['#188038', 'M17 24l5 5 9-10', 'shield'], 'shield-bad': ['#d93025', 'M18 18l12 12M30 18L18 30', 'shield'], lock: ['#5f6368', '', 'lock'],
    program: ['#2b6cb0', '', 'program'], gear: ['#5f6368', '', 'gear'], bug: ['#d93025', '', 'bug'], disk: ['#5f6368', '', 'disk'], web: ['#0b7a75', '', 'web'],
    mail: ['#1a73e8', '', 'mail'], money: ['#188038', '', 'money'], user: ['#5f6368', '', 'user'], character: ['#34a853', '', 'character'],
  };
  function statusIcon(name, size = 40) {
    if (!name || name === 'none') return null;
    if (name === 'character') return characterArt(size);
    const [colour, mark, shape] = STATUS[name] ?? STATUS.info;
    const base = {
      circle: `<circle cx="24" cy="24" r="19" fill="${colour}"/>`,
      triangle: `<path d="M24 5l21 37H3z" fill="${colour}"/>`,
      shield: `<path d="M24 4l17 6v12c0 11-7.5 19-17 22C14.5 41 7 33 7 22V10z" fill="${colour}"/>`,
      lock: `<rect x="10" y="21" width="28" height="22" rx="4" fill="${colour}"/><path d="M16 21v-5a8 8 0 0 1 16 0v5" stroke="${colour}" stroke-width="4" fill="none"/>`,
      program: glyphOf('window', colour, ''), gear: `<circle cx="24" cy="24" r="12" fill="none" stroke="${colour}" stroke-width="6" stroke-dasharray="5 3"/><circle cx="24" cy="24" r="5" fill="${colour}"/>`,
      bug: `<ellipse cx="24" cy="27" rx="10" ry="13" fill="${colour}"/><circle cx="24" cy="12" r="6" fill="${colour}"/><path d="M14 22H6m36 0h-8M14 32H6m36 0h-8" stroke="${colour}" stroke-width="3"/>`,
      disk: `<rect x="6" y="14" width="36" height="20" rx="4" fill="${colour}"/><circle cx="35" cy="24" r="2.5" fill="#7ee787"/>`,
      web: `<circle cx="24" cy="24" r="17" fill="none" stroke="${colour}" stroke-width="3"/><path d="M7 24h34M24 7c-7 9-7 25 0 34M24 7c7 9 7 25 0 34" stroke="${colour}" stroke-width="2.4" fill="none"/>`,
      mail: `<rect x="6" y="12" width="36" height="24" rx="3" fill="${colour}"/><path d="M6 14l18 13 18-13" stroke="#fff" stroke-width="2.4" fill="none"/>`,
      money: `<rect x="5" y="13" width="38" height="22" rx="3" fill="${colour}"/><circle cx="24" cy="24" r="6" fill="#fff" opacity=".85"/>`,
      user: `<circle cx="24" cy="17" r="8" fill="${colour}"/><path d="M9 42c1-9 7-14 15-14s14 5 15 14z" fill="${colour}"/>`,
    }[shape];
    return h('img', { class: 'opv-status', alt: '', width: size, height: size, src: svgUrl(`${base}${mark ? `<path d="${mark}" stroke="#fff" stroke-width="3.6" stroke-linecap="round" fill="none"/>` : ''}`) });
  }
  // An original desktop helper character (a round green blob with a cap): fictional art, not a real product's mascot.
  function characterArt(size = 120) {
    return h('img', { class: 'opv-character-art', alt: '', width: size, height: size, src: svgUrl(
      '<ellipse cx="24" cy="44" rx="13" ry="2.5" fill="#000" opacity=".18"/><path d="M24 8c10 0 16 8 16 19s-7 16-16 16S8 38 8 27 14 8 24 8z" fill="#3ccf7a"/>' +
      '<ellipse cx="18" cy="24" rx="4" ry="5" fill="#fff"/><ellipse cx="30" cy="24" rx="4" ry="5" fill="#fff"/><circle cx="19" cy="25" r="2" fill="#1b1b1b"/><circle cx="31" cy="25" r="2" fill="#1b1b1b"/>' +
      '<path d="M18 33c3 3 9 3 12 0" stroke="#1b1b1b" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M11 14c4-8 22-8 26 0l-3 2c-5-4-15-4-20 0z" fill="#f2711c"/><circle cx="24" cy="7" r="2.5" fill="#f2711c"/>') });
  }

  // ---- views ----------------------------------------------------------------------------------------------------

  const TIMERS = new WeakMap();
  const CHECKS = new WeakMap();
  const pad = n => String(n).padStart(2, '0');
  const countdown = seconds => {
    const s = Math.max(0, seconds);
    const d = Math.floor(s / 86400);
    return `${d ? `${pad(d)}:` : ''}${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  function clearTimers(el) {
    for (const timer of TIMERS.get(el) ?? []) clearInterval(timer);
    TIMERS.set(el, []);
  }
  const every = (el, ms, fn) => {
    fn();
    const timer = setInterval(fn, ms);
    TIMERS.get(el).push(timer);
  };

  function section(el, item, form = null, at = 0) {
    const tone = item.tone ? ` opv-tone-${item.tone}` : '';
    const box = h('div', { class: `opv-section${tone}` });
    // On a web page: what malware added can be flagged (QUESTS.md §2), and its fields are typed like the form's.
    if (form) box.setAttribute('data-ocean-key', `section:${form.pageId}:${at}`);
    if (form && item.heading) box.setAttribute('data-ocean-label', item.heading);
    if (item.tone === 'injected') box.append(h('div', { class: 'opv-injected-tag' }, 'Added by the malware, not by the site'));
    if (item.heading) box.append(h('div', { class: 'opv-section-heading' }, item.heading));
    if (item.text) box.append(...paras(item.text));
    if (item.rows) box.append(h('div', { class: 'opv-rows' }, item.rows.map(([label, value]) => [h('div', { class: 'opv-row-label' }, label), h('div', { class: 'opv-row-value' }, value)])));
    if (item.table) {
      box.append(h('div', { class: 'opv-table-wrap' }, h('table', { class: 'opv-table' },
        h('thead', {}, h('tr', {}, item.table.columns.map(col => h('th', {}, col)))),
        h('tbody', {}, item.table.rows.map(row => h('tr', {}, row.map(cell => h('td', {}, cell))))))));
    }
    if (item.items) box.append(h('ul', { class: 'opv-items' }, item.items.map(text => h('li', {}, text))));
    if (item.checks) {
      // In a program window a check can be clicked (an installer's pre-ticked offer); the world keeps what was flipped.
      const ctx = form ? null : CHECKS.get(el);
      box.append(h('div', { class: 'opv-checks' }, item.checks.map(check => {
        if (!ctx) return h('div', { class: 'opv-check', 'data-checked': check.checked }, h('span', { class: 'opv-box' }, check.checked ? '✓' : ''), check.label);
        const n = ctx.n++;
        const on = ctx.flips.has(`${ctx.page}.${n}`) ? !check.checked : check.checked;
        return h('button', { class: 'opv-check', type: 'button', role: 'checkbox', 'aria-checked': String(on), 'data-checked': on, 'data-ocean-key': `view-btn:check:${n}`, 'data-ocean-label': `The “${check.label}” box`,
          onClick: () => ctx.onAction(`check:${n}`) }, h('span', { class: 'opv-box' }, on ? '✓' : ''), check.label);
      })));
    }
    if (Number.isInteger(item.progress)) {
      const fill = h('div', { class: 'opv-progress-fill' });
      box.append(h('div', { class: 'opv-progress' }, fill));
      // A short fill animation up to the value: a scan or an install in progress.
      let at = 0;
      every(el, 60, () => {
        at = Math.min(item.progress, at + Math.max(1, item.progress / 40));
        fill.style.width = `${at}%`;
      });
    }
    if (item.timer) {
      const value = h('div', { class: 'opv-timer-value' });
      const start = Date.now();
      box.append(h('div', { class: 'opv-timer' }, h('div', { class: 'opv-timer-label' }, item.timer.label), value));
      every(el, 1000, () => { value.textContent = countdown(item.timer.seconds - Math.floor((Date.now() - start) / 1000)); });
    }
    if (item.code) box.append(h('pre', { class: 'opv-code' }, item.code));
    if (item.fields && form) box.append(fieldList(item.fields, form, form.offsets[at]));
    if (item.note) box.append(h('div', { class: 'opv-note' }, item.note));
    return box;
  }

  // ---- web forms (QUESTS.md §3): fields with no input element. Each key types the field's next character of the scene's
  // fictional value, so nothing real can be entered. A full field passes the next key on to the next empty one.
  const FOCUS = new Map(); // page id -> the field index that has the caret
  function fieldList(fields, form, offset) {
    return h('div', { class: 'opg-fields' }, fields.map((field, n) => {
      const index = offset + n;
      const count = form.typed?.[index] ?? 0;
      const full = count >= field.value.length;
      const text = field.secret && !field.reveal ? '\u2022'.repeat(count) : field.value.slice(0, count);
      const box = h('div', { class: 'opg-field-box', tabindex: '0', role: 'textbox', 'aria-label': field.label, 'data-field': index, 'data-full': full,
        'data-ocean-key': `field:${form.pageId}:${index}`, 'data-ocean-label': `The "${field.label}" box` }, h('span', { class: 'opg-field-text' }, text), h('span', { class: 'opg-caret' }));
      const type = event => {
        if (event.ctrlKey || event.metaKey || event.altKey || !(event.key.length === 1 || event.key === 'Backspace')) return;
        event.preventDefault();
        event.stopPropagation();
        const total = form.lengths;
        const next = (form.typed?.[index] ?? 0) < total[index] ? index : total.findIndex((len, k) => k > index && (form.typed?.[k] ?? 0) < len);
        if (next < 0) return;
        FOCUS.set(form.pageId, next);
        form.onType(next);
      };
      box.addEventListener('keydown', type);
      box.addEventListener('focus', () => FOCUS.set(form.pageId, index));
      box.addEventListener('click', () => box.focus());
      return h('label', { class: `opg-field${field.reveal ? ' opg-field-reveal' : ''}` }, h('span', { class: 'opg-field-label' }, field.label), box);
    }));
  }

  function buttonsOf(page, layout, pageIndex, pageCount, onAction, os) {
    let buttons = page.buttons;
    if (!buttons?.length && layout === 'wizard') {
      buttons = [...(pageIndex > 0 ? [{ label: '< Back', action: 'back' }] : []),
        pageIndex < pageCount - 1 ? { label: 'Next >', action: 'next', primary: true } : { label: 'Finish', action: 'done', primary: true },
        { label: 'Cancel', action: 'close' }];
      if (os === 'macos') buttons = buttons.map(button => ({ ...button, label: button.label.replace(/^< /, '').replace(/ >$/, '') }));
    }
    if (!buttons?.length && layout === 'message') buttons = [{ label: 'OK', action: 'close', primary: true }];
    if (!buttons?.length) return null;
    // view-btn:<action> lets the guide cue a wizard's Next and Finish (QUESTS.md §2).
    return h('div', { class: 'opv-buttons' }, buttons.map(button => h('button', {
      class: `opv-button${button.primary ? ' opv-primary' : ''}`, type: 'button', onClick: event => { event.stopPropagation(); onAction(button.action ?? 'close'); },
      'data-ocean-key': `view-btn:${button.action ?? 'close'}`, 'data-ocean-label': `The "${button.label}" button`,
    }, button.label)));
  }

  function body(el, page, view) {
    const parts = [];
    if (page.image) parts.push(h('img', { class: 'opv-image', alt: '', src: page.image }));
    if (page.text) parts.push(...paras(page.text));
    for (const item of page.sections ?? []) parts.push(section(el, item));
    if (page.lines) {
      // Each line of a program window (a console, a request log) can be flagged: line:<view>:<page>.<n> (QUESTS.md §2).
      const ctx = CHECKS.get(el);
      parts.push(ctx?.id
        ? h('pre', { class: 'opv-lines' }, page.lines.map((line, n) => h('span', { class: 'opv-line', 'data-ocean-key': `line:${ctx.id}:${ctx.page}.${n}`, 'data-ocean-label': `The line “${line.slice(0, 60)}”` }, line)))
        : h('pre', { class: 'opv-lines' }, page.lines.join('\n')));
    }
    if (page.counter) {
      const line = h('div', { class: 'opv-counter' });
      const { from, to, label } = page.counter;
      const start = Date.now();
      every(el, 120, () => {
        const n = Math.round(from + (to - from) * Math.min(1, (Date.now() - start) / 9000));
        const percent = to > 0 ? Math.floor((n / to) * 100) : 100;
        line.textContent = label.replace('{n}', n.toLocaleString('en-US')).replace('{to}', to.toLocaleString('en-US')).replace('{p}', percent);
      });
      parts.push(line);
    }
    return parts;
  }

  // The view's content for one page. Page 0 is the view itself; pages[] (when present) replace its content per page.
  // WCAG relative luminance of #rgb / #rrggbb: dark text on a light colour, white on a dark one.
  function inkOn(hex) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return '#fff';
    const full = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#141414' : '#fff';
  }

  // The app a file opens in, by OS. A view built for a file (world-model docViewOf) stores the neutral name.
  const APP_BY_OS = {
    Console: ['Command Prompt', 'Terminal'], Document: ['Word', 'Word'], Spreadsheet: ['Excel', 'Numbers'], Presentation: ['PowerPoint', 'Keynote'], Browser: ['Microsoft Edge', 'Safari'], PDF: ['Microsoft Edge', 'Preview'],
    Mail: ['Outlook', 'Mail'], Certificate: ['Certificate', 'Keychain Access'], Archive: ['File Explorer', 'Archive Utility'], Disc: ['File Explorer', 'Finder'],
  };
  const appName = (name, os) => (APP_BY_OS[name] ? APP_BY_OS[name][os === 'macos' ? 1 : 0] : name);
  const COLUMN = n => String.fromCharCode(65 + n);
  const numeric = text => /^[-+(]?[$€£]?\d[\d,]*(\.\d+)?%?\)?$/.test(String(text).trim());

  // A spreadsheet grid: column letters, row numbers, the file's table from row 1, a formula bar that shows the clicked cell.
  // The selection is local view state, like a hover.
  function sheetGrid(el, table, os) {
    const cols = Math.max(8, table.columns.length + 2);
    const rows = [table.columns, ...table.rows];
    const count = Math.max(22, rows.length + 4);
    const nameBox = h('div', { class: 'opv-sheet-name' }, 'A1');
    const formula = h('div', { class: 'opv-sheet-formula-value' }, rows[0]?.[0]?.trim() ?? '');
    let selected = null;
    const pick = (cell, r, c) => {
      selected?.classList.remove('opv-sheet-sel');
      selected = cell;
      cell.classList.add('opv-sheet-sel');
      nameBox.textContent = `${COLUMN(c)}${r + 1}`;
      formula.textContent = (rows[r]?.[c] ?? '').trim();
    };
    const body = [];
    for (let r = 0; r < count; r++) {
      const cells = [h('th', { class: 'opv-sheet-rowhead' }, String(r + 1))];
      for (let c = 0; c < cols; c++) {
        const value = (rows[r]?.[c] ?? '').trim();
        const cell = h('td', { class: `${r === 0 && rows.length > 1 ? 'opv-sheet-head' : ''}${numeric(value) ? ' opv-sheet-num' : ''}` }, value);
        cell.addEventListener('click', () => pick(cell, r, c));
        cells.push(cell);
      }
      body.push(h('tr', {}, cells));
    }
    const grid = h('table', { class: 'opv-sheet-grid' }, h('thead', {}, h('tr', {}, h('th', { class: 'opv-sheet-corner' }), Array.from({ length: cols }, (_, c) => h('th', {}, COLUMN(c))))), h('tbody', {}, body));
    const first = grid.querySelector('tbody td');
    if (first) { first.classList.add('opv-sheet-sel'); selected = first; }
    return [h('div', { class: 'opv-sheet-formula' }, nameBox, h('div', { class: 'opv-sheet-fx' }, os === 'macos' ? '=' : 'fx'), formula),
      h('div', { class: 'opv-sheet-scroll' }, grid)];
  }
  const RIBBON = {
    sheet: [['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View'], ['Table', 'Chart', 'Text', 'Shape', 'Media', 'Comment', 'Format', 'Organize']],
    slides: [['File', 'Home', 'Insert', 'Design', 'Transitions', 'Animations', 'Slide Show', 'View'], ['Play', 'Table', 'Chart', 'Text', 'Shape', 'Media', 'Format', 'Animate']],
    word: [['File', 'Home', 'Insert', 'Layout', 'References', 'Mailings', 'Review', 'View'], ['Insert', 'Table', 'Chart', 'Text', 'Shape', 'Media', 'Comment', 'Format']],
    pdf: [['Draw', 'Highlight', 'Erase', 'Read aloud', 'Print'], ['Markup', 'Rotate', 'Highlight', 'Share', 'Search']],
  };
  // A document window's tool strip: Word's ribbon or a PDF viewer's tools, by the app the view names; null for any other.
  const docRibbon = view => (['Word', 'Document'].includes(view.app) ? 'word' : view.app === 'PDF' ? 'pdf' : null);
  // The app's own chrome: a ribbon of tabs on Windows, a toolbar of tools on macOS. Display only.
  const appBar = (layout, view, os) => h('div', { class: `opv-appbar opv-appbar-${layout}` },
    h('span', { class: 'opv-appbar-name' }, appName(view.app, os) ?? view.title),
    h('span', { class: 'opv-appbar-tabs' }, RIBBON[layout][os === 'macos' ? 1 : 0].map((tab, n) => h('span', { class: `opv-appbar-tab${n === 1 && os !== 'macos' ? ' opv-appbar-on' : ''}` }, tab))));
  const officeBar = (bar, onAction) => (bar ? h('div', { class: `opv-bar opv-bar-${bar.tone ?? 'warn'}` }, h('span', { class: 'opv-bar-text' }, bar.text),
    bar.button ? h('button', { class: 'opv-button', type: 'button', onClick: () => onAction(bar.action ?? 'next'),
      'data-ocean-key': `view-btn:${bar.action ?? 'next'}`, 'data-ocean-label': `The "${bar.button}" button` }, bar.button) : null) : null);

  function renderView(el, { view, id = null, page = 0, os = 'windows', dark = false, flips = [] } = {}, onAction = () => {}) {
    clearTimers(el);
    el.replaceChildren();
    if (!view) return;
    const pages = view.pages?.length ? view.pages : [view];
    const index = Math.min(page, pages.length - 1);
    CHECKS.set(el, { flips: new Set(flips ?? []), page: index, n: 0, onAction, id });
    const current = { ...(view.pages?.length ? {} : view), ...pages[index] };
    const theme = view.theme ?? {};
    // data-ocean-view: the shells find a program window by it (flag key view:<id>).
    const root = h('div', { class: `opv opv-${view.layout} opv-os-${os}${dark ? ' opv-dark' : ''}`, 'data-view-layout': view.layout, 'data-page': index, ...(id ? { 'data-ocean-view': id } : {}) });
    if (theme.bg) root.style.setProperty('--opv-bg', theme.bg);
    if (theme.fg) root.style.setProperty('--opv-fg', theme.fg);
    if (theme.accent) root.style.setProperty('--opv-accent', theme.accent);
    if (theme.header) root.style.setProperty('--opv-header', theme.header);
    // Text on a scene-coloured band (ransom head, wizard side, scan head) is white or near-black, whichever reads.
    if (theme.header) root.style.setProperty('--opv-header-fg', inkOn(theme.header));
    if (theme.accent) root.style.setProperty('--opv-accent-fg', inkOn(theme.accent));
    const heading = current.heading ? h('div', { class: 'opv-heading' }, current.heading) : null;
    const icon = statusIcon(current.icon ?? (view.layout === 'message' ? 'info' : null), view.layout === 'message' ? 36 : 32);
    const buttons = buttonsOf(current, view.layout, index, pages.length, onAction, os);
    const training = h('div', { class: 'opv-training' }, 'Training copy: nothing here is real');
    switch (view.layout) {
      case 'message':
        put(root, h('div', { class: 'opv-message-main' }, icon, h('div', { class: 'opv-message-text' }, heading, body(el, current, view))), buttons);
        break;
      case 'wizard': {
        const steps = view.pages?.length ? h('ol', { class: 'opv-wizard-steps' }, view.pages.map((item, n) => h('li', { 'data-current': n === index, 'data-done': n < index }, item.heading ?? `Step ${n + 1}`))) : null;
        put(root, h('div', { class: 'opv-wizard-side' }, os === 'macos' ? steps : h('div', { class: 'opv-wizard-brand' }, statusIcon(current.icon ?? 'program', 44), view.app ?? view.title)),
          h('div', { class: 'opv-wizard-main' }, h('div', { class: 'opv-wizard-head' }, heading, view.publisher ? h('div', { class: 'opv-sub' }, view.publisher) : null),
            h('div', { class: 'opv-wizard-body' }, body(el, current, view)), buttons));
        break;
      }
      case 'ransom': {
        // Like the real ransom windows, the countdowns stand in a coloured side column next to the demand.
        const timed = (current.sections ?? []).filter(item => item.timer);
        const side = timed.length ? h('div', { class: 'opv-ransom-side' }, timed.map(item => section(el, item))) : null;
        const main = side ? { ...current, sections: current.sections.filter(item => !item.timer) } : current;
        put(root, h('div', { class: 'opv-ransom-head' }, icon ?? statusIcon('lock', 34), heading ?? view.title), training,
          h('div', { class: `opv-ransom-frame${side ? ' opv-ransom-split' : ''}` }, side, h('div', { class: 'opv-ransom-body' }, body(el, main, view))), buttons);
        break;
      }
      case 'console':
        put(root, h('div', { class: 'opv-console-body' }, heading ? h('div', { class: 'opv-console-head' }, heading) : null, body(el, current, view)), buttons);
        break;
      case 'sheet': {
        const table = (current.sections ?? []).find(item => item.table)?.table ?? { columns: [' '], rows: [] };
        put(root, appBar('sheet', view, os), officeBar(current.bar, onAction), ...sheetGrid(el, table, os),
          h('div', { class: 'opv-sheet-tabs' }, h('span', { class: 'opv-sheet-tab' }, os === 'macos' ? 'Sheet 1' : 'Sheet1'), h('span', { class: 'opv-sheet-add' }, '+'),
            h('span', { class: 'opv-sheet-status' }, current.bar ? 'Read-only' : 'Ready')), buttons);
        break;
      }
      case 'slides': {
        const thumbs = h('div', { class: 'opv-slides-thumbs' }, pages.map((slide, n) => h('button', {
          class: 'opv-slides-thumb', type: 'button', 'data-current': n === index, onClick: () => onAction(`page:${n}`),
        }, h('span', { class: 'opv-slides-num' }, String(n + 1)), h('span', { class: 'opv-slides-mini' }, slide.heading ?? ''))));
        const slide = h('div', { class: `opv-slides-slide${index === 0 ? ' opv-slides-title' : ''}` }, heading, body(el, { ...current, heading: undefined }, view));
        const nav = h('div', { class: 'opv-buttons opv-slides-nav' }, h('span', { class: 'opv-slides-count' }, `Slide ${index + 1} of ${pages.length}`),
          h('button', { class: 'opv-button', type: 'button', disabled: index === 0, onClick: () => onAction('back') }, os === 'macos' ? '‹ Previous' : 'Previous'),
          h('button', { class: 'opv-button opv-primary', type: 'button', disabled: index >= pages.length - 1, onClick: () => onAction('next'), 'data-ocean-key': 'view-btn:next' }, os === 'macos' ? 'Next ›' : 'Next'));
        put(root, appBar('slides', view, os), h('div', { class: 'opv-slides-main' }, thumbs, h('div', { class: 'opv-slides-stage' }, slide)), nav);
        break;
      }
      case 'document': {
        const bar = officeBar(current.bar, onAction);
        // The window's title bar already names the file: the strip under it is the app's own (a ribbon, a viewer's tools).
        const ribbon = docRibbon(view);
        put(root, ribbon ? appBar(ribbon, view, os) : h('div', { class: 'opv-doc-tool' }, appName(view.app, os) ?? 'Document', h('span', { class: 'opv-sub' }, view.title)), bar,
          h('div', { class: 'opv-doc-scroll' }, h('div', { class: 'opv-doc-page' }, heading, body(el, current, view))), buttons);
        break;
      }
      case 'screen':
        put(root, h('div', { class: 'opv-screen-body' }, heading, body(el, current, view), buttons), h('div', { class: 'opv-training opv-screen-training' }, 'Training illustration: nothing here is real'));
        break;
      case 'scan':
        put(root, h('div', { class: 'opv-scan-head' }, icon ?? statusIcon('shield-bad', 34), h('div', {}, heading ?? view.title, view.app ? h('div', { class: 'opv-sub' }, view.app) : null)), training,
          h('div', { class: 'opv-scan-body' }, body(el, current, view)), buttons);
        break;
      case 'character':
        put(root, h('div', { class: 'opv-balloon' }, heading, current.balloon ? h('p', { class: 'opv-p' }, current.balloon) : null, body(el, { ...current, balloon: undefined }, view), buttons),
          characterArt(110));
        break;
      default:
        put(root, h('div', { class: 'opv-panel-head' }, icon, heading), h('div', { class: 'opv-panel-body' }, body(el, current, view)), buttons);
    }
    el.append(root);
  }

  // ---- OS dialogs -------------------------------------------------------------------------------------------------

  // The folder a file is in, as each OS writes it. Under a drive (world-model: a top folder with `drive`): C:\Tools,
  // E:\ for a USB stick, \\fileserver\ for a share; macOS: /Volumes/<name>. Otherwise the user's home.
  const pathOf = (world, node, os) => {
    const parts = [];
    let drive = null;
    for (let at = world.fs.nodes[node?.parentId]; at && at.id !== 'root'; at = world.fs.nodes[at.parentId]) {
      if (at.drive) { drive = at; break; }
      parts.unshift(at.id === 'home' ? world.user.short : at.name);
    }
    if (os === 'macos') return drive ? `/Volumes/${[drive.name, ...parts].join('/')}` : `/Users/${parts.join('/')}`;
    if (!drive) return `C:\\Users\\${parts.join('\\')}`;
    const root = /^[A-Z]$/i.test(drive.drive) ? `${drive.drive.toUpperCase()}:` : drive.archive === 'share' ? `\\\\${drive.drive}` : drive.archive === 'cd' ? 'D:' : 'E:';
    return [root, ...parts].join('\\') + (parts.length ? '' : '\\');
  };
  const sizeOf = bytes => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  const dateOf = iso => { try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

  // Placement hints: elevation dims the whole screen (the secure desktop), the others float over it.
  function dialogFrame(dialog) {
    return { modal: dialog.kind !== 'autoplay' && dialog.kind !== 'detected', dim: dialog.kind === 'elevation', corner: dialog.kind === 'autoplay' || dialog.kind === 'detected' };
  }

  function renderDialog(el, { dialog, world, os = 'windows', dark = false } = {}, onAnswer = () => {}) {
    clearTimers(el);
    el.replaceChildren();
    if (!dialog || !world) return;
    const node = dialog.fileId ? world.fs.nodes[dialog.fileId] : null;
    const program = dialog.programId ? world.data.programs?.[dialog.programId] : null;
    const type = node ? WM.fileTypeOf(node) : { type: 'program', label: 'Application', ext: 'exe' };
    // Where the file came from, as macOS records it: a mail attachment, else a web download.
    const fromMail = !!node && (world.data.mail?.messages ?? []).some(message => message.attachments?.includes(node.id));
    const name = node?.name ?? program?.name ?? 'program';
    const publisher = program ? program.publisher : null;
    const icon = node ? fileIcon(WM.iconTypeOf(node), os, { encrypted: node.encrypted }) : fileIcon('program', os);
    const mac = os === 'macos';
    const winExe = mac && ['program', 'script', 'installer', 'library'].includes(type.type) && type.ext !== 'sh' && type.ext !== 'command' && type.ext !== 'pkg';
    const button = (label, answer, primary) => h('button', { class: `opd-button${primary ? ' opd-primary' : ''}`, type: 'button', 'data-ocean-key': `dialog-btn:${answer}`, 'data-ocean-label': `The "${label}" button`, onClick: event => { event.stopPropagation(); onAnswer(answer); } }, label);
    const root = h('div', { class: `opd opd-${dialog.kind} opd-os-${os}${dark ? ' opd-dark' : ''}`, 'data-dialog-kind': dialog.kind, 'data-dialog-id': dialog.id, role: 'dialog', 'aria-modal': 'true',
      'data-ocean-key': `dialog:${dialog.kind}:${dialog.programId ?? dialog.fileId ?? dialog.view ?? 'x'}`, 'data-ocean-label': `The ${dialog.kind.replace('-', ' ')} window for ${name}` });
    const fileImg = size => h('img', { class: 'opd-file-icon', alt: '', width: size, height: size, src: icon });
    const rows = list => h('div', { class: 'opd-rows' }, list.filter(Boolean).map(([label, value, cls]) => [h('div', { class: 'opd-row-label' }, label), h('div', { class: `opd-row-value ${cls ?? ''}` }, value)]));
    const title = text => h('div', { class: 'opd-title' }, h('span', {}, text), mac ? null : h('button', { class: 'opd-x', type: 'button', 'aria-label': 'Close', onClick: () => onAnswer('cancel') }, '✕'));

    switch (dialog.kind) {
      case 'open-warning':
        if (mac) {
          put(root, h('div', { class: 'opd-mac-alert' }, fileImg(64),
            h('div', { class: 'opd-heading' }, winExe ? `“${name}” is a Windows program.` : `“${WM.displayName(name, 'macos')}” is an app downloaded from the Internet. Are you sure you want to open it?`),
            h('p', { class: 'opd-text' }, winExe ? 'A Mac cannot run it. This training desktop shows what it does on the Windows PC it was made for.' : `${fromMail ? 'Mail' : 'Safari'} downloaded this file ${dateOf(node?.modified)}.`),
            h('div', { class: 'opd-buttons opd-stack' }, button(winExe ? 'Show what it does' : 'Open', 'run'), button('Cancel', 'cancel', true))));
        } else {
          put(root, title('Open File - Security Warning'), h('div', { class: 'opd-body' },
            h('div', { class: 'opd-question' }, 'Do you want to run this file?'),
            h('div', { class: 'opd-split' }, fileImg(40), rows([['Name:', pathOf(world, node, os).replace(/\\$/, '') + '\\' + name, 'opd-strong'],
              ['Publisher:', publisher ?? 'Unknown Publisher', publisher ? '' : 'opd-link'], ['Type:', type.label], ['From:', pathOf(world, node, os)]])),
            h('div', { class: 'opd-buttons' }, button('Run', 'run'), button('Cancel', 'cancel', true)),
            h('div', { class: 'opd-check' }, h('span', { class: 'opd-box' }, '✓'), 'Always ask before opening this file'),
            h('div', { class: 'opd-footer' }, statusIcon('shield', 22), h('span', {}, 'While files from the Internet can be useful, this file type can potentially harm your computer. If you do not trust the source, do not run this software. ', h('span', { class: 'opd-link' }, "What's the risk?")))));
        }
        break;
      case 'reputation':
        if (mac) {
          put(root, h('div', { class: 'opd-mac-alert' }, statusIcon('warning', 58),
            h('div', { class: 'opd-heading' }, `“${WM.displayName(name, 'macos')}” Not Opened`),
            h('p', { class: 'opd-text' }, `Apple could not verify “${WM.displayName(name, 'macos')}” is free of malware that may harm your Mac or compromise your privacy.`),
            h('div', { class: 'opd-buttons opd-stack' }, button('Done', 'cancel', true), button('Move to Trash', 'cancel'), button('Open Anyway', 'run'))));
        } else {
          const more = h('div', { class: 'opd-ss-more', hidden: true }, rows([['App:', name], ['Publisher:', publisher ?? 'Unknown publisher']]));
          const run = button('Run anyway', 'run');
          run.hidden = true;
          put(root, h('div', { class: 'opd-ss' },
            h('div', { class: 'opd-ss-title' }, 'Windows protected your PC'),
            h('p', { class: 'opd-ss-text' }, 'Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC at risk.'),
            h('button', { class: 'opd-ss-link', type: 'button', onClick: event => { event.currentTarget.hidden = true; more.hidden = false; run.hidden = false; } }, 'More info'),
            more, h('div', { class: 'opd-buttons' }, run, button("Don't run", 'cancel', true))));
        }
        break;
      case 'elevation': {
        const verified = Boolean(program?.signed && publisher);
        if (mac) {
          put(root, h('div', { class: 'opd-mac-alert' }, statusIcon('lock', 54),
            h('div', { class: 'opd-heading' }, `${program?.name ?? WM.displayName(name, 'macos')} wants to make changes.`),
            h('p', { class: 'opd-text' }, 'Enter your password to allow this.'),
            rows([['User Name:', world.user.name], ['Password:', '••••••••  (filled in for the training)']]),
            h('div', { class: 'opd-buttons' }, button('Cancel', 'cancel'), button('OK', 'run', true))));
        } else {
          put(root, h('div', { class: `opd-uac-head${verified ? ' opd-uac-verified' : ''}` }, 'User Account Control'),
            h('div', { class: 'opd-body' }, h('div', { class: 'opd-question' }, 'Do you want to allow this app to make changes to your device?'),
              h('div', { class: 'opd-split' }, fileImg(36), h('div', { class: 'opd-strong' }, program?.name ?? name)),
              rows([[verified ? 'Verified publisher:' : 'Publisher:', verified ? publisher : 'Unknown'], ['File origin:', 'Hard drive on this computer']]),
              h('div', { class: 'opd-link' }, 'Show more details'),
              h('div', { class: 'opd-buttons opd-wide' }, button('Yes', 'run'), button('No', 'cancel', true))));
        }
        break;
      }
      case 'cant-open': {
        const why = node?.encrypted ? 'This file was encrypted by ransomware. No app can open it until it is decrypted.'
          : type.type === 'unknown' ? `No app on this computer opens “.${type.ext || '?'}” files.` : `This training desktop has no app for ${type.label} files.`;
        if (mac) {
          put(root, h('div', { class: 'opd-mac-alert' }, fileImg(64),
            h('div', { class: 'opd-heading' }, node?.encrypted ? `The document “${name}” could not be opened.` : `There is no application set to open the document “${name}”.`),
            h('p', { class: 'opd-text' }, why), h('div', { class: 'opd-buttons' }, button('Search App Store', 'ok'), button('OK', 'ok', true))));
        } else {
          put(root, title(''), h('div', { class: 'opd-body' }, h('div', { class: 'opd-heading' }, 'How do you want to open this file?'),
            h('div', { class: 'opd-split' }, fileImg(32), h('div', { class: 'opd-strong' }, name)), h('p', { class: 'opd-text' }, why),
            h('div', { class: 'opd-list' }, h('div', { class: 'opd-list-item' }, statusIcon('web', 22), 'Look for an app in the Microsoft Store')),
            h('div', { class: 'opd-buttons' }, button('OK', 'ok', true))));
        }
        break;
      }
      case 'properties': {
        const signed = program?.signed && publisher;
        const details = [['Type of file:', `${type.label}${type.ext ? ` (.${type.ext})` : ''}`], [mac ? 'Where:' : 'Location:', pathOf(world, node, os)],
          ['Size:', `${sizeOf(node?.size ?? 0)} (${(node?.size ?? 0).toLocaleString('en-US')} bytes)`], [mac ? 'Modified:' : 'Modified:', dateOf(node?.modified)],
          program ? ['Publisher:', publisher ?? 'Unknown', publisher ? '' : 'opd-bad'] : null,
          program || WM.RUNNABLE.includes(type.type) ? ['Digital signature:', signed ? `Signed by ${publisher}. The signature is valid.` : 'None: the publisher could not be verified.', signed ? 'opd-good' : 'opd-bad'] : null,
          program?.description ? ['Description:', program.description] : null,
          node?.hidden ? ['Attributes:', 'Hidden, System'] : null,
          node?.parentId === 'downloads' && !mac ? ['Security:', 'This file came from another computer and might be blocked to help protect this computer.'] : null];
        put(root, title(mac ? '' : `${name} Properties`), h('div', { class: 'opd-body' },
          h('div', { class: 'opd-split' }, fileImg(48), h('div', {}, h('div', { class: 'opd-strong' }, mac ? WM.displayName(name, 'macos') : name), mac ? h('div', { class: 'opd-sub' }, `${type.label} — ${sizeOf(node?.size ?? 0)}`) : null)),
          rows(details), h('div', { class: 'opd-buttons' }, button('OK', 'ok', true))));
        break;
      }
      case 'detected':
        put(root, h('div', { class: 'opd-av' }, statusIcon('shield-bad', 34), h('div', { class: 'opd-av-main' },
          h('div', { class: 'opd-heading' }, mac ? `“${name}” will damage your computer.` : 'Virus & threat protection: threats found'),
          h('p', { class: 'opd-text' }, mac ? 'You should move it to the Trash.' : `Microsoft Defender Antivirus found ${dialog.threat ?? 'a threat'} in ${name}. It was stopped before it ran.`),
          dialog.threat ? rows([['Threat:', dialog.threat, 'opd-bad'], ['Severity:', 'Severe'], ['File:', name]]) : null,
          // macOS's own malware alert (XProtect) carries this box, ticked; display only.
          mac ? h('div', { class: 'opd-check' }, h('span', { class: 'opd-box' }, '✓'), 'Report malware to Apple to protect other users') : null,
          h('div', { class: 'opd-buttons' }, button(mac ? 'Move to Trash' : 'Remove', 'trash', true), button(mac ? 'Cancel' : 'Dismiss', 'ok')))));
        break;
      case 'autoplay': {
        const drive = node ?? { name: 'Removable drive' };
        put(root, h('div', { class: 'opd-ap' }, h('div', { class: 'opd-heading' }, drive.name),
          h('div', { class: 'opd-sub' }, mac ? 'A disk was connected. Choose what to do.' : 'Choose what to do with removable drives.'),
          h('div', { class: 'opd-list' }, (dialog.options ?? []).map((option, n) => h('button', { class: 'opd-list-item', type: 'button', onClick: () => onAnswer(`option:${n}`) },
            h('img', { alt: '', width: 26, height: 26, src: fileIcon(/run:/.test(option.action) ? 'program' : 'folder', os) }),
            h('span', {}, h('span', { class: 'opd-strong' }, option.label), option.sub ? h('span', { class: 'opd-sub' }, option.sub) : null))),
            h('button', { class: 'opd-list-item', type: 'button', onClick: () => onAnswer('cancel') }, h('span', { class: 'opd-strong' }, 'Take no action')))));
        break;
      }
      case 'firewall':
        if (mac) {
          put(root, h('div', { class: 'opd-mac-alert' }, fileImg(64),
            h('div', { class: 'opd-heading' }, `Do you want the application “${WM.displayName(name, 'macos')}” to accept incoming network connections?`),
            h('p', { class: 'opd-text' }, 'Clicking Deny may limit the application’s behaviour. This setting can be changed in the Firewall pane of Network settings.'),
            h('div', { class: 'opd-buttons' }, button('Deny', 'cancel', true), button('Allow', 'ok'))));
        } else {
          put(root, title('Windows Security Alert'), h('div', { class: 'opd-body' },
            h('div', { class: 'opd-split' }, statusIcon('shield', 40), h('div', { class: 'opd-heading' }, 'Windows Defender Firewall has blocked some features of this app')),
            h('p', { class: 'opd-text' }, 'Windows Defender Firewall has blocked some features of this app on all public and private networks.'),
            rows([['Name:', program?.name ?? name, 'opd-strong'], ['Publisher:', publisher ?? 'Unknown', publisher ? '' : 'opd-bad'], ['Path:', `${pathOf(world, node, os).replace(/[\\/]$/, '')}${mac ? '/' : '\\'}${name}`]]),
            h('p', { class: 'opd-text' }, 'Allow it to communicate on these networks:'),
            h('div', { class: 'opd-check' }, h('span', { class: 'opd-box' }, '✓'), 'Private networks, such as my home or work network'),
            h('div', { class: 'opd-buttons' }, button('Allow access', 'ok'), button('Cancel', 'cancel', true))));
        }
        break;
      case 'message': {
        const view = world.data.views?.[dialog.view];
        const host = h('div', { class: 'opd-message-host' });
        renderView(host, { view: view && { ...view, layout: 'message' }, os, dark }, () => onAnswer('ok'));
        put(root, title(view?.title ?? ''), host);
        break;
      }
      default:
        put(root, h('div', { class: 'opd-body' }, h('div', { class: 'opd-text' }, dialog.kind), h('div', { class: 'opd-buttons' }, button('OK', 'ok', true))));
    }
    el.append(root);
  }

  // ---- styles (both shells; OS idiom by class) ---------------------------------------------------------------------

  const CSS = `
.opv,.opd{box-sizing:border-box;font:13px/1.45 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;color:var(--opv-fg,#1b1b1b);--opv-accent-d:var(--opv-accent,#0067c0)}
.opv *,.opd *{box-sizing:border-box}
.opv-os-macos,.opd-os-macos{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}
.opv{height:100%;display:flex;flex-direction:column;background:var(--opv-bg,#fff);overflow:hidden}
.opv-dark{--opv-bg-d:#202020}
.opv-dark:not(.opv-ransom):not(.opv-screen):not(.opv-console):not(.opv-scan):not(.opv-character):not(.opv-sheet):not(.opv-slides){background:var(--opv-bg,#2b2b2b);color:var(--opv-fg,#f1f1f1)}
.opv-p{margin:0 0 8px;white-space:pre-wrap}
.opv-heading{font-size:17px;font-weight:600;margin:0 0 8px}
.opv-sub{font-size:11.5px;opacity:.7;font-weight:400;margin-left:8px}
.opv-buttons{display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;flex:none}
.opv-button,.opd-button{min-width:84px;padding:5px 14px;border-radius:4px;border:1px solid rgba(0,0,0,.18);background:#fdfdfd;color:#1b1b1b;font:inherit;cursor:pointer}
.opv-button:hover,.opd-button:hover{background:#f0f0f0}
.opv-primary,.opd-primary{background:var(--opv-accent-d);border-color:var(--opv-accent-d);color:var(--opv-accent-fg,#fff)}
.opv-primary:hover,.opd-primary:hover{filter:brightness(1.08);background:var(--opv-accent-d)}
.opv-os-macos .opv-button,.opd-os-macos .opd-button{border-radius:6px;min-width:70px;box-shadow:0 .5px 1.5px rgba(0,0,0,.2)}
.opv-os-macos .opv-primary,.opd-os-macos .opd-primary{background:var(--opv-accent,#0a84ff);border-color:var(--opv-accent,#0a84ff)}
.opv-section{margin:0 0 10px}
.opv-section-heading{font-weight:600;margin:0 0 4px}
.opv-rows{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px}
.opv-row-label{opacity:.7}
.opv-row-value{overflow-wrap:break-word}
.opv-table-wrap{overflow:auto;border:1px solid rgba(127,127,127,.25);border-radius:4px}
.opv-table{border-collapse:collapse;width:100%;font-size:12px}
.opv-table th{text-align:left;font-weight:600;background:rgba(127,127,127,.1);padding:4px 8px;white-space:nowrap}
.opv-table td{padding:3px 8px;border-top:1px solid rgba(127,127,127,.15);overflow-wrap:break-word}
.opv-items{margin:0;padding-left:18px;list-style:disc outside}.opv-items>li{display:list-item}
.opv-check{display:flex;gap:8px;align-items:flex-start;margin:3px 0}
.opv-line{display:block;white-space:pre-wrap}
button.opv-check{background:none;border:0;padding:0;font:inherit;color:inherit;text-align:left;cursor:default}
button.opv-check:focus-visible .opv-box{outline:2px solid var(--opv-accent-d);outline-offset:1px}
.opv-box,.opd-box{flex:none;width:15px;height:15px;border:1px solid #767676;border-radius:3px;display:inline-grid;place-items:center;font-size:11px;line-height:1;background:#fff;color:#fff}
.opv-check[data-checked=true] .opv-box,.opd-check .opd-box{background:var(--opv-accent-d);border-color:var(--opv-accent-d)}
.opv-progress{height:8px;border-radius:4px;background:rgba(127,127,127,.25);overflow:hidden;margin:6px 0}
.opv-progress-fill{height:100%;width:0;background:var(--opv-accent-d);transition:width .06s linear}
.opv-timer{margin:6px 0}
.opv-timer-label{font-size:12px;opacity:.85}
.opv-timer-value{font:600 22px/1.2 Consolas,"Courier New",monospace;letter-spacing:1px}
.opv-code,.opv-lines{margin:6px 0;padding:8px 10px;background:rgba(127,127,127,.12);border-radius:4px;font:12px/1.4 Consolas,"SF Mono",Menlo,monospace;white-space:pre-wrap;word-break:break-word}
.opv-note{font-size:11.5px;opacity:.7;margin-top:4px}
.opv-tone-bad{color:#c5221f}.opv-tone-good{color:#188038}.opv-tone-warn{color:#b06000}
/* On a dark window the same tones in lighter shades, so they keep a readable contrast (WCAG AA). */
.opv-dark:not(.opv-ransom):not(.opv-scan):not(.opv-character) .opv-tone-bad,.opv-screen .opv-tone-bad,.opv-console .opv-tone-bad{color:#ff8a80}.opv-dark:not(.opv-ransom):not(.opv-scan):not(.opv-character) .opv-tone-good{color:#81c995}.opv-dark:not(.opv-ransom):not(.opv-scan):not(.opv-character) .opv-tone-warn,.opv-screen .opv-tone-warn{color:#fdd663}
.opv-tone-injected{border:2px dashed #d93025;border-radius:6px;padding:8px;background:rgba(217,48,37,.06);position:relative}
.opv-injected-tag{font-size:10.5px;font-weight:700;color:#d93025;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px}
.opv-image{max-width:100%;border-radius:4px;margin-bottom:8px}
.opv-training{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:3px 10px;background:#fbbc04;color:#202124;flex:none}
.opv-panel-head{display:flex;gap:12px;align-items:center;padding:14px 16px 4px}
.opv-panel-head .opv-heading{margin:0}
.opv-panel-body{flex:1;overflow:auto;padding:8px 16px}
.opv-message{background:var(--opv-bg,#fff)}
.opv-message-main{flex:1;display:flex;gap:14px;padding:18px 18px 8px;overflow:auto}
.opv-message-text{flex:1;min-width:0}
.opv-os-windows.opv-message .opv-buttons{background:#f0f0f0;border-top:1px solid #dfdfdf}
.opv-dark.opv-message .opv-buttons{background:#2b2b2b;border-color:#3a3a3a}
.opv-os-macos.opv-message .opv-message-main{flex-direction:column;align-items:center;text-align:center}
.opv-os-macos.opv-message .opv-buttons{justify-content:center}
.opv-wizard{flex-direction:row}
.opv-wizard-side{width:30%;max-width:190px;flex:none;background:var(--opv-header,var(--opv-accent-d));color:var(--opv-header-fg,#fff);padding:16px 12px}
.opv-os-macos .opv-wizard-side{background:rgba(127,127,127,.1);color:inherit}
.opv-wizard-brand{display:flex;flex-direction:column;gap:10px;font-weight:600;font-size:15px}
.opv-wizard-steps{margin:0;padding-left:18px;font-size:12.5px;line-height:2}
.opv-wizard-steps li[data-current=true]{font-weight:700}
.opv-wizard-steps li[data-done=true]{opacity:.55}
.opv-wizard-main{flex:1;display:flex;flex-direction:column;min-width:0}
.opv-wizard-head{padding:14px 16px 6px;border-bottom:1px solid rgba(127,127,127,.2)}
.opv-wizard-head .opv-heading{margin:0}
.opv-wizard-head .opv-sub{margin:0}
.opv-wizard-body{flex:1;overflow:auto;padding:12px 16px}
.opv-wizard .opv-buttons{border-top:1px solid rgba(127,127,127,.2)}
.opv-ransom{--opv-bg-x:var(--opv-bg,#7a0000);background:var(--opv-bg,#7a0000);color:var(--opv-fg,#fff)}
.opv-ransom-head{display:flex;gap:12px;align-items:center;padding:12px 16px;background:var(--opv-header,rgba(0,0,0,.35));color:var(--opv-header-fg,inherit);font-size:19px;font-weight:700}
.opv-ransom-body{flex:1;overflow:auto;padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;align-content:start}
.opv-ransom-body>.opv-p{grid-column:1/-1}
.opv-ransom-frame{flex:1;min-height:0;display:flex}
.opv-ransom-frame>.opv-ransom-body{flex:1;min-width:0}
.opv-ransom-side{flex:none;width:31%;min-width:170px;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--opv-header,rgba(0,0,0,.35));color:var(--opv-header-fg,#fff)}
.opv-ransom-side .opv-section{background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.18)}
.opv-ransom-side .opv-timer-value{font-size:26px}
.opv-ransom-split>.opv-ransom-body{display:flex;flex-wrap:wrap;align-content:flex-start}.opv-ransom-split>.opv-ransom-body>*{flex:1 1 220px}.opv-ransom-split>.opv-ransom-body>.opv-p{flex-basis:100%}
.opv-ransom .opv-section{background:color-mix(in srgb,var(--opv-fg,#fff) 9%,transparent);border-radius:4px;padding:8px 10px}
.opv-ransom .opv-timer-value{color:#ffd54f}
.opv-ransom .opv-code{background:rgba(0,0,0,.35)}
.opv-ransom .opv-button:not(.opv-primary){background:rgba(255,255,255,.92);color:#1b1b1b}
.opv-console{background:var(--opv-bg,#0c0c0c);color:var(--opv-fg,#cccccc)}
.opv-console-body{flex:1;overflow:auto;padding:8px 10px;font:12.5px/1.45 Consolas,"Cascadia Mono",Menlo,monospace}
.opv-console .opv-lines,.opv-console .opv-code{background:none;padding:0;margin:0;font:inherit}
.opv-console-head{opacity:.8;margin-bottom:6px}
.opv-os-macos.opv-console{background:var(--opv-bg,#1e1e1e);color:var(--opv-fg,#e6e6e6)}
.opv-document{background:#e9e9e9}
.opv-dark.opv-document{background:#1f1f1f}
.opv-doc-tool{flex:none;padding:6px 12px;font-weight:600;background:var(--opv-header,#2b579a);color:var(--opv-header-fg,#fff);font-size:12.5px}
.opv-os-macos .opv-doc-tool{background:var(--opv-header,#f4f4f4);color:#333}
.opv-bar{flex:none;display:flex;align-items:center;gap:12px;padding:7px 12px;font-size:12.5px;border-bottom:1px solid rgba(0,0,0,.12)}
.opv-bar-warn{background:#fff4ce;color:#3b2d00}.opv-bar-info{background:#e8f0fe;color:#0b2a63}.opv-bar-bad{background:#fde7e9;color:#6b0d0d}
.opv-bar-text{flex:1}
.opv-doc-scroll{flex:1;overflow:auto;padding:16px}
.opv-doc-page{background:#fff;color:#1b1b1b;max-width:640px;margin:0 auto;padding:28px 34px;min-height:100%;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.opv-screen{background:var(--opv-bg,#000);color:var(--opv-fg,#c0c0c0);font:15px/1.5 "Lucida Console",Consolas,"Courier New",monospace}
.opv-screen-body{flex:1;overflow:auto;padding:5% 7%}
.opv-screen .opv-heading{font:inherit;font-weight:700;color:var(--opv-accent,var(--opv-fg,#fff))}
.opv-screen .opv-lines,.opv-screen .opv-code{background:none;padding:0;font:inherit}
.opv-screen .opv-counter{margin-top:10px}
.opv-screen .opv-buttons{justify-content:flex-start;padding:16px 0}
.opv-screen .opv-button{background:transparent;color:inherit;border:1px solid currentColor;border-radius:0;font-family:inherit}
.opv-screen-training{position:absolute;right:12px;bottom:12px}
.opv-screen{position:relative}
.opv-scan{background:var(--opv-bg,#f3f3f3);color:var(--opv-fg,#1b1b1b)}
.opv-scan-head{display:flex;gap:12px;align-items:center;padding:12px 16px;background:var(--opv-header,#c5221f);color:var(--opv-header-fg,#fff);font-weight:700;font-size:16px}
.opv-scan-head .opv-sub{color:#fff;margin:0}
.opv-scan-body{flex:1;overflow:auto;padding:12px 16px}
.opv-scan .opv-items li{color:#c5221f}
.opv-character{background:transparent;flex-direction:row;align-items:flex-end;gap:4px;padding:6px}
.opv-balloon{flex:1;background:#fffde7;color:#1b1b1b;border:1px solid #c9b458;border-radius:12px;padding:10px 12px;box-shadow:0 2px 8px rgba(0,0,0,.25);position:relative;align-self:stretch;overflow:auto;font-size:12.5px}
.opv-balloon .opv-buttons{padding:6px 0 0;justify-content:flex-start;flex-wrap:wrap}
.opv-balloon .opv-button{min-width:0;padding:3px 10px}
.opv-character-art{flex:none;animation:opv-bob 2.4s ease-in-out infinite}
@keyframes opv-bob{50%{transform:translateY(-6px)}}
@media (prefers-reduced-motion:reduce){.opv-character-art{animation:none}}
.opv-appbar{flex:none;display:flex;align-items:center;gap:14px;padding:0 12px;height:30px;font-size:12px;background:var(--opv-header,#217346);color:var(--opv-header-fg,#fff)}
.opv-appbar-slides{background:var(--opv-header,#c43e1c)}
.opv-appbar-word{background:var(--opv-header,#2b579a)}
.opv-appbar-pdf{background:#3b3b3b}
.opv-appbar-name{font-weight:700}
.opv-appbar-tabs{display:flex;gap:2px;overflow:hidden}
.opv-appbar-tab{padding:3px 8px;border-radius:3px;white-space:nowrap;opacity:.92}
.opv-appbar-on{background:rgba(255,255,255,.22)}
.opv-os-macos .opv-appbar{background:#f1f1f1;color:#333;border-bottom:1px solid #d6d6d6;height:34px}
.opv-os-macos .opv-appbar-tab{font-size:11px;color:#555}
.opv-dark.opv-os-macos .opv-appbar{background:#2e2e2e;color:#ddd;border-color:#444}
.opv-dark.opv-os-macos .opv-appbar-tab{color:#b8b8b8}
.opv-sheet{background:#fff;color:#1b1b1b}
.opv-sheet-formula{flex:none;display:flex;align-items:center;gap:8px;padding:3px 8px;border-bottom:1px solid #d4d4d4;font-size:12px;background:#fff}
.opv-sheet-name{width:64px;border:1px solid #d4d4d4;padding:1px 6px;font-size:11.5px}
.opv-sheet-fx{font-style:italic;color:#666;padding:0 6px;border-right:1px solid #d4d4d4}
.opv-sheet-formula-value{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.opv-sheet-scroll{flex:1;overflow:auto;background:#fff}
.opv-sheet-grid{border-collapse:collapse;font-size:12px;table-layout:fixed}
.opv-sheet-grid th{background:#f3f3f3;color:#555;font-weight:400;border:1px solid #dcdcdc;padding:1px 4px;position:sticky;top:0;min-width:84px;z-index:1}
.opv-sheet-grid th.opv-sheet-corner,.opv-sheet-grid th.opv-sheet-rowhead{min-width:34px;width:34px;text-align:center;position:sticky;left:0}
.opv-sheet-grid tbody th.opv-sheet-rowhead{z-index:0}
.opv-sheet-grid td{border:1px solid #e3e3e3;padding:1px 6px;height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;cursor:cell}
.opv-sheet-head{font-weight:700;background:#f7fbf8}
.opv-sheet-num{text-align:right;font-variant-numeric:tabular-nums}
.opv-sheet-grid td.opv-sheet-sel{outline:2px solid #217346;outline-offset:-2px}
.opv-os-macos .opv-sheet-grid td.opv-sheet-sel{outline-color:#0a84ff}
.opv-sheet-tabs{flex:none;display:flex;align-items:center;gap:6px;padding:2px 8px;border-top:1px solid #d4d4d4;background:#f3f3f3;font-size:11.5px}
.opv-sheet-tab{padding:2px 12px;background:#fff;border-bottom:2px solid #217346;font-weight:600;color:#217346}
.opv-os-macos .opv-sheet-tab{border-color:#0a84ff;color:#0a84ff}
.opv-sheet-add{color:#666}
.opv-sheet-status{margin-left:auto;color:#666}
.opv-slides{background:#e6e6e6;color:#1b1b1b}
.opv-slides-main{flex:1;min-height:0;display:flex}
.opv-slides-thumbs{flex:none;width:132px;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:8px;background:#f3f3f3;border-right:1px solid #d4d4d4}
.opv-slides-thumb{display:flex;gap:6px;align-items:flex-start;border:0;background:none;padding:0;cursor:pointer;text-align:left;font:inherit;color:inherit}
.opv-slides-num{font-size:10.5px;color:#666;width:12px}
.opv-slides-mini{flex:1;aspect-ratio:16/9;background:#fff;border:1px solid #cfcfcf;font-size:8px;line-height:1.2;padding:4px;overflow:hidden}
.opv-slides-thumb[data-current=true] .opv-slides-mini{border:2px solid #c43e1c}
.opv-os-macos .opv-slides-thumb[data-current=true] .opv-slides-mini{border-color:#0a84ff}
.opv-slides-stage{flex:1;min-width:0;display:grid;place-items:center;padding:14px;overflow:auto}
.opv-slides-slide{width:100%;max-width:560px;aspect-ratio:16/9;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);padding:7% 8%;overflow:hidden;font-size:14px}
.opv-slides-slide .opv-heading{font-size:22px;margin-bottom:14px;color:#c43e1c}
.opv-slides-title{display:flex;flex-direction:column;justify-content:center;text-align:center}
.opv-slides-title .opv-heading{font-size:28px}
.opv-slides-nav{border-top:1px solid #d4d4d4;background:#f3f3f3;align-items:center}
.opv-slides-count{margin-right:auto;font-size:11.5px;color:#555}
.opv-button:disabled{opacity:.45;cursor:default}
.opd{background:#f9f9f9;color:#1b1b1b;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.12);overflow:hidden;width:440px;max-width:calc(100vw - 24px)}
.opd-dark{background:#2b2b2b;color:#f1f1f1}
.opd-title{display:flex;align-items:center;justify-content:space-between;padding:6px 6px 6px 12px;font-size:12px;background:inherit}
.opd-x{border:0;background:transparent;font-size:13px;width:34px;height:26px;border-radius:4px;cursor:pointer;color:inherit}
.opd-x:hover{background:#c42b1c;color:#fff}
.opd-body{padding:4px 18px 16px}
.opd-question,.opd-heading{font-size:15px;font-weight:600;margin:4px 0 12px}
.opd-text{margin:0 0 10px;white-space:pre-wrap}
.opd-split{display:flex;gap:14px;align-items:flex-start;margin-bottom:10px}
.opd-rows{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;font-size:12.5px;margin:4px 0 10px;flex:1}
.opd-row-label{opacity:.75}
.opd-row-value{overflow-wrap:anywhere}
.opd-strong{font-weight:600}
.opd-link{color:#0067c0;text-decoration:underline;cursor:default}
.opd-good{color:#188038}.opd-bad{color:#c5221f;font-weight:600}
.opd-sub{display:block;font-size:11.5px;opacity:.7}
.opd-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.opd-wide .opd-button{flex:1}
.opd-check{display:flex;gap:8px;align-items:center;font-size:12px;margin-top:12px;opacity:.9}
.opd-check .opd-box{color:#fff}
.opd-footer{display:flex;gap:10px;align-items:flex-start;border-top:1px solid rgba(0,0,0,.12);margin:14px -18px -16px;padding:12px 18px;font-size:11.5px;background:rgba(0,0,0,.03)}
.opd-list{display:flex;flex-direction:column;gap:2px;margin:8px 0}
.opd-list-item{display:flex;gap:10px;align-items:center;text-align:left;padding:8px 10px;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.opd-list-item:hover{background:rgba(0,0,0,.06)}
.opd-reputation.opd-os-windows{background:#0063b1;color:#fff;width:520px;border-radius:0}
.opd-ss{padding:28px 32px 20px}
.opd-ss-title{font-size:26px;font-weight:300;margin-bottom:14px}
.opd-ss-text{margin:0 0 14px;font-size:14px}
.opd-ss-link{background:none;border:0;color:#fff;text-decoration:underline;font:inherit;padding:0;cursor:pointer}
.opd-ss-more{margin-top:14px}
.opd-ss .opd-buttons{margin-top:26px}
.opd-ss .opd-button{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.85);border-radius:0;min-width:110px}
.opd-ss .opd-primary{background:transparent}
.opd-elevation.opd-os-windows{width:460px;border-radius:0}
.opd-uac-head{background:#e8a200;color:#1b1b1b;padding:10px 18px;font-size:13px}
.opd-uac-head.opd-uac-verified{background:#1f5ba8;color:#fff}
.opd-elevation.opd-os-windows .opd-body{background:#f3f3f3;padding-top:14px}
.opd-av,.opd-ap{display:flex;gap:12px;padding:14px 16px}
.opd-ap{flex-direction:column;gap:0;width:340px}
.opd-av-main{flex:1;min-width:0}
.opd-detected .opd-heading,.opd-autoplay .opd-heading{font-size:14px;margin:0 0 6px}
.opd-os-macos{border-radius:12px;background:#ececec;width:300px;text-align:center}
.opd-os-macos.opd-dark{background:#323232}
.opd-mac-alert{display:flex;flex-direction:column;align-items:center;padding:20px 18px 16px}
.opd-mac-alert .opd-heading{font-size:13px;font-weight:700;margin:12px 0 6px}
.opd-mac-alert .opd-text{font-size:11.5px}
.opd-mac-alert .opd-rows{text-align:left;width:100%}
.opd-mac-alert .opd-buttons{width:100%;justify-content:center}
.opd-stack{flex-direction:column}
.opd-stack .opd-button{width:100%}
.opd-os-macos.opd-properties,.opd-os-macos.opd-detected,.opd-os-macos.opd-autoplay{text-align:left;width:340px}
.opd-message-host{min-height:120px}
.opd-message-host .opv{height:auto}
.opg{font-family:inherit;color:#202124;--opv-accent-d:var(--opv-accent,#0067c0)}
.opg[data-page-part=warning]{background:#fff;min-height:100%;padding:1px 0}.opg.opg-dark[data-page-part=warning]{color:#e8eaed;background:#202124}
.opg-macos.opg-dark[data-page-part=warning]{background:#1e1e1e}
.opg[data-page-part=sections]{color:#1d1d1f;font-size:13.5px}
.opg-toolbar{display:flex;align-items:center;gap:8px;padding:4px 10px;font-size:12px;background:linear-gradient(#fff6d6,#ffe9a3);border-bottom:1px solid #e0c060;color:#3c3000}
.opg-toolbar-logo{width:16px;height:16px;border-radius:4px;background:#f2711c;color:#fff;font-size:11px;font-weight:800;display:grid;place-items:center}
.opg-toolbar-search{flex:1;max-width:260px;background:#fff;border:1px solid #d6b84a;border-radius:3px;padding:2px 8px;color:#80766a}
.opg-toolbar-chip{padding:1px 6px;border-radius:3px;background:rgba(255,255,255,.6);border:1px solid #e0c060;font-size:11px}
.opg-issuer{display:flex;gap:6px;align-items:center;font-size:11.5px;padding:4px 12px;background:#e6f4ea;color:#0d652d;border-bottom:1px solid #b7dfc4}
.opg-issuer-by{font-weight:700}
.opg-dark .opg-issuer{background:#1e3a29;color:#a8dab5;border-color:#2c5a3c}
.opg[data-page-part=sections]{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.opg-warning{max-width:560px;margin:48px auto;padding:0 24px;font-size:14px;line-height:1.5}
.opg-windows .opg-warning{color:#202124}.opg-windows.opg-dark .opg-warning{color:#e8eaed}
.opg-warning h1{font-size:24px;font-weight:600;margin:14px 0 10px}
.opg-warning-code{font-size:12px;opacity:.7;margin:6px 0 18px;font-family:Consolas,monospace}
.opg-warning-buttons{display:flex;justify-content:space-between;gap:10px}
.opg-warning-buttons button{padding:7px 16px;border-radius:6px;font-size:13px;cursor:pointer;border:1px solid #c4c7c5;background:transparent;color:inherit}
.opg-warning-buttons .opg-back{background:#1a73e8;border-color:#1a73e8;color:#fff}
.opg-macos .opg-warning{text-align:center}.opg-macos .opg-warning-icon{display:flex;justify-content:center}.opg-macos .opg-warning-buttons{justify-content:center}
.opg-warning-details{margin-top:16px;font-size:13px}
.opg-link{background:none;border:none;color:#1a73e8;text-decoration:underline;cursor:pointer;padding:0;font-size:13px}
.opg[data-page-part=form]{margin:6px 0 4px}
.opg-fields{display:flex;flex-direction:column;gap:10px;margin:6px 0}
.opg-field{display:flex;flex-direction:column;gap:4px;font-size:12.5px}
.opg-field-label{font-weight:600;color:#3c4043}
.opg-field-box{min-height:32px;display:flex;align-items:center;padding:0 10px;border:1px solid #8a8f98;border-radius:4px;background:#fff;color:#1d1d1f;font:14px/1 "Segoe UI",system-ui,sans-serif;cursor:text;letter-spacing:.5px;outline:none}
.opg-macos .opg-field-box{border-radius:7px;border-color:#c7c7cc}
.opg-field-box:focus{border-color:#1a73e8;box-shadow:0 0 0 3px rgba(26,115,232,.25)}
.opg-caret{display:none;width:1px;height:17px;background:#1d1d1f;margin-left:1px;animation:opg-blink 1s steps(1) infinite}
.opg-field-box:focus .opg-caret{display:inline-block}
@keyframes opg-blink{50%{opacity:0}}
.opg-form-hint{font-size:11px;color:#6b7280;margin-top:2px}
.opv-tone-injected .opg-field-label{color:#3c4043}
/* the quest overlay */
.oql{position:fixed;inset:0;pointer-events:none;z-index:2147483600}
.oql [hidden]{display:none!important}
.oql-flag{pointer-events:auto;position:fixed;width:22px;height:22px;border-radius:6px;border:1px solid rgba(0,0,0,.25);background:#fff;color:#c5221f;display:grid;place-items:center;cursor:pointer;padding:0;box-shadow:0 2px 6px rgba(0,0,0,.25);opacity:.92}
.oql-flag:hover{opacity:1;transform:scale(1.08)}
.oql-flag[data-on=true]{background:#c5221f;color:#fff;border-color:#a50e0e}
.oql-badge{position:fixed;width:18px;height:18px;border-radius:50%;background:#c5221f;color:#fff;display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.oql-badge svg{width:11px;height:11px}
.oql-net{pointer-events:auto;position:fixed;width:22px;height:22px;border-radius:5px;background:rgba(32,33,36,.82);color:#7ee787;display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.4);animation:oql-net 0.5s ease-in-out infinite alternate}
@keyframes oql-net{from{color:#7ee787}to{color:#ffd54f}}
html[data-ocean-fx=low] .oql-net,html[data-ocean-fx=high] .oql-net{width:30px;height:30px;border-radius:7px;transform-origin:center;animation:oql-net 0.5s ease-in-out infinite alternate,oql-net-ring 0.9s ease-out infinite}
html[data-ocean-fx=high] .oql-net{width:34px;height:34px}
@keyframes oql-net-ring{0%{box-shadow:0 0 0 0 rgba(255,213,79,.55),0 1px 4px rgba(0,0,0,.4)}100%{box-shadow:0 0 0 12px rgba(255,213,79,0),0 1px 4px rgba(0,0,0,.4)}}
.oql-spark{position:fixed;width:6px;height:6px;margin:-3px;background:#fff49c;transform:rotate(45deg);box-shadow:0 0 6px #ffd54f}
html.oql-busy,html.oql-busy *{cursor:progress!important}
.ocean-cue{outline:2px solid #ffb300!important;outline-offset:2px;border-radius:6px;box-shadow:0 0 0 4px rgba(255,179,0,.25)!important}
html[data-ocean-fx=low] .ocean-cue,html[data-ocean-fx=high] .ocean-cue{animation:ocean-cue 1.4s ease-in-out infinite}
html[data-ocean-fx=high] .ocean-cue{animation-duration:1.1s}
@keyframes ocean-cue{0%,100%{box-shadow:0 0 0 3px rgba(255,179,0,.25)}50%{box-shadow:0 0 0 7px rgba(255,179,0,.45),0 0 18px rgba(255,179,0,.55)}}
@media (prefers-reduced-motion:reduce){.ocean-cue,.oql-net{animation:none!important}}
`;
  function injectStyles(doc = document) {
    if (doc.getElementById('ocean-program-ui-css')) return;
    const style = doc.createElement('style');
    style.id = 'ocean-program-ui-css';
    style.textContent = CSS;
    doc.head.append(style);
  }

  // ---- browser pages (data.web.pages: toolbars, issuer, sections, warning) -----------------------------------
  // Each browser draws its own page; these are the parts both browsers share. part: 'top' (adware toolbars and the
  // certificate issuer strip), 'sections' (content added to the page, e.g. fields a banking trojan injected) or
  // 'warning' (the browser's full-page warning; onProceed shows the page anyway, a per-tab choice like a disclosure).
  const WARNINGS = {
    cert: { windows: ['Your connection isn\u2019t private', 'Attackers might be trying to steal your information from {host} (for example, passwords, messages or credit cards).', 'NET::ERR_CERT_AUTHORITY_INVALID'],
      macos: ['This Connection Is Not Private', 'This website may be impersonating \u201c{host}\u201d to steal your personal or financial information. You should go back to the previous page.', 'Certificate not trusted'] },
    deceptive: { windows: ['This site has been reported as unsafe', 'Microsoft Defender SmartScreen reported {host} for phishing: it may try to trick you into giving away passwords or card details.', 'Reported phishing website'],
      macos: ['Deceptive Website Warning', 'This website may try to trick you into doing something dangerous, like installing software or disclosing personal or financial information.', 'Reported deceptive website'] },
    malware: { windows: ['This site might harm your computer', '{host} has been reported for hosting malicious software. Microsoft Defender SmartScreen blocked it.', 'Reported malware website'],
      macos: ['This Website May Harm Your Computer', 'This website may attempt to install dangerous software that could harm your computer or steal your personal information.', 'Reported malware website'] },
  };
  function renderPagePart(el, part, { page, os = 'windows', dark = false, pageId = '', typed = [], onType = () => {} } = {}, onProceed = () => {}) {
    // The caret survives a redraw (each typed key redraws the page).
    const hadFocus = el.contains(el.ownerDocument.activeElement);
    clearTimers(el);
    el.replaceChildren();
    if (!page) return;
    const own = page.fields ?? [];
    const offsets = [];
    let next = own.length;
    for (const item of page.sections ?? []) { offsets.push(next); next += item.fields?.length ?? 0; }
    const lengths = [...own, ...(page.sections ?? []).flatMap(item => item.fields ?? [])].map(field => field.value.length);
    const form = { pageId, typed, onType, offsets, lengths };
    injectStyles(el.ownerDocument);
    const root = h('div', { class: `opg opg-${os}${dark ? ' opg-dark' : ''}`, 'data-page-part': part });
    if (part === 'top') {
      for (const name of page.toolbars ?? []) {
        put(root, h('div', { class: 'opg-toolbar', 'data-toolbar': name },
          h('span', { class: 'opg-toolbar-logo' }, name.slice(0, 1).toUpperCase()), h('b', {}, name),
          h('span', { class: 'opg-toolbar-search' }, `Search the web with ${name}\u2026`),
          h('span', { class: 'opg-toolbar-chip' }, 'Weather'), h('span', { class: 'opg-toolbar-chip' }, 'Free games'), h('span', { class: 'opg-toolbar-chip' }, 'Smileys')));
      }
      if (page.issuer) {
        put(root, h('div', { class: 'opg-issuer', 'data-issuer': page.issuer },
          h('span', { class: 'opg-lock' }, '\u{1F512}'), os === 'macos' ? 'Safari is using an encrypted connection.' : 'Connection is secure.',
          h('span', { class: 'opg-issuer-by' }, ` Certificate issued by: ${page.issuer}`)));
      }
    } else if (part === 'form') {
      if (own.length) put(root, fieldList(own, form, 0), h('div', { class: 'opg-form-hint' }, 'Training desktop: click a box, then press any keys. Each key types the next letter of the saved details.'));
    } else if (part === 'sections') {
      (page.sections ?? []).forEach((item, at) => put(root, section(el, item, form, at)));
    } else if (part === 'warning' && WARNINGS[page.warning]) {
      const [title, text, code] = WARNINGS[page.warning][os === 'macos' ? 'macos' : 'windows'];
      const host = String(page.url ?? '').replace(/^https?:\/\//, '').split('/')[0];
      const details = h('div', { class: 'opg-warning-details', hidden: true },
        h('p', {}, `${host} uses a certificate that is not trusted${page.issuer ? `: it was issued by ${page.issuer}` : ''}.`),
        h('button', { class: 'opg-link', type: 'button', onClick: () => onProceed() }, os === 'macos' ? 'visit this website' : `Continue to ${host} (unsafe)`));
      put(root, h('div', { class: `opg-warning opg-warning-${page.warning}`, 'data-warning': page.warning },
        h('div', { class: 'opg-warning-icon' }, statusIcon(page.warning === 'cert' ? 'warning' : 'shield-bad', 56)),
        h('h1', {}, title), h('p', {}, text.replace('{host}', host)), h('div', { class: 'opg-warning-code' }, code),
        h('div', { class: 'opg-warning-buttons' },
          h('button', { class: 'opg-advanced', type: 'button', onClick: () => { details.hidden = !details.hidden; } }, os === 'macos' ? 'Show Details' : 'Advanced'),
          h('button', { class: 'opg-back', type: 'button', onClick: () => {
            root.replaceChildren(h('div', { class: 'opg-warning' }, h('h1', {}, 'You went back'), h('p', {}, 'Nothing from this site was loaded.')));
          } }, os === 'macos' ? 'Go Back' : 'Go back')),
        details));
    }
    el.append(root);
    if (hadFocus || (part === 'form' && FOCUS.has(pageId))) {
      const want = FOCUS.get(pageId);
      const box = root.querySelector(`[data-field="${want}"]`);
      if (box && hadFocus) box.focus({ preventScroll: true });
    }
  }

  // ---- the quest overlay (QUESTS.md §2): cue, flags, the network blip, the busy cursor ---------------------------------
  // Mounted once per shell document. A shell gives locate(key): the element(s) on its screen for an ocean key, or null
  // (each OS draws Mail, the dock and Finder its own way). The overlay stamps data-ocean-key on what it finds, glows the
  // first cue key on screen, lets the trainee flag any keyed thing, and shows network activity while a keylogger runs.
  // emit(intent) sends world intents; nothing here changes the world itself.
  const FLAG_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 1.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3.6 2h8.6l-2.1 3.2 2.1 3.2H3.6z" fill="currentColor"/></svg>';
  const NET_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Every key the overlay looks for on screen, from the world: apps, files, mail, pages, processes, notifications.
  function candidateKeys(world) {
    const keys = ['app:mail', 'app:browser', 'app:files', 'app:taskmanager', 'app:settings', 'net'];
    for (const node of Object.values(world.fs?.nodes ?? {})) if (node && node.kind === 'file' && !node.trashed) keys.push(`file:${node.id}`);
    for (const message of world.data?.mail?.messages ?? []) {
      keys.push(`mail:${message.id}`);
      if (message.link) keys.push(`link:${message.id}`);
    }
    for (const [id, page] of Object.entries(world.data?.web?.pages ?? {})) {
      keys.push(`page:${id}`);
      for (const choice of page.choices) keys.push(`choice:${choice.choiceId}`);
    }
    for (const item of world.data?.processes ?? []) keys.push(`process:${item.name}`);
    for (const item of world.data?.startup ?? []) keys.push(`startup:${item.name}`);
    for (const item of world.notifications?.banners ?? []) keys.push(`notification:${item.id}`);
    for (const win of world.windows ?? []) if (win.app === 'program') keys.push(`view:${win.payload.view}`);
    return keys;
  }
  // CSS here is this file's stylesheet, so the browser's CSS.escape is reached through the window.
  const cssEscape = text => (typeof window !== 'undefined' && window.CSS?.escape ? window.CSS.escape(String(text)) : String(text).replace(/["\\]/g, ch => `\\${ch}`));
  const shown = el => Boolean(el && el.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const labelOf = el => (el.getAttribute('data-ocean-label') || el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 110) || 'This item';
  // The first element under root whose text includes text (a Mail row by its subject); the innermost row-like match.
  function byText(root, selector, text) {
    if (!root || !text) return null;
    return [...root.querySelectorAll(selector)].find(el => el.textContent.includes(text)) ?? null;
  }
  function mountOverlay(doc, { emit = () => {}, locate = () => null } = {}) {
    if (doc.__oceanOverlay) return doc.__oceanOverlay;
    injectStyles(doc);
    const win = doc.defaultView;
    let world = null, os = 'windows', fx = 'none', cued = null, sent = 0, netUntil = 0, procs = null, frame = 0, scrolledFor = null;
    const layer = h('div', { class: 'oql', 'aria-hidden': 'false' });
    const flagBtn = h('button', { class: 'oql-flag', type: 'button', hidden: true, title: 'Flag as suspicious' });
    flagBtn.innerHTML = FLAG_SVG;
    const net = h('div', { class: 'oql-net', hidden: true, 'data-ocean-key': 'net', 'data-ocean-label': 'Network activity while you typed', title: 'Network activity' });
    net.innerHTML = NET_SVG;
    const badges = h('div', { class: 'oql-badges' });
    layer.append(badges, net, flagBtn);
    doc.body.append(layer);
    let hovered = null;
    const flagged = key => (world?.data?.flags ?? []).some(item => item.key === key);
    const placeFlag = () => {
      if (!hovered || !shown(hovered)) { flagBtn.hidden = true; return; }
      const box = hovered.getBoundingClientRect();
      flagBtn.hidden = false;
      // Overhanging the top-right corner, so a small target (a taskbar icon) stays clickable under it.
      const small = box.height < 60;
      flagBtn.style.left = `${Math.min(win.innerWidth - 26, Math.max(2, box.right - (small ? 12 : 26)))}px`;
      flagBtn.style.top = `${Math.max(2, Math.min(win.innerHeight - 26, small ? box.top - 16 : box.top + 4))}px`;
      const on = flagged(hovered.getAttribute('data-ocean-key'));
      flagBtn.dataset.on = String(on);
      flagBtn.title = on ? 'Remove your flag' : 'Flag as suspicious';
    };
    doc.addEventListener('mouseover', event => {
      if (event.target === flagBtn || flagBtn.contains(event.target)) return;
      const keyed = event.target.closest?.('[data-ocean-key]');
      if (keyed === hovered) return;
      hovered = keyed;
      placeFlag();
    }, true);
    flagBtn.addEventListener('click', event => {
      event.stopPropagation();
      event.preventDefault();
      if (!hovered) return;
      const key = hovered.getAttribute('data-ocean-key');
      const on = !flagged(key);
      emit({ kind: 'flag', key, label: labelOf(hovered), on });
      if (on && fx !== 'none') burst(hovered, fx);
      flagBtn.dataset.on = String(on);
    });
    // Juice (Game Polish: coin_pickup_feel, juicy_button_feel): a pop on the flagged thing, and on high a few sparkles.
    function burst(el, level) {
      const box = el.getBoundingClientRect();
      el.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(0.985)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
      if (level !== 'high') return;
      const cx = box.right - 12, cy = box.top + 10;
      for (let n = 0; n < 6; n++) {
        const spark = h('div', { class: 'oql-spark' });
        spark.style.left = `${cx}px`; spark.style.top = `${cy}px`;
        layer.append(spark);
        const angle = (n / 6) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 18 + Math.random() * 16;
        spark.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) scale(.3)`, opacity: 0 }], { duration: 250 + Math.random() * 120, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => spark.remove();
      }
    }
    function stamp() {
      if (!world) return;
      for (const key of candidateKeys(world)) {
        if (key === 'net') continue;
        let found = locate(key);
        if (!found) continue;
        for (const el of Array.isArray(found) ? found : [found]) {
          if (el && el.getAttribute('data-ocean-key') !== key && !el.closest('.oql')) el.setAttribute('data-ocean-key', key);
        }
      }
    }
    function refresh() {
      frame = 0;
      if (!world) return;
      stamp();
      // Cue: the first key in the list with something on screen (most specific first). A thing behind another window is
      // skipped for the next key (its app's dock or taskbar icon brings it forward); only if nothing is uncovered does the
      // covered thing glow.
      // A cued box scrolled out of its page is brought into view once, as a browser does when focus moves to the next box.
      let target = null;
      let covered = null;
      for (const key of world.scene?.cue ?? []) {
        const els = [...doc.querySelectorAll(`[data-ocean-key="${cssEscape(key)}"]`)].filter(shown);
        target = els.find(el => onTop(el, true)) ?? null;
        if (!target && els[0] && scrolledFor !== key && clipped(els[0])) {
          scrolledFor = key;
          els[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
          target = onTop(els[0], true) ? els[0] : null;
        }
        if (target) break;
        covered ??= els[0] ?? null;
      }
      target ??= covered;
      if (cued !== target) {
        cued?.classList.remove('ocean-cue');
        target?.classList.add('ocean-cue');
        cued = target;
      }
      doc.documentElement.dataset.oceanFx = fx;
      // Flag badges on every flagged thing on screen.
      const marks = [];
      const places = [];
      for (const item of world.data?.flags ?? []) {
        for (const el of doc.querySelectorAll(`[data-ocean-key="${cssEscape(item.key)}"]`)) {
          if (!shown(el) || el.closest('.oql') || !onTop(el)) continue;
          const box = el.getBoundingClientRect();
          const mark = h('div', { class: 'oql-badge', title: `You flagged: ${item.label}` });
          mark.innerHTML = FLAG_SVG;
          mark.style.left = `${Math.min(win.innerWidth - 18, Math.max(0, box.right - 16))}px`;
          mark.style.top = `${Math.max(0, box.top - 6)}px`;
          marks.push(mark);
          places.push(item.key, mark.style.left, mark.style.top);
          break;
        }
      }
      // Redrawn only when a badge moves: the overlay's own changes must not wake its observer again.
      const placed = places.join('|');
      if (badges.dataset.placed !== placed) { badges.dataset.placed = placed; badges.replaceChildren(...marks); }
      // The network blip sits on the tray (Windows) or the menu bar (macOS), where the network icon is.
      const anchor = locate('net');
      const live = Date.now() < netUntil;
      net.hidden = !live;
      if (live) {
        const box = anchor && shown(anchor) ? anchor.getBoundingClientRect() : null;
        net.dataset.os = os;
        if (box) { net.style.left = `${box.left + box.width / 2 - (net.offsetWidth || 22) / 2}px`; net.style.top = os === 'macos' ? `${box.bottom + 4}px` : `${box.top - (net.offsetHeight || 22) - 4}px`; net.style.right = net.style.bottom = ''; }
        else { net.style.left = net.style.top = ''; net.style[os === 'macos' ? 'top' : 'bottom'] = os === 'macos' ? '28px' : '54px'; net.style.right = '170px'; }
      }
      placeFlag();
    }
    // A thing covered by a window is not on screen: its badge would float over the window in front. A cue (centre) needs its
    // middle uncovered, where a click lands; a badge needs any corner.
    function onTop(el, centre = false) {
      const box = el.getBoundingClientRect();
      const points = [[box.left + box.width / 2, box.top + box.height / 2], [box.right - 4, box.top + 4], [box.left + 4, box.top + 4]];
      for (const [x, y] of centre ? points.slice(0, 1) : points) {
        if (x < 0 || y < 0 || x >= win.innerWidth || y >= win.innerHeight) continue;
        const hit = doc.elementFromPoint(x, y);
        // A cue must take the click itself: a hit on an ancestor (another window's scroll area over it) does not count.
        if (hit && (hit === el || el.contains(hit) || (!centre && hit.contains(el)) || hit.closest('.oql'))) return true;
      }
      return false;
    }
    // Outside the visible part of a scrolling ancestor (a long page in its window).
    function clipped(el) {
      const box = el.getBoundingClientRect();
      for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
        if (p.scrollHeight <= p.clientHeight + 1 || !/(auto|scroll)/.test(win.getComputedStyle(p).overflowY)) continue;
        const port = p.getBoundingClientRect();
        return box.top < port.top || box.bottom > port.bottom;
      }
      return false;
    }
    const schedule = () => { if (!frame) frame = win.requestAnimationFrame(refresh); };
    new win.MutationObserver(records => { if (records.some(record => !layer.contains(record.target))) schedule(); }).observe(doc.body, { childList: true, subtree: true });
    win.addEventListener('scroll', schedule, true);
    win.addEventListener('resize', schedule);
    const api = {
      update(next, nextOs = os) {
        const before = world;
        world = next;
        os = nextOs;
        fx = next?.scene?.fx ?? 'none';
        // Each key typed while a keylogger runs leaves the machine: the blip lights up again (QUESTS.md §3).
        const total = next?.data?.net?.sent ?? 0;
        if (total > sent && before) { netUntil = Date.now() + 4500; net.animate?.([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' }); win.setTimeout(schedule, 4600); }
        sent = total;
        // A program started with no window: the pointer is busy for a moment, as both OSes show (Windows' working cursor,
        // the Mac's spinning wait cursor).
        const names = (next?.data?.processes ?? []).filter(item => item.suspicious).map(item => item.name);
        if (procs && names.some(name => !procs.includes(name))) {
          doc.documentElement.classList.add('oql-busy');
          win.setTimeout(() => doc.documentElement.classList.remove('oql-busy'), 2600);
        }
        procs = names;
        schedule();
      },
      refresh: schedule,
    };
    doc.__oceanOverlay = api;
    return api;
  }

  // ---- sounds (both OSes, synthesised: no recordings of either OS) ---------------------------------------------------
  // OS cues: the parent plays them for the OS on screen, so the hidden shell stays quiet. Each is short, peaks at once and
  // has a short tail (Game Polish: audio_strong_attack_and_mix). Game cues play only at effects low or high.
  let audio = null, lastPlay = new Map();
  const OS_SOUNDS = {
    windows: {
      notify: [['sine', 1046.5, 0, 0.09, 0.5], ['sine', 1568, 0.07, 0.22, 0.4]], // the soft two-note toast
      mail: [['sine', 784, 0, 0.12, 0.45], ['sine', 1174.7, 0.09, 0.3, 0.4]],
      alert: [['triangle', 523.3, 0, 0.16, 0.5], ['triangle', 392, 0.1, 0.32, 0.4]], // Exclamation for a warning prompt
      error: [['triangle', 311.1, 0, 0.2, 0.55], ['triangle', 261.6, 0.12, 0.38, 0.45]], // Critical Stop
      uac: [], // User Account Control is silent on the secure desktop
      unlock: [['sine', 659.3, 0, 0.18, 0.35], ['sine', 987.8, 0.1, 0.4, 0.3]],
      trash: [['noise', 0, 0, 0.12, 0.25]],
      sent: [['sweep', 600, 0, 0.22, 0.25]],
    },
    macos: {
      notify: [['sine', 1318.5, 0, 0.12, 0.4]], // a bright single note
      mail: [['sine', 1568, 0, 0.1, 0.35], ['sine', 2093, 0.08, 0.26, 0.3]], // New Mail
      alert: [['sine', 880, 0, 0.14, 0.45], ['sine', 880, 0.15, 0.28, 0.3]], // Funk-like double knock
      error: [['triangle', 370, 0, 0.18, 0.5]], // Basso-like low note
      uac: [['sine', 880, 0, 0.14, 0.45], ['sine', 880, 0.15, 0.28, 0.3]],
      unlock: [],
      trash: [['noise', 0, 0, 0.18, 0.3]],
      sent: [['sweep', 900, 0, 0.3, 0.25]],
    },
    game: {
      flag: [['square', 1200, 0, 0.012, 0.12], ['sine', 1760, 0.02, 0.1, 0.25]], // click down, bright click up
      unflag: [['square', 700, 0, 0.012, 0.1]],
      task: [['sine', 1046.5, 0, 0.12, 0.35], ['sine', 1318.5, 0.07, 0.2, 0.32], ['sine', 1568, 0.14, 0.36, 0.3]],
      cue: [['sine', 1975.5, 0, 0.05, 0.12]],
      step: [['sine', 880, 0, 0.06, 0.15]],
      type: [['square', 2400, 0, 0.008, 0.05]],
      leak: [['sine', 2637, 0, 0.03, 0.1], ['sine', 1975.5, 0.03, 0.07, 0.08]],
      threat: [['sawtooth', 110, 0, 0.35, 0.3], ['sawtooth', 82.4, 0.08, 0.5, 0.25]],
      reveal: [['sweep', 200, 0, 0.6, 0.3], ['sine', 523.3, 0.55, 1.0, 0.35], ['sine', 784, 0.6, 1.1, 0.3]],
      score: [['sine', 784, 0, 0.1, 0.3], ['sine', 1046.5, 0.08, 0.2, 0.3], ['sine', 1568, 0.16, 0.5, 0.3]],
    },
  };
  // name: an OS cue (played as the OS on screen) or a game cue. pitch: a multiplier (a rising streak on repeated cues).
  function sound(name, { os = 'windows', volume = 70, muted = false, pitch = 1 } = {}) {
    const tones = OS_SOUNDS.game[name] ?? OS_SOUNDS[os === 'macos' ? 'macos' : 'windows'][name];
    if (!tones?.length || muted || !volume || typeof window === 'undefined') return;
    // Four voices at most and a 40 ms retrigger cooldown per cue (no machine-gun repeats).
    const now = Date.now();
    if (now - (lastPlay.get(name) ?? 0) < 40) return;
    lastPlay.set(name, now);
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime + 0.005;
      const master = audio.createGain();
      master.gain.value = Math.min(1, volume / 100) * 0.5;
      master.connect(audio.destination);
      for (const [wave, freq, start, end, peak] of tones) {
        const gain = audio.createGain();
        gain.gain.setValueAtTime(0.0001, t0 + start);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + end);
        gain.connect(master);
        let source;
        if (wave === 'noise') {
          const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * (end - start)), audio.sampleRate);
          const data = buffer.getChannelData(0);
          for (let n = 0; n < data.length; n++) data[n] = (Math.random() * 2 - 1) * (1 - n / data.length);
          source = audio.createBufferSource();
          source.buffer = buffer;
          const filter = audio.createBiquadFilter();
          filter.type = 'bandpass'; filter.frequency.value = 1800;
          source.connect(filter).connect(gain);
        } else {
          source = audio.createOscillator();
          source.type = wave === 'sweep' ? 'sine' : wave;
          source.frequency.setValueAtTime(freq * pitch, t0 + start);
          if (wave === 'sweep') source.frequency.exponentialRampToValueAtTime(freq * pitch * 2.6, t0 + end);
          source.connect(gain);
        }
        source.start(t0 + start);
        source.stop(t0 + end + 0.02);
      }
    } catch {
      // No audio device or no gesture yet: sounds are optional.
    }
  }

  const api = Object.freeze({ appName, fileIcon, pathOf, renderView, renderDialog, dialogFrame, injectStyles, characterArt, countdown, renderPagePart, ICON_STYLE,
    mountOverlay, byText, candidateKeys, sound });
  if (typeof window !== 'undefined') window.OceanProgramUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
