/* 节奏豆豆 · 纯逻辑：关卡表 / 谱面 / 判定 / 评分 / 校准
   浏览器挂 window.RhythmCore；Node 里 require 可直接跑（test-core.mjs）。
   时间单位：秒（音频时间轴）；判定窗口：毫秒。
   谱面用 16 格 / 小节（十六分网格）：
     x = 你要按，d = 豆豆示范（不判定、不计分，只做动作和出声），. = 空

   节奏原则：
     - 教学段（1-5 关）：普通段每小节 1 个，2 小节最多 3 个
     - 进阶段（6-10 关）：每拍、反拍、八分（最多 1 小节）
     - 反拍（弱拍）只在少数小节出现，用来拉难度
   三种关卡类型（mode）：
     echo = 模仿关：示范 2 小节 → 跟做 2 小节
     beat = 卡点关：没有示范，开局听 2 小节，然后全程跟豆豆同步
     rush = 连打关：密度递增，一直跟，不能断
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RhythmCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 判定窗口（毫秒）：网页 + 手机触摸抖动大，比原版放宽
  const WIN = { perfect: 60, good: 120, miss: 200 };

  const LEVELS = [
    {
      id: 'clap',
      name: '拍手',
      mode: 'echo',
      diff: 1,
      action: 'clap',
      bpm: 110,
      bars: 15,
      demoBars: 2,
      rollBar: 9,
      theme: { sky: '#0b1220', glow: 'rgba(110,150,235,0.18)', accent: '#ffd166' },
      music: {
        kick: 0.5, snare: 0.24, hat: 0.1, lead: 0.055, style: 'soft',
        chords: [-12, -16, -9, -14], scale: [0, 3, 5, 7, 10],
      },
      pattern: [
        '................',
        '................',
        'd...............',
        'd...............',
        'x...............',
        'x...............',
        'd.......d.......',
        'd...............',
        'x.......x.......',
        'x...............',
        'd...d...d...d...',
        'd...d...d...d...',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...............',
      ],
    },
    {
      id: 'nod',
      name: '点头',
      mode: 'beat',
      diff: 1,
      action: 'nod',
      bpm: 96,
      bars: 14,
      demoBars: 2,
      rollBar: 9,
      theme: { sky: '#140f08', glow: 'rgba(255,190,110,0.18)', accent: '#ffc46b' },
      music: {
        kick: 0.46, snare: 0.2, hat: 0.08, lead: 0.06, style: 'warm',
        chords: [-7, -11, -4, -9], scale: [0, 2, 3, 5, 7, 8, 10],
      },
      pattern: [
        '................',
        '................',
        'x...............',
        'x...............',
        'x...............',
        'x...............',
        'x.......x.......',
        'x...............',
        'x.......x.......',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x...x...x...',
      ],
    },
    {
      id: 'jump',
      name: '跳绳',
      mode: 'echo',
      diff: 2,
      action: 'jump',
      bpm: 132,
      bars: 16,
      demoBars: 2,
      rollBar: 9,
      theme: { sky: '#061714', glow: 'rgba(90,230,190,0.16)', accent: '#7ff0cf' },
      music: {
        kick: 0.52, snare: 0.26, hat: 0.11, lead: 0.055, style: 'bright',
        chords: [-5, -9, -2, -7], scale: [0, 2, 3, 5, 7, 8, 10],
      },
      pattern: [
        '................',
        '................',
        'd...............',
        'd...............',
        'x...............',
        'x...............',
        'd.......d.......',
        'd...............',
        'x.......x.......',
        'x...............',
        'd...d...d...d...',
        'd...d...d...d...',
        'x...x...x...x...',
        'x...x...x...x...',
        'd...............',
        'x...............',
      ],
    },
    {
      id: 'drum',
      name: '打鼓',
      mode: 'beat',
      diff: 3,
      action: 'hit',
      bpm: 140,
      bars: 16,
      demoBars: 2,
      rollBar: 9,
      theme: { sky: '#150a0c', glow: 'rgba(255,110,110,0.16)', accent: '#ff9a8a' },
      music: {
        kick: 0.6, snare: 0.3, hat: 0.12, lead: 0.05, style: 'heavy',
        chords: [-9, -13, -6, -11], scale: [0, 3, 5, 6, 7, 10],
      },
      pattern: [
        '................',
        '................',
        'x...............',
        'x...............',
        'x.......x.......',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...............',
        'x...............',
        'x...x...x.x.x...',
        'x...x...x...x...',
        'x...............',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
      ],
    },
    {
      id: 'rush',
      name: '冲刺',
      mode: 'rush',
      diff: 3,
      action: 'jump',
      bpm: 150,
      bars: 16,
      demoBars: 2,
      rollBar: 5,
      theme: { sky: '#0d0a1a', glow: 'rgba(180,120,255,0.16)', accent: '#c9a6ff' },
      music: {
        kick: 0.55, snare: 0.28, hat: 0.13, lead: 0.05, style: 'rush',
        chords: [-3, -7, 2, -5], scale: [0, 2, 3, 5, 7, 8, 11],
      },
      pattern: [
        '................',
        '................',
        'x...............',
        'x...............',
        'x.......x.......',
        'x...............',
        'x...x...x.x.x...',
        'x...x...x...x...',
        'x...............',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x...x...x...',
        'x...............',
        'x...............',
      ],
    },

    /* ---------- 进阶：6-10 关 ---------- */

    {
      id: 'spin',
      name: '转圈',
      mode: 'beat',
      diff: 3,
      action: 'spin',
      bpm: 120,
      bars: 16,
      demoBars: 2,
      rollBar: 7,
      theme: { sky: '#101a0c', glow: 'rgba(190,230,120,0.16)', accent: '#c8f07a' },
      music: {
        kick: 0.54, snare: 0.27, hat: 0.11, lead: 0.055, style: 'bright',
        chords: [-2, -7, 0, -5], scale: [0, 2, 4, 7, 9],
      },
      pattern: [
        '................',
        '................',
        'x.......x.......',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
        'x.......x.......',
        'x...............',
        'x...x...x.x.x...',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x...x...x...',
        'x.......x.......',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
      ],
    },
    {
      id: 'lean',
      name: '摇摆',
      mode: 'beat',
      diff: 3,
      action: 'lean',
      bpm: 130,
      bars: 16,
      demoBars: 2,
      rollBar: 9,
      theme: { sky: '#0c1420', glow: 'rgba(120,200,255,0.16)', accent: '#8fd4ff' },
      music: {
        kick: 0.56, snare: 0.28, hat: 0.12, lead: 0.055, style: 'bright',
        chords: [-10, -5, -12, -7], scale: [0, 2, 3, 5, 7, 9, 10],
      },
      pattern: [
        '................',
        '................',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x.......x.......',
        'x...............',
        'x...x...x.x.x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x...x...x...',
        'x.......x.......',
        'x...............',
      ],
    },
    {
      id: 'pulse',
      name: '弹跳',
      mode: 'rush',
      diff: 3,
      action: 'pulse',
      bpm: 140,
      bars: 16,
      demoBars: 2,
      rollBar: 9,
      theme: { sky: '#1a1008', glow: 'rgba(255,170,90,0.16)', accent: '#ffb066' },
      music: {
        kick: 0.58, snare: 0.29, hat: 0.12, lead: 0.05, style: 'heavy',
        chords: [-4, -9, -2, -7], scale: [0, 2, 4, 5, 7, 9],
      },
      pattern: [
        '................',
        '................',
        'x.......x.......',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x...x...x...',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x.......x.......',
        'x...............',
      ],
    },
    {
      id: 'shake',
      name: '抖动',
      mode: 'rush',
      diff: 3,
      action: 'shake',
      bpm: 150,
      bars: 16,
      demoBars: 2,
      rollBar: 5,
      theme: { sky: '#1a0a14', glow: 'rgba(255,120,200,0.16)', accent: '#ff8fd0' },
      music: {
        kick: 0.6, snare: 0.3, hat: 0.13, lead: 0.05, style: 'rush',
        chords: [-7, -12, -5, -10], scale: [0, 1, 3, 5, 7, 8, 10],
      },
      pattern: [
        '................',
        '................',
        'x...x...x...x...',
        'x...x...x...x...',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x...x...x...',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x...x...x...',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x...x...x...',
      ],
    },
    {
      id: 'crazy',
      name: '疯狂',
      mode: 'rush',
      diff: 3,
      action: 'spin',
      bpm: 160,
      bars: 16,
      demoBars: 2,
      rollBar: 4,
      theme: { sky: '#12061a', glow: 'rgba(200,120,255,0.18)', accent: '#d9a6ff' },
      music: {
        kick: 0.62, snare: 0.32, hat: 0.14, lead: 0.05, style: 'rush',
        chords: [-6, -10, -3, -8], scale: [0, 1, 3, 5, 6, 8, 10],
      },
      pattern: [
        '................',
        '................',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x.x.x...x...',
        'x...x...x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x...x...x...',
        'x...x.x.x...x...',
        'x.x.x.x.x.x.x.x.',
        'x...x...x...x...',
        'x.......x.......',
      ],
    },
    {
      id: 'catch',
      name: '接球',
      mode: 'beat',
      diff: 3,
      action: 'catch',
      bpm: 120,
      bars: 16,
      demoBars: 2,
      rollBar: 9,
      theme: { sky: '#0c1622', glow: 'rgba(120,200,255,0.16)', accent: '#9fd8ff' },
      music: {
        kick: 0.5, snare: 0.24, hat: 0.1, lead: 0.055, style: 'soft',
        chords: [-8, -12, -5, -10], scale: [0, 2, 4, 6, 7, 9],
      },
      pattern: [
        '................',
        '................',
        'x.......x.......',
        'x...............',
        'x.......x.......',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
        'x.......x.......',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
        'x.......x.......',
        'x...............',
        'x...x...x...x...',
        'x...x...x...x...',
      ],
    },
  ];

  function levelAt(i) {
    const lv = LEVELS[i | 0];
    return lv || LEVELS[0];
  }

  function spbOf(lv) { return 60 / lv.bpm; }
  function beatsOf(lv) { return lv.bars * 4; }
  function totalOf(lv) { return beatsOf(lv) * spbOf(lv); }

  function isDemoBar(lv, bar) {
    const pat = lv.pattern[bar];
    return !!pat && pat.indexOf('d') >= 0;
  }

  function buildChart(level) {
    const lv = levelAt(level || 0);
    const spb = spbOf(lv);
    const notes = [];
    for (let bar = 0; bar < lv.pattern.length; bar++) {
      const pat = lv.pattern[bar];
      for (let i = 0; i < 16; i++) {
        const ch = pat[i];
        if (ch !== 'x' && ch !== 'd') continue;
        const beat = bar * 4 + i * 0.25;
        notes.push({
          beat,
          t: +(beat * spb).toFixed(6),
          bar,
          slot: i,
          demo: ch === 'd',
        });
      }
    }
    return notes;
  }

  function playNotes(chart) {
    return chart.filter((n) => !n.demo);
  }

  function judge(dtMs) {
    const a = Math.abs(dtMs);
    if (a <= WIN.perfect) return 'perfect';
    if (a <= WIN.good) return 'good';
    if (a <= WIN.miss) return 'miss';
    return 'far';
  }

  function grade(acc, misses) {
    if (acc >= 0.95 && misses === 0) return 'S';
    if (acc >= 0.85) return 'A';
    if (acc >= 0.70) return 'B';
    if (acc >= 0.50) return 'C';
    return 'D';
  }

  function tally(list) {
    let perfect = 0, good = 0, miss = 0, none = 0, combo = 0, maxCombo = 0;
    for (const r of list) {
      if (r === 'perfect') { perfect++; combo++; }
      else if (r === 'good') { good++; combo++; }
      else if (r === 'miss') { miss++; combo = 0; }
      else { none++; combo = 0; }
      if (combo > maxCombo) maxCombo = combo;
    }
    const total = list.length;
    const acc = total ? (perfect + good * 0.5) / total : 0;
    return {
      perfect, good, miss, none, total,
      maxCombo, acc,
      grade: grade(acc, miss + none),
    };
  }

  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function calibrate(samples) {
    const s = samples.slice(2).filter((v) => Number.isFinite(v) && Math.abs(v) <= 250);
    if (s.length < 3) return 0;
    return Math.round(median(s));
  }

  return {
    WIN, LEVELS,
    levelAt, spbOf, beatsOf, totalOf, isDemoBar,
    buildChart, playNotes, judge, grade, tally, median, calibrate,
  };
}));
