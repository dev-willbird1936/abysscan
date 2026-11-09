// Shared navigation: three main destinations, separate operator tools, and a compact keyboard-accessible mobile menu.
(() => {
  const header = document.querySelector('.bar, .pg-bar, .jv-bar');
  const nav = header?.querySelector('nav');
  if (!nav) return;
  const tools = document.createElement('details');
  tools.className = 'site-tools';
  const summary = document.createElement('summary');
  summary.textContent = 'Tools';
  tools.append(summary);
  const links = document.createElement('div');
  links.className = 'site-tools-links';
  const legacy = nav.querySelector('.nav-dev');
  if (legacy) links.append(legacy);
  for (const link of nav.querySelectorAll('a[href="/scene-studio"]')) {
    if (nav.querySelector('a[href="/bestiary"]') && !link.hasAttribute('aria-current')) links.append(link);
  }
  if (links.childNodes.length) { tools.append(links); nav.append(tools); }
  for (const link of nav.querySelectorAll('a[href]')) {
    const url = new URL(link.href, location.href);
    if (url.pathname === location.pathname && !url.hash && !link.hasAttribute('aria-current')) link.setAttribute('aria-current', 'page');
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'site-nav-toggle';
  toggle.textContent = 'Menu';
  nav.id ||= 'site-navigation';
  toggle.setAttribute('aria-controls', nav.id);
  const close = () => { toggle.setAttribute('aria-expanded', 'false'); nav.removeAttribute('data-open'); tools.open = false; };
  close();
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav.toggleAttribute('data-open', open);
    if (open) nav.querySelector('a, button, summary')?.focus();
  });
  header.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); toggle.focus(); }
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('click', event => { if (!header.contains(event.target)) close(); });
  header.insertBefore(toggle, nav);
  header.classList.add('site-nav-ready');
})();
