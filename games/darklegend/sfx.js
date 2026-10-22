/* 豆豆暗黑传奇 · 音效
   手机策略：
   1) 必须在用户点击里同步 create/resume AudioContext 并出声
   2) WAV 用 Blob URL（部分机 data: URI 播不了）
   3) 首次未解锁前游戏音效不播，等点「开启音效」
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const MUTE_KEY = 'darklegend-sfx-mute';
  const UNLOCK_KEY = 'darklegend-sfx-unlocked';
  const hasAudio = typeof global.Audio === 'function';

  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 忽略 */ }

  let unlocked = false;
  let lastError = '';
  let AC = null;
  const wavCache = Object.create(null); // key -> blobUrl
  const pool = [];
  const listeners = [];

  function setErr(e) {
    lastError = e ? String(e.message || e) : '';
  }

  function notify() {
    for (const fn of listeners) {
      try { fn({ unlocked, muted, lastError }); } catch { /* 忽略 */ }
    }
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /* ---------- 原始 WAV bytes → Blob URL ---------- */
  function makeWavBytes(samples, sr) {
    const n = samples.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF');
    v.setUint32(4, 36 + n * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    w(36, 'data');
    v.setUint32(40, n * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
    return buf;
  }

  function synthSamples(freq, dur, type, vol, slide) {
    const sr = 22050;
    const n = Math.max(1, Math.floor(sr * dur));
    const out = new Float32Array(n);
    vol = vol == null ? 0.4 : vol;
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
      const attack = Math.min(1, i / (sr * 0.01));
      const release = Math.exp(-2.8 * t / Math.max(0.02, dur));
      out[i] = s * vol * attack * release;
    }
    return { samples: out, sr };
  }

  function blobUrlOf(freq, dur, type, vol, slide) {
    const key = [freq, dur, type || 'sine', vol || 0, slide || 0].join('|');
    if (wavCache[key]) return wavCache[key];
    const { samples, sr } = synthSamples(freq, dur, type, vol, slide);
    const bytes = makeWavBytes(samples, sr);
    const url = (typeof URL !== 'undefined' && URL.createObjectURL)
      ? URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
      : '';
    wavCache[key] = url;
    return url;
  }

  function getAudio() {
    if (!hasAudio) return null;
    let a = pool.find((x) => x.paused || x.ended);
    if (!a) {
      a = new Audio();
      a.preload = 'auto';
      a.playsInline = true;
      a.setAttribute('playsinline', 'true');
      a.setAttribute('webkit-playsinline', 'true');
      pool.push(a);
      if (pool.length > 6) pool.shift();
    }
    return a;
  }

  function playBlob(url, vol) {
    if (muted || !url || !hasAudio) return Promise.resolve(false);
    try {
      const a = getAudio();
      if (!a) return Promise.resolve(false);
      a.volume = Math.max(0, Math.min(1, vol == null ? 1 : vol));
      if (a.src !== url) {
        a.src = url;
        try { a.load(); } catch { /* 忽略 */ }
      }
      const p = a.play();
      if (p && typeof p.then === 'function') {
        return p.then(() => true).catch((e) => { setErr(e); return false; });
      }
      return Promise.resolve(true);
    } catch (e) {
      setErr(e);
      return Promise.resolve(false);
    }
  }

  function playTone(freq, dur, type, vol, slide) {
    if (!unlocked || muted) return;
    const url = blobUrlOf(freq, dur, type, vol, slide);
    playBlob(url, 1);
  }

  function playSeq(steps) {
    if (!unlocked || muted) return;
    for (const s of steps) {
      const delay = Math.round((s.delay || 0) * 1000);
      const run = () => playTone(s.f, s.d, s.type, s.vol, s.slide);
      if (delay <= 0) run();
      else setTimeout(run, delay);
    }
  }

  /* ---------- 手势内同步解锁：WebAudio 尖鸣 + HTMLAudio ---------- */
  function beepWebSync() {
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return false;
      // 必须在手势栈里 new，不能复用页加载时建的
      if (!AC || AC.state === 'closed') AC = new Ctx();
      if (AC.state === 'suspended') AC.resume();
      const t0 = AC.currentTime;
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t0);
      o.frequency.setValueAtTime(1174, t0 + 0.08);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(g).connect(AC.destination);
      o.start(t0);
      o.stop(t0 + 0.3);
      return true;
    } catch (e) {
      setErr(e);
      return false;
    }
  }

  function unlock(opts) {
    opts = opts || {};
    const audible = opts.audible !== false;
    let ok = false;
    if (audible) ok = beepWebSync() || ok;

    // HTMLAudio 同步播一声（Blob）
    if (hasAudio && audible) {
      try {
        const url = blobUrlOf(660, 0.18, 'sine', 0.7, 0);
        const a = new Audio();
        a.playsInline = true;
        a.setAttribute('playsinline', 'true');
        a.volume = 1;
        a.src = url;
        try { a.load(); } catch { /* 忽略 */ }
        const p = a.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            unlocked = true;
            try { localStorage.setItem(UNLOCK_KEY, '1'); } catch { /* 忽略 */ }
            notify();
          }).catch((e) => setErr(e));
        } else {
          ok = true;
        }
      } catch (e) {
        setErr(e);
      }
    }

    if (ok || audible) {
      unlocked = true;
      try { localStorage.setItem(UNLOCK_KEY, '1'); } catch { /* 忽略 */ }
    }
    // 若用户之前静音，开启流程里可强制取消静音
    if (opts.forceUnmute) {
      muted = false;
      try { localStorage.setItem(MUTE_KEY, '0'); } catch { /* 忽略 */ }
    }
    notify();
    return unlocked;
  }

  const SFX = {
    dropWhite() { playTone(200, 0.07, 'square', 0.55, -40); },
    dropBlue() { playTone(900, 0.11, 'sine', 0.6, -220); },
    dropYellow() {
      playSeq([
        { f: 988, d: 0.12, type: 'sine', vol: 0.6 },
        { f: 1319, d: 0.16, type: 'sine', vol: 0.55, delay: 0.07 },
      ]);
    },
    dropOrange() {
      playSeq([
        { f: 140, d: 0.35, type: 'sawtooth', vol: 0.65 },
        { f: 280, d: 0.25, type: 'triangle', vol: 0.5, delay: 0.08 },
      ]);
    },
    hit() { playTone(220, 0.08, 'sawtooth', 0.55, -100); },
    kill() { playTone(170, 0.12, 'square', 0.6, -90); },
    hurt() { playTone(140, 0.16, 'sawtooth', 0.6, -50); },
    die() { playTone(95, 0.45, 'sawtooth', 0.65, -45); },
    level() {
      playSeq([
        { f: 523, d: 0.1, type: 'triangle', vol: 0.6 },
        { f: 659, d: 0.1, type: 'triangle', vol: 0.6, delay: 0.09 },
        { f: 784, d: 0.16, type: 'triangle', vol: 0.6, delay: 0.18 },
      ]);
    },
    potion() { playTone(440, 0.1, 'sine', 0.55, 180); },
    gold() { playTone(1200, 0.08, 'sine', 0.5, -400); },
    skill() { playTone(280, 0.2, 'sawtooth', 0.55, 450); },
    fire() {
      playSeq([
        { f: 190, d: 0.12, type: 'sawtooth', vol: 0.6 },
        { f: 320, d: 0.16, type: 'sawtooth', vol: 0.5, delay: 0.08 },
      ]);
    },
    elite() {
      playSeq([
        { f: 440, d: 0.1, type: 'triangle', vol: 0.6 },
        { f: 554, d: 0.12, type: 'triangle', vol: 0.55, delay: 0.08 },
      ]);
    },
    rare() {
      playSeq([
        { f: 523, d: 0.12, type: 'sine', vol: 0.6 },
        { f: 784, d: 0.14, type: 'sine', vol: 0.55, delay: 0.1 },
      ]);
    },
    boss() {
      playSeq([
        { f: 90, d: 0.35, type: 'sawtooth', vol: 0.7 },
        { f: 130, d: 0.25, type: 'square', vol: 0.55, delay: 0.1 },
      ]);
    },
    ui() { playTone(660, 0.1, 'sine', 0.6); },
    pickup() { playTone(720, 0.09, 'triangle', 0.55, 200); },
    test() { playTone(880, 0.22, 'sine', 0.75); },
  };

  const DROP_BY_RARITY = {
    white: 'dropWhite',
    blue: 'dropBlue',
    yellow: 'dropYellow',
    orange: 'dropOrange',
  };

  function play(name) {
    if (muted || !unlocked) return;
    const fn = SFX[name];
    if (typeof fn === 'function') fn();
  }

  function drop(rarity) {
    play(DROP_BY_RARITY[rarity] || 'dropWhite');
  }

  function isMuted() { return muted; }
  function isUnlocked() { return unlocked; }
  function getLastError() { return lastError; }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* 忽略 */ }
    if (!muted && unlocked) play('test');
    notify();
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  // 兼容旧 API：不再静默解锁，改为需要 enable()
  function bindAutoUnlock() { /* 改由显式按钮 enable */ }

  function enable() {
    return unlock({ audible: true, forceUnmute: true });
  }

  DL.Sfx = {
    unlock, enable, play, drop, isMuted, isUnlocked, setMuted, toggleMute,
    bindAutoUnlock, onChange, getLastError,
    MUTE_KEY, DROP_BY_RARITY,
  };
})(typeof window !== 'undefined' ? window : globalThis);
