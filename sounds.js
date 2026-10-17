// Sounds are recorded samples where we have a good one (audio/, built by
// scripts/build-sounds.mjs) and synthesized with the Web Audio API otherwise.
// A sampled sound falls back to its synth version until the samples load.
// Each sound is `(k) => durationSeconds`, where `k` is a kit bound to an
// AudioContext (live or offline), an output node, and a start time.

const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;

function curve(fn, n = 512) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1));
  return c;
}

const noiseCache = new WeakMap();
function noiseBuffer(ac) {
  let buf = noiseCache.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ac, buf);
  }
  return buf;
}

// Vowel formants: [frequency, Q, gain]
const VOWELS = {
  ha: [[800, 6, 1], [1200, 7, 0.6], [2500, 9, 0.25]],
  aw: [[620, 6, 1], [950, 7, 0.5], [2500, 9, 0.2]],
  oh: [[450, 6, 1], [800, 7, 0.45], [2600, 9, 0.15]],
  oo: [[330, 6, 1], [870, 8, 0.35], [2250, 10, 0.1]],
};
const vowel = (name, scale) => VOWELS[name].map(([f, q, g]) => [f * scale, q, g]);

// A random audience member: pitch and vocal-tract scale.
function person({ low = [100, 165], high = [195, 310] } = {}) {
  const female = chance(0.5);
  return { f0: female ? rand(...high) : rand(...low), scale: female ? rand(1.1, 1.22) : rand(0.95, 1.05) };
}

export function kit(ac, out, t0) {
  const nb = noiseBuffer(ac);
  const k = {
    ac,
    out,
    t0,
    gain(v = 1, dest = out) {
      const g = ac.createGain();
      g.gain.value = v;
      if (dest) g.connect(dest);
      return g;
    },
    filter(type, freq, q, dest) {
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q !== undefined) f.Q.value = q;
      f.connect(dest);
      return f;
    },
    pan(dest, v = rand(-0.7, 0.7)) {
      if (!ac.createStereoPanner) return dest;
      const p = ac.createStereoPanner();
      p.pan.value = v;
      p.connect(dest);
      return p;
    },
    noise(start, dur, dest) {
      const s = ac.createBufferSource();
      s.buffer = nb;
      s.loop = true;
      s.connect(dest);
      s.start(start, rand(0, 1.5));
      s.stop(start + dur);
      return s;
    },
    osc(type, freq, start, dur, dest) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(dest);
      o.start(start);
      o.stop(start + dur);
      return o;
    },
    // Percussive envelope: instant attack, exponential decay.
    hit(param, peak, start, decay) {
      param.setValueAtTime(0, start);
      param.linearRampToValueAtTime(peak, start + 0.002);
      param.setTargetAtTime(0, start + 0.002, decay);
    },
    // One sung/spoken voice: sawtooth + breath through vowel formants.
    voice(start, dur, { pitch, env, formants, tone = 1, breath = 0.15, vibrato = 0.012, dest = out }) {
      const src = k.gain(1, null);
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueCurveAtTime(curve(pitch), start, dur);
      const lfo = ac.createOscillator();
      lfo.frequency.value = rand(4.5, 6.5);
      lfo.connect(k.gain(pitch(0) * vibrato, o.frequency));
      o.connect(k.gain(tone, src));
      k.noise(start, dur, k.gain(breath, src));
      const shaped = ac.createGain();
      shaped.gain.value = 0;
      shaped.gain.setValueCurveAtTime(curve(env), start, dur);
      for (const [f, q, g] of formants) src.connect(k.filter("bandpass", f, q, k.gain(g * 4, shaped)));
      shaped.connect(k.pan(dest));
      for (const node of [o, lfo]) {
        node.start(start);
        node.stop(start + dur);
      }
    },
  };
  return k;
}

// ---------- Audience voices ----------

function laughVoice(k, start, dur, { f0, scale }, rate) {
  const decel = rand(0.2, 0.4);
  const phase = (t) => dur * rate * (t - (decel / 2) * t * t);
  const syl = (t) => {
    const x = phase(t) % 1;
    return x < 0.55 ? Math.sin((Math.PI * x) / 0.55) : 0;
  };
  const overall = (t) => Math.min(1, (t * dur) / 0.06) * Math.pow(1 - t, 1.3);
  k.voice(start, dur, {
    pitch: (t) => f0 * (1 + 0.12 * syl(t)) * (1 - 0.18 * t),
    env: (t) => overall(t) * Math.pow(syl(t), 1.2),
    formants: vowel("ha", scale),
    breath: 0.3,
  });
}

function murmur(k, start, dur, level, center = 600) {
  const g = k.gain(0);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(level, start + 0.12);
  g.gain.linearRampToValueAtTime(0, start + dur);
  k.noise(start, dur, k.filter("bandpass", center, 0.6, g));
}

function crowdLaugh(k, start, { voices, dur, spread = 0.35 }) {
  const bus = k.gain(1 / Math.sqrt(voices));
  const sub = { ...k, out: bus };
  for (let i = 0; i < voices; i++) {
    const vdur = dur * rand(0.55, 1);
    laughVoice(sub, start + (i === 0 ? 0 : rand(0, spread)), vdur, person(), rand(4.2, 6.5));
  }
  murmur(k, start, dur, 0.04);
  return dur + spread;
}

function crowdVowel(k, start, { voices, dur, name, pitch, env, spread = 0.15, low, high, breath = 0.12 }) {
  const bus = k.gain(1 / Math.sqrt(voices));
  const sub = { ...k, out: bus };
  for (let i = 0; i < voices; i++) {
    const p = person({ low, high });
    const vdur = dur * rand(0.8, 1);
    sub.voice(start + rand(0, spread), vdur, {
      pitch: (t) => p.f0 * pitch(t),
      env,
      formants: vowel(name, p.scale),
      breath,
      vibrato: 0.02,
    });
  }
  return dur + spread;
}

const sustain = (attack, release) => (t) => Math.min(1, t / attack, (1 - t) / release);

// ---------- Applause & crickets (rendered sample-by-sample) ----------

function applauseBuffer(ac, dur, { clappers = 40, swell = 0.3, fade = 1.6 } = {}) {
  const sr = ac.sampleRate;
  const len = Math.floor(dur * sr);
  const buf = ac.createBuffer(2, len, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let c = 0; c < clappers; c++) {
    const period = 1 / rand(3.5, 6.5);
    const end = dur - rand(0, fade);
    const p = Math.random();
    const gl = Math.sqrt(1 - p);
    const gr = Math.sqrt(p);
    const amp = rand(0.4, 1);
    const tau = rand(0.003, 0.008) * sr;
    const clen = Math.floor(tau * 6);
    const color = rand(0.25, 0.75);
    for (let t = rand(0, swell); t < end; t += period * rand(0.85, 1.15)) {
      const s0 = Math.floor(t * sr);
      const a = amp * rand(0.7, 1) * Math.min(1, t / swell + 0.2);
      let y = 0;
      for (let i = 0; i < clen && s0 + i < len; i++) {
        y += color * ((Math.random() * 2 - 1) * Math.exp(-i / tau) - y);
        L[s0 + i] += y * a * gl;
        R[s0 + i] += y * a * gr;
      }
    }
  }
  normalize(buf, 0.9);
  return buf;
}

function cricketBuffer(ac, dur) {
  const sr = ac.sampleRate;
  const len = Math.floor(dur * sr);
  const buf = ac.createBuffer(2, len, sr);
  const crickets = [
    { f: rand(4200, 4500), every: rand(0.55, 0.7), pan: 0.25, at: 0.1 },
    { f: rand(4700, 5000), every: rand(0.75, 0.9), pan: 0.8, at: 0.35 },
  ];
  for (const c of crickets) {
    const chans = [buf.getChannelData(0), buf.getChannelData(1)];
    const gains = [Math.sqrt(1 - c.pan), Math.sqrt(c.pan)];
    for (let t = c.at; t < dur - 0.2; t += c.every * rand(0.95, 1.05)) {
      for (let p = 0; p < 3; p++) {
        const s0 = Math.floor((t + p * 0.04) * sr);
        const plen = Math.floor(0.018 * sr);
        for (let i = 0; i < plen && s0 + i < len; i++) {
          const w = Math.sin((Math.PI * i) / plen) ** 2;
          const v = Math.sin((2 * Math.PI * c.f * i) / sr) * w * 0.5;
          chans[0][s0 + i] += v * gains[0];
          chans[1][s0 + i] += v * gains[1];
        }
      }
    }
  }
  return buf;
}

function normalize(buf, peak) {
  let max = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    for (const v of buf.getChannelData(ch)) max = Math.max(max, Math.abs(v));
  }
  if (!max) return;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= peak / max;
  }
}

function playBuffer(k, buf, start, level = 1, dest = k.out) {
  const s = k.ac.createBufferSource();
  s.buffer = buf;
  s.connect(k.gain(level, dest));
  s.start(start);
  return buf.duration;
}

function applause(k, start, dur, opts) {
  const bus = k.gain(1);
  const shaped = k.filter("highpass", 350, 0.7, k.filter("peaking", 2200, 1, bus));
  playBuffer(k, applauseBuffer(k.ac, dur, opts), start, 1, shaped);
  return dur;
}

// ---------- Percussion ----------

function kick(k, t, level = 1) {
  const g = k.gain(0);
  const o = k.osc("sine", 120, t, 0.5, g);
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  k.hit(g.gain, level, t, 0.12);
}

function tom(k, t, f, level = 0.9) {
  const g = k.gain(0);
  const o = k.osc("sine", f, t, 0.6, g);
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.2);
  k.hit(g.gain, level, t, 0.11);
  const n = k.gain(0);
  k.noise(t, 0.05, k.filter("bandpass", 2500, 1, n));
  k.hit(n.gain, 0.25 * level, t, 0.008);
}

function snare(k, t, level = 1) {
  const n = k.gain(0);
  k.noise(t, 0.4, k.filter("highpass", 1200, 0.7, n));
  k.hit(n.gain, 0.7 * level, t, 0.06);
  const g = k.gain(0);
  k.osc("triangle", 190, t, 0.2, g);
  k.hit(g.gain, 0.5 * level, t, 0.04);
}

function cymbal(k, t, decay = 0.5, level = 0.5) {
  const g = k.gain(0);
  const hp = k.filter("highpass", 6500, 0.7, g);
  k.noise(t, decay * 6, hp);
  // Classic analog-cymbal square stack for metallic shimmer.
  const metal = k.gain(0.08, hp);
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) k.osc("square", f * 2.1, t, decay * 6, metal);
  k.hit(g.gain, level, t, decay);
}

function hat(k, t, level = 0.25) {
  const g = k.gain(0);
  k.noise(t, 0.1, k.filter("highpass", 8000, 0.7, g));
  k.hit(g.gain, level, t, 0.018);
}

// ---------- Tonal instruments ----------

function brass(k, t, freqs, dur, level = 0.35) {
  const g = k.gain(0);
  const lp = k.filter("lowpass", 500, 2, g);
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.linearRampToValueAtTime(3200, t + 0.04);
  lp.frequency.setTargetAtTime(1600, t + 0.04, 0.15);
  for (const f of freqs) {
    for (const cents of [-7, 7]) {
      const o = k.osc("sawtooth", f, t, dur + 0.3, lp);
      o.detune.value = cents;
    }
  }
  const peak = level / Math.sqrt(freqs.length);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.03);
  g.gain.setValueAtTime(peak * 0.85, t + Math.max(0.05, dur - 0.05));
  g.gain.linearRampToValueAtTime(0, t + dur + 0.2);
}

function bell(k, t, f, level = 0.4) {
  for (const [ratio, amp, decay] of [[1, 1, 0.6], [2.76, 0.35, 0.25], [5.4, 0.15, 0.12], [2, 0.2, 0.4]]) {
    const g = k.gain(0);
    k.osc("sine", f * ratio, t, 3, g);
    k.hit(g.gain, level * amp, t, decay);
  }
}

function slapBass(k, t, f, dur) {
  const g = k.gain(0);
  const lp = k.filter("lowpass", 2400, 6, g);
  lp.frequency.setValueAtTime(2400, t);
  lp.frequency.setTargetAtTime(280, t, 0.05);
  k.osc("sawtooth", f, t, dur + 0.1, lp);
  k.osc("square", f / 2, t, dur + 0.1, k.gain(0.4, lp));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.55, t + 0.004);
  g.gain.setTargetAtTime(0.25, t + 0.004, 0.08);
  g.gain.setTargetAtTime(0, t + dur, 0.02);
}

// ---------- Recorded samples ----------

// Sound id → clip variants in audio/ (each press picks one at random), and a
// gain that matches the clips to the synth version's loudness, so the `level`
// in app.js holds for both (tuned with scripts/loudness.mjs).
const SAMPLES = {
  applause: { clips: ["applause-1", "applause-2"], gain: 1 },
  whoo: { clips: ["whoo-1", "whoo-2"], gain: 9.4 },
  crickets: { clips: ["crickets-1", "crickets-2"], gain: 0.4 },
  rimshot: { clips: ["rimshot-1", "rimshot-2", "rimshot-3"], gain: 2.4 },
  drumroll: { clips: ["drumroll-1", "drumroll-2"], gain: 2.4 },
  doorbell: { clips: ["doorbell-1", "doorbell-2"], gain: 1.15 },
  scratch: { clips: ["scratch-1", "scratch-2", "scratch-3"], gain: 1.6 },
  boing: { clips: ["boing-1", "boing-2"], gain: 1.55 },
};
export const SAMPLE_FILES = Object.values(SAMPLES).flatMap((s) => s.clips.map((name) => `/audio/${name}.mp3`));

// AudioBuffers aren't tied to the context that decoded them, so decode once
// up front (no user gesture needed) and play them in any live or offline context.
const buffers = new Map();
export const samplesReady = (async () => {
  if (typeof OfflineAudioContext === "undefined") return;
  const decoder = new OfflineAudioContext(2, 1, 44100);
  await Promise.all(
    SAMPLE_FILES.map(async (url) => {
      try {
        const res = await fetch(url);
        if (res.ok) buffers.set(url, await decoder.decodeAudioData(await res.arrayBuffer()));
      } catch {}
    }),
  );
})();

// Plays a random loaded variant; returns its duration, or null if none loaded.
function sample(k, id, start = k.t0, gain = 1) {
  const { clips, gain: base } = SAMPLES[id];
  const loaded = clips.map((name) => buffers.get(`/audio/${name}.mp3`)).filter(Boolean);
  if (!loaded.length) return null;
  return playBuffer(k, loaded[Math.floor(Math.random() * loaded.length)], start, base * gain);
}

// ---------- The board ----------

export const SOUNDS = {
  chuckle: (k) => crowdLaugh(k, k.t0, { voices: 7, dur: 1.4, spread: 0.2 }),
  bigLaugh: (k) => crowdLaugh(k, k.t0, { voices: 22, dur: 2.8 }),
  roar: (k) => crowdLaugh(k, k.t0, { voices: 34, dur: 4.2, spread: 0.4 }),
  laughApplause: (k) => {
    const a = crowdLaugh(k, k.t0, { voices: 26, dur: 3.2 });
    const b = 0.7 + (sample(k, "applause", k.t0 + 0.7) ?? applause(k, k.t0 + 0.7, 4.5, { clappers: 45 }));
    return Math.max(a, b);
  },
  applause: (k) => sample(k, "applause") ?? applause(k, k.t0, 5, { clappers: 50 }),
  whoo: (k) => {
    const rec = sample(k, "whoo");
    if (rec) return rec;
    const v = crowdVowel(k, k.t0, {
      voices: 6,
      dur: 1.3,
      name: "oo",
      spread: 0.3,
      pitch: (t) => 1.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.6)),
      env: sustain(0.08, 0.35),
      low: [150, 220],
      high: [300, 420],
    });
    return Math.max(v, 0.2 + applause(k, k.t0 + 0.2, 3.5, { clappers: 30 }));
  },
  aww: (k) =>
    crowdVowel(k, k.t0, {
      voices: 16,
      dur: 1.9,
      name: "aw",
      pitch: (t) => 1.25 - 0.4 * Math.pow(t, 0.8),
      env: sustain(0.15, 0.3),
    }),
  ooh: (k) =>
    crowdVowel(k, k.t0, {
      voices: 16,
      dur: 1.5,
      name: "oo",
      pitch: (t) => 0.95 + 0.35 * Math.sin(Math.PI * t * 0.85),
      env: sustain(0.12, 0.35),
    }),
  gasp: (k) => {
    const voices = 14;
    const bus = k.gain(1.6 / Math.sqrt(voices));
    for (let i = 0; i < voices; i++) {
      const p = person();
      k.voice(k.t0 + rand(0, 0.08), rand(0.45, 0.6), {
        pitch: () => p.f0,
        env: (t) => Math.min(1, t / 0.08) * Math.pow(1 - t, 2),
        formants: vowel("ha", p.scale * 1.15),
        tone: 0.12,
        breath: 1.2,
        dest: bus,
      });
    }
    return 0.7;
  },
  boo: (k) =>
    crowdVowel(k, k.t0, {
      voices: 18,
      dur: 2.3,
      name: "oo",
      spread: 0.3,
      pitch: (t) => 1.05 - 0.2 * t,
      env: (t) => sustain(0.1, 0.25)(t) * (0.8 + 0.2 * Math.sin(t * 19)),
      low: [85, 135],
      high: [165, 230],
    }),
  crickets: (k) => sample(k, "crickets") ?? playBuffer(k, cricketBuffer(k.ac, 3.6), k.t0, 0.5),
  sadTrombone: (k) => {
    const notes = [[233.08, 0.42], [220, 0.42], [207.65, 0.42], [196, 1.7]];
    let t = k.t0;
    notes.forEach(([f, d], i) => {
      const last = i === notes.length - 1;
      const g = k.gain(0);
      const lp = k.filter("lowpass", 400, 4, g);
      lp.frequency.setValueAtTime(350, t);
      lp.frequency.linearRampToValueAtTime(1700, t + 0.12);
      lp.frequency.linearRampToValueAtTime(650, t + d);
      for (const cents of [-6, 6]) {
        const o = k.osc("sawtooth", f, t, d + 0.1, lp);
        o.detune.value = cents;
        o.frequency.setValueAtTime(f * 0.96, t);
        o.frequency.linearRampToValueAtTime(f, t + 0.06);
        if (last) {
          const depth = k.gain(0, o.frequency);
          k.osc("sine", 5, t + 0.3, d, depth);
          depth.gain.setValueAtTime(0, t + 0.3);
          depth.gain.linearRampToValueAtTime(5, t + 0.8);
        }
      }
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.04);
      g.gain.setValueAtTime(0.4, t + d - 0.08);
      g.gain.linearRampToValueAtTime(0, t + d + 0.05);
      t += d;
    });
    return t - k.t0 + 0.1;
  },
  rimshot: (k) => {
    const rec = sample(k, "rimshot");
    if (rec) return rec;
    tom(k, k.t0, 230);
    tom(k, k.t0 + 0.17, 165);
    kick(k, k.t0 + 0.42);
    snare(k, k.t0 + 0.42, 0.8);
    cymbal(k, k.t0 + 0.42, 0.45, 0.55);
    return 2.6;
  },
  drumroll: (k) => {
    const rec = sample(k, "drumroll");
    if (rec) return rec;
    const len = 2.2;
    for (let t = 0; t < len; t += (1 / 24) * rand(0.9, 1.1)) {
      snare(k, k.t0 + t, (0.18 + 0.6 * (t / len)) * rand(0.8, 1));
    }
    const crash = k.t0 + len + 0.05;
    kick(k, crash);
    snare(k, crash);
    cymbal(k, crash, 0.7, 0.7);
    return len + 3.6;
  },
  tada: (k) => {
    brass(k, k.t0, [392, 523.25, 659.25], 0.13);
    const da = k.t0 + 0.2;
    brass(k, da, [261.63, 329.63, 392, 523.25, 659.25], 1.3, 0.45);
    kick(k, da, 0.8);
    cymbal(k, da, 0.6, 0.45);
    return 3;
  },
  theme: (k) => {
    const e = 0.2; // eighth note
    const [E2, G2, A2, Bb2, B2, D3, E3] = [82.41, 98, 110, 116.54, 123.47, 146.83, 164.81];
    const riff = [E2, null, E3, D3, B2, A2, G2, A2, E2, null, G2, A2, Bb2, B2, null, null];
    riff.forEach((f, i) => {
      const t = k.t0 + i * e;
      if (f) slapBass(k, t, f, e * 0.85);
      hat(k, t, i % 2 ? 0.12 : 0.2);
      if (i % 4 === 0) kick(k, t, 0.7);
      if (i % 4 === 2) snare(k, t, 0.5);
    });
    const stab = k.t0 + 14 * e;
    brass(k, stab, [164.81, 207.65, 293.66, 369.99, 493.88], 0.9, 0.5);
    slapBass(k, stab, E2, 0.9);
    kick(k, stab);
    cymbal(k, stab, 0.5, 0.4);
    return 14 * e + 2.2;
  },
  doorbell: (k) => {
    const rec = sample(k, "doorbell");
    if (rec) return rec;
    bell(k, k.t0, 659.25);
    bell(k, k.t0 + 0.55, 523.25);
    return 3.2;
  },
  scratch: (k) => {
    const rec = sample(k, "scratch");
    if (rec) return rec;
    const d = 0.55;
    const g = k.gain(0);
    const bp = k.filter("bandpass", 600, 3, g);
    k.noise(k.t0, d, bp);
    const tonal = k.filter("lowpass", 1800, 1, k.gain(0.5, g));
    const o = k.osc("sawtooth", 200, k.t0, d, tonal);
    const sweeps = [[0, 500, 120], [0.13, 3000, 600], [0.3, 400, 90], [0.38, 2200, 420], [d, 300, 60]];
    for (const [t, f, p] of sweeps) {
      bp.frequency.linearRampToValueAtTime(f, k.t0 + t);
      o.frequency.linearRampToValueAtTime(p, k.t0 + t);
    }
    g.gain.setValueAtTime(0, k.t0);
    g.gain.linearRampToValueAtTime(0.9, k.t0 + 0.02);
    g.gain.setValueAtTime(0.9, k.t0 + 0.27);
    g.gain.linearRampToValueAtTime(0.1, k.t0 + 0.32);
    g.gain.linearRampToValueAtTime(0.9, k.t0 + 0.36);
    g.gain.linearRampToValueAtTime(0, k.t0 + d);
    return d + 0.1;
  },
  boing: (k) => {
    const rec = sample(k, "boing");
    if (rec) return rec;
    const d = 0.9;
    const g = k.gain(0);
    const o = k.osc("triangle", 200, k.t0, d, g);
    o.frequency.setValueCurveAtTime(
      curve((t) => (170 + 230 * t) * (1 + 0.45 * Math.sin(2 * Math.PI * 11 * t * d) * Math.exp(-4 * t))),
      k.t0,
      d,
    );
    g.gain.setValueAtTime(0, k.t0);
    g.gain.linearRampToValueAtTime(0.7, k.t0 + 0.01);
    g.gain.setTargetAtTime(0, k.t0 + 0.01, d / 3.5);
    return d;
  },
};
