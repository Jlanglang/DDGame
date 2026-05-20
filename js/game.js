(function () {
  'use strict';

  const FLIP_BACK_MS = 600;
  const FADE_AFTER_FLIP_MS = 160;
  const MATCH_FADE_MS = 420;
  const MATCH_FADE_STAGGER_MS = 50;
  const CRUSH_MS = FADE_AFTER_FLIP_MS + MATCH_FADE_MS + MATCH_FADE_STAGGER_MS;
  const MATCHED_CLASS = 'matched';
  const FLIPPED_CLASS = 'flipped';
  const CRUSHING_CLASS = 'crushing';
  const CRUSHED_CLASS = 'crushed';

  const BOARD_GAP = 8;
  const BOARD_SCALER_PAD = 5;
  const MAX_PAIRS = 20;

  const appEl = document.getElementById('app');
  const boardViewport = document.getElementById('board-viewport');
  const boardScaler = document.getElementById('board-scaler');
  const board = document.getElementById('board');
  const levelLabel = document.getElementById('level-label');
  const movesLabel = document.getElementById('moves-label');
  const timerLabel = document.getElementById('timer-label');
  const dropRateHud = document.getElementById('drop-rate-hud');
  const errorMsg = document.getElementById('error-msg');
  const homePage = document.getElementById('home-page');
  const gamePage = document.getElementById('game-page');
  const homeMenu = document.getElementById('home-menu');
  const levelPicker = document.getElementById('level-picker');
  const levelList = document.getElementById('level-list');
  const levelSelectHint = document.getElementById('level-select-hint');
  const btnPickLevel = document.getElementById('btn-pick-level');
  const btnQuickStart = document.getElementById('btn-quick-start');
  const btnLevelPickerClose = document.getElementById('btn-level-picker-close');
  const synthPicker = document.getElementById('synth-picker');
  const synthPickerList = document.getElementById('synth-picker-list');
  const synthPickerHint = document.getElementById('synth-picker-hint');
  const btnSynthPickerClose = document.getElementById('btn-synth-picker-close');
  const lotteryPicker = document.getElementById('lottery-picker');
  const lotteryPickerList = document.getElementById('lottery-picker-list');
  const lotteryPickerHint = document.getElementById('lottery-picker-hint');
  const btnLotteryPickerClose = document.getElementById('btn-lottery-picker-close');
  const lotteryResult = document.getElementById('lottery-result');
  const lotteryResultEmoji = document.getElementById('lottery-result-emoji');
  const lotteryResultTitle = document.getElementById('lottery-result-title');
  const lotteryResultDesc = document.getElementById('lottery-result-desc');
  const lotteryResultTag = document.getElementById('lottery-result-tag');
  const btnLotteryResultClose = document.getElementById('btn-lottery-result-close');
  const homeHint = document.getElementById('home-hint');
  const modeList = document.getElementById('mode-list');
  const btnSound = document.getElementById('btn-sound');
  const btnSoundGame = document.getElementById('btn-sound-game');
  const btnMenu = document.getElementById('btn-menu');
  const btnHome = document.getElementById('btn-home');
  const overlay = document.getElementById('overlay');
  const modal = overlay ? overlay.querySelector('.modal') : null;
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const btnReplay = document.getElementById('btn-replay');
  const btnOverlayClose = document.getElementById('btn-overlay-close');
  const btnNext = document.getElementById('btn-next');
  const btnSelect = document.getElementById('btn-select');
  const btnHint = document.getElementById('btn-hint');
  const hintCountEl = document.getElementById('hint-count');
  const comboHud = document.getElementById('combo-hud');
  const comboToast = document.getElementById('combo-toast');
  const achievementPop = document.getElementById('achievement-pop');
  const btnShare = document.getElementById('btn-share');
  const dailyCard = document.getElementById('daily-card');
  const subPanel = document.getElementById('sub-panel');
  const subPanelTitle = document.getElementById('sub-panel-title');
  const subPanelBody = document.getElementById('sub-panel-body');
  const btnSubBack = document.getElementById('btn-sub-back');
  const btnAchievements = document.getElementById('btn-achievements');
  const btnBackpack = document.getElementById('btn-backpack');
  const btnLotteryLog = document.getElementById('btn-lottery-log');
  const overlayDrops = document.getElementById('overlay-drops');

  let baseLevels = [];
  let modeLevelSets = {};
  let tilePool = [];
  let levels = [];
  let currentLevelIndex = 0;
  let currentModeId = 'normal';
  let moves = 0;
  let moveLimit = 0;
  let timeLeft = 0;
  let timerId = null;
  let idleSeconds = 0;
  /** 挑战模式：当前被倒计时盯上的那一对 */
  let idleTargetPairId = null;
  let gameOver = false;
  let lock = false;
  let firstCard = null;
  let secondCard = null;
  let matchedCount = 0;
  let totalPairs = 0;
  let lastUniqueImageCount = 0;
  let lastBoardCardCount = 0;
  let combo = 0;
  let comboMax = 0;
  let hintsLeft = 0;
  let hintsUsed = 0;
  let isDailyRun = false;
  let dailyConfig = null;
  let challengeCoverCount = 0;
  let idleWarnSfxPlayed = false;
  let victoryPending = false;
  let victoryShown = false;

  function currentMode() {
    return GameModes.get(currentModeId);
  }

  function sfx(name, opts) {
    if (typeof GameAudio !== 'undefined') GameAudio.play(name, opts);
  }

  function ensureGlobalBgm() {
    if (typeof GameAudio !== 'undefined') GameAudio.ensureBgm?.();
  }

  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function updateComboHud() {
    if (!comboHud) return;
    if (combo < 2) {
      comboHud.classList.add('hidden');
      return;
    }
    comboHud.textContent = `连击 x${combo}`;
    comboHud.classList.remove('hidden');
    comboHud.style.animation = 'none';
    void comboHud.offsetWidth;
    comboHud.style.animation = '';
  }

  function showComboToast(text, ms = 900) {
    if (!comboToast) return;
    comboToast.textContent = text;
    comboToast.classList.remove('hidden');
    setTimeout(() => comboToast.classList.add('hidden'), ms);
  }

  function onComboMatch() {
    combo += 1;
    if (combo > comboMax) comboMax = combo;
    updateComboHud();
    if (typeof GameAudio !== 'undefined' && GameAudio.playMatchCombo) {
      GameAudio.playMatchCombo(combo);
    } else {
      sfx('match');
    }
    if (combo === 3) {
      showComboToast('3 连击！');
      vibrate(30);
    } else if (combo === 5) {
      showComboToast('5 连击！');
      vibrate([30, 40, 30]);
    } else if (combo === 10) {
      showComboToast('10 连击！！');
      vibrate([50, 50, 50]);
    }
  }

  function resetCombo() {
    combo = 0;
    updateComboHud();
  }

  function updateHintButton() {
    if (!btnHint) return;
    const mode = currentMode();
    const max = GameModes.hintCountFor(mode);
    if (max <= 0 || gameOver) {
      btnHint.classList.add('hidden');
      return;
    }
    btnHint.classList.remove('hidden');
    btnHint.disabled = hintsLeft <= 0 || lock;
    if (hintCountEl) hintCountEl.textContent = ` ${hintsLeft}`;
  }

  function useHint() {
    if (gameOver || lock || hintsLeft <= 0) return;
    const unmatched = [...board.querySelectorAll('.card')].filter(
      (c) => !isCardRemoved(c) && !c.classList.contains(FLIPPED_CLASS)
    );
    if (unmatched.length < 2) return;

    const bySrc = {};
    unmatched.forEach((c) => {
      const src = c.dataset.src;
      if (!src) return;
      if (!bySrc[src]) bySrc[src] = [];
      bySrc[src].push(c);
    });
    const srcKeys = Object.keys(bySrc).filter((k) => bySrc[k].length >= 2);
    if (!srcKeys.length) return;

    const pickSrc = srcKeys[Math.floor(Math.random() * srcKeys.length)];
    const pairCards = bySrc[pickSrc].slice(0, 2);
    hintsLeft -= 1;
    hintsUsed += 1;
    sfx('click');
    pairCards.forEach((card) => card.classList.add('hint-flash'));
    setTimeout(() => {
      pairCards.forEach((card) => card.classList.remove('hint-flash'));
    }, 1200);
    updateHintButton();
  }

  function updateSoundButton() {
    if (typeof GameAudio === 'undefined') return;
    const on = GameAudio.isEnabled();
    document.querySelectorAll('.btn-sound').forEach((btn) => {
      btn.textContent = on ? '🔊' : '🔇';
      btn.classList.toggle('off', !on);
      btn.setAttribute('aria-label', on ? '关闭音效与背景音乐' : '开启音效与背景音乐');
    });
  }

  function toggleSound() {
    if (typeof GameAudio === 'undefined') return;
    GameAudio.unlockFromUserGesture?.();
    const on = GameAudio.toggle();
    updateSoundButton();
    if (on) GameAudio.play('click');
  }

  /** 普通 / 困难：配对后渐隐消失；挑战：保持已匹配展示 */
  function useCrushEffect() {
    return !currentMode().hasIdlePenalty;
  }

  function hasTimeLimit() {
    return currentMode().hasTimeLimit !== false;
  }

  function isCardRemoved(card) {
    return (
      card.classList.contains(MATCHED_CLASS) ||
      card.classList.contains(CRUSHED_CLASS)
    );
  }

  function countPlayableCards() {
    return [...board.querySelectorAll('.card')].filter((c) => !isCardRemoved(c))
      .length;
  }

  function isBoardCleared() {
    const cards = board.querySelectorAll('.card');
    if (!cards.length) return false;
    return countPlayableCards() === 0;
  }

  /** 满足胜利条件则弹出结算（afterMatch 已在渐隐动画结束后调用） */
  function tryVictory() {
    if (victoryShown) return false;
    if (matchedCount < totalPairs && !isBoardCleared()) return false;
    showWin();
    return true;
  }

  function playCrushMatch(cardA, cardB, onComplete) {
    const cards = [cardA, cardB];
    cards.forEach((card) => {
      card.disabled = true;
      card.classList.add(FLIPPED_CLASS);
    });

    // 等翻牌渐显完成后再播渐隐
    setTimeout(() => {
      cardA.classList.add(CRUSHING_CLASS);
      cardB.classList.add(CRUSHING_CLASS, 'crushing--stagger');
    }, FADE_AFTER_FLIP_MS);

    setTimeout(() => {
      cards.forEach((card) => {
        card.classList.remove(CRUSHING_CLASS, FLIPPED_CLASS);
        card.classList.add(CRUSHED_CLASS);
      });
      onComplete();
    }, CRUSH_MS);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const MIN_GRID_COLS = 2;

  const MIN_CELL_SIZE = 52;

  /**
   * 在 board-viewport 可用区域内枚举列数，取能使单格最大的行列布局
   */
  function gridSizeForViewport(cardCount, maxWidth, maxHeight, gapPx) {
    let best = null;

    for (let cols = MIN_GRID_COLS; cols <= cardCount; cols++) {
      const rows = Math.ceil(cardCount / cols);
      const cellByW = (maxWidth - (cols - 1) * gapPx) / cols;
      const cellByH = (maxHeight - (rows - 1) * gapPx) / rows;
      if (cellByW <= 0 || cellByH <= 0) continue;

      const cell = Math.min(cellByW, cellByH);
      const cellFloor = Math.floor(cell);
      if (
        !best ||
        cellFloor > best.cellSize ||
        (cellFloor === best.cellSize && rows < best.rows)
      ) {
        best = { cols, rows, cellSize: cellFloor };
      }
    }

    if (!best) {
      const cols = Math.max(MIN_GRID_COLS, Math.ceil(Math.sqrt(cardCount)));
      const rows = Math.ceil(cardCount / cols);
      const cellByW = (maxWidth - (cols - 1) * gapPx) / cols;
      const cellByH = (maxHeight - (rows - 1) * gapPx) / rows;
      best = {
        cols,
        rows,
        cellSize: Math.max(
          MIN_CELL_SIZE,
          Math.floor(Math.min(cellByW, cellByH))
        ),
      };
    }

    best.cellSize = Math.max(MIN_CELL_SIZE, best.cellSize);
    return best;
  }

  /** 布局稳定后再算网格（避免每日挑战与选关列数不一致） */
  function scheduleFitBoard(cardCount) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitBoardGrid(cardCount);
      });
    });
  }

  /** 按 board-viewport 整体宽高计算牌面，尽量铺满可用区域 */
  function fitBoardGrid(cardCount) {
    if (!cardCount) return;
    lastBoardCardCount = cardCount;

    const gapPx = BOARD_GAP;
    const padTotal = BOARD_SCALER_PAD * 2;

    let maxWidth = window.innerWidth - padTotal;
    let maxHeight = window.innerHeight - 120 - padTotal;
    if (boardViewport) {
      const w = boardViewport.clientWidth;
      const h = boardViewport.clientHeight;
      if (w > 0) maxWidth = w - padTotal;
      if (h > 0) maxHeight = h - padTotal;
    }

    const { cols, rows, cellSize } = gridSizeForViewport(
      cardCount,
      maxWidth,
      maxHeight,
      gapPx
    );

    board.style.setProperty('--card-size', `${cellSize}px`);
    board.style.setProperty('--board-gap', `${gapPx}px`);
    board.style.gridTemplateColumns = `repeat(${cols}, var(--card-size))`;
    board.style.gridTemplateRows = `repeat(${rows}, var(--card-size))`;
    board.style.gap = 'var(--board-gap)';

    const naturalW = cols * cellSize + (cols - 1) * gapPx;
    const naturalH = rows * cellSize + (rows - 1) * gapPx;
    board.style.width = `${naturalW}px`;
    board.style.height = `${naturalH}px`;
    board.style.transform = 'none';
  }

  function pairCount(level) {
    const n = level?.pairs ?? 2;
    return Math.min(Math.max(2, n), MAX_PAIRS);
  }

  /**
   * 本关使用的不同表情包种类数。种类越少重复越多，关卡越简单。
   * 同模式：第 1 关重复最多，最后一关几乎不重复。
   */
  function uniqueImageCountForLevel(pairs, level) {
    const stage = level?.stage ?? 1;
    const modeId = currentModeId || 'normal';
    const maxStage =
      typeof Difficulty !== 'undefined' ? Difficulty.levelsForMode(modeId) : 3;
    const progress = maxStage <= 1 ? 1 : (stage - 1) / (maxStage - 1);
    const minRatio = 0.35;
    const maxRatio = 1;
    const ratio = minRatio + progress * (maxRatio - minRatio);
    const unique = Math.ceil(pairs * ratio);
    return Math.max(2, Math.min(pairs, unique, tilePool.length || pairs));
  }

  /** 加权抽牌，允许同图多对；配对按图片 src 判定 */
  function pickRandomImages(pairs, level) {
    const pool = tilePool.length ? tilePool : [];
    if (!pool.length || typeof TileRarity === 'undefined') return [];

    const uniqueN = uniqueImageCountForLevel(pairs, level);
    return TileRarity.pickWeightedWithDupes(pool, pairs, uniqueN);
  }

  function getLevelConfig(level) {
    const pairs = pairCount(level);
    const base = Difficulty.forPairs(pairs);
    return {
      pairs,
      difficulty: level.difficulty ?? base.difficulty,
      difficultyLabel: level.difficultyLabel ?? base.difficultyLabel,
      timeLimit: level.timeLimit ?? base.timeLimit,
      moveLimit: level.moveLimit ?? base.moveLimit,
      idleSeconds: level.idleSeconds ?? base.idleSeconds,
    };
  }

  function idleLimitFor(level) {
    const lv = level || levels[currentLevelIndex];
    const cfg = lv ? getLevelConfig(lv) : null;
    if (cfg?.idleSeconds != null) return cfg.idleSeconds;
    return currentMode().idleSeconds || 10;
  }

  function applyLevelsForCurrentMode() {
    isDailyRun = false;
    const mode = currentMode();
    if (mode.id === 'normal') {
      levels = baseLevels;
    } else {
      levels = modeLevelSets[mode.id] || [];
    }
    if (currentLevelIndex >= levels.length) {
      currentLevelIndex = Math.max(0, levels.length - 1);
    }
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function getMatchedPairIds() {
    const matched = board.querySelectorAll(`.card.${MATCHED_CLASS}`);
    return [...new Set([...matched].map((c) => c.dataset.pairId))];
  }

  function pickIdleTargetPair() {
    const pairIds = getMatchedPairIds();
    if (pairIds.length === 0) {
      idleTargetPairId = null;
      return;
    }
    let candidates = pairIds;
    if (pairIds.length > 1 && idleTargetPairId) {
      candidates = pairIds.filter((id) => id !== idleTargetPairId);
    }
    idleTargetPairId = candidates[Math.floor(Math.random() * candidates.length)];
  }

  function tickChallengeIdle() {
    const mode = currentMode();
    if (!mode.hasIdlePenalty || gameOver || matchedCount === 0) return;

    if (idleTargetPairId === null || !getMatchedPairIds().includes(idleTargetPairId)) {
      pickIdleTargetPair();
    }

    idleSeconds += 1;
    const limit = idleLimitFor();
    const left = Math.max(0, limit - idleSeconds);
    if (left <= 3 && !idleWarnSfxPlayed) {
      idleWarnSfxPlayed = true;
      sfx('click', { playbackRate: 1.3 });
    }
    if (left > 3) idleWarnSfxPlayed = false;

    if (idleSeconds >= limit) {
      if (idleTargetPairId !== null) {
        coverPairById(idleTargetPairId);
        sfx('flip', { playbackRate: 0.85 });
      }
      idleSeconds = 0;
      idleWarnSfxPlayed = false;
      pickIdleTargetPair();
      updateMatchedIdleVisuals();
    }
  }

  function startTimer() {
    stopTimer();
    idleSeconds = 0;
    timerId = setInterval(() => {
      if (gameOver) return;
      if (hasTimeLimit()) {
        timeLeft -= 1;
        if (timeLeft <= 0) {
          if (lock) return;
          if (tryVictory()) return;
          showFail('时间用完了');
          return;
        }
      }
      tickChallengeIdle();
      updateHud();
    }, 1000);
  }

  function resetIdleOnMatch() {
    idleSeconds = 0;
    pickIdleTargetPair();
    updateMatchedIdleVisuals();
  }

  function updateMatchedIdleVisuals() {
    const mode = currentMode();
    const show = mode.hasIdlePenalty && matchedCount > 0 && !gameOver && idleTargetPairId !== null;
    const limit = idleLimitFor();
    const left = Math.max(0, limit - idleSeconds);
    const progress = Math.min(100, (idleSeconds / limit) * 100);

    board.querySelectorAll('.card').forEach((card) => {
      const isMatched = card.classList.contains(MATCHED_CLASS);
      const isTarget = isMatched && card.dataset.pairId === idleTargetPairId;
      let overlay = card.querySelector('.idle-risk');

      if (!isTarget || !show) {
        card.classList.remove('idle-warn', 'has-idle-timer');
        if (overlay) overlay.classList.add('hidden');
        return;
      }

      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'idle-risk hidden';
        overlay.innerHTML =
          '<span class="idle-risk-num"></span>' +
          '<div class="idle-risk-track"><div class="idle-risk-fill"></div></div>';
        card.appendChild(overlay);
      }

      overlay.classList.remove('hidden');
      card.classList.add('has-idle-timer');
      card.classList.toggle('idle-warn', left <= 3);

      overlay.querySelector('.idle-risk-num').textContent = left;
      overlay.querySelector('.idle-risk-fill').style.width = `${progress}%`;
    });
  }

  function coverPairById(pickId) {
    let covered = false;

    board.querySelectorAll(`.card.${MATCHED_CLASS}`).forEach((card) => {
      if (card.dataset.pairId !== pickId) return;
      covered = true;
      card.classList.remove(MATCHED_CLASS, FLIPPED_CLASS, 'has-idle-timer', 'idle-warn');
      card.disabled = false;
      const overlay = card.querySelector('.idle-risk');
      if (overlay) overlay.classList.add('hidden');
      card.classList.add('penalty-flash');
      setTimeout(() => card.classList.remove('penalty-flash'), 600);
    });

    if (!covered) return;

    challengeCoverCount += 1;
    matchedCount -= 1;

    if (firstCard && firstCard.dataset.pairId === pickId) {
      firstCard = null;
    }
    if (secondCard && secondCard.dataset.pairId === pickId) {
      secondCard = null;
    }

    if (idleTargetPairId === pickId) {
      idleTargetPairId = null;
    }

    updateHud();
  }

  function showError(text) {
    stopTimer();
    closeLevelPicker();
    hideOverlay();
    document.body.classList.remove('game-active');
    if (appEl) {
      appEl.classList.remove('game-active');
      appEl.classList.add('home-view');
    }
    if (homePage) {
      homePage.classList.remove('hidden');
      homePage.setAttribute('aria-hidden', 'false');
    }
    if (gamePage) {
      gamePage.classList.add('hidden');
      gamePage.setAttribute('aria-hidden', 'true');
    }
    if (homeMenu) homeMenu.classList.add('hidden');
    if (errorMsg) {
      errorMsg.textContent = text;
      errorMsg.classList.remove('hidden');
    }
  }

  function renderModeList() {
    if (!modeList) return;
    modeList.innerHTML = '';
    GameModes.LIST.forEach((mode) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn' + (mode.id === currentModeId ? ' active' : '');
      btn.dataset.mode = mode.id;
      btn.innerHTML =
        `<span class="mode-btn-label">${mode.label}</span>` +
        `<span class="mode-btn-desc">${mode.desc}</span>`;
      btn.addEventListener('click', () => {
        sfx('click');
        currentModeId = mode.id;
        currentLevelIndex = 0;
        applyLevelsForCurrentMode();
        renderModeList();
        updateHomeHint();
      });
      modeList.appendChild(btn);
    });
  }

  function getNextLevelIndex(fromIndex) {
    if (fromIndex >= levels.length - 1) return null;
    return fromIndex + 1;
  }

  function isLastAvailableLevel(index) {
    return levels.length === 0 || index >= levels.length - 1;
  }

  function levelMetaText(cfg) {
    const mode = currentMode();
    if (mode.hasMoveLimit) {
      return `${cfg.pairs} 对 · ${cfg.timeLimit}s · ${cfg.moveLimit} 步`;
    }
    if (mode.hasIdlePenalty) {
      const idle = cfg.idleSeconds ?? mode.idleSeconds ?? 10;
      return `${cfg.pairs} 对 · 不限时 · 随机一对${idle}s惩罚`;
    }
    return `${cfg.pairs} 对 · ${cfg.timeLimit}s`;
  }

  function openLevelPicker() {
    if (isDailyRun) {
      showComboToast('每日挑战不能选关', 2000);
      return;
    }
    if (!levelPicker) return;
    renderLevelList();
    levelPicker.classList.remove('hidden');
    levelPicker.setAttribute('aria-hidden', 'false');
  }

  function updateGameChrome() {
    if (btnMenu) {
      btnMenu.classList.toggle('hidden', isDailyRun);
    }
    if (btnSelect) {
      btnSelect.classList.toggle('hidden', isDailyRun);
    }
  }

  function closeLevelPicker() {
    if (!levelPicker) return;
    levelPicker.classList.add('hidden');
    levelPicker.setAttribute('aria-hidden', 'true');
  }

  function showHome() {
    stopTimer();
    gameOver = false;
    isDailyRun = false;
    hideOverlay();
    hideSubPanel();
    closeLevelPicker();
    document.body.classList.remove('game-active');
    if (appEl) {
      appEl.classList.remove('game-active');
      appEl.classList.add('home-view');
    }
    if (homePage) {
      homePage.classList.remove('hidden');
      homePage.setAttribute('aria-hidden', 'false');
    }
    if (gamePage) {
      gamePage.classList.add('hidden');
      gamePage.setAttribute('aria-hidden', 'true');
    }
    if (btnHint) btnHint.classList.add('hidden');
    if (homeMenu) homeMenu.classList.remove('hidden');
    if (errorMsg) errorMsg.classList.add('hidden');
    if (dropRateHud) dropRateHud.classList.add('hidden');
    updateGameChrome();
    renderModeList();
    renderDailyCard();
    updateHomeHint();
    ensureGlobalBgm();
  }

  function showLevelSelect() {
    showHome();
  }

  function updateHomeHint() {
    const mode = currentMode();
    const level = levels[currentLevelIndex];
    let hint = '选择模式后，选关或快速开始 · 每局随机（同图可重复）';

    if (level) {
      hint = `${mode.label} · 当前 ${level.name}（${pairCount(level)} 对）· 可换关或快速开始`;
    }

    if (homeHint) homeHint.textContent = hint;
  }

  function quickStart() {
    if (levels.length === 0) {
      openLevelPicker();
      return;
    }
    startLevel(currentLevelIndex);
  }

  function hideSubPanel() {
    if (!subPanel) return;
    subPanel.classList.add('hidden');
    subPanel.setAttribute('aria-hidden', 'true');
    if (homeMenu) homeMenu.classList.remove('hidden');
  }

  function showSubPanel(title, html) {
    if (homeMenu) homeMenu.classList.add('hidden');
    subPanel.classList.remove('hidden');
    subPanel.setAttribute('aria-hidden', 'false');
    subPanelTitle.textContent = title;
    subPanelBody.innerHTML = html;
  }

  function renderAchievementsPanel() {
    const list = Achievements.list();
    const html = list
      .map(
        (a) =>
          `<div class="achievement-item${a.unlocked ? ' achievement-item--unlocked' : ''}">` +
          `<p class="achievement-item-title">${a.unlocked ? '✓ ' : ''}${a.title}</p>` +
          `<p class="achievement-item-desc">${a.desc}</p></div>`
      )
      .join('');
    showSubPanel(`成就 ${Achievements.countUnlocked()}/${list.length}`, html);
  }

  function checkSynthAchievements() {
    const unlocked = [];
    if (typeof Achievements === 'undefined' || typeof Backpack === 'undefined') {
      return unlocked;
    }
    const total = Backpack.totalSynthesized();
    const tryUnlock = (id) => {
      const u = Achievements.unlock(id);
      if (u) unlocked.push(u);
    };
    if (total === 1) tryUnlock('first_synth');
    if (total >= 10) tryUnlock('synth_10');
    return unlocked;
  }

  function performSynth(src) {
    if (!src || typeof Backpack === 'undefined' || !Backpack.synthOnce(src)) {
      return false;
    }
    sfx('win', { playbackRate: 1.05 });
    const unlocked = checkSynthAchievements();
    if (subPanel && !subPanel.classList.contains('hidden')) {
      renderBackpackPanel();
    }
    refreshSynthPicker();
    if (unlocked.length) {
      setTimeout(() => showAchievementPop(unlocked), 300);
    }
    return true;
  }

  function refreshSynthPicker() {
    if (!synthPickerList || typeof Backpack === 'undefined') return;
    const items = Backpack.listSynthEligible(backpackFragmentPool());
    if (synthPickerHint) {
      synthPickerHint.textContent = `消耗 ${Backpack.synthCostText()}，仅显示材料足够的卡片`;
    }
    if (!items.length) {
      synthPickerList.innerHTML =
        '<p class="synth-picker-empty">暂无符合条件的卡片，继续通关收集碎片吧</p>';
      return;
    }
    synthPickerList.innerHTML = items
      .map((item) => Backpack.renderSynthPickerItemHtml(item))
      .join('');
  }

  function openSynthPicker() {
    if (!synthPicker || typeof Backpack === 'undefined') return;
    refreshSynthPicker();
    synthPicker.classList.remove('hidden');
    synthPicker.setAttribute('aria-hidden', 'false');
  }

  function closeSynthPicker() {
    if (!synthPicker) return;
    synthPicker.classList.add('hidden');
    synthPicker.setAttribute('aria-hidden', 'true');
  }

  function onSynthPickerClick(e) {
    const item = e.target.closest('.synth-pick-item');
    if (!item) return;
    const src = decodeURIComponent(item.dataset.src || '');
    performSynth(src);
  }

  function showLotteryResult(record) {
    if (!lotteryResult || !record) return;
    const isReward = record.type === 'reward';
    const isThanks = record.type === 'thanks';
    if (lotteryResultEmoji) lotteryResultEmoji.textContent = record.emoji || '🎀';
    if (lotteryResultTitle) lotteryResultTitle.textContent = record.title;
    if (lotteryResultDesc) lotteryResultDesc.textContent = record.desc;
    if (lotteryResultTag) {
      const tagText =
        typeof LotteryRewards !== 'undefined'
          ? LotteryRewards.tagLabel(record.type)
          : isThanks
            ? '谢谢惠顾'
            : isReward
              ? '正向奖励'
              : '家庭约定';
      lotteryResultTag.textContent = tagText;
      lotteryResultTag.className =
        'lottery-result-tag ' +
        (isThanks
          ? 'lottery-result-tag--thanks'
          : isReward
            ? 'lottery-result-tag--reward'
            : 'lottery-result-tag--deal');
    }
    lotteryResult.classList.remove('hidden');
    lotteryResult.setAttribute('aria-hidden', 'false');
  }

  function closeLotteryResult() {
    if (!lotteryResult) return;
    lotteryResult.classList.add('hidden');
    lotteryResult.setAttribute('aria-hidden', 'true');
  }

  function renderLotteryLogPanel() {
    if (typeof LotteryRewards === 'undefined') {
      showSubPanel('我的抽奖记录', '<p class="level-select-hint">抽奖模块未加载</p>');
      return;
    }
    const html =
      `<p class="level-select-hint">${LotteryRewards.probabilityText()} · 由家长兑现</p>` +
      LotteryRewards.renderPoolLegendHtml() +
      LotteryRewards.renderLogListHtml();
    showSubPanel('我的抽奖记录', html);
    if (subPanelBody) {
      subPanelBody.removeEventListener('click', onLotteryLogClick);
      subPanelBody.addEventListener('click', onLotteryLogClick);
    }
  }

  function onLotteryLogClick(e) {
    const btn = e.target.closest('.lottery-log-toggle');
    if (!btn || typeof LotteryRewards === 'undefined') return;
    const id = btn.dataset.id;
    if (!id) return;
    sfx('click');
    LotteryRewards.toggleRedeemed(id);
    renderLotteryLogPanel();
  }

  function performLottery() {
    if (typeof Backpack === 'undefined') return false;
    if (!Backpack.canLottery()) {
      sfx('click', { playbackRate: 0.85 });
      showComboToast(`需要 ${Backpack.lotteryCostText()} 才能抽奖`, 2000);
      return false;
    }
    const result = Backpack.lotteryOnce();
    if (!result.ok) return false;
    if (result.item && result.record) {
      if (result.item.type === 'reward') {
        sfx('win', { playbackRate: 1.08 });
      } else if (result.item.type === 'thanks') {
        sfx('click', { playbackRate: 1 });
      } else {
        sfx('click', { playbackRate: 0.95 });
      }
      showLotteryResult(result.record);
    }
    if (subPanel && !subPanel.classList.contains('hidden')) {
      renderBackpackPanel();
    }
    return true;
  }

  function onBackpackPanelClick(e) {
    if (e.target.closest('.btn-sss-synth')) {
      sfx('click');
      openSynthPicker();
      return;
    }
    if (e.target.closest('.btn-sss-lottery')) {
      if (e.target.closest('.btn-sss-lottery').disabled) return;
      sfx('click');
      performLottery();
      return;
    }
    if (e.target.closest('.btn-sss-lottery-log')) {
      sfx('click');
      renderLotteryLogPanel();
    }
  }

  function backpackFragmentPool() {
    if (typeof Backpack === 'undefined' || !tilePool.length) return [];
    return Backpack.filterFragmentPool(tilePool);
  }

  function renderBackpackPanel() {
    const pool = backpackFragmentPool();
    const totalFrags =
      typeof Backpack !== 'undefined' ? Backpack.totalFragments() : 0;
    const synthTotal =
      typeof Backpack !== 'undefined' ? Backpack.getSssCount() : 0;
    const dropHint =
      typeof Backpack !== 'undefined'
        ? `通关掉落：普通 ${Backpack.DROP_COUNT.normal} · 困难 ${Backpack.DROP_COUNT.hard} · 挑战 ${Backpack.DROP_COUNT.challenge} 枚`
        : '';
    const sssHero =
      typeof Backpack !== 'undefined' ? Backpack.renderSssHeroHtml() : '';
    const html =
      sssHero +
      `<p class="level-select-hint">碎片合计 ${totalFrags} · SSS卡 ${synthTotal}</p>` +
      `<p class="backpack-legend">${dropHint}</p>` +
      `<p class="backpack-legend backpack-legend--grades">` +
      `<span class="frag-slot frag-slot--A frag-slot--empty" aria-hidden="true"><span class="frag-slot-tag">A</span></span>` +
      `<span class="frag-slot frag-slot--S frag-slot--empty" aria-hidden="true"><span class="frag-slot-tag">S</span></span>` +
      `<span class="frag-slot frag-slot--SS frag-slot--empty" aria-hidden="true"><span class="frag-slot-tag">SS</span></span>` +
      `</p>` +
      `<div class="backpack-grid">` +
      pool
        .map((tile) => {
          const src = typeof TileRarity !== 'undefined' ? TileRarity.getSrc(tile) : tile;
          return typeof Backpack !== 'undefined'
            ? Backpack.renderBackpackCardHtml(src)
            : '';
        })
        .join('') +
      `</div>`;
    showSubPanel('豆豆背包', html);
    if (subPanelBody) {
      subPanelBody.removeEventListener('click', onBackpackPanelClick);
      subPanelBody.addEventListener('click', onBackpackPanelClick);
    }
  }

  function dailyUnlimited() {
    return typeof GameDaily !== 'undefined' && GameDaily.isUnlimitedPlays();
  }

  function dailyCardMetaText(cfg) {
    const lvl = cfg.level;
    const mode = GameModes.get(cfg.modeId || 'normal');
    let meta = `${cfg.pairs}对 · 限时${lvl.timeLimit}s`;
    if (mode.hasMoveLimit && lvl.moveLimit != null) {
      meta += ` · 限步${lvl.moveLimit}`;
    }
    meta += ` · 固定掉落 SSS×1`;
    if (dailyUnlimited()) {
      meta += ' · 测试模式（不限次数·普通第1关）';
    } else {
      meta += ' · 每日一次';
    }
    return meta;
  }

  function renderDailyCard() {
    if (!dailyCard || typeof GameDaily === 'undefined') return;
    const dk = GameDaily.dateKey();
    const cfg = GameDaily.getConfig(tilePool, dk);
    const unlimited = dailyUnlimited();
    const rec = unlimited ? null : Progress.getDailyRecord(dk);
    const streak = Progress.getDailyStreak();
    dailyCard.classList.remove('hidden');
    dailyCard.classList.toggle('daily-card--done', Boolean(rec));
    dailyCard.innerHTML =
      `<p class="daily-card-title">📅 今日挑战</p>` +
      `<p class="daily-card-meta">${dailyCardMetaText(cfg)}` +
      (rec
        ? ` · 今日已完成（${rec.bestMoves} 步）`
        : unlimited
          ? ' · 点击开始'
          : ` · 连续打卡 ${streak} 天 · 点击开始`) +
      `</p>`;
    dailyCard.onclick = () => {
      sfx('click');
      if (!unlimited && rec) {
        showComboToast('今日挑战已完成，明天再来吧～', 2200);
        return;
      }
      startDaily();
    };
  }

  function startDaily() {
    if (typeof GameDaily === 'undefined') return;
    const dk = GameDaily.dateKey();
    if (!dailyUnlimited() && Progress.getDailyRecord(dk)) {
      showComboToast('今日挑战已完成，明天再来吧～', 2200);
      renderDailyCard();
      return;
    }
    isDailyRun = true;
    dailyConfig = GameDaily.getConfig(tilePool, dk);
    currentModeId = dailyConfig.modeId || 'normal';
    gameOver = false;
    showGame();
    renderDailyLevel();
  }

  function updateDailyHud() {
    const cfg = dailyConfig;
    if (!cfg) return;
    const mode = GameModes.get(cfg.modeId || 'normal');
    const uniqueHint =
      lastUniqueImageCount > 0 ? ` · ${lastUniqueImageCount}种图` : '';
    const testTag = dailyUnlimited() ? ' · 测试' : '';
    levelLabel.textContent =
      `今日挑战 · ${cfg.pairs}对${uniqueHint} · ${mode.label}${testTag}`;
    if (dropRateHud) {
      dropRateHud.textContent = '固定掉落 SSS×1';
      dropRateHud.classList.remove('hidden');
    }

    if (mode.hasMoveLimit) {
      const movesLeft = moveLimit - moves;
      movesLabel.textContent = `步数: ${moves}/${moveLimit}`;
      movesLabel.classList.remove('hidden');
      movesLabel.classList.toggle('warn', movesLeft <= 3 && movesLeft >= 0 && !gameOver);
    } else {
      movesLabel.textContent = `步数: ${moves}`;
      movesLabel.classList.remove('hidden');
      movesLabel.classList.remove('warn');
    }

    if (hasTimeLimit()) {
      timerLabel.textContent = `时间: ${timeLeft}s`;
      timerLabel.classList.remove('hidden');
      timerLabel.classList.toggle('warn', timeLeft <= 10 && !gameOver);
    } else {
      timerLabel.classList.add('hidden');
    }

    if (comboHud) {
      if (combo >= 2) {
        comboHud.textContent = `连击 x${combo}`;
        comboHud.classList.remove('hidden');
      } else {
        comboHud.classList.add('hidden');
      }
    }
  }

  function renderDailyLevel() {
    const cfg = dailyConfig;
    if (!cfg) return;

    stopTimer();
    gameOver = false;
    moves = 0;
    matchedCount = 0;
    combo = 0;
    comboMax = 0;
    challengeCoverCount = 0;
    firstCard = null;
    secondCard = null;
    lock = false;

    const level = cfg.level;
    const mode = GameModes.get(cfg.modeId || 'normal');
    moveLimit = mode.hasMoveLimit ? level.moveLimit : 0;
    timeLeft = level.timeLimit;
    hintsLeft = GameModes.hintCountFor(mode);
    hintsUsed = 0;

    const deck = GameDaily.buildDeck(cfg.images, cfg.deckSeed);
    totalPairs = Math.max(1, Math.floor(deck.length / 2));
    lastUniqueImageCount = new Set(cfg.images).size;
    victoryPending = false;
    victoryShown = false;

    board.innerHTML = '';
    deck.forEach((data, i) => {
      board.appendChild(createCard(data, i));
    });

    updateDailyHud();
    updateComboHud();
    updateHintButton();
    updateGameChrome();
    hideOverlay();
    scheduleFitBoard(deck.length);
    startTimer();
  }

  function showGame() {
    closeLevelPicker();
    updateGameChrome();
    hideSubPanel();
    if (homePage) {
      homePage.classList.add('hidden');
      homePage.setAttribute('aria-hidden', 'true');
    }
    if (gamePage) {
      gamePage.classList.remove('hidden');
      gamePage.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('game-active');
    if (appEl) {
      appEl.classList.add('game-active');
      appEl.classList.remove('home-view');
    }
    if (errorMsg) errorMsg.classList.add('hidden');
    ensureGlobalBgm();
  }

  function renderLevelList() {
    levelList.innerHTML = '';
    const mode = currentMode();

    levelSelectHint.textContent = `${mode.label}：${levels.length} 关（难度递增）`;

    if (levels.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'level-empty-hint';
      empty.textContent = `当前模式无关卡，请运行 node scripts/generate-manifest.js`;
      levelList.appendChild(empty);
      return;
    }

    levels.forEach((level, index) => {
      const cfg = getLevelConfig(level);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-item';
      let meta = levelMetaText(cfg);
      if (level.stage && level.stage > 1) {
        meta += ` · ${level.difficultyLabel} ${level.stage}`;
      } else if (level.difficultyLabel) {
        meta += ` · ${level.difficultyLabel}`;
      }
      btn.innerHTML =
        `<span class="level-item-name">${level.name}</span>` +
        `<span class="level-item-meta">${meta}</span>` +
        `<span class="level-item-tag tag-mode-${mode.id}">${mode.label}</span>`;
      btn.addEventListener('click', () => {
        sfx('click');
        closeLevelPicker();
        startLevel(index);
      });
      levelList.appendChild(btn);
    });
  }

  function startLevel(index) {
    const level = levels[index];
    if (!level) return;
    currentLevelIndex = index;
    gameOver = false;
    showGame();
    renderLevel();
  }

  function dropModeId() {
    return isDailyRun ? 'daily' : currentModeId;
  }

  function dropStageIndex() {
    const level = levels[currentLevelIndex];
    if (!level) return 0;
    if (level.stage != null) return Math.max(0, level.stage - 1);
    return currentLevelIndex;
  }

  function updateDropRateHud() {
    if (!dropRateHud) return;
    if (isDailyRun) {
      dropRateHud.textContent = '固定掉落 SSS×1';
      dropRateHud.classList.remove('hidden');
      return;
    }
    if (typeof Backpack === 'undefined') {
      dropRateHud.classList.add('hidden');
      return;
    }
    const modeId = dropModeId();
    const stageIdx = dropStageIndex();
    const w = Backpack.weightsFor(modeId, stageIdx);
    const n = Backpack.dropCountForMode(modeId);
    dropRateHud.textContent =
      `本关碎片掉落 ${n} 枚 · A ${w.A}% · S ${w.S}% · SS ${w.SS}%`;
    dropRateHud.classList.remove('hidden');
  }

  function updateHud() {
    if (isDailyRun && dailyConfig) {
      updateDailyHud();
      return;
    }
    const level = levels[currentLevelIndex];
    if (!level) return;

    const cfg = getLevelConfig(level);
    const mode = currentMode();

    const uniqueHint =
      lastUniqueImageCount > 0 ? ` · ${lastUniqueImageCount}种图` : '';
    levelLabel.textContent = `${level.name} · ${cfg.pairs}对${uniqueHint} · ${mode.label}`;
    updateDropRateHud();

    if (mode.hasMoveLimit) {
      const movesLeft = moveLimit - moves;
      movesLabel.textContent = `步数: ${moves}/${moveLimit}`;
      movesLabel.classList.remove('hidden');
      movesLabel.classList.toggle('warn', movesLeft <= 3 && movesLeft >= 0 && !gameOver);
    } else if (mode.hasIdlePenalty) {
      const limit = idleLimitFor(level);
      const left = Math.max(0, limit - idleSeconds);
      if (matchedCount > 0 && idleTargetPairId !== null) {
        movesLabel.textContent = `压力倒计时: ${left}s`;
        movesLabel.classList.toggle('warn', left <= 3 && !gameOver);
      } else {
        movesLabel.textContent = `步数: ${moves}`;
        movesLabel.classList.remove('warn');
      }
      movesLabel.classList.remove('hidden');
    } else {
      movesLabel.textContent = `步数: ${moves}`;
      movesLabel.classList.remove('hidden');
      movesLabel.classList.remove('warn');
    }

    if (hasTimeLimit()) {
      timerLabel.textContent = `时间: ${timeLeft}s`;
      timerLabel.classList.toggle('warn', timeLeft <= 10 && !gameOver);
    } else {
      timerLabel.textContent = '时间: 不限';
      timerLabel.classList.remove('warn');
    }

    updateMatchedIdleVisuals();
  }

  function endGame() {
    gameOver = true;
    stopTimer();
    lock = true;
    board.querySelectorAll('.card').forEach((c) => {
      c.disabled = true;
    });
  }

  function buildDeck(images) {
    const deck = [];
    images.forEach((src, pairId) => {
      deck.push({ pairId, src });
      deck.push({ pairId, src });
    });
    return shuffle(deck);
  }

  /** 相同表情包即可配对（允许一图多对） */
  function cardsMatch(a, b) {
    if (!a || !b) return false;
    const src = a.dataset.src;
    return Boolean(src && src === b.dataset.src);
  }

  function createCard(data, index) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.dataset.index = String(index);
    btn.dataset.pairId = String(data.pairId);
    btn.dataset.src = data.src;
    btn.setAttribute('aria-label', '记忆牌');

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const back = document.createElement('div');
    back.className = 'card-face card-back';
    back.textContent = '?';
    back.setAttribute('aria-hidden', 'true');

    const front = document.createElement('div');
    front.className = 'card-face card-front';

    const img = document.createElement('img');
    img.src = data.src;
    img.alt = '';
    img.draggable = false;
    img.loading = 'eager';
    front.appendChild(img);

    inner.appendChild(back);
    inner.appendChild(front);
    btn.appendChild(inner);

    btn.addEventListener('click', onCardActivate);
    return btn;
  }

  function onCardActivate(e) {
    handleCardFlip(e.currentTarget);
  }

  function checkMoveLimit() {
    const mode = currentMode();
    if (!mode.hasMoveLimit) return false;
    if (moves >= moveLimit && !isBoardCleared() && matchedCount < totalPairs) {
      showFail('步数用完了');
      return true;
    }
    return false;
  }

  function handleCardFlip(card) {
    if (gameOver || lock) return;
    if (card.classList.contains(FLIPPED_CLASS) || isCardRemoved(card)) return;

    card.classList.add(FLIPPED_CLASS);
    sfx('flip');

    if (!firstCard) {
      firstCard = card;
      return;
    }

    if (firstCard === card) return;

    secondCard = card;
    moves += 1;
    updateHud();

    const match = cardsMatch(firstCard, secondCard);

    if (match) {
      onComboMatch();
      const cardA = firstCard;
      const cardB = secondCard;

      const afterMatch = () => {
        matchedCount += 1;
        resetIdleOnMatch();
        updateHintButton();
        if (tryVictory()) return;
        checkMoveLimit();
      };

      if (useCrushEffect()) {
        resetTurn();
        playCrushMatch(cardA, cardB, afterMatch);
      } else {
        lock = true;
        cardA.classList.add(MATCHED_CLASS);
        cardB.classList.add(MATCHED_CLASS);
        cardA.disabled = true;
        cardB.disabled = true;
        afterMatch();
        resetTurn();
      }
    } else {
      lock = true;
      resetCombo();
      sfx('mismatch');
      setTimeout(() => {
        if (gameOver) return;
        firstCard.classList.remove(FLIPPED_CLASS);
        secondCard.classList.remove(FLIPPED_CLASS);
        resetTurn();
        updateHintButton();
        checkMoveLimit();
      }, FLIP_BACK_MS);
    }
  }

  function resetTurn() {
    firstCard = null;
    secondCard = null;
    lock = false;
  }

  function renderLevel() {
    const level = levels[currentLevelIndex];
    if (!level) return;

    stopTimer();
    gameOver = false;
    moves = 0;
    matchedCount = 0;
    idleSeconds = 0;
    idleTargetPairId = null;
    idleWarnSfxPlayed = false;
    firstCard = null;
    secondCard = null;
    lock = false;
    combo = 0;
    comboMax = 0;
    challengeCoverCount = 0;
    hintsUsed = 0;
    hintsLeft = GameModes.hintCountFor(currentMode());

    const pairs = pairCount(level);
    const images = pickRandomImages(pairs, level);
    lastUniqueImageCount = new Set(images).size;

    const cfg = getLevelConfig({ ...level, pairs });
    moveLimit = cfg.moveLimit;
    timeLeft = hasTimeLimit() ? cfg.timeLimit : 0;

    const deck = buildDeck(images);
    totalPairs = Math.max(1, Math.floor(deck.length / 2));
    victoryPending = false;
    victoryShown = false;

    board.innerHTML = '';
    deck.forEach((data, i) => {
      board.appendChild(createCard(data, i));
    });
    updateHud();
    updateComboHud();
    updateHintButton();
    updateGameChrome();
    hideOverlay();
    scheduleFitBoard(deck.length);
    startTimer();

    const runTutorial =
      typeof Tutorial !== 'undefined' &&
      Tutorial.shouldRun() &&
      pairs <= 4 &&
      !isDailyRun;
    if (runTutorial) {
      Tutorial.startAfterDelay(null);
    }
  }

  function failMessage(reason) {
    const mode = currentMode();
    const name = isDailyRun
      ? '今日挑战'
      : levels[currentLevelIndex]?.name || '关卡';
    if (mode.hasMoveLimit) {
      return `${name}：${reason}（已用 ${moves}/${moveLimit} 步）`;
    }
    return `${name}：${reason}`;
  }

  function winMessage() {
    if (isDailyRun) {
      return (
        `今日挑战完成，用了 ${moves} 步` +
        (timeLeft > 0 ? `，剩余 ${timeLeft} 秒` : '') +
        ` · 获得 SSS 专属卡 ×1`
      );
    }
    const level = levels[currentLevelIndex];
    const mode = currentMode();
    const name = level?.name || '关卡';
    const base = hasTimeLimit()
      ? `${name} 完成，用了 ${moves} 步，剩余 ${timeLeft} 秒`
      : `${name} 完成，用了 ${moves} 步`;
    return `${base}（${mode.label}）`;
  }

  function buildShareText() {
    const level = levels[currentLevelIndex];
    const name = isDailyRun ? '今日挑战' : level?.name || '豆豆大挑战';
    return `豆豆大挑战 ${name} ${moves}步`;
  }

  function showAchievementPop(items) {
    if (!achievementPop || !items.length) return;
    achievementPop.textContent = `解锁成就：${items.map((a) => a.title).join('、')}`;
    achievementPop.classList.remove('hidden');
    sfx('win', { playbackRate: 1.1 });
  }

  function dailySssRevealHtml() {
    const src =
      typeof Backpack !== 'undefined'
        ? Backpack.SSS_CARD_SRC
        : 'assets/tiles/25.png';
    return (
      '<div class="drop-reveal daily-sss-reveal">' +
      '<p class="drop-reveal-title">获得奖励</p>' +
      '<div class="daily-sss-reveal-card">' +
      `<img src="${src}" alt="" loading="eager" />` +
      '<p class="daily-sss-reveal-label">SSS 专属卡 ×1</p>' +
      '</div></div>'
    );
  }

  function finishDailyOverlay() {
    hideOverlay();
    isDailyRun = false;
    dailyConfig = null;
    showHome();
    renderDailyCard();
  }

  function showOverlay(mode, title, text, options = {}) {
    if (!overlay) return;
    const isWin = mode === 'win';
    const revealDrops = isWin && options.revealDrops?.length;
    const dailySss = isWin && options.dailySssReveal;
    if (modal) {
      modal.classList.toggle('fail', !isWin);
      modal.classList.toggle('modal--revealing', Boolean(revealDrops));
    }
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayText) overlayText.textContent = text;
    if (overlayDrops) {
      if (dailySss) {
        overlayDrops.innerHTML = dailySssRevealHtml();
        overlayDrops.classList.remove('hidden');
        overlayDrops.setAttribute('aria-hidden', 'false');
      } else if (revealDrops && typeof Backpack !== 'undefined') {
        overlayDrops.innerHTML = Backpack.getDropRevealContainerHtml();
        overlayDrops.classList.remove('hidden');
        overlayDrops.setAttribute('aria-hidden', 'false');
      } else {
        overlayDrops.innerHTML = '';
        overlayDrops.classList.add('hidden');
        overlayDrops.setAttribute('aria-hidden', 'true');
      }
    }
    if (btnShare) btnShare.classList.toggle('hidden', !isWin || isDailyRun);
    if (btnReplay) btnReplay.classList.toggle('hidden', isDailyRun);
    if (btnOverlayClose) {
      btnOverlayClose.classList.toggle('hidden', !isDailyRun);
      btnOverlayClose.classList.toggle('primary', isDailyRun);
    }
    if (btnSelect) btnSelect.classList.toggle('hidden', isDailyRun);
    const showNext = isWin && !isDailyRun;
    if (showNext && btnNext) {
      btnNext.textContent = isLastAvailableLevel(currentLevelIndex)
        ? '返回选关'
        : '下一关';
    }
    if (btnNext) btnNext.classList.toggle('hidden', !showNext);
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function showWin() {
    if (victoryShown) return;
    victoryShown = true;
    stopTimer();
    gameOver = false;
    lock = false;
    const level = levels[currentLevelIndex];

    let drops = [];
    let dailySssReveal = false;
    if (isDailyRun && dailyConfig) {
      Progress.recordDaily(dailyConfig.dateKey, { moves });
      if (typeof Backpack !== 'undefined') {
        Backpack.addSssCount(dailyConfig.rewardSss || 1);
      }
      dailySssReveal = true;
    } else if (typeof Backpack !== 'undefined') {
      const stageIdx = level?.stage ? level.stage - 1 : 0;
      drops = Backpack.rollDrops(currentModeId, stageIdx, tilePool);
      Backpack.applyDrops(drops);
    }

    const backpackOwned =
      typeof Backpack !== 'undefined' ? Backpack.ownedCardCount(tilePool) : 0;
    const unlocked = Achievements.checkAfterWin({
      comboMax,
      isDaily: isDailyRun,
      pairs: totalPairs,
      modeId: isDailyRun ? 'daily' : currentModeId,
      backpackOwned,
      backpackTotal: tilePool.length,
      wasCovered: challengeCoverCount > 0,
      hintsUsed,
    });

    endGame();
    sfx('win');
    const title = isDailyRun ? '今日挑战完成！' : '过关！';
    const winText = winMessage();
    showOverlay('win', title, winText, { revealDrops: drops, dailySssReveal });

    const afterReveal = () => {
      if (modal) modal.classList.remove('modal--revealing');
      if (unlocked.length) {
        setTimeout(() => showAchievementPop(unlocked), 300);
      }
    };

    if (dailySssReveal) {
      afterReveal();
    } else if (drops.length && typeof Backpack.playDropReveal === 'function') {
      const root = overlayDrops?.querySelector('.drop-reveal');
      Backpack.playDropReveal(root, drops, {
        sfx: (name, opts) => sfx(name, opts),
        onComplete: afterReveal,
      });
    } else {
      afterReveal();
    }
  }

  function showFail(reason) {
    if (victoryShown) return;
    if (tryVictory()) return;
    if (gameOver) return;
    endGame();
    sfx('fail');
    showOverlay('fail', '挑战失败', failMessage(reason));
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    if (modal) modal.classList.remove('fail');
    if (achievementPop) achievementPop.classList.add('hidden');
    if (modal) modal.classList.remove('modal--revealing');
    if (overlayDrops) {
      overlayDrops.innerHTML = '';
      overlayDrops.classList.add('hidden');
      overlayDrops.setAttribute('aria-hidden', 'true');
    }
  }

  function applyLevelData(data) {
    if (!data.levels || data.levels.length === 0) throw new Error('无关卡数据');
    baseLevels = data.levels;
    modeLevelSets = data.modeLevels || {};
    tilePool =
      typeof TileRarity !== 'undefined'
        ? TileRarity.normalizeTiles(data.tiles || [])
        : data.tiles || [];
    if (typeof Backpack !== 'undefined') Backpack.getBackpack();
    applyLevelsForCurrentMode();
    showHome();
  }

  function loadEmbeddedLevels() {
    if (window.LEVELS_DATA) {
      applyLevelData(window.LEVELS_DATA);
      return true;
    }
    return false;
  }

  async function loadLevels() {
    if (location.protocol === 'file:') {
      if (loadEmbeddedLevels()) return;
      showError(
        '无法离线启动。请先在项目目录运行：\nnode scripts/generate-manifest.js\n\n会生成 js/levels-data.js，之后可双击 index.html 游玩。'
      );
      return;
    }

    try {
      const res = await fetch('levels.json');
      if (!res.ok) throw new Error(res.statusText);
      applyLevelData(await res.json());
    } catch {
      if (loadEmbeddedLevels()) return;
      showError(
        '无法加载关卡。请运行：\nnode scripts/generate-manifest.js'
      );
    }
  }

  if (btnMenu) {
    btnMenu.addEventListener('click', () => {
      sfx('click');
      openLevelPicker();
    });
  }

  if (btnHome) {
    btnHome.addEventListener('click', () => {
      sfx('click');
      if (!gameOver) endGame();
      showHome();
    });
  }

  if (btnSelect) {
    btnSelect.addEventListener('click', () => {
      sfx('click');
      hideOverlay();
      if (isDailyRun) {
        showHome();
        return;
      }
      openLevelPicker();
    });
  }

  if (btnPickLevel) {
    btnPickLevel.addEventListener('click', () => {
      sfx('click');
      openLevelPicker();
    });
  }

  if (btnAchievements) {
    btnAchievements.addEventListener('click', () => {
      sfx('click');
      renderAchievementsPanel();
    });
  }

  if (btnBackpack) {
    btnBackpack.addEventListener('click', () => {
      sfx('click');
      renderBackpackPanel();
    });
  }

  if (btnLotteryLog) {
    btnLotteryLog.addEventListener('click', () => {
      sfx('click');
      renderLotteryLogPanel();
    });
  }

  if (btnQuickStart) {
    btnQuickStart.addEventListener('click', () => {
      sfx('click');
      quickStart();
    });
  }

  if (btnLevelPickerClose) {
    btnLevelPickerClose.addEventListener('click', () => {
      sfx('click');
      closeLevelPicker();
    });
  }

  if (levelPicker) {
    levelPicker.addEventListener('click', (e) => {
      if (e.target === levelPicker) closeLevelPicker();
    });
  }

  if (btnSynthPickerClose) {
    btnSynthPickerClose.addEventListener('click', () => {
      sfx('click');
      closeSynthPicker();
    });
  }

  if (synthPicker) {
    synthPicker.addEventListener('click', (e) => {
      if (e.target === synthPicker) closeSynthPicker();
    });
    synthPickerList?.addEventListener('click', onSynthPickerClick);
  }

  if (btnLotteryResultClose) {
    btnLotteryResultClose.addEventListener('click', () => {
      sfx('click');
      closeLotteryResult();
    });
  }

  if (lotteryResult) {
    lotteryResult.addEventListener('click', (e) => {
      if (e.target === lotteryResult) closeLotteryResult();
    });
  }

  if (btnReplay) {
    btnReplay.addEventListener('click', () => {
      sfx('click');
      hideOverlay();
      if (isDailyRun) {
        if (
          !dailyUnlimited() &&
          dailyConfig &&
          Progress.getDailyRecord(dailyConfig.dateKey)
        ) {
          hideOverlay();
          showHome();
          renderDailyCard();
          return;
        }
        renderDailyLevel();
      } else {
        renderLevel();
      }
    });
  }

  if (btnOverlayClose) {
    btnOverlayClose.addEventListener('click', () => {
      sfx('click');
      finishDailyOverlay();
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
    sfx('click');
    hideOverlay();
    const next = getNextLevelIndex(currentLevelIndex);
    if (next === null) {
      showHome();
    } else {
      startLevel(next);
    }
    });
  }

  if (btnHint) {
    btnHint.addEventListener('click', () => useHint());
  }

  if (btnShare) {
    btnShare.addEventListener('click', async () => {
      const text = buildShareText();
      try {
        if (navigator.share) {
          await navigator.share({ title: '豆豆大挑战', text });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          btnShare.textContent = '已复制';
          setTimeout(() => {
            btnShare.textContent = '分享成绩';
          }, 1500);
        }
      } catch {
        /* 用户取消分享 */
      }
    });
  }

  if (btnSubBack) {
    btnSubBack.addEventListener('click', () => {
      sfx('click');
      hideSubPanel();
    });
  }

  if (btnSound) btnSound.addEventListener('click', toggleSound);
  if (btnSoundGame) btnSoundGame.addEventListener('click', toggleSound);
  updateSoundButton();

  function refitBoardIfVisible() {
    if (lastBoardCardCount && gamePage && !gamePage.classList.contains('hidden')) {
      fitBoardGrid(lastBoardCardCount);
    }
  }

  window.addEventListener('resize', refitBoardIfVisible);

  if (boardViewport && typeof ResizeObserver !== 'undefined') {
    const boardResizeObserver = new ResizeObserver(refitBoardIfVisible);
    boardResizeObserver.observe(boardViewport);
  }

  loadLevels();

  /** F12 调试：setSssCount(5) 设置 SSS 卡数量，getSssCount() 查询 */
  window.setSssCount = function (count) {
    if (typeof Backpack === 'undefined') {
      console.warn('[豆豆] Backpack 未加载');
      return 0;
    }
    const n = Backpack.setSssCount(count);
    console.log(`[豆豆] SSS 卡数量 = ${n}`);
    if (
      subPanel &&
      !subPanel.classList.contains('hidden') &&
      subPanelTitle &&
      subPanelTitle.textContent === '豆豆背包'
    ) {
      renderBackpackPanel();
    }
    return n;
  };

  window.getSssCount = function () {
    return typeof Backpack !== 'undefined' ? Backpack.getSssCount() : 0;
  };
})();
