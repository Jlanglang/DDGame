(function () {
  'use strict';

  const FLIP_BACK_MS = 600;
  const FADE_AFTER_FLIP_MS = 380;
  const MATCH_FADE_MS = 1000;
  const MATCH_FADE_STAGGER_MS = 150;
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
  const homeHint = document.getElementById('home-hint');
  const modeList = document.getElementById('mode-list');
  const btnSound = document.getElementById('btn-sound');
  const btnSoundGame = document.getElementById('btn-sound-game');
  const btnMenu = document.getElementById('btn-menu');
  const btnHome = document.getElementById('btn-home');
  const overlay = document.getElementById('overlay');
  const modal = overlay.querySelector('.modal');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const btnReplay = document.getElementById('btn-replay');
  const btnNext = document.getElementById('btn-next');
  const btnSelect = document.getElementById('btn-select');
  const btnHint = document.getElementById('btn-hint');
  const hintCountEl = document.getElementById('hint-count');
  const comboHud = document.getElementById('combo-hud');
  const comboToast = document.getElementById('combo-toast');
  const overlayStars = document.getElementById('overlay-stars');
  const achievementPop = document.getElementById('achievement-pop');
  const btnShare = document.getElementById('btn-share');
  const dailyCard = document.getElementById('daily-card');
  const subPanel = document.getElementById('sub-panel');
  const subPanelTitle = document.getElementById('sub-panel-title');
  const subPanelBody = document.getElementById('sub-panel-body');
  const btnSubBack = document.getElementById('btn-sub-back');
  const btnAchievements = document.getElementById('btn-achievements');
  const btnGallery = document.getElementById('btn-gallery');

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
  let lastBoardCardCount = 0;
  let combo = 0;
  let comboMax = 0;
  let hintsLeft = 0;
  let hintsUsed = 0;
  let isDailyRun = false;
  let isEndlessRun = false;
  let endlessPairs = 4;
  let dailyConfig = null;
  let challengeCoverCount = 0;
  let lastWinStars = 0;
  let idleWarnSfxPlayed = false;

  function currentMode() {
    return GameModes.get(currentModeId);
  }

  function sfx(name, opts) {
    if (typeof GameAudio !== 'undefined') GameAudio.play(name, opts);
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

  function showComboToast(text) {
    if (!comboToast) return;
    comboToast.textContent = text;
    comboToast.classList.remove('hidden');
    setTimeout(() => comboToast.classList.add('hidden'), 900);
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

    const byPair = {};
    unmatched.forEach((c) => {
      const id = c.dataset.pairId;
      if (!byPair[id]) byPair[id] = [];
      byPair[id].push(c);
    });
    const pairIds = Object.keys(byPair).filter((id) => byPair[id].length >= 2);
    if (!pairIds.length) return;

    const pickId = pairIds[Math.floor(Math.random() * pairIds.length)];
    const pairCards = byPair[pickId].slice(0, 2);
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
      btn.setAttribute('aria-label', on ? '关闭音效' : '开启音效');
    });
  }

  function toggleSound() {
    if (typeof GameAudio === 'undefined') return;
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
    const n = level.pairs ?? level.images.length;
    return Math.min(n, MAX_PAIRS);
  }

  /** 每次开局从图池随机抽取 N 张不同的表情包 */
  function pickRandomImages(pairs) {
    const pool = tilePool.length ? tilePool : [];
    if (pool.length < pairs) {
      const level = levels[currentLevelIndex];
      return level?.images?.slice(0, pairs) || pool.slice();
    }
    return shuffle(pool).slice(0, pairs);
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
    };
  }

  function applyLevelsForCurrentMode() {
    const mode = currentMode();
    isDailyRun = false;
    isEndlessRun = false;
    if (mode.isEndless) {
      isEndlessRun = true;
      endlessPairs = Math.max(4, Progress.getEndlessBest() > 0 ? 4 : 4);
      levels = [
        {
          id: 'endless',
          name: '无尽挑战',
          pairs: endlessPairs,
        },
      ];
    } else if (mode.minPairs && modeLevelSets[mode.id]?.length) {
      levels = modeLevelSets[mode.id];
    } else if (mode.minPairs) {
      levels = baseLevels.filter((lv) => pairCount(lv) >= mode.minPairs);
    } else {
      levels = baseLevels;
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
    const limit = mode.idleSeconds || 10;
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
    const limit = mode.idleSeconds || 10;
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
    appEl.classList.remove('game-active');
    appEl.classList.add('home-view');
    if (homePage) {
      homePage.classList.remove('hidden');
      homePage.setAttribute('aria-hidden', 'false');
    }
    if (gamePage) {
      gamePage.classList.add('hidden');
      gamePage.setAttribute('aria-hidden', 'true');
    }
    if (homeMenu) homeMenu.classList.add('hidden');
    errorMsg.textContent = text;
    errorMsg.classList.remove('hidden');
  }

  function getModeLevelTotal(modeId) {
    const mode = GameModes.get(modeId);
    if (mode.isEndless) return 1;
    if (modeId === currentModeId) return levels.length;
    if (mode.minPairs && modeLevelSets[modeId]) {
      return modeLevelSets[modeId].length;
    }
    if (mode.minPairs) {
      return baseLevels.filter((lv) => pairCount(lv) >= mode.minPairs).length;
    }
    return baseLevels.length;
  }

  function renderModeList() {
    modeList.innerHTML = '';
    GameModes.LIST.forEach((mode) => {
      const done = Progress.getCompletedCount(mode.id);
      const total = getModeLevelTotal(mode.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-btn' + (mode.id === currentModeId ? ' active' : '');
      btn.dataset.mode = mode.id;
      btn.innerHTML =
        `<span class="mode-btn-label">${mode.label}</span>` +
        `<span class="mode-btn-desc">${mode.desc}</span>` +
        `<span class="mode-btn-progress">已通关 ${done}/${total}</span>`;
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
      return `${cfg.pairs} 对 · 不限时 · 随机一对${mode.idleSeconds}s惩罚`;
    }
    return `${cfg.pairs} 对 · ${cfg.timeLimit}s`;
  }

  function openLevelPicker() {
    if (!levelPicker) return;
    renderLevelList();
    levelPicker.classList.remove('hidden');
    levelPicker.setAttribute('aria-hidden', 'false');
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
    appEl.classList.remove('game-active');
    appEl.classList.add('home-view');
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
    errorMsg.classList.add('hidden');
    renderModeList();
    renderDailyCard();
    updateHomeHint();
  }

  function showLevelSelect() {
    showHome();
  }

  function updateHomeHint() {
    const mode = currentMode();
    const level = levels[currentLevelIndex];
    let hint = '选择模式后，选关或快速开始 · 每局随机表情包';

    if (mode.isEndless) {
      hint = `无尽模式 · 最高 ${Progress.getEndlessBest() || 0} 对 · 快速开始或选关`;
    } else if (level) {
      hint = `${mode.label} · 当前 ${level.name}（${pairCount(level)} 对）· 可换关或快速开始`;
    }

    if (homeHint) homeHint.textContent = hint;
  }

  function quickStart() {
    const mode = currentMode();
    if (mode.isEndless) {
      endlessPairs = 4;
      if (levels[0]) levels[0].pairs = 4;
      startLevel(0);
      return;
    }
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

  function renderGalleryPanel() {
    const discovered = new Set(Progress.getGallery());
    const pool = tilePool.length ? tilePool : [];
    const html =
      `<p class="level-select-hint">已收集 ${discovered.size}/${pool.length || '?'}</p>` +
      `<div class="gallery-grid">` +
      pool
        .map((src) => {
          const ok = discovered.has(src);
          return (
            `<div class="gallery-item${ok ? '' : ' gallery-item--locked'}">` +
            `<img src="${src}" alt="" loading="lazy" />` +
            `</div>`
          );
        })
        .join('') +
      `</div>`;
    showSubPanel('豆豆图鉴', html);
  }

  function renderDailyCard() {
    if (!dailyCard || typeof GameDaily === 'undefined') return;
    const dk = GameDaily.dateKey();
    const cfg = GameDaily.getConfig(tilePool, dk);
    const rec = Progress.getDailyRecord(dk);
    const streak = Progress.getDailyStreak();
    dailyCard.classList.remove('hidden');
    dailyCard.classList.toggle('daily-card--done', Boolean(rec));
    dailyCard.innerHTML =
      `<p class="daily-card-title">📅 今日挑战</p>` +
      `<p class="daily-card-meta">${cfg.pairs} 对 · 全员同题 · 连续 ${streak} 天` +
      (rec ? ` · 已完成 ${Progress.starsText(rec.bestStars)}` : ' · 点击开始') +
      `</p>`;
    dailyCard.onclick = () => {
      sfx('click');
      startDaily();
    };
  }

  function startDaily() {
    if (typeof GameDaily === 'undefined') return;
    isDailyRun = true;
    isEndlessRun = false;
    dailyConfig = GameDaily.getConfig(tilePool);
    currentModeId = 'normal';
    gameOver = false;
    showGame();
    renderDailyLevel();
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
    hintsLeft = 2;
    hintsUsed = 0;
    challengeCoverCount = 0;
    firstCard = null;
    secondCard = null;
    lock = false;

    const pairs = cfg.pairs;
    totalPairs = pairs;
    Progress.discoverTiles(cfg.images);

    const deck = GameDaily.buildDeck(cfg.images, cfg.deckSeed);
    const diff = Difficulty.forPairs(pairs);
    moveLimit = diff.moveLimit;
    timeLeft = diff.timeLimit;

    levelLabel.textContent = `今日挑战 · ${pairs}对`;

    board.innerHTML = '';
    deck.forEach((data, i) => {
      board.appendChild(createCard(data, i));
    });
    requestAnimationFrame(() => fitBoardGrid(deck.length));

    updateHud();
    updateHintButton();
    hideOverlay();
    startTimer();
  }

  function showGame() {
    closeLevelPicker();
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
    appEl.classList.add('game-active');
    appEl.classList.remove('home-view');
    errorMsg.classList.add('hidden');
  }

  function renderLevelList() {
    levelList.innerHTML = '';
    const mode = currentMode();

    if (mode.isEndless) {
      const best = Progress.getEndlessBest();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-item';
      btn.innerHTML =
        `<span class="level-item-name">开始无尽</span>` +
        `<span class="level-item-meta">从 4 对起，每关 +1 对 · 最高记录 ${best || 0} 对</span>` +
        `<span class="level-item-tag tag-mode-endless">无尽</span>`;
      btn.addEventListener('click', () => {
        sfx('click');
        closeLevelPicker();
        endlessPairs = 4;
        levels[0].pairs = 4;
        startLevel(0);
      });
      levelList.appendChild(btn);
      return;
    }

    const done = Progress.getCompletedCount(mode.id);
    if (mode.minPairs) {
      levelSelectHint.textContent =
        `${mode.label}：${levels.length} 关（${mode.minPairs} 对起）· 已通关 ${done}/${levels.length}`;
    } else {
      levelSelectHint.textContent = `选关开始 · 已通关 ${done}/${levels.length}`;
    }

    if (levels.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'level-empty-hint';
      empty.textContent = `当前模式无关卡，请运行 node scripts/generate-manifest.js`;
      levelList.appendChild(empty);
      return;
    }

    levels.forEach((level, index) => {
      const cfg = getLevelConfig(level);
      const completed = Progress.isCompleted(mode.id, level.id);
      const record = completed ? Progress.getRecord(mode.id, level.id) : null;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-item' + (completed ? ' level-item--done' : '');
      let meta = levelMetaText(cfg);
      if (record) {
        meta += ` · 最佳 ${record.bestMoves} 步`;
      }
      const stars = record?.bestStars ? Progress.starsText(record.bestStars) : '';
      const starsHtml = stars
        ? `<span class="level-item-stars">${stars}</span>`
        : '';
      btn.innerHTML =
        `<span class="level-item-name">${level.name}${completed ? ' ✓' : ''}</span>` +
        `<span class="level-item-meta">${meta}</span>` +
        starsHtml +
        `<span class="level-item-tag tag-mode-${mode.id}">${completed ? '已通关' : mode.label}</span>`;
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

  function updateHud() {
    const level = levels[currentLevelIndex];
    if (!level) return;

    const cfg = getLevelConfig(level);
    const mode = currentMode();

    levelLabel.textContent = `${level.name} · ${cfg.pairs}对 · ${mode.label}`;

    if (mode.hasMoveLimit) {
      const movesLeft = moveLimit - moves;
      movesLabel.textContent = `步数: ${moves}/${moveLimit}`;
      movesLabel.classList.remove('hidden');
      movesLabel.classList.toggle('warn', movesLeft <= 3 && movesLeft >= 0 && !gameOver);
    } else if (mode.hasIdlePenalty) {
      const limit = mode.idleSeconds || 10;
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

  function createCard(data, index) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.dataset.index = String(index);
    btn.dataset.pairId = String(data.pairId);
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
    if (moves >= moveLimit && matchedCount < totalPairs) {
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
    lock = true;

    const match = firstCard.dataset.pairId === secondCard.dataset.pairId;

    if (match) {
      onComboMatch();
      const cardA = firstCard;
      const cardB = secondCard;

      const afterMatch = () => {
        matchedCount += 1;
        resetIdleOnMatch();
        resetTurn();
        updateHintButton();
        if (checkMoveLimit()) return;
        if (matchedCount >= totalPairs) {
          setTimeout(showWin, useCrushEffect() ? 350 : 400);
        }
      };

      if (useCrushEffect()) {
        playCrushMatch(cardA, cardB, afterMatch);
      } else {
        cardA.classList.add(MATCHED_CLASS);
        cardB.classList.add(MATCHED_CLASS);
        cardA.disabled = true;
        cardB.disabled = true;
        afterMatch();
      }
    } else {
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

    const pairs = isEndlessRun ? endlessPairs : pairCount(level);
    const images = pickRandomImages(pairs);
    totalPairs = pairs;
    Progress.discoverTiles(images);

    const cfg = getLevelConfig({ ...level, pairs });
    moveLimit = cfg.moveLimit;
    timeLeft = hasTimeLimit() ? cfg.timeLimit : 0;

    const deck = buildDeck(images);

    board.innerHTML = '';
    deck.forEach((data, i) => {
      board.appendChild(createCard(data, i));
    });
    requestAnimationFrame(() => {
      fitBoardGrid(deck.length);
    });

    updateHud();
    updateComboHud();
    updateHintButton();
    hideOverlay();
    startTimer();

    const runTutorial =
      typeof Tutorial !== 'undefined' &&
      Tutorial.shouldRun() &&
      pairs <= 2 &&
      !isEndlessRun &&
      !isDailyRun;
    if (runTutorial) {
      Tutorial.startAfterDelay(null);
    }
  }

  function failMessage(reason) {
    const mode = currentMode();
    const level = levels[currentLevelIndex];
    if (mode.hasMoveLimit) {
      return `${level.name}：${reason}（已用 ${moves}/${moveLimit} 步）`;
    }
    return `${level.name}：${reason}`;
  }

  function winMessage() {
    const level = levels[currentLevelIndex];
    const mode = currentMode();
    let name = level?.name || '关卡';
    if (isDailyRun) name = '今日挑战';
    const base = hasTimeLimit()
      ? `${name} 完成，用了 ${moves} 步，剩余 ${timeLeft} 秒`
      : `${name} 完成，用了 ${moves} 步`;
    let extra = '';
    if (lastWinStars >= 3) extra = '\n完美！三星达成！';
    else if (lastWinStars === 2) {
      const pairs = totalPairs;
      const need = Math.ceil(pairs * 1.5);
      extra = `\n差 ${moves - pairs} 步可达三星（完美 ${pairs} 步）`;
    } else {
      extra = '\n继续挑战更高星级吧';
    }
    return `${base}（${mode.label}）${extra}`;
  }

  function buildShareText() {
    const level = levels[currentLevelIndex];
    const name = isDailyRun ? '今日挑战' : level?.name || '豆豆大挑战';
    const stars = Progress.starsText(lastWinStars);
    return `豆豆大挑战 ${name} ${stars} ${moves}步`;
  }

  function showAchievementPop(items) {
    if (!achievementPop || !items.length) return;
    achievementPop.textContent = `解锁成就：${items.map((a) => a.title).join('、')}`;
    achievementPop.classList.remove('hidden');
    sfx('win', { playbackRate: 1.1 });
  }

  function showOverlay(mode, title, text) {
    const isWin = mode === 'win';
    modal.classList.toggle('fail', !isWin);
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    if (overlayStars) {
      if (isWin && lastWinStars > 0) {
        overlayStars.textContent = Progress.starsText(lastWinStars);
        overlayStars.classList.remove('hidden');
      } else {
        overlayStars.classList.add('hidden');
      }
    }
    if (btnShare) btnShare.classList.toggle('hidden', !isWin);
    let showNext = isWin;
    if (isWin && isEndlessRun && endlessPairs < MAX_PAIRS) {
      btnNext.textContent = `下一关（${endlessPairs + 1} 对）`;
    } else if (isWin) {
      btnNext.textContent =
        isDailyRun || isLastAvailableLevel(currentLevelIndex)
          ? '返回选关'
          : '下一关';
    }
    btnNext.classList.toggle('hidden', !showNext);
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function showWin() {
    const level = levels[currentLevelIndex];
    const mode = currentMode();
    const pairs = totalPairs;
    const initialTime = getLevelConfig({ pairs }).timeLimit;

    lastWinStars = Progress.calcStars(
      pairs,
      moves,
      timeLeft,
      initialTime,
      hasTimeLimit()
    );

    if (isDailyRun && dailyConfig) {
      Progress.recordDaily(dailyConfig.dateKey, {
        moves,
        stars: lastWinStars,
      });
    } else if (!isEndlessRun) {
      const firstClear = !Progress.isCompleted(currentModeId, level.id);
      Progress.recordWin(currentModeId, level.id, {
        moves,
        timeLeft,
        stars: lastWinStars,
      });
      void firstClear;
    }

    if (isEndlessRun) {
      Progress.setEndlessBest(endlessPairs);
    }

    const gallery = Progress.getGallery();
    const unlocked = Achievements.checkAfterWin({
      stars: lastWinStars,
      comboMax,
      isDaily: isDailyRun,
      modeId: isDailyRun ? 'daily' : currentModeId,
      galleryCount: gallery.length,
      galleryTotal: tilePool.length,
      endlessPairs: isEndlessRun ? endlessPairs : 0,
      wasCovered: challengeCoverCount > 0,
      hintsUsed,
    });

    endGame();
    sfx('win');
    const title =
      lastWinStars >= 3 ? '三星通关！' : isDailyRun ? '今日挑战完成！' : '过关！';
    showOverlay('win', title, winMessage());
    if (unlocked.length) {
      setTimeout(() => showAchievementPop(unlocked), 400);
    }
  }

  function showFail(reason) {
    if (gameOver) return;
    endGame();
    sfx('fail');
    showOverlay('fail', '挑战失败', failMessage(reason));
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    modal.classList.remove('fail');
    if (achievementPop) achievementPop.classList.add('hidden');
    if (overlayStars) overlayStars.classList.add('hidden');
  }

  function applyLevelData(data) {
    if (!data.levels || data.levels.length === 0) throw new Error('无关卡数据');
    baseLevels = data.levels;
    modeLevelSets = data.modeLevels || {};
    tilePool = data.tiles || [];
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

  btnMenu.addEventListener('click', () => {
    sfx('click');
    openLevelPicker();
  });

  if (btnHome) {
    btnHome.addEventListener('click', () => {
      sfx('click');
      if (!gameOver) endGame();
      showHome();
    });
  }

  btnSelect.addEventListener('click', () => {
    sfx('click');
    hideOverlay();
    openLevelPicker();
  });

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

  if (btnGallery) {
    btnGallery.addEventListener('click', () => {
      sfx('click');
      renderGalleryPanel();
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

  btnReplay.addEventListener('click', () => {
    sfx('click');
    hideOverlay();
    if (isDailyRun) renderDailyLevel();
    else renderLevel();
  });

  btnNext.addEventListener('click', () => {
    sfx('click');
    hideOverlay();
    if (isDailyRun) {
      isDailyRun = false;
      showHome();
      return;
    }
    if (isEndlessRun && endlessPairs < MAX_PAIRS) {
      endlessPairs += 1;
      levels[0].pairs = endlessPairs;
      renderLevel();
      return;
    }
    const next = getNextLevelIndex(currentLevelIndex);
    if (next === null) {
      showHome();
    } else {
      startLevel(next);
    }
  });

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
})();
