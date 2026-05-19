/**
 * 成就（纯本地，偏乐趣向）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Achievements = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFS = [
    { id: 'first_win', title: '初试身手', desc: '首次通关任意关卡' },
    { id: 'combo_5', title: '连击新手', desc: '单局达成 5 连击' },
    { id: 'combo_10', title: '连击大师', desc: '单局达成 10 连击' },
    { id: 'daily_done', title: '每日打卡', desc: '完成一次今日挑战' },
    { id: 'gallery_half', title: '背包收藏家', desc: '背包收集卡片过半' },
    { id: 'gallery_all', title: '背包满员', desc: '每张卡至少获得 1 枚碎片' },
    { id: 'first_synth', title: '初次合成', desc: '首次合成 SSS 表情包' },
    { id: 'synth_10', title: '合成达人', desc: '累计合成 10 次' },
    { id: 'expert_win', title: '专家认证', desc: '通关任意 16 对关卡' },
    { id: 'challenge_clean', title: '压力清零', desc: '挑战模式通关且未被盖回' },
    { id: 'no_hint_win', title: '自力更生', desc: '困难模式未用提示通关' },
  ];

  function getUnlocked() {
    try {
      const raw = localStorage.getItem('doudou-achievements');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveUnlocked(map) {
    try {
      localStorage.setItem('doudou-achievements', JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  function unlock(id) {
    const map = getUnlocked();
    if (map[id]) return null;
    map[id] = Date.now();
    saveUnlocked(map);
    const def = DEFS.find((d) => d.id === id);
    return def || { id, title: id, desc: '' };
  }

  function isUnlocked(id) {
    return Boolean(getUnlocked()[id]);
  }

  function list() {
    return DEFS.map((d) => ({
      ...d,
      unlocked: isUnlocked(d.id),
      unlockedAt: getUnlocked()[d.id] || null,
    }));
  }

  function countUnlocked() {
    return DEFS.filter((d) => isUnlocked(d.id)).length;
  }

  function checkAfterWin(ctx) {
    const unlocked = [];
    const tryUnlock = (id) => {
      const u = unlock(id);
      if (u) unlocked.push(u);
    };

    tryUnlock('first_win');
    if (ctx.comboMax >= 5) tryUnlock('combo_5');
    if (ctx.comboMax >= 10) tryUnlock('combo_10');
    if (ctx.isDaily) tryUnlock('daily_done');
    if (ctx.backpackOwned >= Math.ceil(ctx.backpackTotal / 2)) tryUnlock('gallery_half');
    if (ctx.backpackTotal > 0 && ctx.backpackOwned >= ctx.backpackTotal) tryUnlock('gallery_all');
    if (!ctx.isDaily && ctx.pairs >= 16) tryUnlock('expert_win');
    if (ctx.modeId === 'challenge' && !ctx.wasCovered) tryUnlock('challenge_clean');
    if (ctx.modeId === 'hard' && ctx.hintsUsed === 0) tryUnlock('no_hint_win');

    return unlocked;
  }

  return { DEFS, list, unlock, isUnlocked, countUnlocked, checkAfterWin };
});
