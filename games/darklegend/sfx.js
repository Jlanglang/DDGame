/* 豆豆暗黑传奇 · 音效（WebAudio 合成，零外部资源）
   R15.6：掉落白嗒 / 蓝叮 / 黄叮— / 橙嗡—
   静音键：localStorage darklegend-sfx-mute
   手机：必须在用户手势里 resume；每次播前再补一次，避免 iOS 一直 suspended。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const MUTE_KEY = 'darklegend-sfx-mute';

  let AC = null;
  let unlocked = false;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 隐私模式 */ }

  // 手机外放偏小，整体略抬一档（仍远低于刺耳）
  const VOL = 1.8;

  function ac() {
    if (!AC) {
      try {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return null;
        AC = new Ctx();
      } catch {
        AC = null;
      }
    }
    return AC;
  }

  function kickSilent(a) {
    if (!a) return;
    try {
      // 短缓冲比 oscillator 在 iOS 上更稳
      const n = Math.max(1, Math.floor(a.sampleRate * 0.04));
      const buf = a.createBuffer(1, n, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (i < 8 ? 0.001 : 0);
      const src = a.createBufferSource();
      const g = a.createGain();
      g.gain.value = 0.001;
      src.buffer = buf;
      src.connect(g).connect(a.destination);
      src.start(0);
    } catch {
      try {
        const o = a.createOscillator();
        const g = a.createGain();
        g.gain.value = 0.001;
        o.connect(g).connect(a.destination);
        o.start();
        o.stop(a.currentTime + 0.04);
      } catch { /* 忽略 */ }
    }
  }

  function unlock() {
    const a = ac();
    if (!a) return false;
    const done = () => {
      kickSilent(a);
      unlocked = a.state === 'running';
    };
    if (a.state === 'suspended') {
      a.resume().then(done).catch(() => {});
      // 手势同步窗口内再 kick 一次（部分 WebView resume 后仍要即时出声）
      kickSilent(a);
      return true;
    }
    done();
    return unlocked;
  }

  function ensureRunning() {
    const a = ac();
    if (!a) return null;
    if (a.state === 'suspended') {
      a.resume().catch(() => {});
      kickSilent(a);
    }
    return a;
  }

  function tone(freq, dur, type, vol, slide, delay) {
    if (muted) return;
    const a = ensureRunning();
    if (!a) return;
    type = type || 'square';
    vol = (vol == null ? 0.05 : vol) * VOL;
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
      g.gain.setValueAtTime(Math.max(0.0001, vol), t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch { /* 忽略音频错误 */ }
  }

  /* ---- 具体音色 ---- */
  const SFX = {
    dropWhite() { tone(180, 0.05, 'square', 0.04, -40); },
    dropBlue() { tone(880, 0.09, 'sine', 0.055, -200); },
    dropYellow() {
      tone(988, 0.12, 'sine', 0.06, -120);
      tone(1319, 0.18, 'sine', 0.05, -80, 0.06);
    },
    dropOrange() {
      tone(110, 0.45, 'sawtooth', 0.08, -30);
      tone(220, 0.35, 'triangle', 0.055, 40, 0.08);
      tone(330, 0.25, 'sine', 0.045, 0, 0.18);
    },

    hit() { tone(210, 0.06, 'sawtooth', 0.04, -100); },
    kill() { tone(160, 0.11, 'square', 0.05, -90); },
    hurt() { tone(130, 0.15, 'sawtooth', 0.06, -50); },
    die() { tone(90, 0.55, 'sawtooth', 0.08, -50); },
    level() {
      tone(523, 0.1, 'triangle', 0.065);
      tone(659, 0.1, 'triangle', 0.065, 0, 0.09);
      tone(784, 0.18, 'triangle', 0.065, 0, 0.18);
    },
    potion() { tone(420, 0.09, 'sine', 0.05, 180); },
    gold() { tone(1200, 0.06, 'sine', 0.04, -400); },
    skill() { tone(260, 0.22, 'sawtooth', 0.05, 480); },
    fire() {
      tone(180, 0.12, 'sawtooth', 0.055, 200);
      tone(320, 0.2, 'sawtooth', 0.04, 100, 0.08);
    },
    elite() {
      tone(440, 0.1, 'triangle', 0.06);
      tone(554, 0.14, 'triangle', 0.055, 0, 0.08);
    },
    rare() {
      tone(523, 0.12, 'sine', 0.065);
      tone(784, 0.16, 'sine', 0.06, 0, 0.1);
      tone(1047, 0.2, 'sine', 0.055, 0, 0.2);
    },
    boss() {
      tone(70, 0.4, 'sawtooth', 0.09, -15);
      tone(110, 0.28, 'square', 0.055, 0, 0.12);
    },
    ui() { tone(600, 0.04, 'sine', 0.03); },
    pickup() { tone(700, 0.07, 'triangle', 0.045, 200); },
  };

  const DROP_BY_RARITY = {
    white: 'dropWhite',
    blue: 'dropBlue',
    yellow: 'dropYellow',
    orange: 'dropOrange',
  };

  function play(name) {
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
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* 忽略 */ }
    if (!muted) unlock();
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  // 绑在捕获阶段：任何触摸/点击都尝试解锁（直到 running）
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

  DL.Sfx = {
    unlock, play, drop, isMuted, isUnlocked, setMuted, toggleMute, bindAutoUnlock,
    MUTE_KEY, DROP_BY_RARITY,
  };
})(typeof window !== 'undefined' ? window : globalThis);
