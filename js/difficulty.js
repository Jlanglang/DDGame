/**
 * 按对数配置难度、限时、限步（generate-manifest 与 game 共用）
 *
 * 对数越多 → 时间越长、步数越多、难度档位越高
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Difficulty = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** 难度档位：按对数上限匹配 */
  const TIERS = [
    { maxPairs: 3, id: 'easy', label: '简单' },
    { maxPairs: 6, id: 'normal', label: '一般' },
    { maxPairs: 9, id: 'hard', label: '困难' },
    { maxPairs: 99, id: 'expert', label: '挑战' },
  ];

  /** 时间 = 基础秒数 + 每对额外秒数 */
  const TIME_BASE = 16;
  const TIME_PER_PAIR = 12;

  /** 步数 = 基础 + 每对步数（约等于完美局×2 的缓冲） */
  const MOVE_BASE = 4;
  const MOVE_PER_PAIR = 2.2;

  function tierForPairs(pairs) {
    return TIERS.find((t) => pairs <= t.maxPairs) || TIERS[TIERS.length - 1];
  }

  function forPairs(pairs) {
    const n = Math.max(2, Math.floor(pairs));
    const tier = tierForPairs(n);
    return {
      pairs: n,
      difficulty: tier.id,
      difficultyLabel: tier.label,
      timeLimit: Math.round(TIME_BASE + n * TIME_PER_PAIR),
      moveLimit: Math.ceil(MOVE_BASE + n * MOVE_PER_PAIR),
    };
  }

  return { forPairs, TIERS };
});
