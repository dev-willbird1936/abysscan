// Injected before the site's own scripts (context.addInitScript). The site makes its sound with WebAudio and plays it to the speakers;
// headless Chrome has none, so this also sends everything bound for the speakers to a recorder. Nothing audible changes.
(() => {
  const rec = window.__rec = { chunks: [], startedAt: 0, recorder: null };
  const connect = AudioNode.prototype.connect;
  let tap = null;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = connect.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode) {
      if (!tap) {
        tap = dest.context.createMediaStreamDestination();
        rec.recorder = new MediaRecorder(tap.stream, { mimeType: 'audio/webm;codecs=opus' });
        rec.recorder.ondataavailable = e => e.data.size && rec.chunks.push(e.data);
        rec.recorder.start(200);
        rec.startedAt = Date.now();
      }
      connect.call(this, tap);
    }
    return out;
  };
  // Resolves to the recording as base64 (empty when the site never made a sound).
  window.__recStop = () => new Promise(done => {
    const r = rec.recorder;
    const finish = () => {
      const reader = new FileReader();
      reader.onload = () => done({ startedAt: rec.startedAt, data: String(reader.result).split(',')[1] ?? '' });
      reader.readAsDataURL(new Blob(rec.chunks, { type: 'audio/webm' }));
    };
    if (!r || r.state === 'inactive') return finish();
    r.onstop = finish;
    r.stop();
  });
})();
