// Sound, all synthesised with WebAudio — no audio files. An engine hum that follows the
// throttle, wind that follows the airspeed, a chime for each ring and a thud for touchdown.
export function createAudio() {
  let ctx = null;
  let engineOsc = null; let engineOsc2 = null; let engineGain = null;
  let windSource = null; let windGain = null; let windFilter = null;
  let muted = false;
  let started = false;

  /** Build the graph. Call from a user gesture; browsers block audio before one. */
  function start() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineOsc.start();
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'triangle';
      engineOsc2.frequency.value = 110;
      const gain2 = ctx.createGain();
      gain2.gain.value = 0.4;
      engineOsc2.connect(gain2);
      gain2.connect(engineGain);
      engineOsc2.start();
      const noiseLen = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSource.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, at, dur, type, vol) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(vol, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  return {
    start,
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = muted ? 0 : engineGain.gain.value;
      if (windGain) windGain.gain.value = muted ? 0 : windGain.gain.value;
      return muted;
    },
    get muted() { return muted; },
    /** Follow the engine: rpm from throttle, wind from airspeed. Call every frame. */
    update(throttle, speed, airborne) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const rpm = 42 + throttle * 58;
      engineOsc.frequency.setTargetAtTime(rpm, t, 0.1);
      engineOsc2.frequency.setTargetAtTime(rpm * 2, t, 0.1);
      engineGain.gain.setTargetAtTime(airborne || throttle > 0.05 ? 0.05 + throttle * 0.075 : 0, t, 0.15);
      windFilter.frequency.setTargetAtTime(320 + speed * 9, t, 0.2);
      windGain.gain.setTargetAtTime(Math.min(0.16, speed * 0.0022), t, 0.2);
    },
    /** Two-note chime when a ring is cleared. */
    ring() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      tone(880, t, 0.35, 'sine', 0.22);
      tone(1318, t + 0.09, 0.4, 'sine', 0.18);
    },
    /** A low thud for touchdown, and a soft one for a crash. */
    thud(hard) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      tone(hard ? 55 : 75, t, hard ? 0.5 : 0.25, 'sine', hard ? 0.5 : 0.3);
    },
    /** Short beep for menu clicks. */
    click() {
      if (!ctx || muted) return;
      tone(660, ctx.currentTime, 0.08, 'sine', 0.12);
    },
  };
}
