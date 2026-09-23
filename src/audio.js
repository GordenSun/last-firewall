'use strict';
// All sound is synthesized at runtime with WebAudio: chiptune BGM + SFX.
const Sound = (() => {
  let ac = null, master, sfxBus, musBus, noiseBuf, muted = false;
  const last = {};
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.55;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(master); master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
    musBus = ac.createGain(); musBus.gain.value = 0.42; musBus.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setInterval(schedule, 25);
  }

  function thr(name, ms) {
    const n = performance.now();
    if (last[name] && n - last[name] < ms) return false;
    last[name] = n; return true;
  }

  function tone({ f = 440, f2, d = 0.1, type = 'square', v = 0.2, t0 = 0, dest }) {
    if (!ac) return;
    const t = ac.currentTime + t0;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + d + 0.02);
  }

  function noise({ d = 0.1, v = 0.2, f = 2000, f2, type = 'lowpass', q = 1, t0 = 0, dest }) {
    if (!ac) return;
    const t = ac.currentTime + t0;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + d);
    const g = ac.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    s.connect(fl); fl.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02);
  }

  const sfx = {
    shoot() { if (!thr('shoot', 55)) return; tone({ f: 900 + Math.random() * 120, f2: 260, d: 0.05, v: 0.045 }); noise({ d: 0.03, v: 0.04, f: 6000, type: 'highpass' }); },
    drone() { if (!thr('drone', 90)) return; tone({ f: 1500, f2: 700, d: 0.04, v: 0.025 }); },
    hit() { if (!thr('hit', 40)) return; noise({ d: 0.035, v: 0.1, f: 3500, type: 'highpass' }); tone({ f: 220, f2: 90, d: 0.045, v: 0.06 }); },
    kill() { if (!thr('kill', 35)) return; noise({ d: 0.16, v: 0.22, f: 2200, f2: 180 }); tone({ f: 180, f2: 45, d: 0.13, type: 'triangle', v: 0.3 }); },
    bigKill() { if (!thr('big', 80)) return; noise({ d: 0.5, v: 0.45, f: 1600, f2: 60 }); tone({ f: 110, f2: 28, d: 0.45, type: 'sine', v: 0.7 }); tone({ f: 220, f2: 40, d: 0.25, type: 'square', v: 0.12 }); },
    coin() { if (!thr('coin', 45)) return; tone({ f: 1318, d: 0.05, v: 0.05 }); tone({ f: 1976, d: 0.09, v: 0.05, t0: 0.045 }); },
    energy() { if (!thr('en', 60)) return; tone({ f: 520, f2: 1400, d: 0.08, type: 'sine', v: 0.08 }); },
    heal() { [523, 659, 784].forEach((f, i) => tone({ f, d: 0.1, type: 'triangle', v: 0.15, t0: i * 0.06 })); },
    hurt() { tone({ f: 260, f2: 50, d: 0.3, type: 'sawtooth', v: 0.28 }); noise({ d: 0.25, v: 0.35, f: 900, f2: 100 }); },
    dash() { noise({ d: 0.16, v: 0.16, f: 3500, f2: 500, type: 'bandpass', q: 2 }); tone({ f: 300, f2: 900, d: 0.1, type: 'sine', v: 0.06 }); },
    levelup() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, d: 0.12, v: 0.09, t0: i * 0.055 })); },
    select() { tone({ f: 784, f2: 1568, d: 0.12, v: 0.12 }); tone({ f: 392, d: 0.2, type: 'triangle', v: 0.2 }); noise({ d: 0.3, v: 0.15, f: 5000, f2: 800 }); },
    ready() { [880, 1175, 1760].forEach((f, i) => tone({ f, d: 0.09, v: 0.08, t0: i * 0.07 })); },
    overdrive() { tone({ f: 90, f2: 1400, d: 0.55, type: 'sawtooth', v: 0.22 }); noise({ d: 1.1, v: 0.5, f: 5000, f2: 80 }); tone({ f: 70, f2: 30, d: 0.9, type: 'sine', v: 0.8, t0: 0.05 }); },
    warn() { for (let i = 0; i < 6; i++) tone({ f: i % 2 ? 440 : 620, d: 0.22, type: 'square', v: 0.09, t0: i * 0.25 }); },
    zap() { if (!thr('zap', 70)) return; noise({ d: 0.14, v: 0.2, f: 4500, type: 'highpass' }); tone({ f: 1600, f2: 150, d: 0.12, v: 0.08, type: 'sawtooth' }); },
    boom() { if (!thr('boom', 55)) return; noise({ d: 0.28, v: 0.3, f: 1500, f2: 90 }); tone({ f: 130, f2: 40, d: 0.25, type: 'sine', v: 0.4 }); },
    laser() { tone({ f: 1800, f2: 80, d: 0.9, type: 'sawtooth', v: 0.2 }); noise({ d: 1.0, v: 0.55, f: 3000, f2: 60 }); tone({ f: 55, f2: 25, d: 1.0, type: 'sine', v: 0.9 }); },
    lock() { tone({ f: 1760, d: 0.06, v: 0.06 }); tone({ f: 1760, d: 0.06, v: 0.06, t0: 0.12 }); },
    graze() { if (!thr('graze', 70)) return; tone({ f: 2400, f2: 3000, d: 0.03, v: 0.03, type: 'triangle' }); },
    eshot() { if (!thr('eshot', 110)) return; tone({ f: 340, f2: 160, d: 0.06, v: 0.035 }); },
    nova() { noise({ d: 0.4, v: 0.25, f: 6000, f2: 400, type: 'bandpass', q: 1.5 }); tone({ f: 1200, f2: 300, d: 0.3, type: 'triangle', v: 0.12 }); },
    combo() { [659, 880, 1319].forEach((f, i) => tone({ f, d: 0.08, v: 0.08, t0: i * 0.05 })); },
    deploy() { tone({ f: 200, f2: 600, d: 0.15, v: 0.1 }); noise({ d: 0.15, v: 0.15, f: 800 }); },
    missile() { if (!thr('mis', 120)) return; noise({ d: 0.2, v: 0.08, f: 2500, f2: 600, type: 'bandpass' }); },
  };

  // ---------- music ----------
  let musOn = false, nextT = 0, step = 0, boss = false;
  const PROG = [[45, [57, 60, 64]], [41, [53, 57, 60]], [48, [55, 60, 64]], [43, [55, 59, 62]]];
  const PROG_B = [[45, [57, 60, 64]], [46, [58, 62, 65]], [45, [57, 60, 64]], [44, [56, 59, 63]]];
  const MEL = [69, 0, 72, 76, 81, 79, 76, 72, 77, 0, 76, 72, 69, 72, 77, 76, 76, 0, 79, 76, 72, 76, 79, 84, 83, 0, 81, 79, 74, 79, 83, 81];
  const MEL_B = [81, 0, 81, 80, 81, 0, 76, 0, 82, 0, 82, 81, 82, 0, 77, 0, 81, 0, 84, 83, 81, 0, 76, 0, 80, 0, 83, 81, 80, 0, 76, 75];

  function playStep(s, t) {
    const bar = (s >> 4) & 3, b = s & 15;
    const [root, ch] = (boss ? PROG_B : PROG)[bar];
    const dly = t - ac.currentTime;
    const D = musBus;
    if (b === 0 || b === 8 || (boss && (b === 6 || b === 14)) || b === 11)
      tone({ f: 160, f2: 38, d: 0.14, type: 'sine', v: 0.55, t0: dly, dest: D });
    if (b === 4 || b === 12) { noise({ d: 0.12, v: 0.22, f: 2200, type: 'bandpass', q: 0.8, t0: dly, dest: D }); tone({ f: 190, f2: 120, d: 0.06, type: 'triangle', v: 0.2, t0: dly, dest: D }); }
    if (b % 2 === 1 || boss) noise({ d: 0.025, v: 0.05, f: 8000, type: 'highpass', t0: dly, dest: D });
    if (b % 2 === 0) tone({ f: mtof(root + (b % 4 === 0 ? 0 : 12)), d: 0.11, type: 'sawtooth', v: 0.07, t0: dly, dest: D });
    tone({ f: mtof(ch[s % 3] + 12), d: 0.05, type: 'square', v: 0.018, t0: dly, dest: D });
    if (b % 2 === 0) {
      const m = (boss ? MEL_B : MEL)[bar * 8 + (b >> 1)];
      if (m) tone({ f: mtof(m), d: 0.16, type: 'square', v: 0.045, t0: dly, dest: D });
    }
  }

  function schedule() {
    if (!ac || !musOn) return;
    const bpm = boss ? 168 : 152;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.12) {
      playStep(step, nextT);
      nextT += 60 / bpm / 4; step = (step + 1) % 64;
    }
  }

  return {
    init, sfx,
    music(on) { musOn = on; if (on) step = 0; },
    setBoss(b) { boss = b; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
    get muted() { return muted; },
  };
})();
