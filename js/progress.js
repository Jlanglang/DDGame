/**
 * 通关记录、星级、每日、图鉴、无尽（localStorage）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Progress = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'doudou-dachallenge-progress';

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveAll(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 存储已满或不可用 */
    }
  }

  function levelKey(levelId) {
    return String(levelId);
  }

  function isCompleted(modeId, levelId) {
    const data = loadAll();
    return Boolean(data[modeId]?.[levelKey(levelId)]);
  }

  function getRecord(modeId, levelId) {
    return loadAll()[modeId]?.[levelKey(levelId)] || null;
  }

  /** 1~3 星：完美步数或剩余时间≥50%为 3 星；≤1.5倍对数为 2 星 */
  function calcStars(pairs, moves, timeLeft, timeLimit, hasTimeLimit) {
    const perfect = pairs;
    const good = Math.ceil(pairs * 1.5);
    let stars = 1;
    if (moves <= good) stars = 2;
    if (moves <= perfect) stars = 3;
    if (hasTimeLimit && timeLimit > 0 && timeLeft >= timeLimit * 0.5) {
      stars = Math.max(stars, 3);
    }
    return stars;
  }

  function starsText(n) {
    const s = Math.max(0, Math.min(3, n || 0));
    return '★'.repeat(s) + '☆'.repeat(3 - s);
  }

  function recordWin(modeId, levelId, stats) {
    const data = loadAll();
    if (!data[modeId]) data[modeId] = {};

    const key = levelKey(levelId);
    const prev = data[modeId][key];
    const stars = stats.stars ?? 1;
    const entry = {
      completedAt: Date.now(),
      moves: stats.moves,
      timeLeft: stats.timeLeft,
      stars,
      bestMoves: prev ? Math.min(prev.bestMoves, stats.moves) : stats.moves,
      bestTimeLeft: prev ? Math.max(prev.bestTimeLeft, stats.timeLeft) : stats.timeLeft,
      bestStars: prev ? Math.max(prev.bestStars || 0, stars) : stars,
    };

    data[modeId][key] = entry;
    saveAll(data);
    return entry;
  }

  function getCompletedCount(modeId) {
    const data = loadAll();
    return data[modeId] ? Object.keys(data[modeId]).length : 0;
  }

  function clearMode(modeId) {
    const data = loadAll();
    delete data[modeId];
    saveAll(data);
  }

  function getMeta() {
    return loadAll()._meta || {};
  }

  function setMeta(patch) {
    const data = loadAll();
    data._meta = { ...getMeta(), ...patch };
    saveAll(data);
  }

  function getDailyRecord(dateKey) {
    return loadAll().daily?.[dateKey] || null;
  }

  function recordDaily(dateKey, stats) {
    const data = loadAll();
    if (!data.daily) data.daily = {};
    const prev = data.daily[dateKey];
    const stars = stats.stars ?? 1;
    data.daily[dateKey] = {
      completedAt: Date.now(),
      moves: stats.moves,
      stars,
      bestMoves: prev ? Math.min(prev.bestMoves, stats.moves) : stats.moves,
      bestStars: prev ? Math.max(prev.bestStars || 0, stars) : stars,
    };
    updateDailyStreak(dateKey);
    saveAll(data);
    return data.daily[dateKey];
  }

  function updateDailyStreak(dateKey) {
    const meta = getMeta();
    const last = meta.lastDailyDate;
    let streak = meta.dailyStreak || 0;
    if (last === dateKey) {
      /* 同一天 */
    } else if (last) {
      const prev = new Date(last + 'T12:00:00');
      const cur = new Date(dateKey + 'T12:00:00');
      const diff = Math.round((cur - prev) / 86400000);
      streak = diff === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    setMeta({ lastDailyDate: dateKey, dailyStreak: streak });
  }

  function getDailyStreak() {
    return getMeta().dailyStreak || 0;
  }

  function discoverTiles(paths) {
    if (!paths?.length) return;
    const meta = getMeta();
    const set = new Set(meta.gallery || []);
    paths.forEach((p) => set.add(p));
    setMeta({ gallery: [...set] });
  }

  function getGallery() {
    return getMeta().gallery || [];
  }

  function getEndlessBest() {
    return getMeta().endlessBest || 0;
  }

  function setEndlessBest(pairs) {
    const best = getEndlessBest();
    if (pairs > best) setMeta({ endlessBest: pairs });
    return Math.max(best, pairs);
  }

  function isTutorialDone() {
    return Boolean(getMeta().tutorialDone);
  }

  function setTutorialDone() {
    setMeta({ tutorialDone: true });
  }

  return {
    isCompleted,
    getRecord,
    recordWin,
    getCompletedCount,
    clearMode,
    calcStars,
    starsText,
    getDailyRecord,
    recordDaily,
    getDailyStreak,
    discoverTiles,
    getGallery,
    getEndlessBest,
    setEndlessBest,
    isTutorialDone,
    setTutorialDone,
    getMeta,
    setMeta,
  };
});
