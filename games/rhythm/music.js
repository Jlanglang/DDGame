/* 节奏豆豆 · 程序化音乐（Web Audio，零音频文件）
   - 所有声音都排在 AudioContext 的时间轴上，不靠 setTimeout 卡点
   - 每关一句 8 个八分音符的钩子，反复哼。玩家要按的音是这句里的重音
   - stop() 会换一个 master 并淡出旧的，重开不会拖着上一局的尾音
*/
(function (global) {
  'use strict';

  const AC = global.AudioContext || global.webkitAudioContext;
  const A4 = 440;
  const semi = (n) => A4 * Math.pow(2, n / 12);

  // 每小节根音（相对 A4 的半音）：Am / F / C / G
  const CHORDS = [-12, -16, -9, -14];

  // 每小节的 2、4 拍按材质换打击声
  const SNARE_KIT = {
    water: 'splash',
    wood: 'tap',
    metal: 'clank',
    paper: 'rustle',
    cloth: 'swish',
    kitchen: 'bowl',
  };

  // 一句钩子，8 个八分音符，null 是休止。魔性靠这句反复，不靠每拍都响。
  const HOOKS = {
    soft:   [0, null, 7, 3, null, 7, 12, null],
    warm:   [0, 3, null, 7, 5, null, 3, 0],
    bright: [12, null, 7, null, 12, 7, 4, null],
    heavy:  [0, null, 0, 7, null, 5, 7, null],
    rush:   [0, 7, null, 12, 7, null, 12, 7],
    water:  [12, null, 7, null, 14, null, 7, null],
    wood:   [0, null, 0, 5, null, 7, 3, null],
    metal:  [12, null, 16, null, 12, 7, null, 19],
    paper:  [7, null, 3, null, 0, null, 5, null],
    cloth:  [3, null, 7, 3, null, 0, 7, null],
    kitchen:[0, null, 7, null, 5, 7, null, 3],
  };

  // 奇数小节换一句答句，同一条钩子不要从头循环到尾。
  const ANSWERS = {
    soft:   [12, null, 7, null, 3, 7, 0, null],
    warm:   [7, null, 10, 7, null, 5, 3, 0],
    bright: [7, null, 12, 16, null, 12, 7, null],
    heavy:  [0, 3, null, 7, 5, null, 0, 7],
    rush:   [12, null, 7, 12, null, 0, 7, null],
    water:  [7, null, 14, null, 12, 7, null, 3],
    wood:   [7, null, 3, 0, null, 5, 7, null],
    metal:  [19, null, 12, null, 16, null, 12, 7],
    paper:  [0, null, 5, null, 7, 3, null, 0],
    cloth:  [7, null, 3, null, 10, 7, null, 3],
    kitchen:[5, null, 0, 7, null, 3, 7, null],
  };

  function Engine() {
    this.ctx = null;
    this.master = null;
    this.vol = 0.8;
    this._noiseBuf = null;
    this._timer = null;
    this._cursor = 0;
    this._events = [];
    this._end = 0;
    this._playing = false;
  }

  Engine.prototype.init = function () {
    if (this.ctx) return this.ctx;
    if (!AC) return null;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  };

  Engine.prototype.unlock = function () {
    // iOS 16.4+：设成 playback 会话，静音键打开时也能出声
    try {
      if (global.navigator && global.navigator.audioSession) {
        global.navigator.audioSession.type = 'playback';
      }
    } catch (e) { /* 不支持就算了 */ }
    const c = this.init();
    if (!c) return Promise.resolve(false);
    if (c.state === 'suspended') return c.resume().then(() => true).catch(() => false);
    return Promise.resolve(c.state === 'running');
  };

  // 输出延迟（秒）。蓝牙下 Chrome 可能报 0，剩下的交给玩家校准。
  Engine.prototype.latency = function () {
    const c = this.ctx;
    if (!c) return 0;
    if (Number.isFinite(c.outputLatency) && c.outputLatency > 0) return c.outputLatency;
    if (Number.isFinite(c.baseLatency) && c.baseLatency > 0) return c.baseLatency;
    return 0;
  };

  Engine.prototype.now = function () {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  };

  Engine.prototype.noise = function () {
    if (this._noiseBuf) return this._noiseBuf;
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * 0.5);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = b;
    return b;
  };

  /* ---------- 音色 ---------- */

  Engine.prototype.kick = function (t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.55, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.22);
  };

  Engine.prototype.snare = function (t, v) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.26, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.14);

    const o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    og.gain.setValueAtTime(0.1, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.1);
  };

  // 材质打击声：替换每小节 2、4 拍的 snare，让切菜像切菜、接雨像接雨
  Engine.prototype.splash = function (t, v) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.18, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.14);
  };

  Engine.prototype.tap = function (t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(760, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.22, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.09);
  };

  Engine.prototype.ring = function (t, v) {
    const c = this.ctx;
    for (const f of [1600, 2390, 3170]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime((v || 0.14) * (f === 1600 ? 1 : 0.5), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.45);
    }
  };

  Engine.prototype.rustle = function (t, v) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(hp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.1);
  };

  Engine.prototype.swish = function (t, v) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(lp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.18);
  };

  Engine.prototype.clank = function (t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.16, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.14);
  };

  Engine.prototype.bowl = function (t, v) {    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1180, t);
    o.frequency.exponentialRampToValueAtTime(980, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.18, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.22);
  };

  Engine.prototype.hat = function (t, v) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.08, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.connect(hp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.05);
  };

  Engine.prototype.bass = function (t, f) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.26);
  };

  Engine.prototype.pluck = function (t, f, v, wave) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = wave || 'square';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.055, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.24);
  };

  // 铃声：短、亮，和「啵」不是同一种声音。只在有 cue 的关排。
  Engine.prototype.ring = function (t, f, v) {
    const c = this.ctx;
    const tone = (freq, vol, dur) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    tone(f, v || 0.16, 0.18);
    tone(f * 2.5, (v || 0.16) * 0.28, 0.08);
  };

  // 拍点上的「啵」：音高走钩子，短、往下甩，听得出来这一下就是该按的
  Engine.prototype.bop = function (t, f, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(48, f * 0.55), t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.12, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.11);
  };

  Engine.prototype.click = function (t, accent) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(accent ? 1760 : 1174, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.07);
  };

  // 玩家拍手：立刻响（不等拍点），拍得准不准，听声音就知道
  Engine.prototype.clap = function (v) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const n = c.createBufferSource();
      n.buffer = this.noise();
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400 + i * 520;
      bp.Q.value = 1.1;
      const g = c.createGain();
      const at = t + i * 0.008;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime((v || 0.3) * (1 - i * 0.24), at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      n.connect(bp).connect(g).connect(this.master);
      n.start(at); n.stop(at + 0.06);
    }
  };

  Engine.prototype.judgeSfx = function (kind) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const tone = (f, dur, vol, type) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    };
    if (kind === 'perfect') {
      tone(1568, 0.16, 0.12);
      tone(2093, 0.2, 0.06);
    } else if (kind === 'good') {
      tone(1174, 0.12, 0.09);
    } else if (kind === 'miss') {
      tone(196, 0.16, 0.11, 'triangle');
    }
  };

  /* ---------- 编排 ---------- */

  // 返回按时间排序的事件表；opts 带上每关的 bpm / bars / 音量 / 谱面
  Engine.prototype.buildTrack = function (startT, opts) {
    opts = opts || {};
    const m = Object.assign(
      { kick: 0.55, snare: 0.26, hat: 0.08, lead: 0.055, style: 'soft' },
      opts.music || {}
    );
    const spb = 60 / (opts.bpm || 120);
    const bars = opts.bars || 15;
    const chords = m.chords || CHORDS;
    const ev = [];
    const hook = HOOKS[m.style] || HOOKS.soft;
    const noteTimes = (opts.notes || []).map((n) => startT + n.t);
    const covered = (t) => noteTimes.some((nt) => Math.abs(nt - t) < 0.03);
    const ringAt = [];
    if (opts.cue && opts.notes) {
      const steps = [0, 4, 7, 12];
      for (let i = 0; i < opts.notes.length; i++) {
        const n = opts.notes[i];
        if (n.demo) continue;   // 练习段不敲铃
        for (let k = opts.cue; k >= 1; k--) {
          const rt = startT + n.t - k * spb;
          if (rt < startT - 0.001) continue;
          ringAt.push(rt);
          ev.push({
            t: rt,
            fn: 'ring',
            n: 12 + (steps[opts.cue - k] || 0),
            v: 0.18,
          });
        }
      }
    }
    const coveredRing = (t) => ringAt.some((rt) => Math.abs(rt - t) < 0.03);

    for (let bar = 0; bar < bars; bar++) {
      const t0 = startT + bar * 4 * spb;
      const root = chords[bar % 4];
      const snareFn = SNARE_KIT[m.style] || 'snare';
      const bounce = m.style === 'bright' || m.style === 'heavy' || m.style === 'rush'
        || m.style === 'wood' || m.style === 'metal' || m.style === 'kitchen';

      ev.push({ t: t0, fn: 'kick', v: m.kick });
      ev.push({ t: t0 + 2 * spb, fn: 'kick', v: m.kick * 0.9 });
      if (bounce) ev.push({ t: t0 + 1.5 * spb, fn: 'kick', v: m.kick * 0.32 });
      ev.push({ t: t0 + spb, fn: snareFn, v: m.snare });
      ev.push({ t: t0 + 3 * spb, fn: snareFn, v: m.snare * 0.85 });

      // 软的关只在反拍上给踩镲；连打关加密到十六分的反拍，不再每拍都铺满
      const hats = m.style === 'rush' ? 8 : 4;
      for (let i = 0; i < hats; i++) {
        const off = (i + 0.5) * (4 / hats) * spb;
        ev.push({ t: t0 + off, fn: 'hat', v: (i % 2 ? 0.55 : 0.9) * m.hat });
      }

      ev.push({ t: t0, fn: 'bass', n: root });
      ev.push({ t: t0 + 2.5 * spb, fn: 'bass', n: root + (bounce ? 7 : 0) });

      const phrase = (bar % 2) ? (ANSWERS[m.style] || hook) : hook;
      // 每拍一个四分音符，不再铺八分琶音
      for (let i = 0; i < 4; i++) {
        const t = t0 + i * spb;
        const deg = phrase[i * 2];
        if (deg == null || covered(t) || coveredRing(t)) continue;
        ev.push({
          t,
          fn: 'pluck',
          n: root + 12 + deg,
          v: bar < 2 ? m.lead * 1.35 : m.lead * 1.15,
          wave: m.wave,
        });
      }
      if (bar % 2 === 1) {
        ev.push({ t: t0 + 2.5 * spb, fn: snareFn, v: m.snare * 0.42 });
      }

      // 变速之前的一小节：军鼓滚奏，预告下一段
      if (opts.rollBar === bar) {
        for (let i = 0; i < 4; i++) {
          ev.push({ t: t0 + 3 * spb + i * spb / 4, fn: 'snare', v: 0.08 + i * 0.045 });
        }
      }
    }

    // 谱面落在钩子的音高上。休止格用 7 度顶一下，避免和钩子各唱各的
    if (opts.notes) {
      for (const n of opts.notes) {
        const root = chords[n.bar % 4];
        const idx = Math.round((n.beat % 4) * 2);
        let deg = hook[((idx % 8) + 8) % 8];
        if (deg == null) deg = 7;
        ev.push({
          t: startT + n.t,
          fn: 'bop',
          n: root + 12 + deg,
          v: n.demo ? 0.08 : 0.13,
        });
      }
    }

    ev.sort((a, b) => a.t - b.t);
    return ev;
  };

  Engine.prototype.playEvent = function (e) {
    switch (e.fn) {
      case 'kick': this.kick(e.t, e.v); break;
      case 'snare': this.snare(e.t, e.v); break;
      case 'splash': this.splash(e.t, e.v); break;
      case 'tap': this.tap(e.t, e.v); break;
      case 'ring': this.ring(e.t, e.v); break;
      case 'rustle': this.rustle(e.t, e.v); break;
      case 'swish': this.swish(e.t, e.v); break;
      case 'bowl': this.bowl(e.t, e.v); break;
      case 'clank': this.clank(e.t, e.v); break;
      case 'hat': this.hat(e.t, e.v); break;
      case 'bass': this.bass(e.t, semi(e.n)); break;
      case 'pluck': this.pluck(e.t, semi(e.n), e.v, e.wave); break;
      case 'bop': this.bop(e.t, semi(e.n), e.v); break;
      case 'ring': this.ring(e.t, semi(e.n), e.v); break;
      case 'click': this.click(e.t, e.accent); break;
    }
  };

  // 前瞻调度：每 25ms 把未来 0.5s 的音排进音频时间轴。
  // 窗口比原来看得远，主线程卡一下也不会把音排晚。
  Engine.prototype.playTrack = function (events, endT) {
    this.stop();
    this._events = events;
    this._cursor = 0;
    this._end = endT;
    this._playing = true;
    const tick = () => {
      if (!this._playing || !this.ctx) return;
      const now = this.ctx.currentTime;
      while (this._cursor < this._events.length && this._events[this._cursor].t < now + 0.5) {
        this.playEvent(this._events[this._cursor++]);
      }
      if (now > this._end + 1.2) this.stop();
    };
    this._timer = setInterval(tick, 25);
    tick();
  };

  Engine.prototype.stop = function () {
    this._playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (!this.ctx || !this.master) return;
    const old = this.master;
    const now = this.ctx.currentTime;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(this.ctx.destination);
    try {
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0.0001, now + 0.04);
    } catch (e) { /* 已断开 */ }
    setTimeout(() => { try { old.disconnect(); } catch (e) { /* 忽略 */ } }, 140);
  };

  // 校准用节拍器：返回起拍时间，game.js 拿它对拍
  Engine.prototype.playMetronome = function (startT, beats, bpm) {
    const spb = 60 / (bpm || 120);
    const ev = [];
    for (let i = 0; i < beats; i++) {
      ev.push({ t: startT + i * spb, fn: 'click', accent: i % 4 === 0 });
    }
    this.playTrack(ev, startT + beats * spb);
    return startT;
  };

  global.Music = { Engine, create: function () { return new Engine(); } };
}(typeof window !== 'undefined' ? window : globalThis));
