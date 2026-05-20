/**
 * 音效（Kenney Interface Sounds, CC0）
 * https://kenney.nl/assets/interface-sounds
 * 配对失败为内置柔和合成音（不沿用原 mismatch.wav）
 * 背景音乐：assets/sounds/bgm.mp3
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'doudou-sfx-enabled';
  const BGM_SRC = 'assets/sounds/bgm.mp3';
  const BGM_VOLUME = 0.35;

  const FILES = {
    flip: 'assets/sounds/flip.wav',
    match: 'assets/sounds/match.wav',
    win: 'assets/sounds/win.wav',
    fail: 'assets/sounds/fail.wav',
    click: 'assets/sounds/click.wav',
  };

  const VOLUME = {
    flip: 0.55,
    match: 0.7,
    mismatch: 0.5,
    win: 0.75,
    fail: 0.7,
    click: 0.5,
  };

  let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
  const pool = {};
  let audioCtx = null;
  let bgm = null;

  function getAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function initBgm() {
    if (bgm) return bgm;
    bgm = new Audio(BGM_SRC);
    bgm.loop = true;
    bgm.preload = 'auto';
    bgm.volume = BGM_VOLUME;
    return bgm;
  }

  function syncBgm() {
    initBgm();
    if (!enabled) {
      if (!bgm.paused) bgm.pause();
      return;
    }
    if (bgm.paused) {
      const p = bgm.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  function pauseBgm() {
    if (bgm && !bgm.paused) bgm.pause();
  }

  function bindBgmUnlock() {
    const unlock = () => {
      if (enabled) syncBgm();
    };
    document.addEventListener('pointerdown', unlock, { once: true, passive: true });
    document.addEventListener('keydown', unlock, { once: true });
  }

  /** 轻柔双音下滑，提示配对失败但不刺耳 */
  function playMismatchTone() {
    if (!enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t0 = ctx.currentTime;
      const peak = (VOLUME.mismatch ?? 0.5) * 0.38;
      const notes = [
        { freq: 392, at: 0, dur: 0.11 },
        { freq: 311, at: 0.09, dur: 0.14 },
      ];

      notes.forEach(({ freq, at, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = t0 + at;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.92, start + dur);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
    } catch {
      /* 忽略 */
    }
  }

  function preload() {
    initBgm();
    Object.keys(FILES).forEach((name) => {
      const audio = new Audio(FILES[name]);
      audio.preload = 'auto';
      pool[name] = audio;
    });
  }

  function play(name, opts) {
    if (!enabled) return;
    syncBgm();
    if (name === 'mismatch') {
      playMismatchTone();
      return;
    }
    if (!pool[name]) return;
    try {
      const base = pool[name];
      const node = base.cloneNode();
      node.volume = VOLUME[name] ?? 0.65;
      if (opts?.playbackRate) node.playbackRate = opts.playbackRate;
      const p = node.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* 忽略自动播放限制等 */
    }
  }

  function playMatchCombo(combo) {
    const rate = Math.min(1.45, 1 + (combo - 1) * 0.04);
    play('match', { playbackRate: rate });
  }

  function setEnabled(on) {
    enabled = !!on;
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    if (enabled) syncBgm();
    else pauseBgm();
    return enabled;
  }

  function toggle() {
    return setEnabled(!enabled);
  }

  function isEnabled() {
    return enabled;
  }

  preload();
  bindBgmUnlock();
  if (enabled) syncBgm();

  root.GameAudio = {
    play,
    playMatchCombo,
    toggle,
    setEnabled,
    isEnabled,
    syncBgm,
    pauseBgm,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
