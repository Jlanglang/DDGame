// fx.js — 局部粒子 / 飘字 / 顿帧 + WebAudio 合成音效（SPEC 5.4）
// 铁律：不做全屏闪 / 震屏。反馈只有局部粒子、飘字、顿帧、音效。
// 纯全局脚本（IIFE），Node 下可直接加载；window / document / AudioContext 全部 typeof 保护。
(function (root) {
  'use strict';
  const WV = root.WV = root.WV || {};

  const TAU = Math.PI * 2;

  // ---------- 工具 ----------
  function rand() {
    return typeof WV.rand === 'function' ? WV.rand() : Math.random();
  }
  function rrange(a, b) { return a + (b - a) * rand(); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v, dflt) {
    return typeof v === 'number' && isFinite(v) ? v : dflt;
  }

  const MAX_PARTICLES = 600;
  const MAX_FLOATS = 40;

  // =====================================================================
  //  WV.FX
  // =====================================================================
  WV.FX = {
    // 在 (x,y) 爆出 n 个粒子。颜色、数量、初速都可调。
    burst: function (G, x, y, color, n, speed) {
      if (!G) return;
      if (!Array.isArray(G.particles)) G.particles = [];
      const count = clamp(Math.floor(num(n, 12)), 0, 240);
      const spd = Math.max(0, num(speed, 120));
      const list = G.particles;
      const make = Math.min(count, MAX_PARTICLES - list.length);
      const px = num(x, 0);
      const py = num(y, 0);
      const col = color || '#ffd166';
      for (let i = 0; i < make; i++) {
        const ang = rand() * TAU;
        const sp = spd * rrange(0.35, 1.15);
        const life = rrange(0.26, 0.72);
        list.push({
          x: px + rrange(-3, 3),
          y: py + rrange(-3, 3),
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: life,
          maxLife: life,
          size: rrange(1.6, 3.8),
          color: col,
          shape: rand() < 0.42 ? 'sq' : 'dot',
          drag: rrange(1.4, 2.6),
        });
      }
    },

    // 飘字：向上飘 + 尾段淡出。text 可以是数字。
    float: function (G, x, y, text, color) {
      if (!G) return;
      if (!Array.isArray(G.floats)) G.floats = [];
      const t = text == null ? '' : String(text);
      if (!t) return;
      const life = 0.95;
      G.floats.push({
        x: num(x, 0),
        y: num(y, 0),
        text: t,
        color: color || '#ffffff',
        life: life,
        maxLife: life,
        vy: -40,
        size: 15,
      });
      if (G.floats.length > MAX_FLOATS) {
        G.floats.splice(0, G.floats.length - MAX_FLOATS);
      }
    },

    // 顿帧：只加不减，由 game.js 自己递减。
    hitstop: function (G, sec) {
      if (!G) return;
      const s = num(sec, 0);
      if (s <= 0) return;
      G.hitstop = Math.max(num(G.hitstop, 0), s);
    },

    // 推进粒子 / 飘字，移除过期的。
    update: function (G, dt) {
      if (!G) return;
      let d = num(dt, 0);
      if (d < 0) d = 0;
      if (d > 0.05) d = 0.05;  // 卡帧保护，避免粒子一帧飞太远

      const ps = G.particles;
      if (Array.isArray(ps)) {
        for (let i = ps.length - 1; i >= 0; i--) {
          const p = ps[i];
          p.life -= d;
          if (!(p.life > 0)) {
            ps.splice(i, 1);
            continue;
          }
          const decay = Math.exp(-num(p.drag, 2) * d);
          p.vx *= decay;
          p.vy *= decay;
          p.x += p.vx * d;
          p.y += p.vy * d;
        }
      }

      const fs = G.floats;
      if (Array.isArray(fs)) {
        for (let i = fs.length - 1; i >= 0; i--) {
          const f = fs[i];
          f.life -= d;
          if (!(f.life > 0)) {
            fs.splice(i, 1);
            continue;
          }
          f.y += num(f.vy, -40) * d;
        }
      }
    },

    // 渲染：圆点 / 方块粒子 + 描边飘字。ctx 可以是假对象，只调标准 2D API。
    draw: function (G, ctx) {
      if (!G || !ctx) return;

      const ps = G.particles;
      if (Array.isArray(ps) && ps.length) {
        ctx.save();
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          const a = p.maxLife > 0 ? clamp(p.life / p.maxLife, 0, 1) : 1;
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color || '#ffd166';
          const s = p.size > 0 ? p.size : 2;
          if (p.shape === 'sq') {
            ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, s, 0, TAU);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      const fs = G.floats;
      if (Array.isArray(fs) && fs.length) {
        ctx.save();
        ctx.font = 'bold 15px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        for (let i = 0; i < fs.length; i++) {
          const f = fs[i];
          // 前半段全不透明，后半段线性淡出
          const a = f.maxLife > 0 ? clamp(f.life / (f.maxLife * 0.5), 0, 1) : 1;
          ctx.globalAlpha = a;
          ctx.fillStyle = f.color || '#ffffff';
          ctx.strokeText(f.text, f.x, f.y);
          ctx.fillText(f.text, f.x, f.y);
        }
        ctx.restore();
      }
    },
  };

  // =====================================================================
  //  WV.audio —— WebAudio 纯合成，零外部文件
  // =====================================================================
  const LS_KEY = 'wvc-muted';
  const MASTER = 0.42;          // 总音量克制

  let actx = null;              // AudioContext 实例
  let master = null;            // 总音量节点
  let muted = readMuted();      // 静音状态
  let noiseBuf = null;

  function readMuted() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return false;
      const v = localStorage.getItem(LS_KEY);
      return v === '1' || v === 'true';
    } catch (e) {
      return false;
    }
  }

  function writeMuted(v) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(LS_KEY, v ? '1' : '0');
    } catch (e) { /* 隐私模式等，忽略 */ }
  }

  function ctorOf() {
    try {
      if (typeof AudioContext !== 'undefined' && typeof AudioContext === 'function') return AudioContext;
      if (root && typeof root.AudioContext === 'function') return root.AudioContext;
      if (root && typeof root.webkitAudioContext === 'function') return root.webkitAudioContext;
    } catch (e) { /* ignore */ }
    return null;
  }

  function dest() {
    return master || (actx ? actx.destination : null);
  }

  function nowT() {
    return actx ? actx.currentTime : 0;
  }

  // 音量包络：0.0001 起，attack 到 peak，dur 内指数收尾
  function env(t0, peak, attack, dur) {
    const g = actx.createGain();
    const p = Math.max(0.0002, peak);
    const a = Math.max(0.001, Math.min(attack, dur * 0.5));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, a + 0.01));
    const out = dest();
    if (out) g.connect(out);
    return g;
  }

  // 单振荡器短音
  function tone(type, f0, f1, dur, peak, t0, attack) {
    if (!actx) return;
    const t = typeof t0 === 'number' ? t0 : nowT();
    const f = Math.max(20, num(f0, 440));
    const o = actx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    const end = Math.max(20, num(f1, f));
    if (end !== f) o.frequency.exponentialRampToValueAtTime(end, t + dur);
    o.connect(env(t, peak, num(attack, 0.01), dur));
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // 噪声源（懒创建，0.4s 白噪声循环用）
  function noiseBuffer() {
    if (noiseBuf || !actx) return noiseBuf;
    try {
      const len = Math.max(1, Math.floor(actx.sampleRate * 0.4));
      const buf = actx.createBuffer(1, len, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = buf;
    } catch (e) {
      noiseBuf = null;
    }
    return noiseBuf;
  }

  // 带滤波的噪声爆发
  function noiseHit(dur, peak, type, fFrom, fTo, t0) {
    if (!actx) return;
    const buf = noiseBuffer();
    if (!buf) return;
    const t = typeof t0 === 'number' ? t0 : nowT();
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    let node = src;
    let filter = null;
    if (typeof actx.createBiquadFilter === 'function') {
      filter = actx.createBiquadFilter();
      filter.type = type || 'lowpass';
      filter.frequency.setValueAtTime(Math.max(40, num(fFrom, 1200)), t);
      const to = Math.max(40, num(fTo, num(fFrom, 1200)));
      if (to !== num(fFrom, 1200)) {
        filter.frequency.exponentialRampToValueAtTime(to, t + dur);
      }
      filter.Q.value = 1;
      src.connect(filter);
      node = filter;
    }
    node.connect(env(t, peak, 0.008, dur));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // 小音阶
  function arp(notes, step, peak, t0, type) {
    const t = typeof t0 === 'number' ? t0 : nowT();
    for (let i = 0; i < notes.length; i++) {
      tone(type, notes[i], notes[i], step * 0.95, peak, t + i * step, 0.006);
    }
  }

  // 12 个音效：全部振荡器 / 噪声合成
  const SOUNDS = {
    // 玩家开火：短促下滑 electronic blip
    shoot: function (t) {
      tone('triangle', 660, 300, 0.075, 0.06, t, 0.004);
      noiseHit(0.03, 0.02, 'highpass', 2200, 1600, t);
    },
    // 跳弹：高频金属「叮」
    ricochet: function (t) {
      tone('sine', 2100, 2600, 0.05, 0.038, t, 0.002);
      tone('triangle', 1500, 2300, 0.075, 0.03, t + 0.018, 0.004);
    },
    // 命中：闷响 + 短噪声
    hit: function (t) {
      noiseHit(0.05, 0.055, 'bandpass', 1400, 700, t);
      tone('square', 200, 120, 0.06, 0.032, t, 0.002);
    },
    // 击毁：下滑方波 + 碎屑噪声
    kill: function (t) {
      tone('square', 380, 110, 0.14, 0.05, t, 0.004);
      noiseHit(0.12, 0.055, 'lowpass', 1400, 300, t);
    },
    // 爆炸：低频噪声 + 次低频
    explode: function (t) {
      noiseHit(0.36, 0.12, 'lowpass', 1100, 90, t);
      tone('sine', 120, 40, 0.3, 0.075, t, 0.006);
      tone('triangle', 70, 35, 0.38, 0.05, t + 0.012);
    },
    // 玩家受击：下行锯齿 + 噪声
    playerHit: function (t) {
      tone('sawtooth', 320, 70, 0.32, 0.075, t, 0.006);
      noiseHit(0.28, 0.075, 'lowpass', 900, 160, t);
    },
    // 强化：上行琶音
    powerup: function (t) {
      arp([523, 659, 784, 1047], 0.07, 0.048, t, 'triangle');
    },
    // 选卡：两声轻脆 UI 音
    card: function (t) {
      arp([740, 1100], 0.055, 0.038, t, 'sine');
    },
    // 开局：三音上行
    start: function (t) {
      arp([392, 523, 659], 0.1, 0.052, t, 'triangle');
    },
    // 胜利：四音欢快
    win: function (t) {
      arp([523, 659, 784, 1047], 0.13, 0.058, t, 'triangle');
    },
    // 失败：四音下行
    lose: function (t) {
      arp([392, 311, 262, 196], 0.16, 0.058, t, 'sine');
    },
    // BOSS 登场：低频锯齿咆哮
    boss: function (t) {
      tone('sawtooth', 140, 55, 0.7, 0.08, t, 0.02);
      tone('square', 70, 48, 0.85, 0.048, t + 0.03, 0.02);
      noiseHit(0.7, 0.04, 'lowpass', 400, 80, t);
    },
  };

  const SOUND_NAMES = Object.keys(SOUNDS);

  function init() {
    if (actx) {
      if (actx.state === 'suspended' && typeof actx.resume === 'function') {
        try {
          const p = actx.resume();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) { /* ignore */ }
      }
      return actx;
    }
    const Ctor = ctorOf();
    if (!Ctor) return null;             // 无音频环境：静默降级
    try {
      actx = new Ctor();
    } catch (e) {
      actx = null;
      return null;
    }
    try {
      master = actx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      if (actx.destination) master.connect(actx.destination);
    } catch (e) {
      master = null;
    }
    if (actx.state === 'suspended' && typeof actx.resume === 'function') {
      try {
        const p = actx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) { /* ignore */ }
    }
    return actx;
  }

  function play(name) {
    if (typeof name !== 'string' || !name) return;
    if (!Object.prototype.hasOwnProperty.call(SOUNDS, name)) return;  // 名字不存在静默
    if (muted) return;
    if (!actx) init();                 // 首次播放自动补一次 init（无环境则直接返回）
    if (!actx || actx.state === 'closed') return;
    if (actx.state === 'suspended' && typeof actx.resume === 'function') {
      try {
        const p = actx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) { /* ignore */ }
    }
    try {
      SOUNDS[name](nowT() + 0.001);
    } catch (e) { /* 音频图异常不影响游戏 */ }
  }

  function toggle() {
    muted = !muted;
    writeMuted(muted);
    if (master && actx) {
      try {
        const t = actx.currentTime;
        if (master.gain.cancelScheduledValues) master.gain.cancelScheduledValues(t);
        if (master.gain.setTargetAtTime) {
          master.gain.setTargetAtTime(muted ? 0 : MASTER, t, 0.02);
        } else {
          master.gain.value = muted ? 0 : MASTER;
        }
      } catch (e) {
        try { master.gain.value = muted ? 0 : MASTER; } catch (e2) { /* ignore */ }
      }
    }
    return muted;
  }

  const AUDIO = {
    init: init,
    play: play,
    toggle: toggle,
  };
  Object.defineProperty(AUDIO, 'names', {  // 只读参考，方便联调
    get: function () { return SOUND_NAMES.slice(); },
    enumerable: true,
    configurable: false,
  });
  WV.audio = AUDIO;
  Object.defineProperty(WV.audio, 'muted', {
    get: function () { return muted; },
    enumerable: true,
    configurable: false,
  });
})(typeof window !== 'undefined' ? window : globalThis);
