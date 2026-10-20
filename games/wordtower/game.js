/* ============================================================
   豆豆单词塔 · 单炮台 + 拼词成长
   ------------------------------------------------------------
   循环：外星怪沿桥冲下来 → 你的塔自动开火 → 字母怪掉字母
        → 点「拼词」补全单词（暂停答题）→ 拼对主角变强，拼错就没了
   ============================================================ */

(() => {
  'use strict';

  const W = 720;
  const H = 1600;
  const BRIDGE = { left: 96, right: 624 };
  const TOWER_Y = 1180;      // 敌人越过这条线就撞塔
  const SPAWN_Y = 300;       // 出生口在单词卡下方，怪一出来就看得见

  /* ----------------------------------------------------------
     数值配置：想调平衡只改这一块
     ---------------------------------------------------------- */

  const BAL = Object.assign({
    towerHp: 10,        // 塔血：漏一个怪扣 1 点

    damage: 10,         // 单发伤害
    rate: 2.2,          // 初始攻速（发/秒）
    shots: 1,           // 同时发射的弹道数
    bulletSpeed: 1000,

    hpBase: 20,         // 第 1 波小怪血量
    hpGrowth: 1.2,      // 每波 ×1.2
    speed: 95,          // 小怪推进速度（像素/秒）→ 压迫感主要来自这里
    waves: 8,           // 8 波杂兵，清完 BOSS 登场
    waveCounts: [4, 5, 6, 6, 7, 8, 9, 10],
    spawnGap: 0.5,      // 同一波里两只怪的间隔
    waveGap: 1.2,       // 清场后的休息
    bossMul: 5,         // BOSS 血量 = 第 8 波血量 ×5
    bossSpeed: 34,

    lettersPerWave: 3,  // 每波带字母的怪（也就是候选字母数）

    buffDmg: 1.25,      // 拼对 dmg 词：伤害 ×1.25
    buffRate: 0.45,     // 拼对 rate 词：攻速 +0.45/s
    buffSlow: 0.26,     // 拼对 slow 词：命中减速（可叠）
    rateMax: 7,         // 攻速上限
    shotsMax: 5,
    firePenalty: 2,     // 拼错停火秒数
  }, (typeof globalThis !== 'undefined' && globalThis.__BALANCE) || {});

  const BUFF_TEXT = {
    dmg: '伤害 +25%',
    rate: '攻速 +0.45/s',
    split: '弹道 +1',
    shield: '塔血 +1',
    slow: '命中减速',
  };

  /* ----------------------------------------------------------
     状态
     ---------------------------------------------------------- */

  const G = {
    state: 'playing',   // playing | over
    paused: false,
    quizOpen: false,
    quizLocked: false,
    quizHold: 0,
    result: null,
    bal: BAL,

    wave: 0,
    time: 0,
    kills: 0,
    hp: BAL.towerHp,
    maxHp: BAL.towerHp,

    enemies: [],
    bullets: [],
    particles: [],
    floaters: [],
    queue: [],          // 本波待生成的怪
    spawnTimer: 0,
    waveGap: 0,
    bossSpawned: false,

    tower: {
      x: W / 2,
      y: TOWER_Y,
      angle: -Math.PI / 2,
      cd: 0,
      damage: BAL.damage,
      rate: BAL.rate,
      shots: BAL.shots,
      slowLevel: 0,
      dmgMul: 1,
      shield: 0,
      kick: 0,
    },

    word: null,
    tray: [],
    wordsDone: 0,
    wordsFailed: 0,
  };

  /* ----------------------------------------------------------
     元素
     ---------------------------------------------------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hpFill = document.getElementById('hpFill');
  const stageName = document.getElementById('stageName');
  const wordZhEl = document.getElementById('wordZh');
  const wordWEl = document.getElementById('wordW');
  const trayEl = document.getElementById('tray');
  const spellBtn = document.getElementById('spell');
  const quizEl = document.getElementById('quiz');
  const quizZh = document.getElementById('quizZh');
  const quizWord = document.getElementById('quizWord');
  const quizLetters = document.getElementById('quizLetters');
  const quizTip = document.getElementById('quizTip');
  const overEl = document.getElementById('over');
  const overSub = document.getElementById('overSub');
  const pauseBtn = document.getElementById('pause');
  const hintEl = document.getElementById('hint');

  let hintShown = false;
  function hideHint() {
    if (hintShown) return;
    hintShown = true;
    hintEl.classList.add('gone');
  }

  /* ----------------------------------------------------------
     背景细节（只生成一次）
     ---------------------------------------------------------- */

  const STARS = [];
  for (let i = 0; i < 90; i++) {
    STARS.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.6 + Math.random() * 1.6,
      a: 0.15 + Math.random() * 0.5,
    });
  }

  const RUNES = [];
  for (let i = 0; i < 26; i++) {
    RUNES.push({
      x: BRIDGE.left + 12 + Math.random() * (BRIDGE.right - BRIDGE.left - 24),
      y: Math.random() * H,
      ch: String.fromCharCode(65 + Math.floor(Math.random() * 26)),
      a: 0.05 + Math.random() * 0.06,
      s: 16 + Math.random() * 26,
    });
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ----------------------------------------------------------
     HUD
     ---------------------------------------------------------- */

  function syncHud() {
    const ratio = Math.max(0, G.hp / G.maxHp);
    hpFill.style.width = `${ratio * 100}%`;
    hpFill.classList.toggle('low', ratio <= 0.34);

    stageName.textContent = G.bossSpawned
      ? '豆豆单词塔 · BOSS'
      : `豆豆单词塔 · 第 ${G.wave} 波`;
  }

  /* ----------------------------------------------------------
     单词
     ---------------------------------------------------------- */

  function tierForWave(wave) {
    if (wave <= 3) return 'easy';
    if (wave <= 6) return 'mid';
    return 'hard';
  }

  function newWord() {
    const bank = (window.WORD_BANK && window.WORD_BANK[tierForWave(G.wave)]) || [];
    const pool = bank.length ? bank : [{ w: 'APPLE', zh: '苹果', buff: 'dmg' }];
    const item = pick(pool);
    const w = item.w;

    // 缺一个字母：别挖第一个（太简单），也别挖最后一个（读起来怪）
    const blank = w.length <= 3 ? w.length - 1 : 1 + Math.floor(Math.random() * (w.length - 2));
    const correct = w[blank];

    // 干扰项：一个用这个词里的别的字母，一个是随机字母
    const others = w.split('').filter((c, i) => i !== blank && c !== correct);
    let decoy1 = others.length ? pick(others) : 'E';
    let decoy2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    if (decoy2 === correct) decoy2 = decoy2 === 'A' ? 'B' : 'A';

    const candidates = shuffle([correct, decoy1, decoy2]);

    G.word = { w, zh: item.zh, buff: item.buff, blank, correct, candidates, used: 0 };
    G.tray = [];
    G.wordClock = 0;

    reletterEnemies();
    renderWord();
    renderTray();
  }

  /** 换词后，场上还没死的字母怪要重新分到新词的候选字母 */
  function reletterEnemies() {
    let i = 0;
    for (const e of G.enemies) {
      if (e.dead || e.kind !== 'letter') continue;
      e.letter = G.word ? G.word.candidates[i++] || null : null;
      if (!e.letter) e.kind = 'grunt';
    }
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderWord() {
    if (!G.word) return;
    const w = G.word.w;
    wordZhEl.textContent = G.word.zh;
    wordWEl.innerHTML = w
      .split('')
      .map((c, i) => (i === G.word.blank ? '<span class="blank">_</span>' : c))
      .join(' ');
    quizZh.textContent = G.word.zh;
    quizWord.innerHTML = wordWEl.innerHTML;
  }

  function renderTray() {
    const slots = Math.max(3, G.tray.length);
    let html = '';
    for (let i = 0; i < slots; i++) {
      const c = G.tray[i];
      html += `<div class="slot${c ? ' filled' : ''}">${c || ''}</div>`;
    }
    trayEl.innerHTML = html;
    spellBtn.disabled = G.tray.length === 0 || G.state !== 'playing';
  }

  /* ----------------------------------------------------------
     答题面板
     ---------------------------------------------------------- */

  function openQuiz() {
    if (G.quizOpen || G.state !== 'playing' || !G.word || !G.tray.length) return;
    G.quizOpen = true;
    G.quizLocked = false;
    G.quizHold = 0;
    G.paused = true;
    hideHint();

    quizTip.textContent = '选错就没了';
    quizTip.className = 'quiz-tip';

    quizLetters.innerHTML = '';
    for (const letter of G.tray) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = letter;
      b.addEventListener('click', () => chooseLetter(letter));
      quizLetters.appendChild(b);
    }

    renderWord();
    quizEl.hidden = false;
  }

  function chooseLetter(letter) {
    if (!G.quizOpen || !G.word || G.quizLocked) return;
    G.quizLocked = true;

    const right = letter === G.word.correct;
    const buff = G.word.buff;
    const wordW = G.word.w;
    const zh = G.word.zh;

    if (right) {
      applyBuff(buff);
      G.wordsDone += 1;
      quizTip.textContent = `✔ ${wordW} ${zh} · ${BUFF_TEXT[buff] || '变强'}`;
      quizTip.className = 'quiz-tip ok';
      floatText(TOWER_Y - 210, `+${BUFF_TEXT[buff] || '变强'}`, '#7ee0a0');
    } else {
      G.tower.cd = BAL.firePenalty;
      G.wordsFailed += 1;
      quizTip.textContent = `✘ 正确答案是 ${G.word.correct}（${wordW} ${zh}）· 停火 ${BAL.firePenalty}s`;
      quizTip.className = 'quiz-tip bad';
      floatText(TOWER_Y - 210, '拼错了！', '#ff7a6b');
    }

    // 面板停留一下（计时在 frame 里走，方便无头模拟），让人看清对错
    G.quizHold = right ? 0.7 : 1.15;
  }

  /** 答题面板收起：继续打，换下一个词 */
  function finishQuiz() {
    quizEl.hidden = true;
    G.quizOpen = false;
    G.quizLocked = false;
    G.paused = false;
    if (G.state === 'playing') {
      newWord();
      syncHud();
      renderTray();
    }
  }

  function applyBuff(buff) {
    const t = G.tower;
    if (buff === 'dmg') {
      t.dmgMul *= BAL.buffDmg;
    } else if (buff === 'rate') {
      t.rate = Math.min(BAL.rateMax, t.rate + BAL.buffRate);
    } else if (buff === 'split') {
      t.shots = Math.min(BAL.shotsMax, t.shots + 1);
    } else if (buff === 'shield') {
      t.shield += 1;
      G.maxHp += 1;
      G.hp = Math.min(G.maxHp, G.hp + 1);
    } else if (buff === 'slow') {
      t.slowLevel = Math.min(3, t.slowLevel + 1);
    }
    syncHud();
  }

  /* ----------------------------------------------------------
     波次
     ---------------------------------------------------------- */

  function enemyHp(wave) {
    return Math.round(BAL.hpBase * Math.pow(BAL.hpGrowth, wave - 1));
  }

  function startWave() {
    const n = BAL.waveCounts[Math.min(G.wave - 1, BAL.waveCounts.length - 1)] || 6;
    const hp = enemyHp(G.wave);
    const q = [];

    // 字母怪均匀插在队伍里
    const letterEvery = G.word ? Math.max(2, Math.floor(n / BAL.lettersPerWave)) : 0;
    let lettersLeft = G.word ? BAL.lettersPerWave : 0;

    for (let i = 0; i < n; i++) {
      const wantLetter =
        lettersLeft > 0 && i > 0 && i % letterEvery === 0;
      if (wantLetter) {
        lettersLeft -= 1;
        q.push({ kind: 'letter', hp });
      } else {
        q.push({ kind: 'grunt', hp });
      }
    }

    // 字数不够的话把剩下的字母怪补到队尾
    while (lettersLeft > 0) {
      lettersLeft -= 1;
      q.push({ kind: 'letter', hp });
    }

    G.queue = q;
    G.spawnTimer = 0.25;
    syncHud();
  }

  function spawnFromQueue() {
    const item = G.queue.shift();
    if (!item) return;

    const isBoss = item.kind === 'boss';
    const letter =
      item.kind === 'letter' && G.word
        ? G.word.candidates[G.word.used++ % G.word.candidates.length]
        : null;

    const x = isBoss
      ? W / 2
      : BRIDGE.left + 60 + Math.random() * (BRIDGE.right - BRIDGE.left - 120);

    G.enemies.push({
      kind: isBoss ? 'boss' : letter ? 'letter' : 'grunt',
      x,
      y: isBoss ? SPAWN_Y - 40 : SPAWN_Y + Math.random() * 30 - 15,
      r: isBoss ? 54 : 20,
      hp: item.hp,
      maxHp: item.hp,
      speed: isBoss ? BAL.bossSpeed : BAL.speed,
      letter,
      dead: false,
      hitFlash: 0,
      slowT: 0,
      wob: Math.random() * Math.PI * 2,
    });
  }

  function updateSpawner(dt) {
    if (G.bossSpawned && G.enemies.length === 0 && G.queue.length === 0) return;

    if (G.queue.length) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        spawnFromQueue();
        G.spawnTimer = BAL.spawnGap;
      }
      return;
    }

    if (G.enemies.length > 0) return;

    G.waveGap -= dt;
    if (G.waveGap > 0) return;

    if (G.wave >= BAL.waves) {
      if (!G.bossSpawned) {
        G.bossSpawned = true;
        G.queue.push({ kind: 'boss', hp: Math.round(enemyHp(BAL.waves) * BAL.bossMul) });
        G.spawnTimer = 0;
        syncHud();
      }
      return;
    }

    G.wave += 1;
    startWave();
    G.waveGap = BAL.waveGap;
  }

  /* ----------------------------------------------------------
     主角（固定炮台）
     ---------------------------------------------------------- */

  function findTarget() {
    let best = null;
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (!best || e.y > best.y) best = e;
    }
    return best;
  }

  function updateTower(dt) {
    const t = G.tower;
    const target = findTarget();

    if (target) {
      const dx = target.x - t.x;
      const dy = target.y - t.y;
      t.angle = Math.atan2(dy, dx);
    } else {
      t.angle = -Math.PI / 2;
    }

    if (t.kick > 0) t.kick = Math.max(0, t.kick - dt * 6);
    t.cd -= dt;
    if (t.cd > 0 || !target) return;

    fire(t.angle);
    t.cd = 1 / Math.max(0.2, t.rate);
  }

  function fire(angle) {
    const t = G.tower;
    const muzzle = 52;
    const ox = t.x + Math.cos(angle) * muzzle;
    const oy = t.y + Math.sin(angle) * muzzle;
    const dmg = t.damage * t.dmgMul;
    const n = t.shots;
    const spread = 0.055;

    for (let i = 0; i < n; i++) {
      const a = angle + (i - (n - 1) / 2) * spread;
      G.bullets.push({
        x: ox,
        y: oy,
        vx: Math.cos(a) * BAL.bulletSpeed,
        vy: Math.sin(a) * BAL.bulletSpeed,
        damage: dmg,
        dead: false,
      });
    }

    t.kick = 1;
    puff(ox, oy, '#ffd166', 3);
  }

  /* ----------------------------------------------------------
     敌人 / 子弹
     ---------------------------------------------------------- */

  function updateEnemies(dt) {
    for (const e of G.enemies) {
      if (e.dead) continue;

      if (e.hitFlash > 0) e.hitFlash -= dt * 4;
      if (e.slowT > 0) e.slowT -= dt;
      e.wob += dt * 6;

      e.y += e.speed * dt * (e.slowT > 0 ? 0.62 : 1);

      if (e.y >= TOWER_Y) {
        e.dead = true;
        puff(e.x, TOWER_Y, '#ff7a6b', 22);
        shake = 1;

        if (e.kind === 'boss') {
          G.hp = 0;
          syncHud();
          lose();
          return;
        }

        G.hp -= 1;
        syncHud();
        if (G.hp <= 0) {
          lose();
          return;
        }
      }
    }

    G.enemies = G.enemies.filter((e) => !e.dead);
  }

  function updateBullets(dt) {
    for (const b of G.bullets) {
      if (b.dead) continue;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.y < -80 || b.x < -80 || b.x > W + 80) {
        b.dead = true;
        continue;
      }

      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + 8;
        if (dx * dx + dy * dy <= rr * rr) {
          hitEnemy(e, b);
          b.dead = true;
          break;
        }
      }
    }

    G.bullets = G.bullets.filter((b) => !b.dead);
  }

  function hitEnemy(e, b) {
    e.hp -= b.damage;
    e.hitFlash = 1;
    puff(b.x, b.y, '#ffd166', 3);

    if (G.tower.slowLevel > 0) e.slowT = 0.9;

    if (e.hp <= 0) {
      e.dead = true;
      G.kills += 1;
      puff(e.x, e.y, '#9be26a', e.kind === 'boss' ? 70 : 14);

      if (e.kind === 'boss') {
        win();
        return;
      }

      if (e.kind === 'letter' && e.letter) {
        addLetter(e.letter, e.x, e.y);
      }
    }
  }

  function addLetter(letter, x, y) {
    if (!G.word) return;
    if (G.tray.length >= 3) return;
    G.tray.push(letter);
    floatText(y, letter, '#ffd166');
    puff(x, y, '#ffd166', 16);
    renderTray();
  }

  /* ----------------------------------------------------------
     粒子 / 飘字
     ---------------------------------------------------------- */

  function puff(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(30, 200);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rnd(0.2, 0.5),
        max: 0.5,
        color,
        size: rnd(2, 4),
      });
    }
  }

  function floatText(y, text, color) {
    G.floaters.push({ x: W / 2, y, text, color, life: 1.1, max: 1.1 });
  }

  function updateParticles(dt) {
    for (const p of G.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
    }
    G.particles = G.particles.filter((p) => p.life > 0);

    for (const f of G.floaters) {
      f.y -= dt * 46;
      f.life -= dt;
    }
    G.floaters = G.floaters.filter((f) => f.life > 0);
  }

  /* ----------------------------------------------------------
     胜负
     ---------------------------------------------------------- */

  function resultLine() {
    return `第 ${G.wave} 波 · 击杀 ${G.kills} · 拼对 ${G.wordsDone} 词 · 拼错 ${G.wordsFailed} 词`;
  }

  function win() {
    G.state = 'over';
    G.result = 'win';
    document.getElementById('overK').textContent = '守住了';
    document.getElementById('overK').classList.remove('lost');
    document.getElementById('overTitle').textContent = '豆豆塔还在';
    overSub.innerHTML = resultLine();
    overEl.hidden = false;
  }

  function lose() {
    G.state = 'over';
    G.result = 'lose';
    document.getElementById('overK').textContent = '失守';
    document.getElementById('overK').classList.add('lost');
    document.getElementById('overTitle').textContent = '豆豆塔被推平了';
    overSub.innerHTML = resultLine();
    overEl.hidden = false;
  }

  function reset() {
    G.state = 'playing';
    G.paused = false;
    G.quizOpen = false;
    G.quizLocked = false;
    G.quizHold = 0;
    G.result = null;
    G.wave = 0;
    G.time = 0;
    G.kills = 0;
    G.hp = BAL.towerHp;
    G.maxHp = BAL.towerHp;
    G.enemies = [];
    G.bullets = [];
    G.particles = [];
    G.floaters = [];
    G.queue = [];
    G.spawnTimer = 0;
    G.waveGap = 0;
    G.bossSpawned = false;
    G.tray = [];
    G.wordsDone = 0;
    G.wordsFailed = 0;
    G.tower = {
      x: W / 2,
      y: TOWER_Y,
      angle: -Math.PI / 2,
      cd: 0,
      damage: BAL.damage,
      rate: BAL.rate,
      shots: BAL.shots,
      slowLevel: 0,
      dmgMul: 1,
      shield: 0,
      kick: 0,
    };

    quizEl.hidden = true;
    overEl.hidden = true;
    setPaused(false);

    hintShown = false;
    hintEl.classList.remove('gone');

    newWord();
    G.wave = 1;
    startWave();
    syncHud();
    renderTray();
  }

  /* ----------------------------------------------------------
     暂停
     ---------------------------------------------------------- */

  function setPaused(v) {
    if (G.state !== 'playing' || G.quizOpen) return;
    G.paused = v;
    pauseBtn.classList.toggle('paused', v);
    pauseBtn.setAttribute('aria-label', v ? '继续' : '暂停');
  }

  /* ----------------------------------------------------------
     更新
     ---------------------------------------------------------- */

  function update(dt) {
    G.time += dt;
    if (G.time > 12) hideHint();
    if (G.state !== 'playing') {
      updateParticles(dt);
      return;
    }

    updateSpawner(dt);
    if (G.state !== 'playing') return;

    updateEnemies(dt);
    if (G.state !== 'playing') return;

    updateTower(dt);
    updateBullets(dt);
    updateParticles(dt);

    // 兜底：正确字母被漏掉了、场上也没字母怪了 → 过一会儿换词，别卡死
    if (G.word) {
      G.wordClock = (G.wordClock || 0) + dt;
      const lettersLeft =
        G.enemies.some((e) => !e.dead && e.kind === 'letter') ||
        G.queue.some((q) => q.kind === 'letter');
      const winnable = G.tray.includes(G.word.correct);
      if (G.wordClock > 10 && !lettersLeft && !winnable) {
        newWord();
        renderTray();
      }
    }
  }

  /* ----------------------------------------------------------
     渲染
     ---------------------------------------------------------- */

  let sx = 1;
  let sy = 1;
  let shake = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    sx = canvas.width / W;
    sy = canvas.height / H;
  }

  window.addEventListener('resize', resize);

  function render() {
    const ox = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0;
    ctx.setTransform(sx, 0, 0, sy, ox * sx, 0);
    ctx.clearRect(-20, 0, W + 40, H);
    shake = Math.max(0, shake - 0.06);

    drawBackdrop();
    drawBridge();
    drawEnemies();
    drawTower();
    drawBullets();
    drawParticles();
    drawFloaters();
  }

  function drawBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070b14');
    g.addColorStop(0.55, '#0b1220');
    g.addColorStop(1, '#0a0f18');
    ctx.fillStyle = g;
    ctx.fillRect(-20, 0, W + 40, H);

    for (const s of STARS) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#cfd8ea';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBridge() {
    const x0 = BRIDGE.left;
    const w = BRIDGE.right - BRIDGE.left;

    // 桥面
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a2333');
    g.addColorStop(1, '#131a27');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, w, TOWER_Y + 40);

    // 漂浮的字母符文
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of RUNES) {
      ctx.globalAlpha = r.a;
      ctx.fillStyle = '#8fb4ff';
      ctx.font = `800 ${r.s}px "SF Mono", Consolas, monospace`;
      ctx.fillText(r.ch, r.x, r.y);
    }
    ctx.globalAlpha = 1;

    // 横向刻线
    ctx.strokeStyle = 'rgba(120, 160, 220, 0.07)';
    ctx.lineWidth = 2;
    for (let y = 80; y < TOWER_Y; y += 110) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
    }

    // 桥沿
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(x0 - 10, 0, 10, TOWER_Y + 40);
    ctx.fillRect(x0 + w, 0, 10, TOWER_Y + 40);

    // 桥沿发光
    ctx.strokeStyle = 'rgba(102, 160, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, TOWER_Y + 40);
    ctx.moveTo(x0 + w, 0);
    ctx.lineTo(x0 + w, TOWER_Y + 40);
    ctx.stroke();

    // 塔前线
    ctx.strokeStyle = 'rgba(255, 122, 107, 0.5)';
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.moveTo(x0 - 10, TOWER_Y);
    ctx.lineTo(x0 + w + 10, TOWER_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 出生口：桥顶的光门
    const pr = 34 + Math.sin(G.time * 2.4) * 3;
    const pg = ctx.createRadialGradient(W / 2, SPAWN_Y, 4, W / 2, SPAWN_Y, pr * 2.2);
    pg.addColorStop(0, 'rgba(150, 120, 255, 0.5)');
    pg.addColorStop(0.6, 'rgba(90, 70, 200, 0.18)');
    pg.addColorStop(1, 'rgba(90, 70, 200, 0)');
    ctx.beginPath();
    ctx.arc(W / 2, SPAWN_Y, pr * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = pg;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(W / 2, SPAWN_Y, pr, pr * 0.42, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(170, 150, 255, 0.75)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(W / 2, SPAWN_Y, pr * 0.6, pr * 0.25, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(210, 190, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawEnemies() {
    for (const e of G.enemies) {
      if (e.dead) continue;

      const bob = Math.sin(e.wob) * 3;
      const y = e.y + bob;
      const isBoss = e.kind === 'boss';
      const isLetter = e.kind === 'letter';

      // 影子
      ctx.beginPath();
      ctx.ellipse(e.x, y + e.r + 10, e.r * 0.8, e.r * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fill();

      // 身体
      const bodyGrad = ctx.createRadialGradient(
        e.x - e.r * 0.3, y - e.r * 0.35, e.r * 0.2,
        e.x, y, e.r
      );
      if (isBoss) {
        bodyGrad.addColorStop(0, '#ff9b8a');
        bodyGrad.addColorStop(1, '#b83a30');
      } else if (isLetter) {
        bodyGrad.addColorStop(0, '#ffe6a8');
        bodyGrad.addColorStop(1, '#c98f2a');
      } else {
        bodyGrad.addColorStop(0, '#9be26a');
        bodyGrad.addColorStop(1, '#3f7a2c');
      }
      ctx.beginPath();
      ctx.arc(e.x, y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // 眼睛
      const eyeR = isBoss ? 9 : 4.5;
      const eyeY = y - e.r * 0.12;
      ctx.fillStyle = '#10161f';
      ctx.beginPath();
      ctx.arc(e.x - e.r * 0.32, eyeY, eyeR, 0, Math.PI * 2);
      ctx.arc(e.x + e.r * 0.32, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();

      // 命中闪白
      if (e.hitFlash > 0) {
        ctx.globalAlpha = Math.min(0.45, e.hitFlash * 0.45);
        ctx.beginPath();
        ctx.arc(e.x, y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 字母怪的字母
      if (isLetter && e.letter) {
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, y, e.r + 7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = '800 26px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.strokeText(e.letter, e.x, y - e.r - 24);
        ctx.fillStyle = '#ffd166';
        ctx.fillText(e.letter, e.x, y - e.r - 24);
      }

      // 血条
      if (e.hp < e.maxHp) {
        const wBar = isBoss ? 110 : 40;
        const ratio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(e.x - wBar / 2, y + e.r + 6, wBar, 5);
        ctx.fillStyle = ratio > 0.4 ? '#7ee0a0' : '#ff7a6b';
        ctx.fillRect(e.x - wBar / 2, y + e.r + 6, wBar * ratio, 5);
      }
    }
  }

  function drawTower() {
    const t = G.tower;
    const base = 44;

    // 地基光环：随伤害倍率变大
    const glow = Math.min(1, Math.log10(Math.max(1, t.dmgMul)) / 1.6);
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 26, base + glow * 30, 14 + glow * 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(102, 160, 255, ${0.08 + glow * 0.14})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(140, 190, 255, ${0.2 + glow * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 底座
    ctx.beginPath();
    ctx.arc(t.x, t.y, base, 0, Math.PI * 2);
    ctx.fillStyle = '#1b2536';
    ctx.fill();
    ctx.strokeStyle = '#4b6a9b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 核心
    const core = 15 + Math.sin(G.time * 4) * 1.5;
    const coreGrad = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, core + 6);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.45, '#8fd0ff');
    coreGrad.addColorStop(1, 'rgba(80, 150, 255, 0)');
    ctx.beginPath();
    ctx.arc(t.x, t.y, core + 6, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // 炮管
    const kick = t.kick * 7;
    const bx = t.x + Math.cos(t.angle) * (30 - kick);
    const by = t.y + Math.sin(t.angle) * (30 - kick);
    const ex = t.x + Math.cos(t.angle) * (62 - kick);
    const ey = t.y + Math.sin(t.angle) * (62 - kick);

    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6f8ab5';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.strokeStyle = '#a9c2e6';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // 多弹道：枪口加小刺
    for (let i = 1; i < t.shots; i++) {
      const off = (i - (t.shots - 1) / 2) * 10;
      const nx = Math.cos(t.angle + Math.PI / 2) * off;
      const ny = Math.sin(t.angle + Math.PI / 2) * off;
      ctx.beginPath();
      ctx.arc(ex + nx, ey + ny, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd166';
      ctx.fill();
    }

    // 护盾（拼对 shield 词）
    if (t.shield > 0) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, base + 16, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(126, 224, 160, ${0.18 + t.shield * 0.08})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function drawBullets() {
    for (const b of G.bullets) {
      if (b.dead) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const len = 22;
      const tx = b.x - (b.vx / sp) * len;
      const ty = b.y - (b.vy / sp) * len;

      ctx.strokeStyle = 'rgba(255, 209, 102, 0.5)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff3c4';
      ctx.fill();
      ctx.lineCap = 'butt';
    }
  }

  function drawParticles() {
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    for (const f of G.floaters) {
      const a = Math.max(0, f.life / f.max);
      ctx.globalAlpha = a;
      ctx.font = '800 30px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ----------------------------------------------------------
     循环
     ---------------------------------------------------------- */

  let last = 0;
  const QS = new URLSearchParams(location.search);
  const FAST = Math.max(1, Math.min(8, Number(QS.get('fast')) || 1));

  function frame(now) {
    if (!last) last = now;
    let dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    dt *= FAST;

    if (!G.paused && G.state === 'playing') update(dt);
    else updateParticles(dt);

    // 答题面板的对错停留（暂停中也要走）
    if (G.quizHold > 0) {
      G.quizHold -= dt / FAST;
      if (G.quizHold <= 0) {
        G.quizHold = 0;
        finishQuiz();
      }
    }

    render();
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------
     控件
     ---------------------------------------------------------- */

  pauseBtn.addEventListener('click', () => setPaused(!G.paused));
  spellBtn.addEventListener('click', openQuiz);
  document.getElementById('again').addEventListener('click', reset);

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      setPaused(!G.paused);
    }
    if (e.key === 'Enter') openQuiz();
  });

  /* ----------------------------------------------------------
     启动
     ---------------------------------------------------------- */

  resize();
  reset();
  if (QS.has('debug')) {
    window.__g = G;
    window.__api = {
      openQuiz,
      chooseLetter,
      newWord,
      startWave,
      reset,
      renderTray,
      goal: () => ({
        wave: G.wave,
        hp: G.hp,
        tray: G.tray.slice(),
        word: G.word && { w: G.word.w, correct: G.word.correct, zh: G.word.zh, buff: G.word.buff },
        quiz: G.quizOpen,
        state: G.state,
      }),
    };
  }
  requestAnimationFrame(frame);
})();
