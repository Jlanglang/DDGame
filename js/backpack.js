/**
 * 背包：每张卡 A / S / SS 碎片，通关按模式概率掉落
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Backpack = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GRADES = ['A', 'S', 'SS'];

  /** 碎片数量无上限，每级单槽展示累计数量 */

  const GRADE_LABEL = { A: 'A级', S: 'S级', SS: 'SS级', SSS: 'SSS级' };

  /** 槽位顶栏标识 */
  const GRADE_SLOT_TAG = { A: 'A', S: 'S', SS: 'SS', SSS: 'SSS' };

  /** 合成产物固定等级 */
  const SYNTH_RESULT_GRADE = 'SSS';

  /** 唯一 SSS 卡（固定 25.png，不进入碎片掉落池） */
  const SSS_CARD_SRC = 'assets/tiles/25.png';
  const LEGACY_SSS_CARD_SRC = 'assets/tiles/15.png';

  /** 单次合成消耗（同一张卡） */
  const SYNTH_COST = { A: 4, S: 2, SS: 1 };

  /** 抽奖消耗：SSS 专属卡数量 */
  const LOTTERY_SSS_COST = 1;

  /** 各模式单次通关掉落碎片数量 */
  const DROP_COUNT = {
    normal: 2,
    hard: 4,
    challenge: 8,
    daily: 2,
  };

  /** 各模式关卡数（与 difficulty.js 一致，用于 stage 上限） */
  const LEVELS_PER_MODE = { normal: 3, hard: 4, challenge: 5, daily: 3 };

  /**
   * 碎片掉落概率（%），整数。
   * 普通/每日：固定；困难/挑战：S 固定，SS 随关卡 +1%/关，余量为 A。
   */
  const DROP_RATES = {
    normal: { A: 90, S: 10, SS: 0 },
    daily: { A: 90, S: 10, SS: 0 },
    hard: { A: 90, S: 9, SS: 1, ssPerStage: 1 },
    challenge: { A: 80, S: 15, SS: 5, ssPerStage: 1 },
  };

  function emptyCounts() {
    return { A: 0, S: 0, SS: 0 };
  }

  function migrateFromGallery(meta) {
    if (!meta || meta.backpack) return meta?.backpack || {};
    const backpack = {};
    (meta.gallery || []).forEach((src) => {
      backpack[src] = { A: 1, S: 0, SS: 0 };
    });
    if (typeof Progress !== 'undefined') {
      Progress.setMeta({ backpack, gallery: undefined });
    }
    return backpack;
  }

  function getBackpack() {
    if (typeof Progress === 'undefined') return {};
    const meta = Progress.getMeta();
    if (!meta.backpack) return migrateFromGallery(meta);
    return meta.backpack;
  }

  function saveBackpack(backpack) {
    if (typeof Progress !== 'undefined') {
      Progress.setMeta({ backpack });
    }
  }

  function getCounts(src) {
    const bag = getBackpack();
    return { ...emptyCounts(), ...(bag[src] || {}) };
  }

  function addFragment(src, grade, amount = 1) {
    if (!src || isSssCardSrc(src) || !GRADES.includes(grade) || amount < 1) return;
    const bag = { ...getBackpack() };
    const cur = { ...emptyCounts(), ...(bag[src] || {}) };
    cur[grade] = (cur[grade] || 0) + amount;
    bag[src] = cur;
    saveBackpack(bag);
  }

  function isSssCardSrc(src) {
    return src === SSS_CARD_SRC;
  }

  function migrateSynthesized(syn) {
    const out = { ...(syn || {}) };
    let moved = 0;
    if (out[LEGACY_SSS_CARD_SRC]) {
      moved += out[LEGACY_SSS_CARD_SRC];
      delete out[LEGACY_SSS_CARD_SRC];
    }
    Object.keys(out).forEach((k) => {
      if (k === SSS_CARD_SRC) return;
      moved += out[k] || 0;
      delete out[k];
    });
    if (moved > 0) {
      out[SSS_CARD_SRC] = (out[SSS_CARD_SRC] || 0) + moved;
      if (typeof Progress !== 'undefined') {
        Progress.setMeta({ synthesized: out });
      }
    }
    return out;
  }

  function getSynthesized() {
    if (typeof Progress === 'undefined') return {};
    const raw = Progress.getMeta().synthesized || {};
    return migrateSynthesized(raw);
  }

  function getSynthCount(src) {
    if (src && !isSssCardSrc(src)) return 0;
    return getSynthesized()[SSS_CARD_SRC] || 0;
  }

  function maxSynthPossible(counts) {
    const c = { ...emptyCounts(), ...counts };
    return Math.min(
      Math.floor((c.A || 0) / SYNTH_COST.A),
      Math.floor((c.S || 0) / SYNTH_COST.S),
      Math.floor((c.SS || 0) / SYNTH_COST.SS)
    );
  }

  function canSynth(src) {
    return maxSynthPossible(getCounts(src)) > 0;
  }

  function synthCostText() {
    return `${SYNTH_COST.A}A + ${SYNTH_COST.S}S + ${SYNTH_COST.SS}SS → ${SYNTH_RESULT_GRADE}`;
  }

  function getSssCount(src) {
    void src;
    return getSynthCount(SSS_CARD_SRC);
  }

  function addSssCount(amount = 1) {
    if (amount < 1) return;
    const synthesized = { ...getSynthesized() };
    synthesized[SSS_CARD_SRC] = (synthesized[SSS_CARD_SRC] || 0) + amount;
    if (typeof Progress !== 'undefined') {
      Progress.setMeta({ synthesized });
    }
  }

  /** 调试用：直接设置 SSS 卡数量 */
  function setSssCount(count) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const synthesized = { ...getSynthesized() };
    if (n <= 0) {
      delete synthesized[SSS_CARD_SRC];
    } else {
      synthesized[SSS_CARD_SRC] = n;
    }
    if (typeof Progress !== 'undefined') {
      Progress.setMeta({ synthesized });
    }
    return n;
  }

  function consumeSssCount(amount = LOTTERY_SSS_COST) {
    const n = getSssCount();
    if (n < amount) return false;
    const synthesized = { ...getSynthesized() };
    const left = n - amount;
    if (left <= 0) {
      delete synthesized[SSS_CARD_SRC];
    } else {
      synthesized[SSS_CARD_SRC] = left;
    }
    if (typeof Progress !== 'undefined') {
      Progress.setMeta({ synthesized });
    }
    return true;
  }

  function synthOnce(src) {
    if (!src || isSssCardSrc(src) || !canSynth(src)) return false;
    const bag = { ...getBackpack() };
    const cur = { ...emptyCounts(), ...(bag[src] || {}) };
    cur.A -= SYNTH_COST.A;
    cur.S -= SYNTH_COST.S;
    cur.SS -= SYNTH_COST.SS;
    if (cur.A + cur.S + cur.SS <= 0) {
      delete bag[src];
    } else {
      bag[src] = cur;
    }
    saveBackpack(bag);

    addSssCount(1);
    return true;
  }

  function lotteryCostText() {
    return `SSS卡 ×${LOTTERY_SSS_COST}`;
  }

  function maxLotteryPossible() {
    return Math.floor(getSssCount() / LOTTERY_SSS_COST);
  }

  function canLottery() {
    return getSssCount() >= LOTTERY_SSS_COST;
  }

  function lotteryOnce(rng) {
    if (!canLottery() || !consumeSssCount(LOTTERY_SSS_COST)) {
      return { ok: false, reason: 'no_sss' };
    }

    if (typeof LotteryRewards === 'undefined') {
      return { ok: false, reason: 'no_lottery' };
    }
    const item = LotteryRewards.roll(rng);
    const record = LotteryRewards.addRecord(item, SSS_CARD_SRC);
    return { ok: true, item, record };
  }

  function totalSynthesized() {
    let n = 0;
    Object.values(getSynthesized()).forEach((v) => {
      n += v || 0;
    });
    return n;
  }

  function synthesizedCardCount() {
    return Object.values(getSynthesized()).filter((v) => v > 0).length;
  }

  function applyDrops(drops) {
    drops.forEach((d) => addFragment(d.src, d.grade, d.count || 1));
  }

  function dropCountForMode(modeId) {
    return DROP_COUNT[modeId] ?? DROP_COUNT.normal;
  }

  function maxStageIndex(modeId) {
    let n = LEVELS_PER_MODE[modeId] ?? LEVELS_PER_MODE.normal;
    if (typeof Difficulty !== 'undefined' && Difficulty.levelsForMode) {
      n = Difficulty.levelsForMode(modeId);
    }
    return Math.max(0, n - 1);
  }

  function weightsFor(modeId, stageIndex = 0) {
    const stage = Math.max(0, Math.min(maxStageIndex(modeId), Math.floor(stageIndex)));
    const plan = DROP_RATES[modeId] || DROP_RATES.normal;

    if (plan.ssPerStage == null) {
      return { A: plan.A, S: plan.S, SS: plan.SS };
    }

    const ss = plan.SS + stage * plan.ssPerStage;
    const s = plan.S;
    const a = 100 - s - ss;
    return { A: a, S: s, SS: ss };
  }

  function pickGrade(weights, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const total = weights.A + weights.S + weights.SS;
    let r = random() * total;
    for (const g of GRADES) {
      r -= weights[g];
      if (r <= 0) return g;
    }
    return 'A';
  }

  function filterFragmentPool(tilePool) {
    const pool =
      typeof TileRarity !== 'undefined'
        ? TileRarity.normalizeTiles(tilePool || [])
        : tilePool || [];
    return pool.filter((tile) => {
      const src =
        typeof TileRarity !== 'undefined' ? TileRarity.getSrc(tile) : tile.src || tile;
      return !isSssCardSrc(src);
    });
  }

  function pickCardSrc(pool, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    if (!pool.length) return null;
    const tile = pool[Math.floor(random() * pool.length)];
    if (typeof TileRarity !== 'undefined') return TileRarity.getSrc(tile);
    return typeof tile === 'string' ? tile : tile.src;
  }

  /**
   * @param {string} modeId normal | hard | challenge | daily
   * @param {number} stageIndex 0~4（关卡 stage-1）
   * @param {Array} tilePool
   */
  function rollDrops(modeId, stageIndex, tilePool, rng) {
    const pool = filterFragmentPool(tilePool);
    const n = dropCountForMode(modeId);
    const weights = weightsFor(modeId, stageIndex);
    const drops = [];
    for (let i = 0; i < n; i++) {
      const src = pickCardSrc(pool, rng);
      if (!src) continue;
      drops.push({ src, grade: pickGrade(weights, rng), count: 1 });
    }
    return drops;
  }

  function mergeDrops(drops) {
    const map = new Map();
    drops.forEach((d) => {
      const key = `${d.src}|${d.grade}`;
      const prev = map.get(key);
      if (prev) prev.count += d.count || 1;
      else map.set(key, { src: d.src, grade: d.grade, count: d.count || 1 });
    });
    return [...map.values()];
  }

  function ownedCardCount(tilePool) {
    const bag = getBackpack();
    const pool =
      typeof TileRarity !== 'undefined'
        ? TileRarity.normalizeTiles(tilePool || [])
        : tilePool || [];
    return pool.filter((tile) => {
      const src =
        typeof TileRarity !== 'undefined' ? TileRarity.getSrc(tile) : tile.src || tile;
      if (isSssCardSrc(src)) return false;
      const c = bag[src];
      return c && c.A + c.S + c.SS > 0;
    }).length;
  }

  function totalFragments() {
    const bag = getBackpack();
    let n = 0;
    Object.values(bag).forEach((c) => {
      n += (c.A || 0) + (c.S || 0) + (c.SS || 0);
    });
    return n;
  }

  function formatDropsText(drops) {
    const merged = mergeDrops(drops);
    if (!merged.length) return '';
    return merged
      .map((d) => {
        const name = d.src.split('/').pop() || '卡片';
        return `${name} ${d.grade}×${d.count}`;
      })
      .join('、');
  }

  function slotHtml(src, grade, count) {
    const n = count || 0;
    const filled = n > 0;
    const tag = GRADE_SLOT_TAG[grade] || grade;
    const countBadge =
      n > 0 ? `<span class="frag-slot-count">${n}</span>` : '';
    return (
      '<div class="frag-slot frag-slot--' +
      grade +
      (filled ? ' frag-slot--filled' : ' frag-slot--empty') +
      '">' +
      `<span class="frag-slot-tag">${tag}</span>` +
      '<div class="frag-slot-body">' +
      (filled ? `<img src="${src}" alt="" loading="lazy" />` : '') +
      '</div>' +
      countBadge +
      `</div>`
    );
  }

  function renderCardSlotsHtml(src, counts) {
    const c = { ...emptyCounts(), ...counts };
    return (
      '<div class="backpack-slots">' +
      GRADES.map((g) => slotHtml(src, g, c[g])).join('') +
      '</div>'
    );
  }

  function renderFragmentSlotsHtml(src, counts) {
    const c = { ...emptyCounts(), ...counts };
    return (
      '<div class="backpack-slots backpack-slots--frag">' +
      GRADES.map((g) => slotHtml(src, g, c[g] || 0)).join('') +
      '</div>'
    );
  }

  function cardDisplayName(src) {
    return (src || '').split('/').pop() || '卡片';
  }

  function listSynthEligible(tilePool) {
    const pool = filterFragmentPool(tilePool);
    const list = [];
    pool.forEach((tile) => {
      const src =
        typeof TileRarity !== 'undefined' ? TileRarity.getSrc(tile) : tile.src || tile;
      const counts = getCounts(src);
      const maxTimes = maxSynthPossible(counts);
      if (maxTimes < 1) return;
      list.push({
        src,
        counts,
        maxTimes,
        name: cardDisplayName(src),
      });
    });
    return list;
  }

  function renderSynthPickerItemHtml(item) {
    const srcEnc = encodeURIComponent(item.src);
    const timesLabel =
      item.maxTimes > 1 ? `可合成 ${item.maxTimes} 次` : '可合成 1 次';
    return (
      '<button type="button" class="synth-pick-item" data-src="' +
      srcEnc +
      '">' +
      renderFragmentSlotsHtml(item.src, item.counts) +
      `<span class="synth-pick-name">${item.name}</span>` +
      `<span class="synth-pick-meta">${synthCostText()} · ${timesLabel}</span>` +
      '<span class="synth-pick-action">点击合成</span>' +
      '</button>'
    );
  }

  function renderSssSlotHtml(src, count) {
    const n = count || 0;
    if (n < 1) return '';
    return (
      '<div class="backpack-slots backpack-slots--sss">' +
      slotHtml(src, SYNTH_RESULT_GRADE, n) +
      '</div>'
    );
  }

  function synthNeedText(counts) {
    const c = { ...emptyCounts(), ...counts };
    const parts = [];
    if (c.A < SYNTH_COST.A) parts.push(`A ${SYNTH_COST.A - c.A}`);
    if (c.S < SYNTH_COST.S) parts.push(`S ${SYNTH_COST.S - c.S}`);
    if (c.SS < SYNTH_COST.SS) parts.push(`SS ${SYNTH_COST.SS - c.SS}`);
    return parts.join(' · ') || synthCostText();
  }

  function renderBackpackCardHtml(src) {
    if (isSssCardSrc(src)) return '';
    const counts = getCounts(src);
    const total = counts.A + counts.S + counts.SS;
    const ok = total > 0;
    const srcEnc = encodeURIComponent(src);
    const body = ok
      ? renderFragmentSlotsHtml(src, counts)
      : renderCardSlotsHtml(src, emptyCounts());
    return (
      '<div class="backpack-item' +
      (ok ? '' : ' backpack-item--locked') +
      `" data-src="${srcEnc}">` +
      body +
      `</div>`
    );
  }

  function renderSssHeroHtml() {
    const n = getSssCount();
    const filled = n > 0;
    const slot =
      '<div class="backpack-sss-hero-slot">' +
      '<div class="frag-slot frag-slot--SSS backpack-sss-hero-card' +
      (filled ? ' frag-slot--filled' : ' frag-slot--empty') +
      '">' +
      `<span class="frag-slot-tag">${GRADE_SLOT_TAG.SSS}</span>` +
      '<div class="frag-slot-body">' +
      `<img src="${SSS_CARD_SRC}" alt="" loading="lazy" />` +
      '</div>' +
      (filled ? `<span class="frag-slot-count">${n}</span>` : '') +
      '</div>' +
      `<span class="backpack-sss-hero-count${filled ? '' : ' backpack-sss-hero-count--empty'}">×${n}</span>` +
      '</div>';
    return (
      '<section class="backpack-sss-hero" aria-label="SSS 专属卡">' +
      '<p class="backpack-sss-hero-title">SSS 专属卡</p>' +
      slot +
      '<p class="backpack-sss-hero-desc">25.png · 合成得 SSS · 抽奖得现实奖券</p>' +
      '<div class="backpack-sss-hero-actions">' +
      '<button type="button" class="btn-sss-synth">合成</button>' +
      `<button type="button" class="btn-sss-lottery"${n < LOTTERY_SSS_COST ? ' disabled' : ''}>抽奖</button>` +
      '<button type="button" class="btn-sss-lottery-log">抽奖记录</button>' +
      '</div>' +
      '<p class="backpack-sss-hero-meta">' +
      `合成 ${synthCostText()} · 抽奖 ${lotteryCostText()}（${typeof LotteryRewards !== 'undefined' ? LotteryRewards.probabilityText() : '均等概率'}）` +
      '</p></section>'
    );
  }

  const DROP_REVEAL_GRADE_MS = 720;
  const DROP_REVEAL_CARD_MS = 780;
  const DROP_REVEAL_GAP_MS = 180;

  function expandDropsForReveal(drops) {
    const list = [];
    mergeDrops(drops).forEach((d) => {
      const n = d.count || 1;
      for (let i = 0; i < n; i++) {
        list.push({ src: d.src, grade: d.grade });
      }
    });
    return list;
  }

  function dropRevealActiveHtml(src, grade) {
    const tag = GRADE_SLOT_TAG[grade] || grade;
    return (
      '<div class="drop-reveal-active">' +
      `<div class="drop-reveal-grade frag-slot frag-slot--${grade} drop-reveal-grade-only">` +
      `<span class="frag-slot-tag">${tag}</span>` +
      '<div class="frag-slot-body drop-reveal-grade-body">' +
      `<span class="drop-reveal-grade-letter" aria-hidden="true">${tag}</span>` +
      '</div></div>' +
      `<div class="drop-reveal-card frag-slot frag-slot--${grade} drop-reveal-card--hidden">` +
      `<span class="frag-slot-tag">${tag}</span>` +
      `<div class="frag-slot-body"><img src="${src}" alt="" /></div>` +
      '</div></div>'
    );
  }

  function dropRevealHistoryHtml(src, grade) {
    return '<div class="drop-reveal-won">' + slotHtml(src, grade, 1) + '</div>';
  }

  function getDropRevealContainerHtml() {
    return (
      '<div class="drop-reveal">' +
      '<p class="drop-reveal-title">获得碎片</p>' +
      '<div class="drop-reveal-stage" aria-live="polite"></div>' +
      '<div class="drop-reveal-history"></div>' +
      '</div>'
    );
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function playDropReveal(root, drops, opts = {}) {
    const items = expandDropsForReveal(drops);
    if (!root || !items.length) {
      opts.onComplete?.();
      return;
    }
    const stage = root.querySelector('.drop-reveal-stage');
    const history = root.querySelector('.drop-reveal-history');
    if (!stage || !history) {
      opts.onComplete?.();
      return;
    }

    const playSfx = (name, sfxOpts) => {
      if (typeof opts.sfx === 'function') opts.sfx(name, sfxOpts);
    };

    for (let i = 0; i < items.length; i++) {
      const { src, grade } = items[i];
      stage.innerHTML = dropRevealActiveHtml(src, grade);
      const gradeEl = stage.querySelector('.drop-reveal-grade');
      const cardEl = stage.querySelector('.drop-reveal-card');
      if (!gradeEl || !cardEl) continue;

      gradeEl.classList.add('drop-reveal-pop-in');
      playSfx('click', { playbackRate: 1.15 });
      opts.onItem?.(items[i], i, items.length);
      await delay(DROP_REVEAL_GRADE_MS);

      gradeEl.classList.add('drop-reveal-grade-out');
      cardEl.classList.remove('drop-reveal-card--hidden');
      cardEl.classList.add('drop-reveal-pop-in');
      playSfx('flip', { playbackRate: 1.05 });
      await delay(DROP_REVEAL_CARD_MS);

      history.insertAdjacentHTML('beforeend', dropRevealHistoryHtml(src, grade));
      stage.innerHTML = '';
      if (i < items.length - 1) await delay(DROP_REVEAL_GAP_MS);
    }

    stage.innerHTML = '';
    opts.onComplete?.();
  }

  function formatDropsHtml(drops) {
    const merged = mergeDrops(drops);
    if (!merged.length) return '';
    return (
      '<div class="drop-rewards">' +
      '<p class="drop-rewards-title">获得碎片</p>' +
      '<div class="drop-rewards-list">' +
      merged
        .map(
          (d) =>
            `<div class="drop-reward-group frag-grade-row frag-grade-row--${d.grade}">` +
            `<div class="frag-grade-slots">${slotHtml(d.src, d.grade, d.count)}</div></div>`
        )
        .join('') +
      '</div></div>'
    );
  }

  function weightLegend(modeId, stageIndex) {
    const last = maxStageIndex(modeId);
    const w0 = weightsFor(modeId, 0);
    if (last > 0 && (DROP_RATES[modeId]?.ssPerStage ?? 0) > 0) {
      const wLast = weightsFor(modeId, last);
      return (
        `A ${w0.A}→${wLast.A}% · S ${w0.S}% · SS ${w0.SS}→${wLast.SS}%` +
        `（第1→${last + 1}关）`
      );
    }
    const w = weightsFor(modeId, stageIndex ?? 0);
    return `A ${w.A}% · S ${w.S}% · SS ${w.SS}%`;
  }

  return {
    GRADES,
    GRADE_LABEL,
    GRADE_SLOT_TAG,
    SYNTH_COST,
    SYNTH_RESULT_GRADE,
    SSS_CARD_SRC,
    LOTTERY_SSS_COST,
    DROP_COUNT,
    synthCostText,
    lotteryCostText,
    consumeSssCount,
    emptyCounts,
    isSssCardSrc,
    filterFragmentPool,
    getBackpack,
    getCounts,
    getSynthCount,
    getSssCount,
    setSssCount,
    getSynthesized,
    maxSynthPossible,
    canSynth,
    maxLotteryPossible,
    canLottery,
    listSynthEligible,
    renderSynthPickerItemHtml,
    renderSssHeroHtml,
    cardDisplayName,
    synthOnce,
    lotteryOnce,
    totalSynthesized,
    synthesizedCardCount,
    addFragment,
    applyDrops,
    rollDrops,
    mergeDrops,
    dropCountForMode,
    weightsFor,
    ownedCardCount,
    totalFragments,
    formatDropsText,
    formatDropsHtml,
    getDropRevealContainerHtml,
    playDropReveal,
    expandDropsForReveal,
    renderCardSlotsHtml,
    renderFragmentSlotsHtml,
    renderSssSlotHtml,
    renderBackpackCardHtml,
    slotHtml,
    weightLegend,
  };
});
