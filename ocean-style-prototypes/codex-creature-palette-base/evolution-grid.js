// 6 family x 5 depth evolution grid: 30 depth-coloured candidate stills.
// Pure join logic is exported for node tests; the DOM wiring runs only in a browser.
(function (root) {
  const FAMILIES = [
    ['anglerfish', 'Anglerfish'], ['viperfish', 'Viperfish'], ['siphonophore', 'Siphonophore'],
    ['isopod-host', 'Isopod Host Fish'], ['cookiecutter', 'Cookiecutter Shark'], ['squid', 'Squid → Kraken'],
  ];
  const DEPTHS = ['sunlight', 'twilight', 'midnight', 'abyss', 'trench'];
  const STAGE_BY_DEPTH = { sunlight: 'base-rich', twilight: 'base-rich', midnight: 'midnight-abyss', abyss: 'midnight-abyss', trench: 'trench' };
  const STAGE_LABELS = { 'base-rich': 'Base form', 'midnight-abyss': 'Mid form', trench: 'Trench form' };
  const MANIFEST_URL = '../codex-creature-depth-evolution/depth-colors/';
  const SHA256 = /^[a-f0-9]{64}$/;

  const title = word => word[0].toUpperCase() + word.slice(1);

  // Join manifest variants to the 6x5 grid. A missing or inconsistent entry becomes an explicit cell, never a fallback image.
  function buildCells(manifest, status, manifestSha256) {
    const byId = new Map((manifest?.variants ?? []).map(item => [item.id, item]));
    const qvlBound = status?.qvl?.result === 'pass' && !!manifestSha256 && status.depth_color_manifest_sha256 === manifestSha256;
    const cells = [];
    for (const [family, familyName] of FAMILIES) {
      for (const depth of DEPTHS) {
        const id = `${family}-${depth}`;
        const item = byId.get(id);
        const cell = { id, family, familyName, depth, depthName: title(depth), state: 'missing' };
        if (item) {
          const consistent = item.form === family && item.depth === depth && item.stage === STAGE_BY_DEPTH[depth] &&
            item.display_file === `${id}-256.png` && item.file === `${id}-128.png` &&
            SHA256.test(item.sha256) && SHA256.test(item.display_sha256);
          Object.assign(cell, {
            state: consistent ? 'ok' : 'mismatch',
            stage: item.stage,
            stageLabel: STAGE_LABELS[item.stage] ?? 'Unknown form',
            file: item.file,
            displayFile: item.display_file,
            sha256: item.sha256,
            displaySha256: item.display_sha256,
            candidate: item.status === 'candidate',
            qvl: qvlBound ? 'pass' : 'unbound',
          });
        }
        cells.push(cell);
      }
    }
    return cells;
  }

  const api = { FAMILIES, DEPTHS, STAGE_BY_DEPTH, STAGE_LABELS, buildCells };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function integrity(url, expected) {
    if (!root.crypto?.subtle) return 'unverified';
    try {
      const response = await fetch(url);
      if (!response.ok) return 'missing';
      return (await sha256Hex(await response.arrayBuffer())) === expected ? 'verified' : 'mismatch';
    } catch { return 'missing'; }
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderCell(cell) {
    const td = node('td');
    td.dataset.id = cell.id;
    td.dataset.state = cell.state;
    td.style.setProperty('--ocean', { sunlight: '#164d4a', twilight: '#173867', midnight: '#25234f', abyss: '#112a3c', trench: '#111522' }[cell.depth]);
    if (cell.state !== 'ok') {
      td.append(node('strong', 'cell-error', cell.state === 'missing' ? 'Missing' : 'Mismatched manifest entry'));
      return td;
    }
    const img = node('img');
    img.src = MANIFEST_URL + cell.displayFile;
    img.alt = `${cell.familyName}, ${cell.depthName}: ${cell.stageLabel}`;
    img.loading = 'lazy';
    const badges = node('small', 'badges');
    badges.append(
      node('span', `badge ${cell.qvl}`, cell.qvl === 'pass' ? 'QVL pass' : 'QVL unbound'),
      node('span', 'badge candidate', cell.candidate ? 'Candidate' : 'Not candidate'),
      node('span', 'badge pending', 'Animation pending'),
    );
    const links = node('small');
    for (const [file, label] of [[cell.displayFile, 'PNG 256'], [cell.file, 'PNG 128']]) {
      const link = node('a', '', label);
      link.href = MANIFEST_URL + file;
      link.download = '';
      links.append(link, document.createTextNode(' '));
    }
    const check = node('small', 'integrity unverified', 'Integrity: checking');
    td.append(img, node('small', 'depth-name', `${cell.depthName} · ${cell.stageLabel}`), badges, links, check);
    integrity(MANIFEST_URL + cell.displayFile, cell.displaySha256).then(result => {
      check.className = `integrity ${result}`;
      check.textContent = `Integrity: ${result === 'verified' ? 'SHA-256 verified' : result}`;
    });
    return td;
  }

  async function load() {
    const body = document.querySelector('#grid');
    const summary = document.querySelector('#grid-status');
    try {
      const [manifestResponse, statusResponse] = await Promise.all([fetch(MANIFEST_URL + 'depth-color-manifest.json'), fetch('evolution-grid-status.json')]);
      if (!manifestResponse.ok || !statusResponse.ok) throw new Error('manifest or status file missing');
      const manifestBytes = await manifestResponse.arrayBuffer();
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      const manifestSha256 = root.crypto?.subtle ? await sha256Hex(manifestBytes) : null;
      const cells = buildCells(manifest, await statusResponse.json(), manifestSha256);
      for (const [family, familyName] of FAMILIES) {
        const row = node('tr');
        const head = node('th', '', familyName);
        head.scope = 'row';
        row.append(head, ...cells.filter(cell => cell.family === family).map(renderCell));
        body.append(row);
      }
      const ready = cells.filter(cell => cell.state === 'ok').length;
      const bound = cells.filter(cell => cell.qvl === 'pass').length;
      summary.textContent = `${ready} of 30 candidate stills loaded · ${bound} QVL pass · 0 animations · final promotion pending.`;
    } catch (error) {
      summary.textContent = `Could not load the 30 depth variants: ${error.message}`;
    }
  }

  document.querySelector('#bg').addEventListener('change', event => { document.body.dataset.bg = event.target.value; });
  load();
})(typeof window !== 'undefined' ? window : globalThis);
