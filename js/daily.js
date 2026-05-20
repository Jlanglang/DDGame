/**
 * 每日挑战：固定关卡，全员同题，完成得 SSS×1
 * TEST_UNLIMITED_PLAYS=true 时：不限次数，难度为普通第 1 关（便于测试）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GameDaily = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** 测试用：关闭「每日一次」限制 */
  const TEST_UNLIMITED_PLAYS = false;

  const MODE_ID = TEST_UNLIMITED_PLAYS ? 'normal' : 'hard';
  /** 普通第 1 关 / 困难第 3 关（stage 索引） */
  const DAILY_STAGE_INDEX = TEST_UNLIMITED_PLAYS ? 0 : 2;

  function dateKey(d) {
    const x = d || new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleSeeded(arr, seed) {
    const a = arr.slice();
    const rnd = mulberry32(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getDailyLevel() {
    const data =
      typeof window !== 'undefined' ? window.LEVELS_DATA : null;
    const normalLv = data?.levels?.[DAILY_STAGE_INDEX];
    const modeLv = data?.modeLevels?.[MODE_ID]?.[DAILY_STAGE_INDEX];
    const embedded = MODE_ID === 'normal' ? normalLv || modeLv : modeLv;

    if (embedded) {
      return {
        id: embedded.id ?? (DAILY_STAGE_INDEX + 1),
        name: embedded.name || `第 ${DAILY_STAGE_INDEX + 1} 关`,
        pairs: embedded.pairs,
        timeLimit: embedded.timeLimit,
        moveLimit: embedded.moveLimit,
        stage: embedded.stage ?? DAILY_STAGE_INDEX + 1,
        difficulty: MODE_ID,
        difficultyLabel: embedded.difficultyLabel || '入门',
      };
    }
    if (typeof Difficulty !== 'undefined' && Difficulty.forStage) {
      const cfg = Difficulty.forStage(MODE_ID, DAILY_STAGE_INDEX);
      return {
        ...cfg,
        id: DAILY_STAGE_INDEX + 1,
        name: `第 ${DAILY_STAGE_INDEX + 1} 关`,
        difficulty: MODE_ID,
      };
    }
    if (MODE_ID === 'normal') {
      return {
        id: 1,
        name: '第 1 关',
        pairs: 4,
        timeLimit: 80,
        moveLimit: 17,
        stage: 1,
        difficulty: MODE_ID,
        difficultyLabel: '入门',
      };
    }
    return {
      id: 3,
      name: '第 3 关',
      pairs: 10,
      timeLimit: 77,
      moveLimit: 30,
      stage: 3,
      difficulty: MODE_ID,
      difficultyLabel: '熟练',
    };
  }

  function uniqueImageCount(pairs, stage) {
    const maxStage =
      typeof Difficulty !== 'undefined' ? Difficulty.levelsForMode(MODE_ID) : 3;
    const progress = maxStage <= 1 ? 1 : (stage - 1) / (maxStage - 1);
    const minRatio = 0.35;
    const maxRatio = 1;
    const ratio = minRatio + progress * (maxRatio - minRatio);
    const unique = Math.ceil(pairs * ratio);
    return Math.max(2, Math.min(pairs, unique));
  }

  function getConfig(tilePool, key) {
    const dk = key || dateKey();
    const seed = hashSeed('doudou-daily-' + dk);
    const level = getDailyLevel();
    const pairs = level.pairs;
    const pool = tilePool.length ? tilePool : [];

    const normalized =
      typeof TileRarity !== 'undefined' ? TileRarity.normalizeTiles(pool) : pool;
    const pickRnd = mulberry32(seed + 1);
    const uniqueN = uniqueImageCount(pairs, level.stage || 1);
    let images = [];
    if (typeof TileRarity !== 'undefined') {
      images = TileRarity.pickWeightedWithDupes(
        normalized,
        pairs,
        uniqueN,
        () => pickRnd()
      );
    } else if (normalized.length) {
      const remaining = normalized.slice();
      const n = Math.min(pairs, remaining.length);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(pickRnd() * remaining.length);
        const item = remaining.splice(idx, 1)[0];
        images.push(typeof item === 'string' ? item : item.src);
      }
      while (images.length < pairs) {
        const item = normalized[Math.floor(pickRnd() * normalized.length)];
        images.push(typeof item === 'string' ? item : item.src);
      }
    }

    const deckSeed = seed + 2;
    return {
      dateKey: dk,
      pairs,
      images,
      deckSeed,
      level,
      modeId: MODE_ID,
      rewardSss: 1,
    };
  }

  function buildDeck(images, deckSeed) {
    const deck = [];
    images.forEach((src, pairId) => {
      deck.push({ pairId, src });
      deck.push({ pairId, src });
    });
    return shuffleSeeded(deck, deckSeed);
  }

  function isUnlimitedPlays() {
    return TEST_UNLIMITED_PLAYS;
  }

  function isDoneToday() {
    if (TEST_UNLIMITED_PLAYS) return false;
    if (typeof Progress === 'undefined') return false;
    return Boolean(Progress.getDailyRecord(dateKey()));
  }

  return {
    dateKey,
    getConfig,
    buildDeck,
    hashSeed,
    getDailyLevel,
    getHardLevel3: getDailyLevel,
    isDoneToday,
    isUnlimitedPlays,
    MODE_ID,
    DAILY_STAGE_INDEX,
    HARD_STAGE_INDEX: DAILY_STAGE_INDEX,
    TEST_UNLIMITED_PLAYS,
  };
});

