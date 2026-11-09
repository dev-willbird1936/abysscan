// Web Audio synth cues (no media files, no network). Volume and mute come from world.sys.
let ctx = null;

const tones = {
  chime: [[880, 0, 0.18], [1318.5, 0.12, 0.32]],
  unlock: [[523.3, 0, 0.12], [659.3, 0.08, 0.14], [784, 0.16, 0.3]],
  error: [[220, 0, 0.16], [196, 0.14, 0.24]],
  trash: [[400, 0, 0.06], [260, 0.04, 0.12], [140, 0.1, 0.16]],
};

export const playSound = (name, sys) => {
  if (!sys || sys.muted || !sys.volume || !tones[name] || window.parent !== window) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state == "suspended") ctx.resume();
    const peak = 0.18 * (sys.volume / 100);
    const now = ctx.currentTime;
    for (const [freq, start, end] of tones[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = name == "error" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(peak, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + end + 0.02);
    }
  } catch (err) {
    // Audio unavailable (no user gesture yet or no device); cues are optional.
  }
};
