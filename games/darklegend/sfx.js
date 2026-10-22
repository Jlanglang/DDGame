/* 豆豆暗黑传奇 · 音效
   主路径：合成短 WAV → HTMLAudioElement.play（手机/微信更稳）
   辅：手势里顺带 resume WebAudio
   R15.6 掉落分档；静音键 localStorage darklegend-sfx-mute
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const MUTE_KEY = 'darklegend-sfx-mute';
  const hasAudio = typeof global.Audio === 'function';

  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 隐私模式 */ }

  let unlocked = false;
  let AC = null;
  const cache = Object.create(null);
  const pool = [];

  /* ---------- WAV 编码 ---------- */
  function encodeWav(samples, sr) {
    const n = samples.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    wstr(0, 'RIFF');
    v.setUint32(4, 36 + n * 2, true);
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    wstr(36, 'data');
    v.setUint32(40, n * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
    const bytes = new Uint8Array(buf);
    let b64;
    if (typeof btoa === 'function') {
      let bin = '';
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
      }
      b64 = btoa(bin);
    } else if (typeof Buffer !== 'undefined') {
      b64 = Buffer.from(bytes).toString('base64');
    } else {
      b64 = '';
    }
    return 'data:audio/wav;base64,' + b64;
  }

  function synth(freq, dur, type, vol, slide) {
    const sr = 22050;
    const n = Math.max(1, Math.floor(sr * dur));
    const out = new Float32Array(n);
    vol = vol == null ? 0.35 : vol;
    slide = slide || 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = Math.max(40, freq + slide * (i / n));
      const ph = 2 * Math.PI * f * t;
      let s;
      if (type === 'square') s = Math.sin(ph) > 0 ? 1 : -1;
      else if (type === 'sawtooth') s = 2 * ((f * t) % 1) - 1;
      else if (type === 'triangle') s = 1 - 4 * Math.abs(((f * t) % 1) - 0.5);
      else s = Math.sin(ph);
      const attack = Math.min(1, i / (sr * 0.008));
      const release = Math.exp(-3.2 * t / Math.max(0.02, dur));
      out[i] = s * vol * attack * release;
    }
    return encodeWav(out, sr);
  }

  function uriOf(freq, dur, type, vol, slide) {
    const key = [freq, dur, type || 'sine', vol || 0, slide || 0].join('|');
    if (!cache[key]) cache[key] = synth(freq, dur, type, vol, slide);
    return cache[key];
  }

  /* ---------- HTMLAudio ---------- */
  function getAudio() {
    if (!hasAudio) return null;
    let a = pool.find((x) => x.paused || x.ended);
    if (!a) {
      a = new Audio();
      a.preload = 'auto';
      a.setAttribute('playsinline', 'true');
      a.setAttribute('webkit-playsinline', 'true');
      pool.push(a);
      if (pool.length > 8) pool.shift();
    }
    return a;
  }

  function playUri(uri, vol) {
    if (muted || !uri || !hasAudio) return;
    try {
      const a = getAudio();
      if (!a) return;
      a.volume = Math.max(0, Math.min(1, vol == null ? 0.85 : vol));
      a.src = uri;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { unlocked = true; }).catch(() => {});
      } else {
        unlocked = true;
      }
    } catch { /* 忽略 */ }
  }

  function playTone(freq, dur, type, vol, slide) {
    playUri(uriOf(freq, dur, type, vol, slide), 0.9);
  }

  function playSeq(steps) {
    for (const s of steps) {
      const delay = Math.round((s.delay || 0) * 1000);
      const run = () => playTone(s.f, s.d, s.type, s.vol, s.slide);
      if (delay <= 0) run();
      else setTimeout(run, delay);
    }
  }

  /* ---------- 解锁（静音 WAV + WebAudio resume） ---------- */
  let silentUri = null;

  function unlockWeb() {
    try {
      if (!AC) {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (Ctx) AC = new Ctx();
      }
      if (!AC) return;
      if (AC.state === 'suspended') AC.resume().catch(() => {});
      const n = Math.max(1, Math.floor(AC.sampleRate * 0.02));
      const buf = AC.createBuffer(1, n, AC.sampleRate);
      const src = AC.createBufferSource();
      src.buffer = buf;
      src.connect(AC.destination);
      src.start(0);
    } catch { /* 忽略 */ }
  }

  function unlock() {
    unlockWeb();
    if (!hasAudio) return unlocked;
    if (!silentUri) {
      const sr = 22050;
      const n = Math.floor(sr * 0.05);
      const z = new Float32Array(n);
      for (let i = 0; i < 16 && i < n; i++) z[i] = 0.001;
      silentUri = encodeWav(z, sr);
    }
    try {
      const a = getAudio();
      if (!a) return unlocked;
      a.volume = 0.02;
      a.src = silentUri;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { unlocked = true; }).catch(() => {});
      } else {
        unlocked = true;
      }
    } catch { /* 忽略 */ }
    return unlocked;
  }

  /* ---------- 音色 ---------- */
  const SFX = {
    dropWhite() { playTone(200, 0.06, 'square', 0.5, -40); },
    dropBlue() { playTone(900, 0.1, 'sine', 0.55, -220); },
    dropYellow() {
      playSeq([
        { f: 988, d: 0.12, type: 'sine', vol: 0.55 },
        { f: 1319, d: 0.16, type: 'sine', vol: 0.5, delay: 0.07 },
      ]);
    },
    dropOrange() {
      playSeq([
        { f: 120, d: 0.4, type: 'sawtooth', vol: 0.6 },
        { f: 240, d: 0.3, type: 'triangle', vol: 0.45, delay: 0.08 },
        { f: 360, d: 0.22, type: 'sine', vol: 0.4, delay: 0.16 },
      ]);
    },
    hit() { playTone(220, 0.07, 'sawtooth', 0.48, -100); },
    kill() { playTone(170, 0.12, 'square', 0.55, -90); },
    hurt() { playTone(140, 0.16, 'sawtooth', 0.55, -50); },
    die() { playTone(95, 0.5, 'sawtooth', 0.6, -45); },
    level() {
      playSeq([
        { f: 523, d: 0.1, type: 'triangle', vol: 0.55 },
        { f: 659, d: 0.1, type: 'triangle', vol: 0.55, delay: 0.09 },
        { f: 784, d: 0.16, type: 'triangle', vol: 0.55, delay: 0.18 },
      ]);
    },
    potion() { playTone(440, 0.1, 'sine', 0.5, 180); },
    gold() { playTone(1200, 0.07, 'sine', 0.45, -400); },
    skill() { playTone(280, 0.22, 'sawtooth', 0.5, 450); },
    fire() {
      playSeq([
        { f: 190, d: 0.12, type: 'sawtooth', vol: 0.55 },
        { f: 320, d: 0.18, type: 'sawtooth', vol: 0.45, delay: 0.08 },
      ]);
    },
    elite() {
      playSeq([
        { f: 440, d: 0.1, type: 'triangle', vol: 0.55 },
        { f: 554, d: 0.12, type: 'triangle', vol: 0.5, delay: 0.08 },
      ]);
    },
    rare() {
      playSeq([
        { f: 523, d: 0.12, type: 'sine', vol: 0.55 },
        { f: 784, d: 0.14, type: 'sine', vol: 0.52, delay: 0.1 },
        { f: 1047, d: 0.18, type: 'sine', vol: 0.5, delay: 0.2 },
      ]);
    },
    boss() {
      playSeq([
        { f: 80, d: 0.4, type: 'sawtooth', vol: 0.65 },
        { f: 120, d: 0.28, type: 'square', vol: 0.5, delay: 0.12 },
      ]);
    },
    ui() { playTone(660, 0.09, 'sine', 0.55); },
    pickup() { playTone(720, 0.08, 'triangle', 0.5, 200); },
    test() {
      playSeq([
        { f: 523, d: 0.16, type: 'sine', vol: 0.7 },
        { f: 659, d: 0.16, type: 'sine', vol: 0.7, delay: 0.12 },
        { f: 784, d: 0.22, type: 'sine', vol: 0.7, delay: 0.24 },
      ]);
    },
  };

  const DROP_BY_RARITY = {
    white: 'dropWhite',
    blue: 'dropBlue',
    yellow: 'dropYellow',
    orange: 'dropOrange',
  };

  function play(name) {
    if (muted) return;
    if (!unlocked) unlock();
    const fn = SFX[name];
    if (typeof fn === 'function') fn();
  }

  function drop(rarity) {
    play(DROP_BY_RARITY[rarity] || 'dropWhite');
  }

  function isMuted() { return muted; }
  function isUnlocked() { return unlocked; }

  function setMuted(v) {
    const was = muted;
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* 忽略 */ }
    if (was && !muted) {
      unlock();
      // 打开音效时强制试听，方便确认手机能响
      const fn = SFX.test;
      if (fn) fn();
    }
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function bindAutoUnlock(target) {
    if (!target || typeof target.addEventListener !== 'function') return;
    const tryUnlock = () => {
      unlock();
      if (unlocked) {
        target.removeEventListener('pointerdown', tryUnlock, true);
        target.removeEventListener('touchstart', tryUnlock, true);
        target.removeEventListener('mousedown', tryUnlock, true);
        target.removeEventListener('keydown', tryUnlock, true);
      }
    };
    target.addEventListener('pointerdown', tryUnlock, true);
    target.addEventListener('touchstart', tryUnlock, { capture: true, passive: true });
    target.addEventListener('mousedown', tryUnlock, true);
    target.addEventListener('keydown', tryUnlock, true);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) unlock();
      });
    }
  }

  // 预热常用 cache（不播）
  try {
    [
      [220, 0.07, 'sawtooth', 0.48, -100],
      [170, 0.12, 'square', 0.55, -90],
      [660, 0.09, 'sine', 0.55, 0],
      [200, 0.06, 'square', 0.5, -40],
      [900, 0.1, 'sine', 0.55, -220],
      [1200, 0.07, 'sine', 0.45, -400],
      [440, 0.1, 'sine', 0.5, 180],
      [523, 0.16, 'sine', 0.7, 0],
    ].forEach((s) => { uriOf(s[0], s[1], s[2], s[3], s[4]); });
  } catch { /* 忽略 */ }

  DL.Sfx = {
    unlock, play, drop, isMuted, isUnlocked, setMuted, toggleMute, bindAutoUnlock,
    MUTE_KEY, DROP_BY_RARITY,
  };
})(typeof window !== 'undefined' ? window : globalThis);
