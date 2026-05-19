/**
 * 音效（Kenney Interface Sounds, CC0）
 * https://kenney.nl/assets/interface-sounds
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'doudou-sfx-enabled';

  const FILES = {
    flip: 'assets/sounds/flip.wav',
    match: 'assets/sounds/match.wav',
    mismatch: 'assets/sounds/mismatch.wav',
    win: 'assets/sounds/win.wav',
    fail: 'assets/sounds/fail.wav',
    click: 'assets/sounds/click.wav',
  };

  const VOLUME = {
    flip: 0.55,
    match: 0.7,
    mismatch: 0.65,
    win: 0.75,
    fail: 0.7,
    click: 0.5,
  };

  let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
  const pool = {};

  function preload() {
    Object.keys(FILES).forEach((name) => {
      const audio = new Audio(FILES[name]);
      audio.preload = 'auto';
      pool[name] = audio;
    });
  }

  function play(name, opts) {
    if (!enabled || !pool[name]) return;
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
    return enabled;
  }

  function toggle() {
    return setEnabled(!enabled);
  }

  function isEnabled() {
    return enabled;
  }

  preload();

  root.GameAudio = { play, playMatchCombo, toggle, setEnabled, isEnabled };
})(typeof globalThis !== 'undefined' ? globalThis : this);
