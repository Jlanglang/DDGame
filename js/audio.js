/**

 * 音效（Kenney Interface Sounds, CC0）

 * 配对失败为内置柔和合成音

 * 背景音乐 assets/sounds/bgm.mp3：全应用循环

 * 手机端须在 touchstart 等手势中同步 play()，click 事件无效

 */

(function (root) {

  'use strict';



  const STORAGE_KEY = 'doudou-sfx-enabled';

  const BGM_SRC = 'assets/sounds/bgm.original.mp3';

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

  let bgmUnlockBound = false;

  let bgmUnlocked = false;

  let unlockEl = null;

  let promptTimer = null;



  function isMobileLike() {

    return (

      /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) ||

      (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches)

    );

  }



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

    bgm.playsInline = true;

    return bgm;

  }



  function hideUnlockPrompt() {

    if (unlockEl) {

      unlockEl.classList.add('hidden');

      unlockEl.setAttribute('aria-hidden', 'true');

    }

  }



  function showUnlockPrompt() {

    if (!enabled || bgmUnlocked || !isMobileLike()) return;

    if (!unlockEl) {

      unlockEl = document.createElement('div');

      unlockEl.id = 'audio-unlock';

      unlockEl.className = 'audio-unlock';

      unlockEl.setAttribute('role', 'button');

      unlockEl.setAttribute('aria-label', '轻触开启背景音乐');

      unlockEl.innerHTML = '<span class="audio-unlock-text">轻触屏幕开启音乐</span>';

      document.body.appendChild(unlockEl);

    }

    unlockEl.classList.remove('hidden');

    unlockEl.setAttribute('aria-hidden', 'false');

  }



  function scheduleUnlockPrompt() {

    if (promptTimer) clearTimeout(promptTimer);

    if (!isMobileLike() || !enabled) return;

    promptTimer = setTimeout(() => {

      if (!bgmUnlocked && enabled) showUnlockPrompt();

    }, 800);

  }



  /** 必须在用户手势回调中同步调用（尤其 iOS / 微信） */

  function unlockFromUserGesture() {

    if (!enabled) return false;

    initBgm();

    getAudioContext();

    if (bgmUnlocked && !bgm.paused) return true;

    let p;

    try {

      p = bgm.play();

    } catch {

      return false;

    }



    const markOk = () => {

      if (!bgm.paused) {

        bgmUnlocked = true;

        hideUnlockPrompt();

      }

    };



    markOk();

    if (p && typeof p.then === 'function') {

      p.then(markOk).catch(() => {});

    }

    return bgmUnlocked;

  }



  function ensureBgm() {

    if (!enabled) {

      if (bgm && !bgm.paused) bgm.pause();

      return;

    }

    initBgm();

    if (!bgmUnlocked) {

      scheduleUnlockPrompt();

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

    if (bgmUnlockBound) return;

    bgmUnlockBound = true;



    const onGesture = () => {

      unlockFromUserGesture();

    };



    const cap = { capture: true, passive: true };

    document.addEventListener('touchstart', onGesture, cap);

    document.addEventListener('touchend', onGesture, cap);

    document.addEventListener('pointerdown', onGesture, cap);

    document.addEventListener('click', onGesture, cap);



    document.addEventListener('visibilitychange', () => {

      if (document.visibilityState === 'visible' && bgmUnlocked) ensureBgm();

    });

    window.addEventListener('pageshow', () => {

      if (bgmUnlocked) ensureBgm();

    });

  }



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

    unlockFromUserGesture();

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

      /* 忽略 */

    }

  }



  function playMatchCombo(combo) {

    const rate = Math.min(1.45, 1 + (combo - 1) * 0.04);

    play('match', { playbackRate: rate });

  }



  function setEnabled(on) {

    enabled = !!on;

    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');

    if (enabled) {

      scheduleUnlockPrompt();

    } else {

      bgmUnlocked = false;

      pauseBgm();

      hideUnlockPrompt();

    }

    return enabled;

  }



  function toggle() {

    return setEnabled(!enabled);

  }



  function isEnabled() {

    return enabled;

  }



  function isBgmPlaying() {

    return Boolean(bgm && !bgm.paused);

  }



  preload();

  bindBgmUnlock();



  if (enabled && !isMobileLike()) {

    initBgm();

    const p = bgm.play();

    if (p && typeof p.then === 'function') {

      p.then(() => {

        bgmUnlocked = true;

      }).catch(() => {});

    }

  } else if (enabled) {

    scheduleUnlockPrompt();

  }



  root.GameAudio = {

    play,

    playMatchCombo,

    toggle,

    setEnabled,

    isEnabled,

    ensureBgm,

    syncBgm: ensureBgm,

    pauseBgm,

    unlockFromUserGesture,

    isBgmPlaying,

  };

})(typeof globalThis !== 'undefined' ? globalThis : this);


