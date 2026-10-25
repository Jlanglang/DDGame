/* 豆豆拍手 · 程序化音乐（Web Audio，零音频文件）
   - 所有声音都排在 AudioContext 的时间轴上，不靠 setTimeout 卡点
   - 30 秒 15 小节：鼓 / 贝斯 / 琶音；玩家拍手音走 clap()，立刻响
   - stop() 会换一个 master 并淡出旧的，重开不会拖着上一局的尾音
*/
(function (global) {
  'use strict';

  const AC = global.AudioContext || global.webkitAudioContext;
  const A4 = 440;
  const semi = (n) => A4 * Math.pow(2, n / 12);

  // 每小节根音（相对 A4 的半音）：Am / F / C / G
  const CHORDS = [-12, -16, -9, -14];

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

  Engine.prototype.pluck = function (t, f, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v || 0.055, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.24);
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
    const scale = m.scale || [0, 3, 5, 7, 10];
    const ev = [];

    for (let bar = 0; bar < bars; bar++) {
      const t0 = startT + bar * 4 * spb;
      ev.push({ t: t0, fn: 'kick', v: m.kick });
      ev.push({ t: t0 + 2 * spb, fn: 'kick', v: m.kick });
      ev.push({ t: t0 + spb, fn: 'snare', v: m.snare });
      ev.push({ t: t0 + 3 * spb, fn: 'snare', v: m.snare });

      // 冲刺关踩镲翻倍到十六分，听感上先「紧」起来
      const div = m.style === 'rush' ? 16 : 8;
      const step = 4 * spb / div;
      for (let i = 0; i < div; i++) {
        ev.push({ t: t0 + i * step, fn: 'hat', v: (i % 2 ? 0.55 : 0.95) * m.hat });
      }

      const root = chords[bar % 4];
      ev.push({ t: t0, fn: 'bass', n: root });
      ev.push({ t: t0 + 2 * spb, fn: 'bass', n: root });

      // 每拍一个轻引导音：把拍子数出来（1、2、3、4），卡点位置会在上面再加一个重音
      for (let i = 0; i < 4; i++) {
        ev.push({ t: t0 + i * spb, fn: 'pluck', n: root + 12 + scale[i % scale.length], v: 0.028 });
      }
      // 前奏留一段固定琶音，正式段交给谱面引导音
      if (bar < 2) {
        const arp = [0, 7, 12, 7];
        for (let i = 0; i < 4; i++) {
          ev.push({ t: t0 + i * spb, fn: 'pluck', n: root + 12 + arp[i], v: m.lead });
        }
      }

      // 变速之前的一小节：军鼓滚奏，预告下一段
      if (opts.rollBar === bar) {
        for (let i = 0; i < 4; i++) {
          ev.push({ t: t0 + 3 * spb + i * spb / 4, fn: 'snare', v: 0.08 + i * 0.045 });
        }
      }
    }

    // 引导音：每个该按的音符位置都响一下，音高走每关自己的音阶
    if (opts.notes) {
      let k = 0;
      for (const n of opts.notes) {
        const root = chords[n.bar % 4];
        const off = Math.abs((n.beat % 1) - 0.5) < 1e-6;
        ev.push({
          t: startT + n.t,
          fn: 'pluck',
          n: root + 12 + (off ? 12 : scale[k % scale.length]),
          v: off ? 0.1 : 0.085,
        });
        k++;
      }
    }

    ev.sort((a, b) => a.t - b.t);
    return ev;
  };

  Engine.prototype.playEvent = function (e) {
    switch (e.fn) {
      case 'kick': this.kick(e.t); break;
      case 'snare': this.snare(e.t); break;
      case 'hat': this.hat(e.t, e.v); break;
      case 'bass': this.bass(e.t, semi(e.n)); break;
      case 'pluck': this.pluck(e.t, semi(e.n), e.v); break;
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
