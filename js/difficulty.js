/**
 * 各模式关卡数不同，难度随关卡递增（对数 + 限时/限步/惩罚时间）
 * 普通 3 关 · 困难 4 关 · 挑战 5 关
 * generate-manifest 与 game 共用
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Difficulty = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEVELS_PER_MODE = {
    normal: 3,
    hard: 4,
    challenge: 5,
  };

  const STAGE_LABELS = ['入门', '进阶', '熟练', '困难', '专家'];

  /** 每模式对数（逐关递增，长度与 LEVELS_PER_MODE 一致） */
  const MODE_PLANS = {
    normal: { pairsByStage: [4, 6, 8] },
    hard: { pairsByStage: [6, 8, 10, 12] },
    challenge: {
      pairsByStage: [8, 10, 12, 14, 16],
      idleByStage: [12, 11, 10, 9, 8],
    },
  };

  function levelsForMode(modeId) {
    return LEVELS_PER_MODE[modeId] ?? LEVELS_PER_MODE.normal;
  }

  const TIME_BASE = 24;
  const TIME_PER_PAIR = 14;
  const MOVE_BASE = 6;
  const MOVE_PER_PAIR = 2.6;

  /** 同模式内每进阶一关：在基础公式上再略收紧 */
  const STAGE_TIME_FACTOR = 0.97;
  const STAGE_MOVE_REDUCTION = 1;

  /** 模式限时倍率（困难模式时间减半） */
  const MODE_TIME_FACTOR = {
    normal: 1,
    hard: 0.5,
    challenge: 1,
  };

  function allPairCounts() {
    const set = new Set();
    Object.values(MODE_PLANS).forEach((plan) => {
      plan.pairsByStage.forEach((p) => set.add(p));
    });
    return [...set].sort((a, b) => a - b);
  }

  function forStage(modeId, stageIndex) {
    const plan = MODE_PLANS[modeId] || MODE_PLANS.normal;
    const maxStage = levelsForMode(modeId) - 1;
    const stage = Math.max(0, Math.min(stageIndex, maxStage));
    const pairs = plan.pairsByStage[stage];
    const modeTimeFactor = MODE_TIME_FACTOR[modeId] ?? 1;
    const timeLimit = Math.max(
      30,
      Math.round(
        (TIME_BASE + pairs * TIME_PER_PAIR) *
          Math.pow(STAGE_TIME_FACTOR, stage) *
          modeTimeFactor
      )
    );
    const moveLimit = Math.max(
      pairs + 2,
      Math.ceil(MOVE_BASE + pairs * MOVE_PER_PAIR) - stage * STAGE_MOVE_REDUCTION
    );
    const out = {
      pairs,
      difficulty: modeId,
      difficultyLabel: STAGE_LABELS[stage],
      timeLimit,
      moveLimit,
      stage: stage + 1,
    };
    if (plan.idleByStage) {
      out.idleSeconds = plan.idleByStage[stage];
    }
    return out;
  }

  /** 每日等：按对数映射到最近一档 */
  function tierForPairs(pairs) {
    const n = Math.max(2, Math.floor(pairs));
    const counts = allPairCounts();
    let best = counts[0];
    for (const p of counts) {
      if (n >= p) best = p;
    }
    return { pairs: best };
  }

  function forPairs(pairs) {
    const n = Math.max(2, Math.floor(pairs));
    for (const modeId of Object.keys(MODE_PLANS)) {
      const plan = MODE_PLANS[modeId];
      const idx = plan.pairsByStage.indexOf(n);
      if (idx >= 0) return forStage(modeId, idx);
    }
    const { pairs: nearest } = tierForPairs(n);
    for (const modeId of Object.keys(MODE_PLANS)) {
      const idx = MODE_PLANS[modeId].pairsByStage.indexOf(nearest);
      if (idx >= 0) return forStage(modeId, idx);
    }
    return forStage('normal', 0);
  }

  function buildModeLevels(modeId) {
    const levels = [];
    const n = levelsForMode(modeId);
    for (let s = 0; s < n; s++) {
      const cfg = forStage(modeId, s);
      const id = s + 1;
      levels.push({
        id,
        name: `第 ${id} 关`,
        pairs: cfg.pairs,
        difficulty: cfg.difficulty,
        difficultyLabel: cfg.difficultyLabel,
        timeLimit: cfg.timeLimit,
        moveLimit: cfg.moveLimit,
        stage: cfg.stage,
        ...(cfg.idleSeconds != null ? { idleSeconds: cfg.idleSeconds } : {}),
      });
    }
    return levels;
  }

  return {
    LEVELS_PER_MODE,
    levelsForMode,
    MODE_PLANS,
    STAGE_LABELS,
    allPairCounts,
    tierForPairs,
    forStage,
    forPairs,
    buildModeLevels,
  };
});
