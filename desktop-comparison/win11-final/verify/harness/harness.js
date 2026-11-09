// Parent test page: standalone (?mode=standalone) or bridge v3 parent (?mode=embedded).
const params = new URLSearchParams(location.search);
const embedded = params.get('mode') === 'embedded';
const frame = document.getElementById('shell');
const harness = window.harness = { world: null, intents: [], ready: null, port: null };

frame.src = '/app/index.html' + (embedded ? '?oceanShell=1' : '');

harness.push = (mutate) => {
  const next = JSON.parse(JSON.stringify(harness.world));
  mutate(next);
  next.revision = (harness.world.revision || 0) + 1;
  harness.world = next;
  harness.port.postMessage({ type: 'world', version: 3, revision: next.revision, world: next });
  return next.revision;
};

if (embedded) {
  frame.addEventListener('load', async () => {
    const seed = await (await fetch('/seed.json')).json();
    seed.phase = 'desktop';
    harness.world = seed;
    const channel = new MessageChannel();
    harness.port = channel.port1;
    channel.port1.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'ready') {
        harness.ready = data;
        channel.port1.postMessage({ type: 'world', version: 3, revision: seed.revision, world: seed });
      } else if (data.type === 'world-intent') harness.intents.push(data);
    };
    frame.contentWindow.postMessage({ type: 'ocean-shell-attach', version: 3 }, '*', [channel.port2]);
  });
}
