(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const source = $('source');
  const key = 'abysscan-scene-studio-draft';
  const limit = 64 * 1024;
  let starters = [], lastLoaded = '', busy = false, previewSource = null;
  const bytes = text => new TextEncoder().encode(text).length;
  const error = message => { $('error').textContent = message; $('error').hidden = !message; };
  const status = message => { $('status').textContent = message; };
  function saveDraft() {
    try { localStorage.setItem(key, source.value); $('draft-status').textContent = 'Draft saved in this browser'; }
    catch { $('draft-status').textContent = 'Draft storage unavailable — download to keep it'; }
    error('');
    status(previewSource !== null && previewSource !== source.value ? 'Script changed. Preview still shows the previous version.' : 'Ready to check.');
  }
  function insert(text) {
    source.setRangeText(text, source.selectionStart, source.selectionEnd, 'end');
    source.focus(); saveDraft();
  }
  function replace(text) {
    if (bytes(text) > limit) { error('Script is too large. Limit: 64 KiB.'); return; }
    source.value = text; lastLoaded = text; saveDraft();
  }
  function confirmReplace() {
    return !source.value.trim() || source.value === lastLoaded || window.confirm('Replace the current draft? Download it first if you want to keep it.');
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['validate', 'preview']) $(id).disabled = value;
  }
  async function request(path, body) {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || `Request failed (${response.status})`), { line: result.line });
    return result;
  }
  async function check(preview) {
    if (busy) return;
    if (bytes(source.value) > limit) { error('Script is too large. Limit: 64 KiB.'); return; }
    const sent = source.value;
    error(''); setBusy(true); status(preview ? 'Preparing the desktop…' : 'Checking every command and world change…');
    try {
      const result = await request(`/api/scene-studio/${preview ? 'preview' : 'validate'}`, { source: sent });
      if (sent !== source.value) { status('Script changed during the check. Check the current version again.'); return; }
      $('steps').replaceChildren(...result.steps.map(step => {
        const item = document.createElement('li');
        const title = document.createElement('strong'); title.textContent = step.title;
        const hint = document.createElement('span'); hint.textContent = step.look;
        item.append(title, hint); return item;
      }));
      status(`Valid: ${result.name} · ${result.steps.length} step${result.steps.length === 1 ? '' : 's'} · starts on ${result.os}.`);
      if (preview) {
        const url = new URL(result.url, location.origin);
        if ($('os').value !== 'script') url.searchParams.set('os', $('os').value);
        $('desktop').src = url.href;
        $('full-preview').href = url.href;
        $('full-preview').hidden = false;
        $('empty').hidden = true; $('frame-wrap').hidden = false;
        previewSource = sent;
        $('frame-wrap').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      }
    } catch (failure) {
      error(failure.message); status('Fix the script and check it again.');
      if (failure.line && sent === source.value) {
        const lines = source.value.split('\n');
        const start = lines.slice(0, failure.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
        source.focus(); source.setSelectionRange(start, start + (lines[failure.line - 1]?.length || 0));
      }
    } finally { setBusy(false); }
  }
  source.addEventListener('input', saveDraft);
  source.addEventListener('keydown', event => {
    if (event.key === 'Tab') { event.preventDefault(); insert('  '); }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); check(true); }
  });
  $('validate').addEventListener('click', () => check(false));
  $('preview').addEventListener('click', () => check(true));
  $('load-starter').addEventListener('click', () => {
    const chosen = starters.find(starter => starter.id === $('starter').value);
    if (chosen && confirmReplace()) replace(chosen.source);
  });
  $('insert-app').addEventListener('click', () => insert(`open ${$('app').value}\n`));
  $('import').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async event => {
    const file = event.target.files[0];
    try {
      if (file && file.size > limit) { error('Script is too large. Limit: 64 KiB.'); return; }
      if (file && confirmReplace()) replace(await file.text());
    } catch { error('Could not read that file.'); }
    finally { event.target.value = ''; }
  });
  $('export').addEventListener('click', () => {
    const title = /^title (.+)$/m.exec(source.value)?.[1] || 'my-scenario';
    const url = URL.createObjectURL(new Blob([source.value], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'my-scenario'}.scene`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  async function init() {
    try {
      const data = await request('/api/scene-studio/templates');
      starters = data.starters;
      $('starter').replaceChildren(...starters.map(starter => new Option(starter.name, starter.id)));
      $('snippets').replaceChildren(...data.snippets.map(([name, text]) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = name;
        button.addEventListener('click', () => insert(text)); return button;
      }));
      $('app').replaceChildren(...window.OceanWorldModel.CANONICAL_APPS.map(app => new Option(app, app)));
      let draft = null;
      try { draft = localStorage.getItem(key); } catch {}
      lastLoaded = starters[0].source;
      source.value = draft ?? lastLoaded;
      status(draft !== null ? 'Restored your local draft. Check it or preview.' : 'Edit the example, then check or preview. Ctrl/⌘ + Enter previews.');
    } catch (failure) { error(`Studio could not load: ${failure.message}. Restart the local server and reload.`); }
  }
  init();
})();
