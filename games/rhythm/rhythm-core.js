/* 节奏豆豆 · 纯逻辑：关卡表 / 谱面 / 判定 / 评分 / 校准
   浏览器挂 window.RhythmCore；Node 里 require 可直接跑（test-core.mjs）。
   时间单位：秒（音频时间轴）；判定窗口：毫秒。
   谱面用 16 格 / 小节（十六分网格）：
     x = 你要按，d = 旧的示范记号（现在的关不用），. = 空

   分工不跟某一句走：数拍是 A 的动画，玩家只按「打」。
   B、C、D 只在打之前那零点几秒进动画。没有豆豆示范。
   开头 1 小节是空的，用来听拍子。
   句子和进场跟着情景，不按 mode 盖成同一句。mode 只是选关页上的类型名。
*/
(function (root, factory) {
  const scenes = (typeof module === 'object' && module.exports)
    ? require('./scenes.js')
    : root.RhythmScenes;
  const api = factory(scenes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RhythmCore = api;
}(typeof self !== 'undefined' ? self : this, function (Scenes) {
  'use strict';

  // 判定窗口（毫秒）。短谱一关只有 7 到 12 下，窗口和 S 都按这个放宽。
  // 不错仍算半分。S：准确率 ≥ 85% 且一次失误都没有。
  const WIN = { perfect: 80, good: 150, miss: 220 };


  function countMarks(pattern, ch) {
    let n = 0;
    for (let i = 0; i < pattern.length; i++) {
      const bar = pattern[i];
      for (let j = 0; j < bar.length; j++) if (bar[j] === ch) n++;
    }
    return n;
  }

  function stage(spec) {
    const pattern = Scenes.patternOf(spec.chart);
    const play = countMarks(pattern, 'x');
    const demo = countMarks(pattern, 'd');
    let intro = 0;
    while (intro < pattern.length && !/[xd]/.test(pattern[intro])) intro++;
    return {
      id: spec.id,
      name: spec.name,
      mode: spec.mode,
      diff: spec.diff,
      action: spec.id,
      btn: spec.btn,
      bpm: spec.bpm,
      bars: pattern.length,
      demoBars: intro,
      theme: spec.theme,
      music: spec.music,
      arc: !!spec.arc,
      enter: spec.enter || 'fall',
      cue: spec.cue || 0,
      notes: play,
      notesTotal: play + demo,
      scene: { face: 'side', part: spec.part, prop: spec.prop },
      visual: spec.visual,
      pattern: pattern,
    };
  }

  const LEVELS = (Scenes.SCENES || []).map(stage);

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
    if (acc >= 0.85 && misses === 0) return 'S';
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

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // 动作时钟：strike 在拍点上正好是 1（手落到位）。过冲发生在拍点之后。
  // prevT / nextT 是相邻两个音符的时间；已经到点的音符算 prev，还没到的算 next。
  function cuePose(t, prevT, nextT) {
    let phase = 0;
    if (nextT != null) {
      const spanStart = prevT != null ? prevT : nextT - 0.42;
      const span = nextT - spanStart;
      phase = span > 1e-4 ? clamp01((t - spanStart) / span) : 1;
    } else if (prevT != null) {
      phase = 1;
    }

    if (nextT != null) {
      const anchor = prevT != null ? prevT : nextT - 0.42;
      const gap = Math.max(0.08, nextT - anchor);
      const lead = Math.min(0.42, Math.max(0.12, gap * 0.92));
      // 落点至少留 50ms。快拍如果立刻切下一拍的蓄力，手到位的那一帧会被吃掉。
      let windAt = nextT - lead;
      if (prevT != null) windAt = Math.max(windAt, prevT + 0.05);
      if (windAt > nextT - 0.04) windAt = nextT - 0.04;
      const windSpan = Math.max(0.04, nextT - windAt);
      if (t >= windAt && t < nextT) {
        const u = clamp01((t - windAt) / windSpan);
        const swing = u < 0.32 ? 0 : (u - 0.32) / 0.68;
        return { strike: swing, raise: 1 - swing, phase };
      }
    }

    if (prevT != null && t >= prevT) {
      const age = t - prevT;
      let strike = 0;
      if (age < 0.045) strike = 1 + (age / 0.045) * 0.16;
      else if (age < 0.12) strike = 1.16 - ((age - 0.045) / 0.075) * 0.16;
      else if (age < 0.28) strike = 1 - (age - 0.12) / 0.16;
      return { strike, raise: 0, phase };
    }

    return { strike: 0, raise: 0, phase };
  }

  return {
    WIN, LEVELS,
    levelAt, spbOf, beatsOf, totalOf, isDemoBar,
    buildChart, playNotes, judge, grade, tally, median, calibrate, cuePose,
  };
}));
