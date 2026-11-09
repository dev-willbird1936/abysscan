async () => {
  const select = document.querySelector('#style');
  const results = [];
  for (let i = 0; i < select.options.length; i++) {
    select.value = i;
    select.dispatchEvent(new Event('change'));
    const panels = [...document.querySelectorAll('.zone')];
    const images = panels.flatMap(p => [...p.querySelectorAll('img')]);
    const decoded = await Promise.allSettled(images.map(img => img.decode()));
    results.push({
      style: select.options[i].text,
      panels: panels.length,
      decoded: decoded.filter(r => r.status === 'fulfilled').length,
      overlays: panels.filter(p => p.querySelector('.creatures')).length,
      exact16by9: images.every(img => img.naturalWidth === 1600 && img.naturalHeight === 900),
      aligned: panels.every(p => {
        const a = p.querySelector('img').getBoundingClientRect();
        const b = p.querySelector('.creatures').getBoundingClientRect();
        return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
      }),
      layout16by9: panels.every(p => Math.abs(p.getBoundingClientRect().width / p.getBoundingClientRect().height - 16 / 9) < .01),
      warnings: panels.filter(p => !p.querySelector('.creature-warning').hidden).length,
      pixelated: i !== 3 || images.every(img => getComputedStyle(img).imageRendering === 'pixelated')
    });
  }
  select.value = 1;
  select.dispatchEvent(new Event('change'));
  document.querySelector('.creatures').src = 'creature-assets/paper-cut/nonexistent-verification-image.png';
  await Promise.allSettled([...document.querySelectorAll('.zone img')].map(img => img.decode()));
  const missing = {
    warningVisible: !document.querySelector('.creature-warning').hidden,
    backgroundVisible: !document.querySelector('.zone img:not(.creatures)').hidden,
    backgroundDecoded: document.querySelector('.zone img:not(.creatures)').naturalWidth === 1600,
    status: document.querySelector('#status').textContent
  };
  select.value = 0;
  select.dispatchEvent(new Event('change'));
  await Promise.all([...document.querySelectorAll('.zone img')].map(img => img.decode()));
  window.scrollTo(0, document.body.scrollHeight);
  const stickyAtBottom = Math.abs(document.querySelector('header').getBoundingClientRect().top) < 1;
  window.scrollTo(0, 0);
  return {
    viewport: [innerWidth, innerHeight],
    styles: results,
    decodedTotal: results.reduce((n, r) => n + r.decoded, 0),
    allStylesPass: results.every(r => r.panels === 5 && r.overlays === 5 && r.decoded === 10 && r.exact16by9 && r.aligned && r.layout16by9 && r.warnings === 0 && r.pixelated),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    stickyAtBottom,
    missingLayer: missing,
    recoveredStatus: document.querySelector('#status').textContent
  };
}
