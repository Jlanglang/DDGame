/* 节奏豆豆 · 情景表。前 50 关的句子保持原样，新关只往后面加。
   浏览器挂 window.RhythmScenes；Node 里 require。
   A 是拍点上动的那一件，B 是把拍子带过来的东西，C 是场地，D 是碰上的那一下。
   地面线在 y=924（PLANT 908）。东西停在 y 960 以上，免得压到下面的黄点车道。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RhythmScenes = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const E = '................';
  const X = 'x...............';
  const D = 'd...............';
  const X2 = 'x.......x.......';
  const D2 = 'd.......d.......';

  const T = {
    lift: { sky: '#061714', glow: 'rgba(90,230,190,0.16)', accent: '#7ff0cf' },
    disc: { sky: '#0b1220', glow: 'rgba(110,150,235,0.18)', accent: '#ffd166' },
    kick: { sky: '#140f08', glow: 'rgba(255,190,110,0.18)', accent: '#ffc46b' },
    drum: { sky: '#150a0c', glow: 'rgba(255,110,110,0.16)', accent: '#ff9a8a' },
    duck: { sky: '#101a0c', glow: 'rgba(190,230,120,0.16)', accent: '#c8f07a' },
    swat: { sky: '#1a1008', glow: 'rgba(255,170,90,0.16)', accent: '#ffb066' },
    high: { sky: '#0c1622', glow: 'rgba(120,200,255,0.16)', accent: '#9fd8ff' },
    stone: { sky: '#0c1420', glow: 'rgba(120,200,255,0.16)', accent: '#8fd4ff' },
    sash: { sky: '#12061a', glow: 'rgba(200,120,255,0.18)', accent: '#d9a6ff' },
    bump: { sky: '#1a0a14', glow: 'rgba(255,120,200,0.16)', accent: '#ff8fd0' },
    mole: { sky: '#1a120c', glow: 'rgba(210,160,90,0.16)', accent: '#e7b15a' },
    water: { sky: '#07161c', glow: 'rgba(120,210,230,0.18)', accent: '#8ee7f2' },
    wood: { sky: '#1a1008', glow: 'rgba(230,170,90,0.16)', accent: '#e7b15a' },
    metal: { sky: '#10141c', glow: 'rgba(190,210,235,0.16)', accent: '#d5e2f2' },
    paper: { sky: '#16141c', glow: 'rgba(220,200,255,0.14)', accent: '#e4d4ff' },
    cloth: { sky: '#1a1020', glow: 'rgba(255,160,200,0.14)', accent: '#ffb3d0' },
    kitchen: { sky: '#1a120c', glow: 'rgba(255,180,100,0.16)', accent: '#ffc46b' },
  };

  const M = {
    soft: { kick: 0.5, snare: 0.24, hat: 0.1, lead: 0.055, style: 'soft', wave: 'square', chords: [-12, -16, -9, -14], scale: [0, 3, 5, 7, 10] },
    warm: { kick: 0.46, snare: 0.2, hat: 0.08, lead: 0.06, style: 'warm', wave: 'square', chords: [-7, -11, -4, -9], scale: [0, 2, 3, 5, 7, 8, 10] },
    bright: { kick: 0.52, snare: 0.26, hat: 0.11, lead: 0.055, style: 'bright', wave: 'square', chords: [-5, -9, -2, -7], scale: [0, 2, 3, 5, 7, 8, 10] },
    heavy: { kick: 0.58, snare: 0.29, hat: 0.12, lead: 0.05, style: 'heavy', wave: 'square', chords: [-9, -13, -6, -11], scale: [0, 3, 5, 6, 7, 10] },
    water: { kick: 0.4, snare: 0.16, hat: 0.07, lead: 0.048, style: 'water', wave: 'sine', chords: [-12, -16, -9, -14], scale: [0, 2, 3, 7, 10] },
    wood: { kick: 0.56, snare: 0.3, hat: 0.08, lead: 0.05, style: 'wood', wave: 'triangle', chords: [-9, -13, -6, -11], scale: [0, 3, 5, 7, 10] },
    metal: { kick: 0.44, snare: 0.18, hat: 0.11, lead: 0.046, style: 'metal', wave: 'square', chords: [-5, -9, -2, -7], scale: [0, 2, 4, 7, 11] },
    paper: { kick: 0.36, snare: 0.14, hat: 0.05, lead: 0.042, style: 'paper', wave: 'triangle', chords: [-7, -12, -4, -9], scale: [0, 2, 5, 7, 9] },
    cloth: { kick: 0.4, snare: 0.16, hat: 0.06, lead: 0.046, style: 'cloth', wave: 'sine', chords: [-4, -9, -2, -7], scale: [0, 3, 5, 7, 10] },
    kitchen: { kick: 0.52, snare: 0.26, hat: 0.09, lead: 0.05, style: 'kitchen', wave: 'triangle', chords: [-9, -14, -5, -10], scale: [0, 3, 5, 7, 10] },
  };

  function barFromEighths(eighths, ch) {
    const a = E.split('');
    for (let i = 0; i < eighths.length; i++) a[eighths[i] * 2] = ch;
    return a.join('');
  }

  // 句子跟着情景，不按关卡类型盖成同一句。
  // 八分下标：0 正拍、2 第 2 拍、4 第 3 拍、6 第 4 拍。前奏 1 小节，没有示范音。
  // one    每小节一下，打在这个动词该落的拍上
  // phrase 两小节一句，原样重复，用来跟着抄
  // rounds 一小节里隔开的两下，再空一小节
  // tail   前半每小节一下，后半才变成隔开的两下
  // half   前半一句，后半同一句挪半拍。只给第 51 关以后用
  function patternOf(chart) {
    if (!chart) return [E];
    if (chart.raw) return chart.raw;
    const p = [E];
    const push = (eighths) => p.push(barFromEighths(eighths, 'x'));
    if (chart.k === 'one') {
      // 一句 ×3 → 加花 → 呼吸 → 挪半拍 ×3 → 高潮 ×2 → 收
      const b = chart.hits[0] || 0;
      const early = [b, Math.min(7, b + 2), Math.min(7, b + 4)];
      const peak = [b, Math.min(7, b + 2), Math.min(7, b + 4), Math.min(7, b + 6)];
      const late = [1, 3, 5];
      const latePeak = [1, 3, 5, 7];
      push(early); push(early); push(early);
      push(peak);
      p.push(E);
      push(early);
      push(late); push(late); push(late);
      push(latePeak); push(latePeak);
      push(early);
      return p;
    }
    if (chart.k === 'phrase') {
      // 一句 ×3 → 加花 → 呼吸 → 挪半拍 ×3 → 高潮 ×2 → 收
      const a = chart.bars[0][0];
      const b = chart.bars[1][0];
      const early = [a, b];
      const peak = [a, b, (a + 4) % 8];
      const late = [a + 1, b + 1];
      const latePeak = [a + 1, b + 1, (a + 5) % 8];
      push(early); push(early); push(early);
      push(peak);
      p.push(E);
      push(early);
      push(late); push(late); push(late);
      push(latePeak); push(latePeak);
      push(early);
      return p;
    }
    if (chart.k === 'rounds') {
      for (let i = 0; i < chart.n; i++) {
        push(chart.hits);
        p.push(E);
      }
      return p;
    }
    if (chart.k === 'tail') {
      for (let i = 0; i < chart.s; i++) push(chart.single);
      for (let i = 0; i < chart.p; i++) {
        push(chart.pair);
        p.push(E);
      }
      return p;
    }
    if (chart.k === 'half') {
      for (let i = 0; i < chart.n; i++) push(chart.early);
      for (let i = 0; i < chart.n; i++) push(chart.late);
      return p;
    }
    if (chart.k === 'mix') {
      for (let i = 0; i < chart.n; i++) p.push(chart.bars[i % chart.bars.length]);
      return p;
    }
    return p;
  }

  function one(hits) { return { k: 'one', hits: hits, n: 12 }; }
  function phrase(bars) { return { k: 'phrase', bars: bars, n: 6 }; }
  function rounds(hits) { return { k: 'rounds', hits: hits, n: 6 }; }
  function tail(single, pair) { return { k: 'tail', single: single, s: 8, pair: pair, p: 2 }; }
  function half(early, late) { return { k: 'half', early: early, late: late, n: 6 }; }

  // 节奏型库：16 格 / 小节（十六分网格），每拍 4 格
  // 只用有停顿的型。十六分连打会变成「一直点」，不是卡点。
  const CELL = {
    pp: 'x.x.x.x.x.x.x.x.',   // 二八：每拍两个八分
    off: 'x..x..x.x..x..x',   // 切分：正拍 + 反拍，间隔 2~3 格
    dot: 'x..xx..xx..xx..x',  // 附点：附点八分 + 十六分
  };
  function groove(bars) { return { k: 'mix', bars: bars, n: 12 }; }

  function polar(x, y, ang, len) {
    return { x: x + Math.cos(ang) * len, y: y + Math.sin(ang) * len };
  }

  function mix(a, b, u) {
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  }

  function limb2(root, target, lenA, lenB, prefer) {
    const dx = target.x - root.x;
    const dy = target.y - root.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const max = lenA + lenB - 0.01;
    const min = Math.abs(lenA - lenB) + 0.01;
    const clamped = Math.max(min, Math.min(max, dist));
    const ux = dx / dist;
    const uy = dy / dist;
    const end = { x: root.x + ux * clamped, y: root.y + uy * clamped };
    const c = (lenA * lenA - lenB * lenB + clamped * clamped) / (2 * clamped);
    const h = Math.sqrt(Math.max(0, lenA * lenA - c * c));
    const px = -uy;
    const py = ux;
    const j1 = { x: root.x + ux * c + px * h, y: root.y + uy * c + py * h };
    const j2 = { x: root.x + ux * c - px * h, y: root.y + uy * c - py * h };
    const d1 = (j1.x - prefer.x) ** 2 + (j1.y - prefer.y) ** 2;
    const d2 = (j2.x - prefer.x) ** 2 + (j2.y - prefer.y) ** 2;
    return { joint: d1 <= d2 ? j1 : j2, end };
  }

  function angOf(actor, u) {
    if (!actor) return 0;
    if (u < 0) return actor.rest;
    const wind = actor.wind != null ? actor.wind : actor.rest;
    const hit = actor.hit != null ? actor.hit : actor.rest;
    return wind + (hit - wind) * u;
  }

  function limbAt(actor, u) {
    const hip = { x: actor.hip[0], y: actor.hip[1] };
    const foot = u < 0 ? actor.rest : mix(actor.wind, actor.hit, u);
    const solved = limb2(hip, { x: foot[0], y: foot[1] }, actor.len, actor.len, {
      x: actor.prefer[0], y: actor.prefer[1],
    });
    return { hip, knee: solved.joint, end: solved.end, len: actor.len };
  }

  function sceneU(strike, raise) {
    const hit = Math.max(0, strike || 0);
    const up = raise || 0;
    if (up <= 0.02 && hit <= 0.02) return -1;
    if (hit <= 0.02) return 0;
    if (hit >= 1) return 1;
    // 先蓄着，最后一小段才甩到位。中间不要匀速爬。
    if (hit < 0.62) return hit * 0.08;
    return 0.05 + Math.pow((hit - 0.62) / 0.38, 0.55) * 0.95;
  }

  function cueU(visual, pose) {
    const a = visual && visual.actor;
    pose = pose || {};
    if (a && a.drive === 'arrive') {
      const ar = pose.arrive;
      if (!ar || ar.mode === 'park') return -1;
      return 1 - Math.max(0, Math.min(1, ar.s));
    }
    return sceneU(pose.strike, pose.raise);
  }

  function actorTip(visual) {
    const a = (visual && visual.actor) || { k: 'none' };
    if (a.k === 'pivot' || a.k === 'flower' || a.k === 'pedal' || a.k === 'needle') {
      const tip = polar(a.x, a.y, a.hit, a.len || 0);
      if (a.headPad) return polar(tip.x, tip.y, a.hit, a.headPad);
      return tip;
    }
    if (a.k === 'leg' || a.k === 'arm') return limbAt(a, 1).end;
    if (a.k === 'paddle') return { x: a.x, y: a.y - 16 };
    if (a.k === 'pinch') return { x: a.x, y: a.y + Math.cos(a.close) * a.len };
    if (a.k === 'hinge') return polar(a.x, a.y, a.hit, a.w || 80);
    if (a.k === 'slide') return { x: a.x + (a.dx || 0), y: a.y };
    if (visual && visual.aim) return { x: visual.aim[0], y: visual.aim[1] };
    return { x: a.x || 400, y: a.y || 860 };
  }

  function propHome(visual) {
    const b = visual && visual.prop;
    const base = visual && visual.aim
      ? { x: visual.aim[0], y: visual.aim[1] }
      : actorTip(visual || {});
    return { x: base.x + ((b && b.ox) || 0), y: base.y + ((b && b.oy) || 0) };
  }

  function propEnds(visual) {
    const home = propHome(visual);
    const b = (visual && visual.prop) || {};
    return {
      home,
      enter: { x: home.x + (b.dx || 0), y: home.y + (b.dy || 0) },
      exit: { x: home.x + (b.ex || 0), y: home.y + (b.ey || 0) },
    };
  }

  // 下面这份是旧谱，只给对象字面量占位。真正在用的句子是文件末尾的 PLAN，不要改回按类型覆盖。
  const keep = {
    lift: [E, E, D, X, D, X, D, X, D2, X2, D2, X2, D, X, D, X, D, X],
    disc: [E, E, D, X, D, X, D, X, D, D, X, X, D, D, X, X, D, X],
    beat: [E, E, X, E, X, E, X, E, X, E, X, E, X, E, X, E],
    swat: [E, E, X, E, X, E, X, E, X, E, X, E, X, X, X, X],
    stone: [E, E, X, E, X, E, X, E, X, E, X, X, X, X, X, X],
    bump: [E, E, X2, E, X2, E, X2, E, X2, E, X2, E, X2, E],
    mole: [E, E, X, E, X, E, X, X, X, E, X, X, X, X, X, X],
  };

  function V(places, actor, prop, aim) {
    return { places: places || [], actor: actor || { k: 'none' }, prop: prop || null, aim: aim || null };
  }

  const SCENES = [
    { id: 'lift', name: '让球', btn: '让', mode: 'echo', diff: 1, bpm: 100, part: 'cup', prop: 'ball', theme: T.lift, music: M.soft, chart: { raw: keep.lift },
      visual: V([{ k: 'cup', x: 430, y: 898, f: '#f6f1e6' }], { k: 'none' }, { k: 'ball', f: '#ff8d5a', r: 20, travel: 'x', dx: 230 }, [430, 898]) },
    { id: 'disc', name: '接飞盘', btn: '接', mode: 'echo', diff: 1, bpm: 108, part: 'mitt', prop: 'disc', theme: T.disc, music: M.warm, chart: { raw: keep.disc },
      visual: V([], { k: 'pivot', x: 300, y: 860, len: 108, rest: 0.9, wind: 0.25, hit: -0.72, f: '#f0943e', head: 'mitt' }, { k: 'disc', f: '#ffd15c', r: 16, travel: 'x', dx: 240 }) },
    { id: 'kick', name: '踢球', btn: '踢', mode: 'beat', diff: 2, bpm: 104, part: 'leg', prop: 'ball', theme: T.kick, music: M.bright, chart: { raw: keep.beat },
      visual: V([], { k: 'leg', hip: [300, 750], len: 100, rest: [400, 906], wind: [330, 850], hit: [470, 902], prefer: [420, 760] }, { k: 'ball', f: '#ff8d5a', r: 20, travel: 'x', dx: 200, ox: 18, oy: 8, ex: 130, ey: -150, behind: true }) },
    { id: 'drum', name: '敲鼓', btn: '敲', mode: 'beat', diff: 2, bpm: 112, part: 'stick', prop: 'drum', theme: T.drum, music: M.heavy, chart: { raw: keep.beat },
      visual: V([{ k: 'drum', at: 'tip' }], { k: 'pivot', x: 246, y: 748, len: 214, rest: -0.25, wind: -1.05, hit: 0.52, f: '#e7b15a', head: 'knob' }, null) },
    { id: 'duck', name: '躲树枝', btn: '躲', mode: 'beat', diff: 2, bpm: 108, part: 'flower', prop: 'branch', theme: T.duck, music: M.soft, chart: { raw: keep.beat },
      visual: V([], { k: 'flower', x: 330, y: 908, len: 196, rest: -Math.PI / 2, wind: -Math.PI / 2 - 0.06, hit: -Math.PI / 2 + 0.72, f: '#63b85a' }, { k: 'branch', f: '#6b3a22', travel: 'x', dx: 260, ex: -180 }, [346, 634]) },
    { id: 'swat', name: '拍苍蝇', btn: '拍', mode: 'beat', diff: 3, bpm: 116, part: 'swat', prop: 'fly', theme: T.swat, music: M.bright, chart: { raw: keep.swat },
      visual: V([{ k: 'wall', at: 'tip', ox: -18 }], { k: 'pivot', x: 268, y: 790, len: 176, rest: -0.2, wind: -0.95, hit: 0.12, f: '#d7c4a8', head: 'swat', headPad: 15 }, { k: 'fly', f: '#2a241c', r: 10, travel: 'y', dy: -220, behind: true }) },
    { id: 'high', name: '接高球', btn: '接', mode: 'beat', diff: 3, bpm: 100, part: 'basket', prop: 'ball', theme: T.high, music: M.warm, chart: { raw: keep.beat },
      visual: V([{ k: 'basket', x: 430, y: 820, f: '#e7b15a' }], { k: 'none' }, { k: 'ball', f: '#ff8d5a', r: 20, travel: 'y', dy: -340, ey: 28 }, [430, 804]) },
    { id: 'stone', name: '踩石', btn: '踩', mode: 'beat', diff: 3, bpm: 120, part: 'pedal', prop: 'stone', theme: T.stone, music: M.heavy, chart: { raw: keep.stone },
      visual: V([], { k: 'pedal', x: 348, y: 902, len: 128, rest: -0.06, wind: -0.42, hit: 0.04, f: '#d5c2a6' }, { k: 'bar', f: '#6f6256', w: 72, h: 22, travel: 'x', dx: 220, behind: true }) },
    { id: 'sash', name: '推窗', btn: '推', mode: 'beat', diff: 3, bpm: 96, part: 'arm', prop: 'sash', theme: T.sash, music: M.soft, chart: { raw: keep.beat },
      visual: V([{ k: 'frame', at: 'tip', ox: 48, w: 52, h: 150 }], { k: 'arm', hip: [118, 748], len: 78, rest: [196, 812], wind: [210, 700], hit: [252, 768], prefer: [190, 660] }, { k: 'sash', f: '#d7ecff', w: 28, h: 120, travel: 'x', dx: 210, ox: 18, behind: true }) },
    { id: 'bump', name: '颠球', btn: '颠', mode: 'pair', diff: 3, bpm: 118, part: 'paddle', prop: 'ball', theme: T.bump, music: M.bright, arc: true, chart: { raw: keep.bump },
      visual: V([], { k: 'paddle', x: 410, y: 858, f: '#f0943e' }, { k: 'ball', f: '#ff8d5a', r: 20, travel: 'y', dy: -300, ey: -220 }, [410, 808]) },
    { id: 'mole', name: '打地鼠', btn: '打', mode: 'pair', diff: 3, bpm: 124, part: 'mallet', prop: 'mole', theme: T.mole, music: M.heavy, chart: { raw: keep.mole },
      visual: V([{ k: 'hole', at: 'tip', oy: 52 }], { k: 'pivot', x: 270, y: 690, len: 236, rest: -0.12, wind: -0.72, hit: 0.82, f: '#c48a55', head: 'mallet' }, { k: 'mole', f: '#a56b45', r: 22, travel: 'y', dy: 70, oy: 8, ey: 48, behind: true }) },

    { id: 'rain', name: '接雨', btn: '雨', mode: 'echo', diff: 3, bpm: 100, part: 'bowl', prop: 'drop', theme: T.water, music: M.water, chart: { k: 'echo1', n: 7 },
      visual: V([{ k: 'bowl', x: 400, y: 860, f: '#f6f1e6' }], { k: 'none' }, { k: 'drop', f: '#7ec8e3', r: 12, travel: 'y', dy: -300, ey: 16 }, [400, 888]) },
    { id: 'lamp', name: '拉灯', btn: '灯', mode: 'beat', diff: 3, bpm: 104, part: 'lamp', prop: 'tassel', theme: T.metal, music: M.metal, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'lamp', x: 400, y: 700, f: '#f6f1e6' }], { k: 'none' }, { k: 'tassel', f: '#e7b15a', r: 14, travel: 'y', dy: -80, ey: 10 }, [400, 820]) },
    { id: 'knife', name: '切菜', btn: '切', mode: 'beat', diff: 3, bpm: 108, part: 'knife', prop: 'cuke', theme: T.kitchen, music: M.kitchen, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'board', x: 400, y: 880, w: 220, h: 26, f: '#c48a55' }, { k: 'cuke', x: 400, y: 852, f: '#63b85a' }], { k: 'none' }, { k: 'knife', f: '#d5dde8', travel: 'y', dy: -300 }, [400, 852]) },
    { id: 'sling', name: '弹弓', btn: '弹', mode: 'beat', diff: 3, bpm: 112, part: 'target', prop: 'pebble', theme: T.kick, music: M.bright, chart: { k: 'beat1', n: 6 },
      visual: V([{ k: 'target', x: 520, y: 760 }, { k: 'sling', x: 230, y: 800, f: '#8a5a3a' }], { k: 'none' }, { k: 'pebble', f: '#8d8274', r: 12, travel: 'x', dx: -270 }, [520, 760]) },
    { id: 'pour', name: '倒水', btn: '倒', mode: 'echo', diff: 3, bpm: 96, part: 'cup', prop: 'drop', theme: T.water, music: M.water, chart: { k: 'echo1', n: 6 },
      visual: V([{ k: 'pot', x: 300, y: 830, f: '#c48a55' }, { k: 'cup', x: 480, y: 870, f: '#f6f1e6' }], { k: 'hinge', x: 330, y: 800, w: 64, h: 18, rest: -0.5, wind: -0.25, hit: 0.7, f: '#e7b15a' }, { k: 'drop', f: '#7ec8e3', r: 11, travel: 'line', dx: -150, dy: -70, ey: 12 }, [480, 858]) },
    { id: 'rod', name: '提竿', btn: '提', mode: 'beat', diff: 3, bpm: 100, part: 'rod', prop: 'bobber', theme: T.water, music: M.water, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'pond', x: 430, y: 880, w: 280, f: '#1c6b8a' }], { k: 'pivot', x: 240, y: 700, len: 180, rest: -0.55, wind: 0.95, hit: -0.9, f: '#c48a55', head: 'knob' }, { k: 'bobber', f: '#ff5b45', r: 12, travel: 'y', dy: -90 }, [400, 868]) },
    { id: 'knock', name: '叩门', btn: '叩', mode: 'beat', diff: 3, bpm: 108, part: 'door', prop: 'ring', theme: T.wood, music: M.wood, chart: { k: 'tail', s: 5, p: 2 },
      visual: V([{ k: 'door', x: 360, y: 800, w: 150, h: 230, f: '#c48a55' }], { k: 'none' }, { k: 'ring', f: '#e7b15a', r: 18, travel: 'x', dx: 170 }, [430, 800]) },
    { id: 'press', name: '压纸', btn: '压', mode: 'beat', diff: 3, bpm: 102, part: 'weight', prop: 'paper', theme: T.paper, music: M.paper, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'desk', x: 400, y: 890, w: 300, h: 16, f: '#d7c4a8' }], { k: 'pivot', x: 340, y: 720, len: 160, rest: -0.35, wind: -0.95, hit: 1.2, f: '#8a5a3a', head: 'stamp' }, { k: 'paper', f: '#f6f1e6', w: 78, h: 96, travel: 'x', dx: 200, behind: true }) },
    { id: 'bubble', name: '戳泡', btn: '戳', mode: 'beat', diff: 3, bpm: 116, part: 'spike', prop: 'bubble', theme: T.water, music: M.water, chart: { k: 'beat1', n: 6 },
      visual: V([{ k: 'spike', x: 400, y: 800, f: '#d5dde8' }], { k: 'none' }, { k: 'bubble', f: '#d7f4ff', r: 22, travel: 'x', dx: 220, pop: true }, [400, 774]) },
    { id: 'pinch', name: '夹豆', btn: '夹', mode: 'pair', diff: 3, bpm: 112, part: 'sticks', prop: 'bean', theme: T.kitchen, music: M.kitchen, chart: { k: 'pair', n: 6 },
      visual: V([{ k: 'dish', x: 400, y: 860, f: '#f6f1e6' }], { k: 'pinch', x: 400, y: 700, len: 130, open: 0.72, close: 0.06, f: '#e7b15a' }, { k: 'bean', f: '#63b85a', r: 10, travel: 'y', dy: -160, behind: true }) },
    { id: 'stamp', name: '盖章', btn: '章', mode: 'beat', diff: 3, bpm: 110, part: 'stamp', prop: 'paper', theme: T.paper, music: M.paper, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'paper', x: 400, y: 860, w: 150, h: 110, f: '#f6f1e6' }], { k: 'none' }, { k: 'stamp', f: '#c23b3b', w: 56, h: 72, travel: 'y', dy: -280 }, [400, 820]) },
    { id: 'zip', name: '拉链', btn: '拉', mode: 'beat', diff: 3, bpm: 114, part: 'teeth', prop: 'pull', theme: T.cloth, music: M.cloth, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'teeth', x: 280, y: 820, w: 240, f: '#d5dde8' }], { k: 'none' }, { k: 'pull', f: '#e7b15a', w: 30, h: 40, travel: 'x', dx: -200 }, [500, 820]) },
    { id: 'marble', name: '弹珠', btn: '珠', mode: 'echo', diff: 3, bpm: 108, part: 'hole', prop: 'marble', theme: T.high, music: M.bright, chart: { k: 'echo1', n: 7 },
      visual: V([{ k: 'groove', x: 220, y: 900, w: 360, f: '#d7c4a8' }, { k: 'hole', x: 500, y: 918 }], { k: 'none' }, { k: 'marble', f: '#7eb6ff', r: 14, travel: 'x', dx: 220 }, [500, 900]) },
    { id: 'sprinkle', name: '浇花', btn: '浇', mode: 'beat', diff: 3, bpm: 100, part: 'soil', prop: 'drop', theme: T.water, music: M.water, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'soil', x: 420, y: 880, f: '#6b4a32' }, { k: 'spout', x: 420, y: 620, f: '#8a8a8a' }], { k: 'none' }, { k: 'drop', f: '#7ec8e3', r: 12, travel: 'y', dy: -240 }, [420, 850]) },
    { id: 'lid', name: '盖锅', btn: '盖', mode: 'beat', diff: 3, bpm: 106, part: 'pot', prop: 'lid', theme: T.kitchen, music: M.kitchen, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'pot', x: 400, y: 860, f: '#6b221c' }], { k: 'none' }, { k: 'lid', f: '#c48a55', r: 48, travel: 'y', dy: -260 }, [400, 828]) },
    { id: 'key', name: '入锁', btn: '锁', mode: 'beat', diff: 3, bpm: 118, part: 'lock', prop: 'key', theme: T.metal, music: M.metal, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'lock', x: 490, y: 800, f: '#d5dde8' }], { k: 'none' }, { k: 'key', f: '#e7b15a', travel: 'x', dx: -230 }, [456, 800]) },
    { id: 'go', name: '落子', btn: '子', mode: 'beat', diff: 3, bpm: 96, part: 'grid', prop: 'stone', theme: T.wood, music: M.wood, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'grid', x: 400, y: 830, f: '#d7c4a8' }], { k: 'none' }, { k: 'pebble', f: '#2a241c', r: 16, travel: 'y', dy: -280 }, [400, 812]) },
    { id: 'hanger', name: '挂钩', btn: '挂', mode: 'beat', diff: 3, bpm: 104, part: 'rail', prop: 'hanger', theme: T.cloth, music: M.cloth, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'rail', x: 400, y: 700, w: 280, f: '#d5dde8' }], { k: 'none' }, { k: 'hanger', f: '#f0943e', travel: 'x', dx: -200 }, [470, 722]) },
    { id: 'drawer', name: '关抽屉', btn: '屉', mode: 'beat', diff: 3, bpm: 120, part: 'cabinet', prop: 'drawer', theme: T.wood, music: M.wood, chart: { k: 'tail', s: 5, p: 2 },
      visual: V([{ k: 'cabinet', x: 330, y: 800, w: 210, h: 170, f: '#8a5a3a' }], { k: 'none' }, { k: 'drawer', f: '#e7b15a', w: 130, h: 78, travel: 'x', dx: 170 }, [430, 800]) },
    { id: 'fan', name: '开扇', btn: '扇', mode: 'beat', diff: 3, bpm: 108, part: 'fan', prop: 'ribbon', theme: T.cloth, music: M.cloth, chart: { k: 'beat1', n: 7 },
      visual: V([], { k: 'hinge', x: 280, y: 800, w: 130, h: 86, rest: -1.35, wind: -1.2, hit: -0.2, f: '#ffb3d0' }, { k: 'ribbon', f: '#ff8fb8', w: 64, h: 16, travel: 'x', dx: 180 }) },
    { id: 'wax', name: '滴蜡', btn: '蜡', mode: 'beat', diff: 3, bpm: 100, part: 'envelope', prop: 'drop', theme: T.paper, music: M.paper, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'envelope', x: 400, y: 850, f: '#f6f1e6' }], { k: 'none' }, { k: 'drop', f: '#c23b3b', r: 13, travel: 'y', dy: -260 }, [400, 800]) },
    { id: 'coin', name: '投币', btn: '币', mode: 'echo', diff: 3, bpm: 120, part: 'jar', prop: 'coin', theme: T.metal, music: M.metal, chart: { k: 'echo1', n: 6 },
      visual: V([{ k: 'jar', x: 400, y: 840, f: '#d5e2f2' }], { k: 'none' }, { k: 'coin', f: '#e7b15a', r: 14, travel: 'y', dy: -280, ey: 20 }, [400, 790]) },
    { id: 'shell', name: '合贝', btn: '贝', mode: 'pair', diff: 3, bpm: 112, part: 'shell', prop: 'pearl', theme: T.water, music: M.water, chart: { k: 'pair', n: 5 },
      visual: V([{ k: 'shell', x: 420, y: 860, f: '#f0d3a2' }], { k: 'hinge', x: 330, y: 830, w: 150, h: 46, rest: -1.15, wind: -1.0, hit: 0.12, f: '#f6f1e6', drive: 'arrive' }, { k: 'pebble', f: '#fff6df', r: 8, travel: 'fixed', ox: 30, oy: 16 }) },
    { id: 'stylus', name: '落针', btn: '针', mode: 'beat', diff: 3, bpm: 106, part: 'arm', prop: 'record', theme: T.wood, music: M.wood, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'record', at: 'tip', oy: 8 }], { k: 'pivot', x: 250, y: 700, len: 190, rest: -0.25, wind: -0.75, hit: 0.62, f: '#d5dde8', head: 'stylus' }, null) },
    { id: 'bowl', name: '保龄', btn: '瓶', mode: 'beat', diff: 3, bpm: 122, part: 'pin', prop: 'ball', theme: T.high, music: M.bright, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'lane', x: 300, y: 900, w: 320, f: '#d7c4a8' }, { k: 'pin', x: 520, y: 850, f: '#f6f1e6' }], { k: 'none' }, { k: 'ball', f: '#3a4a88', r: 22, travel: 'x', dx: -220 }, [490, 868]) },
    { id: 'swing', name: '秋千', btn: '荡', mode: 'pair', diff: 3, bpm: 100, part: 'seat', prop: 'seat', theme: T.wood, music: M.wood, chart: { k: 'pair', n: 6 },
      visual: V([{ k: 'swing', x: 380, y: 640, w: 240, h: 230, f: '#c48a55' }], { k: 'pivot', drive: 'arrive', x: 380, y: 640, len: 200, rest: 1.15, wind: 1.15, hit: 0.28, f: '#e7b15a', head: 'seat' }, null) },
    { id: 'shuttle', name: '接羽', btn: '羽', mode: 'beat', diff: 3, bpm: 116, part: 'racket', prop: 'shuttle', theme: T.high, music: M.bright, chart: { k: 'beat1', n: 7 },
      visual: V([], { k: 'pivot', x: 280, y: 840, len: 160, rest: 0.2, wind: -0.35, hit: -0.75, f: '#f0943e', head: 'racket' }, { k: 'shuttle', f: '#f6f1e6', r: 14, travel: 'y', dy: -280 }) },
    { id: 'nail', name: '敲钉', btn: '钉', mode: 'beat', diff: 3, bpm: 124, part: 'hammer', prop: 'nail', theme: T.wood, music: M.wood, chart: { k: 'tail', s: 5, p: 2 },
      visual: V([{ k: 'board', at: 'tip', oy: 16, w: 180, h: 22, f: '#c48a55' }, { k: 'nail', at: 'tip', f: '#d5dde8' }], { k: 'pivot', x: 240, y: 700, len: 210, rest: -0.3, wind: -0.9, hit: 0.75, f: '#8a5a3a', head: 'hammer' }, null) },
    { id: 'cake', name: '翻饼', btn: '饼', mode: 'pair', diff: 3, bpm: 118, part: 'pan', prop: 'cake', theme: T.kitchen, music: M.kitchen, arc: true, chart: { k: 'pair', n: 6 },
      visual: V([], { k: 'paddle', x: 400, y: 860, f: '#6b221c', w: 150, h: 22 }, { k: 'cake', f: '#e7b15a', r: 22, travel: 'y', dy: -280, ey: -200 }, [400, 808]) },
    { id: 'arrow', name: '射箭', btn: '箭', mode: 'beat', diff: 3, bpm: 126, part: 'target', prop: 'arrow', theme: T.kick, music: M.bright, chart: { k: 'tail', s: 5, p: 2 },
      visual: V([{ k: 'target', x: 530, y: 780 }, { k: 'bow', x: 220, y: 780, f: '#c48a55' }], { k: 'none' }, { k: 'arrow', f: '#e7b15a', travel: 'x', dx: -280 }, [500, 780]) },
    { id: 'book', name: '合书', btn: '书', mode: 'beat', diff: 3, bpm: 98, part: 'cover', prop: 'pages', theme: T.paper, music: M.paper, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'pages', at: 'tip', w: 130, h: 16, f: '#f6f1e6' }], { k: 'hinge', x: 340, y: 820, w: 140, h: 18, rest: -1.2, wind: -1.05, hit: 0.06, f: '#6b4a7a' }, null) },
    { id: 'piano', name: '按键', btn: '键', mode: 'beat', diff: 3, bpm: 120, part: 'hammer', prop: 'key', theme: T.wood, music: M.wood, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'ivory', at: 'tip', oy: 10, w: 78, h: 18, f: '#f6f1e6' }], { k: 'pivot', x: 300, y: 720, len: 150, rest: -0.45, wind: -0.95, hit: 0.9, f: '#d7c4a8', head: 'hammer' }, null) },
    { id: 'egg', name: '入窝', btn: '蛋', mode: 'beat', diff: 3, bpm: 102, part: 'nest', prop: 'egg', theme: T.kitchen, music: M.kitchen, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'nest', x: 420, y: 870, f: '#c48a55' }], { k: 'none' }, { k: 'egg', f: '#f6f1e6', r: 16, travel: 'y', dy: -300, ey: 8 }, [420, 840]) },
    { id: 'latch', name: '插销', btn: '销', mode: 'beat', diff: 3, bpm: 128, part: 'socket', prop: 'bolt', theme: T.metal, music: M.metal, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'socket', x: 520, y: 800, f: '#8a5a3a' }], { k: 'none' }, { k: 'bolt', f: '#d5dde8', w: 78, h: 16, travel: 'x', dx: -210 }, [470, 800]) },
    { id: 'mail', name: '投信', btn: '信', mode: 'beat', diff: 3, bpm: 110, part: 'box', prop: 'letter', theme: T.paper, music: M.paper, chart: { k: 'tail', s: 5, p: 2 },
      visual: V([{ k: 'mailbox', x: 510, y: 800, f: '#c23b3b' }], { k: 'none' }, { k: 'letter', f: '#f6f1e6', w: 40, h: 26, travel: 'x', dx: -240 }, [496, 792]) },
    { id: 'bells', name: '碰铃', btn: '铃', mode: 'pair', diff: 3, bpm: 126, part: 'bell', prop: 'bell', theme: T.metal, music: M.metal, chart: { k: 'pair', n: 6 },
      visual: V([{ k: 'bell', x: 330, y: 790, f: '#e7b15a' }], { k: 'none' }, { k: 'bell', f: '#f0d060', r: 26, travel: 'x', dx: 180 }, [410, 790]) },
    { id: 'leaf', name: '落叶', btn: '叶', mode: 'beat', diff: 3, bpm: 96, part: 'pond', prop: 'leaf', theme: T.water, music: M.water, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'pond', x: 400, y: 880, w: 240, f: '#1c6b8a', ripple: true }], { k: 'none' }, { k: 'leaf', f: '#63b85a', r: 16, travel: 'y', dy: -280 }, [400, 858]) },
    { id: 'cut', name: '剪彩', btn: '剪', mode: 'pair', diff: 3, bpm: 120, part: 'scissors', prop: 'ribbon', theme: T.cloth, music: M.cloth, chart: { k: 'pair', n: 5 },
      visual: V([{ k: 'ribbon', at: 'tip', w: 230, h: 20, f: '#ff8fb8', split: true }], { k: 'pinch', x: 400, y: 690, len: 120, open: 0.62, close: 0.04, f: '#d5dde8' }, null) },
    { id: 'candle', name: '吹烛', btn: '吹', mode: 'beat', diff: 3, bpm: 94, part: 'flame', prop: 'puff', theme: T.paper, music: M.paper, chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'candle', x: 430, y: 796, f: '#f6f1e6', flame: true }], { k: 'none' }, { k: 'puff', f: '#d7f4ff', r: 18, travel: 'x', dx: -180, pop: true }, [430, 760]) },
    { id: 'phone', name: '接听', btn: '接', mode: 'beat', diff: 3, bpm: 100, part: 'phone', prop: 'handset', theme: T.metal, cue: 3,
      music: Object.assign({}, M.metal, { kick: 0.22, snare: 0.08, hat: 0.04, lead: 0.02 }),
      chart: { k: 'beat1', n: 7 },
      visual: V([{ k: 'phone', x: 400, y: 830, f: '#f3e6c8' }], { k: 'none' }, { k: 'handset', f: '#2a241c', w: 108, h: 18, travel: 'y', dy: 78 }, [400, 748]) },

    // 52-54：按 docs/节奏豆豆-五十关进度.md 的目录做，句子四条都不重复
    { id: 'stack', name: '叠碗', btn: '叠', mode: 'beat', diff: 3, bpm: 108, part: 'stack', prop: 'bowl', theme: T.kitchen, music: M.kitchen,
      chart: { raw: [E] },
      visual: V([{ k: 'bowl', x: 400, y: 866, f: '#f6f1e6' }], { k: 'none' }, { k: 'lid', f: '#f6f1e6', r: 46, travel: 'y', dy: -300, ey: 4 }, [400, 858]) },
    { id: 'wipe', name: '擦玻璃', btn: '擦', mode: 'beat', diff: 3, bpm: 104, part: 'cloth', prop: 'glass', theme: T.water, music: M.soft,
      chart: { raw: [E] },
      visual: V([], { k: 'pivot', x: 252, y: 772, len: 168, rest: -0.15, wind: -0.95, hit: 0.2, f: '#8ad0f0', head: 'swat' }, null, [400, 760]) },
    { id: 'button', name: '钉扣', btn: '缝', mode: 'beat', diff: 3, bpm: 112, part: 'needle', prop: 'button', theme: T.cloth, music: M.cloth,
      chart: { raw: [E] },
      visual: V([], { k: 'needle', x: 400, y: 700, len: 150, rest: -0.35, wind: -1.05, hit: 0.4, f: '#d5dde8', head: 'stylus' }, null, [400, 812]) },
  ];

  // 每关一句、一种进场。不要再按 echo/beat/pair 盖成同一句。
  // 进场：fall 加速落下，roll 贴地匀一点，dart 很晚才窜进来，
  // pour 斜着倒，snap 没有外来物、手下得很短，dip 浮子沉，tug 绳坠很短，
  // drift 叶子慢落，open 扇面展开，close 盖上，pop 从下冒出，
  // arc 两下之间走弧，swing 两下之间荡过去。
  // 八分下标 → 一小节；rep 用来把「一句 + 空一小节」重复若干遍（52-54 关用）
  const S = (eighths) => barFromEighths(eighths, 'x');
  const rep = (bars, n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(...bars);
    return out;
  };

  const PLAN = {
    lift: { chart: phrase([[4], [2]]), enter: 'roll' },
    disc: { chart: phrase([[2], [4]]), enter: 'dart' },
    kick: { chart: one([4]), enter: 'roll' },
    drum: { chart: one([0]), enter: 'snap' },
    duck: { chart: one([2]), enter: 'dart' },
    swat: { chart: one([6]), enter: 'fall' },
    high: { chart: one([6]), enter: 'fall' },
    stone: { chart: one([4]), enter: 'roll' },
    sash: { chart: one([4]), enter: 'roll' },
    bump: { chart: rounds([0, 4]), enter: 'arc' },
    mole: { chart: phrase([[0], [4]]), enter: 'pop' },
    rain: { chart: phrase([[6], [4]]), enter: 'fall' },
    lamp: { chart: one([0]), enter: 'tug' },
    knife: { chart: one([6]), enter: 'fall' },
    sling: { chart: one([2]), enter: 'dart' },
    pour: { chart: phrase([[4], [6]]), enter: 'pour' },
    rod: { chart: one([0]), enter: 'dip' },
    knock: { chart: tail([0], [0, 4]), enter: 'dart' },
    press: { chart: one([0]), enter: 'fall' },
    bubble: { chart: one([2]), enter: 'dart' },
    pinch: { chart: phrase([[4], [0]]), enter: 'fall' },
    stamp: { chart: one([0]), enter: 'fall' },
    zip: { chart: one([4]), enter: 'roll' },
    marble: { chart: phrase([[4], [0]]), enter: 'roll' },
    sprinkle: { chart: one([6]), enter: 'fall' },
    lid: { chart: one([6]), enter: 'fall' },
    key: { chart: one([4]), enter: 'roll' },
    go: { chart: one([6]), enter: 'fall' },
    hanger: { chart: one([4]), enter: 'roll' },
    drawer: { chart: tail([4], [2, 6]), enter: 'roll' },
    fan: { chart: one([6]), enter: 'open' },
    wax: { chart: one([6]), enter: 'fall' },
    coin: { chart: phrase([[6], [2]]), enter: 'fall' },
    shell: { chart: phrase([[6], [0]]), enter: 'close' },
    stylus: { chart: one([6]), enter: 'snap' },
    bowl: { chart: one([4]), enter: 'roll' },
    swing: { chart: rounds([0, 6]), enter: 'swing' },
    shuttle: { chart: one([6]), enter: 'fall' },
    nail: { chart: tail([0], [2, 6]), enter: 'snap' },
    cake: { chart: rounds([2, 6]), enter: 'arc' },
    arrow: { chart: tail([2], [0, 4]), enter: 'dart' },
    book: { chart: one([6]), enter: 'close' },
    piano: { chart: one([0]), enter: 'snap' },
    egg: { chart: one([6]), enter: 'fall' },
    latch: { chart: one([4]), enter: 'roll' },
    mail: { chart: tail([2], [2, 6]), enter: 'dart' },
    bells: { chart: phrase([[2], [6]]), enter: 'dart' },
    leaf: { chart: one([6]), enter: 'drift' },
    cut: { chart: phrase([[0], [6]]), enter: 'snap' },
    candle: { chart: one([2]), enter: 'dart' },
    phone: { chart: half([6], [7]), enter: 'snap' },

    // 52 叠碗：第 1 拍一只、第 3 拍一只，下一小节第 4 拍盖上；3 遍后整句挪半拍
    stack: {
      enter: 'fall',
      chart: { raw: [E].concat(
        rep([S([0, 4]), S([6])], 3),
        rep([S([1, 5]), S([7])], 3),
      ) },
    },
    // 53 擦玻璃：从左抹到右、隔一拍抹回来、空一小节；4 遍后两下都晚一拍
    wipe: {
      enter: 'roll',
      chart: { raw: [E].concat(
        rep([S([2, 4]), E], 4),
        rep([S([4, 6]), E], 4),
      ) },
    },
    // 54 钉扣：连缝三针、第 4 拍停、空一小节；4 遍后从第 2 拍起针
    button: {
      enter: 'snap',
      chart: { raw: [E].concat(
        rep([S([0, 2, 4]), E], 4),
        rep([S([2, 4, 6]), E], 4),
      ) },
    },
  };

  SCENES.forEach((s) => {
    const plan = PLAN[s.id];
    if (!plan) throw new Error('缺句子: ' + s.id);
    s.chart = plan.chart;
    s.enter = plan.enter;
  });

  return {
    SCENES, patternOf, polar, angOf, limbAt, sceneU, cueU, actorTip, propHome, propEnds,
  };
}));
