/**
 * 通关记录（localStorage）
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

  return {
    isCompleted,
    getRecord,
    recordWin,
    getCompletedCount,
    clearMode,
  };
});
