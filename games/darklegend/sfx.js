/* 豆豆暗黑传奇 · 音效（WebAudio 合成，零外部资源）
   R15.6：掉落白嗒 / 蓝叮 / 黄叮— / 橙嗡—
   静音键：localStorage darklegend-sfx-mute
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const MUTE_KEY = 'darklegend-sfx-mute';

  let AC = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 隐私模式 */ }

  function ac() {
    if (!AC) {
      try { AC = new (global.AudioContext || global.webkitAudioContext)(); } catch { AC = null; }
    }
    if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  }

  function unlock() {
    const a = ac();
    if (!a) return;
    try {
      const o = a.createOscillator();
      const g = a.createGain();
      g.gain.value = 0;
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + 0.01);
    } catch { /* 忽略 */ }
  }

  function tone(freq, dur, type, vol, slide, delay) {
    if (muted) return;
    const a = ac();
    if (!a) return;
    type = type || 'square';
    vol = vol == null ? 0.05 : vol;
    slide = slide || 0;
    delay = delay || 0;
    try {
      const t0 = a.currentTime + delay;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(40, freq), t0);
      if (slide) {
        o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
      }
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch { /* 忽略音频错误 */ }
  }

  /* ---- 具体音色 ---- */
  const SFX = {
    // R15.6 掉落分级
    dropWhite() { tone(180, 0.04, 'square', 0.03, -40); },
    dropBlue() { tone(880, 0.08, 'sine', 0.045, -200); },
    dropYellow() {
      tone(988, 0.12, 'sine', 0.05, -120);
      tone(1319, 0.18, 'sine', 0.04, -80, 0.06);
    },
    dropOrange() {
      tone(110, 0.45, 'sawtooth', 0.07, -30);
      tone(220, 0.35, 'triangle', 0.05, 40, 0.08);
      tone(330, 0.25, 'sine', 0.04, 0, 0.18);
    },

    hit() { tone(210, 0.055, 'sawtooth', 0.032, -100); },
    kill() { tone(160, 0.1, 'square', 0.04, -90); },
    hurt() { tone(130, 0.14, 'sawtooth', 0.05, -50); },
    die() { tone(90, 0.55, 'sawtooth', 0.07, -50); },
    level() {
      tone(523, 0.1, 'triangle', 0.055);
      tone(659, 0.1, 'triangle', 0.055, 0, 0.09);
      tone(784, 0.18, 'triangle', 0.055, 0, 0.18);
    },
    potion() { tone(420, 0.08, 'sine', 0.04, 180); },
    gold() { tone(1200, 0.05, 'sine', 0.03, -400); },
    skill() { tone(260, 0.22, 'sawtooth', 0.04, 480); },
    fire() {
      tone(180, 0.12, 'sawtooth', 0.045, 200);
      tone(320, 0.2, 'sawtooth', 0.035, 100, 0.08);
    },
    elite() {
      tone(440, 0.1, 'triangle', 0.05);
      tone(554, 0.14, 'triangle', 0.045, 0, 0.08);
    },
    rare() {
      tone(523, 0.12, 'sine', 0.055);
      tone(784, 0.16, 'sine', 0.05, 0, 0.1);
      tone(1047, 0.2, 'sine', 0.045, 0, 0.2);
    },
    boss() {
      tone(70, 0.4, 'sawtooth', 0.075, -15);
      tone(110, 0.28, 'square', 0.045, 0, 0.12);
    },
    ui() { tone(600, 0.03, 'sine', 0.02); },
    pickup() { tone(700, 0.06, 'triangle', 0.035, 200); },
  };

  const DROP_BY_RARITY = {
    white: 'dropWhite',
    blue: 'dropBlue',
    yellow: 'dropYellow',
    orange: 'dropOrange',
  };

  function play(name) {
    const fn = SFX[name];
    if (typeof fn === 'function') fn();
  }

  function drop(rarity) {
    play(DROP_BY_RARITY[rarity] || 'dropWhite');
  }

  function isMuted() { return muted; }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* 忽略 */ }
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  DL.Sfx = {
    unlock, play, drop, isMuted, setMuted, toggleMute,
    MUTE_KEY, DROP_BY_RARITY,
  };
})(typeof window !== 'undefined' ? window : globalThis);
