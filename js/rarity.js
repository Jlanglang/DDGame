/**
 * 表情包稀有度与加权抽取（A / R / SR / SSR）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TileRarity = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TIERS = ['A', 'R', 'SR', 'SSR'];

  /** 单张图被抽中的相对权重（可重复对局） */
  const PICK_WEIGHT = {
    A: 50,
    R: 30,
    SR: 15,
    SSR: 5,
  };

  const TIER_LABEL = {
    A: '普通',
    R: '稀有',
    SR: '超稀有',
    SSR: '传说',
  };

  function isValidTier(t) {
    return TIERS.includes(t);
  }

  /** 按图池序号分配固定稀有度（约 50% / 30% / 15% / 5%） */
  function assignRarityByIndex(index, total) {
    const n = Math.max(1, total);
    const p = (index + 0.5) / n;
    if (p < 0.5) return 'A';
    if (p < 0.8) return 'R';
    if (p < 0.95) return 'SR';
    return 'SSR';
  }

  function normalizeTiles(raw) {
    if (!raw || !raw.length) return [];
    return raw.map((item, i, arr) => {
      if (typeof item === 'string') {
        return {
          src: item,
          rarity: assignRarityByIndex(i, arr.length),
        };
      }
      const src = item.src || item.path || '';
      return {
        src,
        rarity: isValidTier(item.rarity) ? item.rarity : assignRarityByIndex(i, arr.length),
      };
    });
  }

  function getSrc(tile) {
    return typeof tile === 'string' ? tile : tile.src;
  }

  function weightOf(tile) {
    const r = typeof tile === 'string' ? 'A' : tile.rarity;
    return PICK_WEIGHT[r] ?? PICK_WEIGHT.A;
  }

  function pickOne(pool, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    if (!pool.length) return null;
    const weights = pool.map(weightOf);
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return getSrc(pool[i]);
    }
    return getSrc(pool[pool.length - 1]);
  }

  /** 有放回加权抽取 */
  function pickWeighted(pool, count, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const images = [];
    for (let i = 0; i < count; i++) {
      const src = pickOne(pool, random);
      if (src) images.push(src);
    }
    return images;
  }

  /** 无放回加权抽取（教程等） */
  function pickWeightedUnique(pool, count, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const remaining = pool.slice();
    const images = [];
    const n = Math.min(count, remaining.length);
    for (let i = 0; i < n; i++) {
      const src = pickOne(remaining, random);
      if (!src) break;
      images.push(src);
      const idx = remaining.findIndex((t) => getSrc(t) === src);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    return images;
  }

  /** 先无放回，图池不足时再有权补足 */
  function pickWeightedUniqueFill(pool, count, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const images = pickWeightedUnique(pool, count, random);
    while (images.length < count) {
      const src = pickOne(pool, random);
      if (!src) break;
      images.push(src);
    }
    return images;
  }

  /**
   * 先抽 uniqueCount 种图，再重复填满 pairs 槽（同图可对应多对，按图配对）
   * @param {number} uniqueCount 不同表情包种类数（越小重复越多、越简单）
   */
  function pickWeightedWithDupes(pool, pairs, uniqueCount, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const n = Math.max(2, Math.min(pairs, uniqueCount));
    const base = pickWeightedUnique(pool, n, random);
    if (!base.length) return [];
    const images = base.slice();
    while (images.length < pairs) {
      images.push(base[Math.floor(random() * base.length)]);
    }
    return images;
  }

  function rarityLabel(tier) {
    return TIER_LABEL[tier] || tier;
  }

  function pickWeightText() {
    return TIERS.map((t) => `${t} ${PICK_WEIGHT[t]}%`).join(' · ');
  }

  return {
    TIERS,
    PICK_WEIGHT,
    assignRarityByIndex,
    normalizeTiles,
    getSrc,
    pickOne,
    pickWeighted,
    pickWeightedUnique,
    pickWeightedUniqueFill,
    pickWeightedWithDupes,
    rarityLabel,
    pickWeightText,
  };
});
