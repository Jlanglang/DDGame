/**
 * 通关记录、每日、背包（localStorage）
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

  function recordWin(modeId, levelId, stats) {
    const data = loadAll();
    if (!data[modeId]) data[modeId] = {};

    const key = levelKey(levelId);
    const prev = data[modeId][key];
    const entry = {
      completedAt: Date.now(),
      moves: stats.moves,
      timeLeft: stats.timeLeft,
      bestMoves: prev ? Math.min(prev.bestMoves, stats.moves) : stats.moves,
      bestTimeLeft: prev ? Math.max(prev.bestTimeLeft, stats.timeLeft) : stats.timeLeft,
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
    data.daily[dateKey] = {
      completedAt: Date.now(),
      moves: stats.moves,
      bestMoves: prev ? Math.min(prev.bestMoves, stats.moves) : stats.moves,
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
    getDailyRecord,
    recordDaily,
    getDailyStreak,
    isTutorialDone,
    setTutorialDone,
    getMeta,
    setMeta,
  };
});
