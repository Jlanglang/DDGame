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

  const CELL_SIZE = 148;
  const BOARD_GAP = 8;
  const MAX_PAIRS = 20;

  const appEl = document.getElementById('app');
  const boardViewport = document.getElementById('board-viewport');
  const boardScaler = document.getElementById('board-scaler');
  const board = document.getElementById('board');
  const levelLabel = document.getElementById('level-label');
  const movesLabel = document.getElementById('moves-label');
  const timerLabel = document.getElementById('timer-label');
  const errorMsg = document.getElementById('error-msg');
  const levelSelect = document.getElementById('level-select');
  const levelList = document.getElementById('level-list');
  const levelSelectHint = document.getElementById('level-select-hint');
  const modeList = document.getElementById('mode-list');
  const btnSound = document.getElementById('btn-sound');
  const btnMenu = document.getElementById('btn-menu');
  const overlay = document.getElementById('overlay');
  const modal = overlay.querySelector('.modal');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const btnReplay = document.getElementById('btn-replay');
  const btnNext = document.getElementById('btn-next');
  const btnSelect = document.getElementById('btn-select');

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

  function currentMode() {
    return GameModes.get(currentModeId);
  }

  function sfx(name) {
    if (typeof GameAudio !== 'undefined') GameAudio.play(name);
  }

  function updateSoundButton() {
    if (!btnSound || typeof GameAudio === 'undefined') return;
    const on = GameAudio.isEnabled();
    btnSound.textContent = on ? '🔊' : '🔇';
    btnSound.classList.toggle('off', !on);
    btnSound.setAttribute('aria-label', on ? '关闭音效' : '开启音效');
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

  /** 优先约 4 行，至少 2 列；末行可不满；宽度不够时靠整体缩放 */
  function gridSize(cardCount, preferredRows) {
    const targetRows = preferredRows || 4;
    const cols = Math.max(MIN_GRID_COLS, Math.ceil(cardCount / targetRows));
    const rows = Math.ceil(cardCount / cols);
    return { cols, rows };
  }

  /** 固定 148×148 格子，整体缩放以适配视口，不出现滚动条 */
  function fitBoardGrid(cardCount) {
    if (!cardCount) return;
    lastBoardCardCount = cardCount;

    const gapPx = BOARD_GAP;
    const cell = CELL_SIZE;

    const maxWidth = (appEl ? appEl.clientWidth : window.innerWidth) - 24;
    const headerEl = document.querySelector('.header');
    const reservedHeight = (headerEl ? headerEl.offsetHeight : 100) + 36;
    const maxHeight = Math.max(120, window.innerHeight - reservedHeight);

    const { cols, rows } = gridSize(cardCount);

    board.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
    board.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
    board.style.gap = `${gapPx}px`;

    const naturalW = cols * cell + (cols - 1) * gapPx;
    const naturalH = rows * cell + (rows - 1) * gapPx;
    board.style.width = `${naturalW}px`;
    board.style.height = `${naturalH}px`;

    const scale = Math.min(1, maxWidth / naturalW, maxHeight / naturalH);
    const scaledW = Math.ceil(naturalW * scale);
    const scaledH = Math.ceil(naturalH * scale);

    board.style.transform = `scale(${scale})`;
    boardScaler.style.width = `${scaledW}px`;
    boardScaler.style.height = `${scaledH}px`;
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
    if (mode.minPairs && modeLevelSets[mode.id]?.length) {
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
    if (idleSeconds >= limit) {
      if (idleTargetPairId !== null) {
        coverPairById(idleTargetPairId);
      }
      idleSeconds = 0;
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
    levelSelect.classList.add('hidden');
    boardViewport.classList.add('hidden');
    boardViewport.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('game-active');
    appEl.classList.remove('game-active');
    btnMenu.classList.add('hidden');
    errorMsg.textContent = text;
    errorMsg.classList.remove('hidden');
  }

  function getModeLevelTotal(modeId) {
    if (modeId === currentModeId) return levels.length;
    const mode = GameModes.get(modeId);
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
        renderLevelList();
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

  function showLevelSelect() {
    stopTimer();
    gameOver = false;
    hideOverlay();
    boardViewport.classList.add('hidden');
    boardViewport.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('game-active');
    appEl.classList.remove('game-active');
    btnMenu.classList.add('hidden');
    levelSelect.classList.remove('hidden');
    renderModeList();
    renderLevelList();
  }

  function showGame() {
    levelSelect.classList.add('hidden');
    boardViewport.classList.remove('hidden');
    boardViewport.setAttribute('aria-hidden', 'false');
    document.body.classList.add('game-active');
    appEl.classList.add('game-active');
    btnMenu.classList.remove('hidden');
    errorMsg.classList.add('hidden');
  }

  function renderLevelList() {
    levelList.innerHTML = '';
    const mode = currentMode();

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
      btn.innerHTML =
        `<span class="level-item-name">${level.name}${completed ? ' ✓' : ''}</span>` +
        `<span class="level-item-meta">${meta}</span>` +
        `<span class="level-item-tag tag-mode-${mode.id}">${completed ? '已通关' : mode.label}</span>`;
      btn.addEventListener('click', () => {
        sfx('click');
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
      sfx('match');
      const cardA = firstCard;
      const cardB = secondCard;

      const afterMatch = () => {
        matchedCount += 1;
        resetIdleOnMatch();
        resetTurn();
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
      sfx('mismatch');
      setTimeout(() => {
        if (gameOver) return;
        firstCard.classList.remove(FLIPPED_CLASS);
        secondCard.classList.remove(FLIPPED_CLASS);
        resetTurn();
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
    firstCard = null;
    secondCard = null;
    lock = false;

    const pairs = pairCount(level);
    const images = pickRandomImages(pairs);
    totalPairs = pairs;

    const cfg = getLevelConfig(level);
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
    hideOverlay();
    startTimer();
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
    const base = hasTimeLimit()
      ? `${level.name} 完成，用了 ${moves} 步，剩余 ${timeLeft} 秒`
      : `${level.name} 完成，用了 ${moves} 步`;
    return `${base}（${mode.label}模式）`;
  }

  function showOverlay(mode, title, text) {
    const isWin = mode === 'win';
    modal.classList.toggle('fail', !isWin);
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    btnNext.classList.toggle('hidden', !isWin);
    btnNext.textContent = isLastAvailableLevel(currentLevelIndex) ? '返回选关' : '下一关';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function showWin() {
    const level = levels[currentLevelIndex];
    const firstClear = !Progress.isCompleted(currentModeId, level.id);
    Progress.recordWin(currentModeId, level.id, { moves, timeLeft });
    endGame();
    sfx('win');
    showOverlay('win', firstClear ? '首次通关!' : '过关!', winMessage());
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
  }

  function applyLevelData(data) {
    if (!data.levels || data.levels.length === 0) throw new Error('无关卡数据');
    baseLevels = data.levels;
    modeLevelSets = data.modeLevels || {};
    tilePool = data.tiles || [];
    applyLevelsForCurrentMode();
    showLevelSelect();
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
    showLevelSelect();
  });
  btnSelect.addEventListener('click', () => {
    sfx('click');
    showLevelSelect();
  });

  btnReplay.addEventListener('click', () => {
    sfx('click');
    hideOverlay();
    renderLevel();
  });

  btnNext.addEventListener('click', () => {
    sfx('click');
    hideOverlay();
    const next = getNextLevelIndex(currentLevelIndex);
    if (next === null) {
      showLevelSelect();
    } else {
      startLevel(next);
    }
  });

  if (btnSound) {
    btnSound.addEventListener('click', () => {
      if (typeof GameAudio === 'undefined') return;
      const on = GameAudio.toggle();
      updateSoundButton();
      if (on) GameAudio.play('click');
    });
    updateSoundButton();
  }

  window.addEventListener('resize', () => {
    if (lastBoardCardCount && !boardViewport.classList.contains('hidden')) {
      fitBoardGrid(lastBoardCardCount);
    }
  });

  loadLevels();
})();
