/* 豆豆暗黑传奇 · 音效（精简）
   仅：kill（怪死）/ equip（换装）/ test（开声确认）
   解锁后优先 WebAudio（可挂机时播）；HTMLAudio 兜底
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const MUTE_KEY = 'darklegend-sfx-mute';
  const hasAudio = typeof global.Audio === 'function';

  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 忽略 */ }

  let unlocked = false;
  let lastError = '';
  let AC = null;
  const wavCache = Object.create(null);
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

  function ensureAC() {
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      if (!AC || AC.state === 'closed') AC = new Ctx();
      if (AC.state === 'suspended') AC.resume().catch(() => {});
      return AC;
    } catch (e) {
      setErr(e);
      return null;
    }
  }

  /* ---------- WebAudio：时间轴上排音，不依赖 setTimeout ---------- */
  function toneWA(freq, dur, vol, slide, when) {
    const a = ensureAC();
    if (!a) return false;
    try {
      const t0 = Math.max(a.currentTime, when || a.currentTime);
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sine';
      const f0 = Math.max(40, freq);
      const f1 = Math.max(40, freq + (slide || 0));
      o.frequency.setValueAtTime(f0, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      const peak = Math.max(0.0001, vol == null ? 0.2 : vol);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
      return true;
    } catch (e) {
      setErr(e);
      return false;
    }
  }

  /* ---------- HTMLAudio 兜底 ---------- */
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

  function blobUrlOf(freq, dur, vol, slide) {
    const key = [freq, dur, vol || 0, slide || 0].join('|');
    if (wavCache[key]) return wavCache[key];
    const sr = 22050;
    const n = Math.max(1, Math.floor(sr * dur));
    const out = new Float32Array(n);
    vol = vol == null ? 0.35 : vol;
    slide = slide || 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = Math.max(40, freq + slide * (i / n));
      const env = Math.min(1, i / (sr * 0.01)) * Math.exp(-2.8 * t / Math.max(0.02, dur));
      out[i] = Math.sin(2 * Math.PI * f * t) * vol * env;
    }
    const url = (typeof URL !== 'undefined' && URL.createObjectURL)
      ? URL.createObjectURL(new Blob([makeWavBytes(out, sr)], { type: 'audio/wav' }))
      : '';
    wavCache[key] = url;
    return url;
  }

  function playHtml(freq, dur, vol, slide) {
    if (!hasAudio) return false;
    try {
      const url = blobUrlOf(freq, dur, vol, slide);
      let a = pool.find((x) => x.paused || x.ended);
      if (!a) {
        a = new Audio();
        a.playsInline = true;
        a.setAttribute('playsinline', 'true');
        pool.push(a);
        if (pool.length > 4) pool.shift();
      }
      a.volume = Math.min(1, Math.max(0.2, vol == null ? 0.45 : vol + 0.15));
      if (a.src !== url) {
        a.src = url;
        try { a.load(); } catch { /* 忽略 */ }
      } else {
        try { a.currentTime = 0; } catch { /* 忽略 */ }
      }
      const p = a.play();
      if (p && p.catch) p.catch((e) => setErr(e));
      return true;
    } catch (e) {
      setErr(e);
      return false;
    }
  }

  /** 播一声：先 WebAudio，失败再 HTML */
  function beep(freq, dur, vol, slide, delay) {
    if (muted || !unlocked) return;
    const a = ensureAC();
    const when = a ? a.currentTime + (delay || 0) : 0;
    if (toneWA(freq, dur, vol, slide, when)) return;
    if ((delay || 0) <= 0) playHtml(freq, dur, vol, slide);
    else setTimeout(() => playHtml(freq, dur, vol, slide), Math.round(delay * 1000));
  }

  function unlock(opts) {
    opts = opts || {};
    const audible = opts.audible !== false;
    ensureAC();
    if (audible) {
      // 手势里立刻出一声（偏女声柔和）
      const a = ensureAC();
      if (a) {
        try {
          if (a.state === 'suspended') a.resume();
          toneWA(660, 0.16, 0.18, -80, a.currentTime);
        } catch (e) { setErr(e); }
      }
      playHtml(660, 0.16, 0.4, -50);
    }
    unlocked = true;
    if (opts.forceUnmute) {
      muted = false;
      try { localStorage.setItem(MUTE_KEY, '0'); } catch { /* 忽略 */ }
    }
    notify();
    return unlocked;
  }

  const SFX = {
    // 怪死：一声软「呀」感（单音，可靠）
    kill() { beep(700, 0.11, 0.22, -120, 0); },
    // 换装：两声轻叮排在 AudioContext 时间轴上（不用 setTimeout）
    equip() {
      beep(620, 0.07, 0.2, 0, 0);
      beep(820, 0.1, 0.18, -40, 0.06);
    },
    test() { beep(660, 0.14, 0.2, -40, 0); },
  };

  function play(name) {
    if (muted || !unlocked) return;
    ensureAC();
    const fn = SFX[name];
    if (typeof fn === 'function') fn();
  }

  function drop() { /* 停用 */ }

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

  function toggleMute() { return setMuted(!muted); }
  function bindAutoUnlock() { /* 显式 enable */ }
  function enable() { return unlock({ audible: true, forceUnmute: true }); }

  DL.Sfx = {
    unlock, enable, play, drop, isMuted, isUnlocked, setMuted, toggleMute,
    bindAutoUnlock, onChange, getLastError,
    MUTE_KEY, DROP_BY_RARITY: {},
  };
})(typeof window !== 'undefined' ? window : globalThis);
