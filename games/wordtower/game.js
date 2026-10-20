/* ============================================================
   豆豆单词塔 v2 · 单炮台 + 升级选卡 + 拼词拿卡
   ------------------------------------------------------------
   循环：怪沿桥冲下来 → 塔自动开火 → 击杀攒经验 → 升级暂停弹三张卡
        → 点开一张，补全它上面的单词才算拿到；拼错这张就没了
   ============================================================ */

(() => {
  'use strict';

  const W = 720;
  const H = 1600;
  const BRIDGE = { left: 96, right: 624 };
  const TOWER_Y = 1180;
  const SPAWN_Y = 250;

  /* ----------------------------------------------------------
     数值配置：想调平衡只改这一块
     ---------------------------------------------------------- */

  const BAL = Object.assign({
    towerHp: 10,        // 塔血：漏一个怪扣 1 点

    damage: 9,          // 单发伤害
    rate: 2.2,          // 初始攻速（发/秒）
    shots: 1,           // 同时发射的弹道数
    bulletSpeed: 1000,

    hpBase: 10,         // 第 1 波小怪血量
    hpGrowth: 1.19,     // 每波 ×1.19（12 波 + BOSS，一把约 2 分 50）
    speed: 84,          // 小怪推进速度（像素/秒）
    waves: 12,          // 12 波杂兵，清完 BOSS 登场
    waveCounts: [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24],
    spawnGap: 0.26,     // 同一波里两只怪的间隔（越小越挤）
    waveGap: 0.8,       // 清场后的休息
    bossMul: 6,         // BOSS 血量 = 最后一波血量 ×6
    bossSpeed: 30,

    eliteEvery: 6,      // 每 N 只怪里出 1 只精英（金色，3 倍经验 + 掉提示）
    eliteHpMul: 2.6,
    eliteSpeed: 62,

    expGrunt: 1,
    expElite: 3,
    expBoss: 25,
    levelBase: 5,       // 升级所需经验 = levelBase + 等级 × levelStep
    levelStep: 3,

    // 卡面数值
    buffDmg: 1.22,
    buffRate: 0.35,
    buffSlow: 0.25,
    buffBurn: 0.35,     // 点燃：每秒造成 35% 子弹伤害 ×层数
    buffCrit: 0.1,
    rateMax: 8,
    shotsMax: 5,
    burnMax: 3,
    slowMax: 3,
  }, (typeof globalThis !== 'undefined' && globalThis.__BALANCE) || {});

  /* ----------------------------------------------------------
     升级卡池：每张卡绑一个 buff，单词从词库里按 buff 抽
     ---------------------------------------------------------- */

  const CARDS = [
    { id: 'dmg',    name: '强化弹头', icon: '✦', desc: '伤害 +22%',       buff: 'dmg' },
    { id: 'rate',   name: '速射机匣', icon: '⇈', desc: '攻速 +0.35/s',    buff: 'rate' },
    { id: 'split',  name: '分裂弹道', icon: '⌇', desc: '弹道 +1',         buff: 'split' },
    { id: 'shield', name: '护盾装甲', icon: '◈', desc: '塔血 +1 并回 1',  buff: 'shield' },
    { id: 'slow',   name: '冰冻弹',   icon: '❄', desc: '命中减速',        buff: 'slow' },
    { id: 'burn',   name: '燃烧弹',   icon: '♨', desc: '命中点燃 2 秒',   buff: 'burn' },
    { id: 'pierce', name: '穿甲弹',   icon: '➤', desc: '子弹穿透 +1',     buff: 'pierce' },
    { id: 'crit',   name: '瞄准镜',   icon: '◎', desc: '暴击 +10%（×2）', buff: 'crit' },
  ];

  /* ----------------------------------------------------------
     状态
     ---------------------------------------------------------- */

  const G = {
    state: 'playing',
    paused: false,
    result: null,
    bal: BAL,

    wave: 0,
    time: 0,
    kills: 0,
    hp: BAL.towerHp,
    maxHp: BAL.towerHp,

    level: 1,
    exp: 0,
    expNext: BAL.levelBase + BAL.levelStep,
    pendingLevels: 0,
    hints: 0,

    enemies: [],
    bullets: [],
    particles: [],
    floaters: [],
    queue: [],
    spawnTimer: 0,
    waveGap: 0,
    bossSpawned: false,

    tower: {
      x: W / 2,
      y: TOWER_Y,
      angle: -Math.PI / 2,
      cd: 0,
      damage: BAL.damage,
      dmgMul: 1,
      rate: BAL.rate,
      shots: BAL.shots,
      slowLevel: 0,
      burnLevel: 0,
      pierce: 0,
      crit: 0,
      shield: 0,
      kick: 0,
    },

    cards: {
      open: false,
      options: [],
      picked: -1,
      hold: 0,
      solved: 0,
      lost: 0,
    },
  };

  /* ----------------------------------------------------------
     元素
     ---------------------------------------------------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hpFill = document.getElementById('hpFill');
  const expFill = document.getElementById('expFill');
  const lvEl = document.getElementById('lv');
  const stageName = document.getElementById('stageName');
  const cardsEl = document.getElementById('cards');
  const cardsK = document.getElementById('cardsK');
  const cardsTip = document.getElementById('cardsTip');
  const cardList = document.getElementById('cardList');
  const puzzleEl = document.getElementById('puzzle');
  const puzzleName = document.getElementById('puzzleName');
  const puzzleZh = document.getElementById('puzzleZh');
  const puzzleWord = document.getElementById('puzzleWord');
  const puzzleLetters = document.getElementById('puzzleLetters');
  const puzzleTip = document.getElementById('puzzleTip');
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

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ----------------------------------------------------------
     背景细节
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

  /* ----------------------------------------------------------
     HUD
     ---------------------------------------------------------- */

  function syncHud() {
    const ratio = Math.max(0, G.hp / G.maxHp);
    hpFill.style.width = `${ratio * 100}%`;
    hpFill.classList.toggle('low', ratio <= 0.34);

    const er = Math.max(0, Math.min(1, G.exp / Math.max(1, G.expNext)));
    expFill.style.width = `${er * 100}%`;
    lvEl.textContent = `Lv.${G.level}`;

    stageName.textContent = G.bossSpawned
      ? '豆豆单词塔 · BOSS'
      : `豆豆单词塔 · 第 ${G.wave} 波`;
  }

  /* ----------------------------------------------------------
     经验 / 升级
     ---------------------------------------------------------- */

  function addExp(n) {
    G.exp += n;
    while (G.exp >= G.expNext) {
      G.exp -= G.expNext;
      G.level += 1;
      G.expNext = BAL.levelBase + G.level * BAL.levelStep;
      G.pendingLevels += 1;
    }
    syncHud();
  }

  /* ----------------------------------------------------------
     选卡
     ---------------------------------------------------------- */

  function wordsWithBuff(buff) {
    const bank = window.WORD_BANK || {};
    const out = [];
    for (const tier of ['easy', 'mid', 'hard']) {
      for (const w of bank[tier] || []) {
        if (w.buff === buff) out.push(w);
      }
    }
    return out;
  }

  function wordForCard(buff) {
    const all = wordsWithBuff(buff);
    if (!all.length) return { w: 'POWER', zh: '力量', buff };
    // 等级越高，越可能抽到长词
    const tier =
      G.level >= 9 ? 0.15 : G.level >= 6 ? 0.45 : G.level >= 4 ? 0.25 : 0.1;
    const longs = all.filter((x) => x.w.length >= 5);
    if (longs.length && Math.random() < tier) return pick(longs);
    return pick(all);
  }

  function buildOption(card) {
    const item = wordForCard(card.buff);
    const w = item.w;
    const blank = w.length <= 3 ? w.length - 1 : 1 + Math.floor(Math.random() * (w.length - 2));
    const correct = w[blank];

    const others = w.split('').filter((c, i) => i !== blank && c !== correct);
    const d1 = others.length ? pick(others) : 'E';
    let d2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    if (d2 === correct) d2 = d2 === 'A' ? 'B' : 'A';

    return {
      card,
      word: w,
      zh: item.zh,
      blank,
      correct,
      letters: shuffle([correct, d1, d2]).map((l) => ({ l, gone: false })),
      dead: false,
    };
  }

  function openCards() {
    if (G.state !== 'playing') return;
    G.pendingLevels = Math.max(0, G.pendingLevels - 1);
    G.cards.open = true;
    G.cards.picked = -1;
    G.cards.hold = 0;
    G.paused = true;
    hideHint();

    // 三张不同种类的卡
    const pool = shuffle(CARDS.slice());
    const seen = new Set();
    const picks = [];
    for (const c of pool) {
      if (picks.length >= 3) break;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      picks.push(buildOption(c));
    }
    G.cards.options = picks;

    // 有提示就排除一个错误字母
    if (G.hints > 0) {
      G.hints -= 1;
      for (const opt of picks) {
        const wrong = opt.letters.filter((x) => x.l !== opt.correct);
        if (wrong.length) pick(wrong).gone = true;
      }
    }

    renderCardPanel();
    cardsEl.hidden = false;
  }

  function renderCardPanel() {
    cardsK.textContent = `升级 Lv.${G.level}`;
    cardsTip.textContent =
      G.hints > 0 || G.cards.options.some((o) => o.letters.some((x) => x.gone))
        ? '三选一 · 补全单词才能拿到（提示已排除一个错误字母）'
        : '三选一 · 补全单词才能拿到，拼错这级就空过';
    cardsTip.style.color = '';

    cardList.hidden = false;
    puzzleEl.hidden = true;
    cardList.innerHTML = '';

    G.cards.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'up' + (opt.dead ? ' dead' : '');
      b.innerHTML = `
        <span class="up-icon">${opt.card.icon}</span>
        <span class="up-body">
          <span class="up-name">${opt.card.name}</span>
          <span class="up-desc">${opt.card.desc}</span>
          <span class="up-word">${blankHtml(opt)}</span>
        </span>`;
      b.addEventListener('click', () => pickCard(i));
      cardList.appendChild(b);
    });
  }

  function blankHtml(opt) {
    return opt.word
      .split('')
      .map((c, i) => (i === opt.blank ? '<span class="blank">_</span>' : c))
      .join(' ');
  }

  function pickCard(i) {
    const opt = G.cards.options[i];
    if (!opt || opt.dead || G.cards.picked >= 0) return;

    G.cards.picked = i;
    cardList.hidden = true;
    puzzleEl.hidden = false;

    puzzleName.textContent = `${opt.card.name} · ${opt.card.desc}`;
    puzzleZh.textContent = opt.zh;
    puzzleWord.innerHTML = blankHtml(opt);
    // 长单词缩小字号，别折行
    const n = opt.word.length;
    puzzleWord.style.fontSize = n >= 8 ? '26px' : n === 7 ? '29px' : n === 6 ? '32px' : '38px';
    puzzleWord.style.letterSpacing = n >= 7 ? '0.06em' : '0.12em';
    puzzleTip.textContent = '拼错这级就拿不到卡';
    puzzleTip.className = 'puzzle-tip';

    puzzleLetters.innerHTML = '';
    for (const item of opt.letters) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.l;
      if (item.gone) b.classList.add('gone');
      b.addEventListener('click', () => answerLetter(item.l));
      puzzleLetters.appendChild(b);
    }
  }

  function answerLetter(letter) {
    const opt = G.cards.options[G.cards.picked];
    if (!opt || G.cards.hold > 0) return;

    if (letter === opt.correct) {
      applyCard(opt.card);
      G.cards.solved += 1;
      puzzleTip.textContent = `✔ ${opt.word} ${opt.zh} · ${opt.card.desc}`;
      puzzleTip.className = 'puzzle-tip ok';
      floatText(TOWER_Y - 190, opt.card.name, '#7ee0a0');
      G.cards.hold = 0.75;
      return;
    }

    opt.dead = true;
    G.cards.lost += 1;
    puzzleTip.textContent = `✘ 正确答案是 ${opt.correct}（${opt.word} ${opt.zh}）· 这一级拿不到卡了`;
    puzzleTip.className = 'puzzle-tip bad';
    G.cards.hold = 1.3;
  }

  /** 卡片面板收起：答对拿卡，答错也收起（一级只有一次机会） */
  function finishCardHold() {
    closeCards();
  }

  function closeCards() {
    cardsEl.hidden = true;
    G.cards.open = false;
    G.cards.picked = -1;
    G.paused = false;
    syncHud();
  }

  function applyCard(card) {
    const t = G.tower;
    switch (card.id) {
      case 'dmg': t.dmgMul *= BAL.buffDmg; break;
      case 'rate': t.rate = Math.min(BAL.rateMax, t.rate + BAL.buffRate); break;
      case 'split': t.shots = Math.min(BAL.shotsMax, t.shots + 1); break;
      case 'shield':
        t.shield += 1;
        G.maxHp += 1;
        G.hp = Math.min(G.maxHp, G.hp + 1);
        break;
      case 'slow': t.slowLevel = Math.min(BAL.slowMax, t.slowLevel + 1); break;
      case 'burn': t.burnLevel = Math.min(BAL.burnMax, t.burnLevel + 1); break;
      case 'pierce': t.pierce += 1; break;
      case 'crit': t.crit = Math.min(0.75, t.crit + BAL.buffCrit); break;
      default: break;
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
    const n = BAL.waveCounts[Math.min(G.wave - 1, BAL.waveCounts.length - 1)] || 8;
    const hp = enemyHp(G.wave);
    const q = [];
    for (let i = 0; i < n; i++) {
      const elite = i > 0 && i % BAL.eliteEvery === BAL.eliteEvery - 1;
      q.push({
        kind: elite ? 'elite' : 'grunt',
        hp: elite ? Math.round(hp * BAL.eliteHpMul) : hp,
      });
    }
    G.queue = q;
    G.spawnTimer = 0.2;
    syncHud();
  }

  function spawnFromQueue() {
    const item = G.queue.shift();
    if (!item) return;

    const isBoss = item.kind === 'boss';
    const isElite = item.kind === 'elite';
    const x = isBoss
      ? W / 2
      : BRIDGE.left + 55 + Math.random() * (BRIDGE.right - BRIDGE.left - 110);

    G.enemies.push({
      kind: item.kind,
      x,
      y: isBoss ? SPAWN_Y - 60 : SPAWN_Y + Math.random() * 26 - 13,
      r: isBoss ? 56 : isElite ? 26 : 20,
      hp: item.hp,
      maxHp: item.hp,
      speed: isBoss ? BAL.bossSpeed : isElite ? BAL.eliteSpeed : BAL.speed,
      dead: false,
      hitFlash: 0,
      slowT: 0,
      burnT: 0,
      burnDps: 0,
      wob: Math.random() * Math.PI * 2,
      mark: isElite || isBoss ? String.fromCharCode(65 + Math.floor(Math.random() * 26)) : '',
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
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
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
    const ox = t.x + Math.cos(angle) * 52;
    const oy = t.y + Math.sin(angle) * 52;
    const base = t.damage * t.dmgMul;
    const n = t.shots;
    const spread = 0.055;

    for (let i = 0; i < n; i++) {
      const a = angle + (i - (n - 1) / 2) * spread;
      const crit = Math.random() < t.crit;
      G.bullets.push({
        x: ox,
        y: oy,
        vx: Math.cos(a) * BAL.bulletSpeed,
        vy: Math.sin(a) * BAL.bulletSpeed,
        damage: crit ? base * 2 : base,
        crit,
        pierce: t.pierce,
        hit: [],
        dead: false,
      });
    }

    t.kick = 1;
    puff(ox, oy, '#ffd166', 3);
  }

  /* ----------------------------------------------------------
     敌人 / 子弹
     ---------------------------------------------------------- */

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    G.kills += 1;
    puff(e.x, e.y, '#9be26a', e.kind === 'boss' ? 70 : 14);

    if (e.kind === 'boss') {
      win();
      return;
    }

    addExp(e.kind === 'elite' ? BAL.expElite : BAL.expGrunt);
    if (e.kind === 'elite') {
      G.hints = Math.min(2, G.hints + 1);
      floatText(e.y, '提示 +1', '#ffd166');
    }
  }

  function updateEnemies(dt) {
    for (const e of G.enemies) {
      if (e.dead) continue;

      if (e.hitFlash > 0) e.hitFlash -= dt * 4;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        if (Math.random() < dt * 8) puff(e.x + rnd(-10, 10), e.y + rnd(-10, 10), '#ff9b5a', 1);
        if (e.hp <= 0) { killEnemy(e); continue; }
      }

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
        if (b.hit.indexOf(e) !== -1) continue;

        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + 8;
        if (dx * dx + dy * dy <= rr * rr) {
          hitEnemy(e, b);
          b.hit.push(e);

          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            b.dead = true;
            break;
          }
        }
      }
    }

    G.bullets = G.bullets.filter((b) => !b.dead);
  }

  function hitEnemy(e, b) {
    e.hp -= b.damage;
    e.hitFlash = 1;

    if (b.crit) {
      puff(b.x, b.y, '#ff7d7d', 8);
    } else {
      puff(b.x, b.y, '#ffd166', 3);
    }

    if (G.tower.slowLevel > 0) e.slowT = 0.9;

    if (G.tower.burnLevel > 0) {
      e.burnT = 2;
      e.burnDps = b.damage * BAL.buffBurn * G.tower.burnLevel;
    }

    if (e.hp <= 0) killEnemy(e);
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
    return `Lv.${G.level} · 第 ${G.wave} 波 · 击杀 ${G.kills} · 拿到 ${G.cards.solved} 张卡`;
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
    G.result = null;
    G.wave = 0;
    G.time = 0;
    G.kills = 0;
    G.hp = BAL.towerHp;
    G.maxHp = BAL.towerHp;
    G.level = 1;
    G.exp = 0;
    G.expNext = BAL.levelBase + G.level * BAL.levelStep;
    G.pendingLevels = 0;
    G.hints = 0;
    G.enemies = [];
    G.bullets = [];
    G.particles = [];
    G.floaters = [];
    G.queue = [];
    G.spawnTimer = 0;
    G.waveGap = 0;
    G.bossSpawned = false;
    G.tower = {
      x: W / 2,
      y: TOWER_Y,
      angle: -Math.PI / 2,
      cd: 0,
      damage: BAL.damage,
      dmgMul: 1,
      rate: BAL.rate,
      shots: BAL.shots,
      slowLevel: 0,
      burnLevel: 0,
      pierce: 0,
      crit: 0,
      shield: 0,
      kick: 0,
    };
    G.cards = { open: false, options: [], picked: -1, hold: 0, solved: 0, lost: 0 };

    cardsEl.hidden = true;
    puzzleEl.hidden = true;
    cardList.hidden = false;
    overEl.hidden = true;
    pauseBtn.classList.remove('paused');

    hintShown = false;
    hintEl.classList.remove('gone');

    G.wave = 1;
    startWave();
    syncHud();
  }

  /* ----------------------------------------------------------
     暂停
     ---------------------------------------------------------- */

  function setPaused(v) {
    if (G.state !== 'playing' || G.cards.open) return;
    G.paused = v;
    pauseBtn.classList.toggle('paused', v);
    pauseBtn.setAttribute('aria-label', v ? '继续' : '暂停');
  }

  /* ----------------------------------------------------------
     更新
     ---------------------------------------------------------- */

  function update(dt) {
    G.time += dt;
    if (G.time > 14) hideHint();
    if (G.state !== 'playing') {
      updateParticles(dt);
      return;
    }

    if (!G.cards.open && G.pendingLevels > 0) {
      openCards();
      return;
    }

    updateSpawner(dt);
    if (G.state !== 'playing') return;

    updateEnemies(dt);
    if (G.state !== 'playing') return;

    updateTower(dt);
    updateBullets(dt);
    updateParticles(dt);
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

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a2333');
    g.addColorStop(1, '#131a27');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, w, TOWER_Y + 40);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of RUNES) {
      ctx.globalAlpha = r.a;
      ctx.fillStyle = '#8fb4ff';
      ctx.font = `800 ${r.s}px "SF Mono", Consolas, monospace`;
      ctx.fillText(r.ch, r.x, r.y);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(120, 160, 220, 0.07)';
    ctx.lineWidth = 2;
    for (let y = 80; y < TOWER_Y; y += 110) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#0d1420';
    ctx.fillRect(x0 - 10, 0, 10, TOWER_Y + 40);
    ctx.fillRect(x0 + w, 0, 10, TOWER_Y + 40);

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

    // 出生口
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
      const isElite = e.kind === 'elite';

      ctx.beginPath();
      ctx.ellipse(e.x, y + e.r + 10, e.r * 0.8, e.r * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fill();

      const bodyGrad = ctx.createRadialGradient(
        e.x - e.r * 0.3, y - e.r * 0.35, e.r * 0.2,
        e.x, y, e.r
      );
      if (isBoss) {
        bodyGrad.addColorStop(0, '#ff9b8a');
        bodyGrad.addColorStop(1, '#b83a30');
      } else if (isElite) {
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

      // 点燃：外圈红焰
      if (e.burnT > 0) {
        ctx.beginPath();
        ctx.arc(e.x, y, e.r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 140, 80, ${0.35 + Math.sin(G.time * 20) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      const eyeR = isBoss ? 9 : 4.5;
      const eyeY = y - e.r * 0.12;
      ctx.fillStyle = '#10161f';
      ctx.beginPath();
      ctx.arc(e.x - e.r * 0.32, eyeY, eyeR, 0, Math.PI * 2);
      ctx.arc(e.x + e.r * 0.32, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();

      if (e.hitFlash > 0) {
        ctx.globalAlpha = Math.min(0.45, e.hitFlash * 0.45);
        ctx.beginPath();
        ctx.arc(e.x, y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (e.mark) {
        ctx.font = '800 24px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.strokeText(e.mark, e.x, y - e.r - 22);
        ctx.fillStyle = '#ffd166';
        ctx.fillText(e.mark, e.x, y - e.r - 22);
      }

      if (e.hp < e.maxHp) {
        const wBar = isBoss ? 110 : isElite ? 52 : 40;
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

    const glow = Math.min(1, Math.log10(Math.max(1, t.dmgMul)) / 1.6);
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 26, base + glow * 30, 14 + glow * 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(102, 160, 255, ${0.08 + glow * 0.14})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(140, 190, 255, ${0.2 + glow * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(t.x, t.y, base, 0, Math.PI * 2);
    ctx.fillStyle = '#1b2536';
    ctx.fill();
    ctx.strokeStyle = '#4b6a9b';
    ctx.lineWidth = 3;
    ctx.stroke();

    const core = 15 + Math.sin(G.time * 4) * 1.5;
    const coreGrad = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, core + 6);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.45, '#8fd0ff');
    coreGrad.addColorStop(1, 'rgba(80, 150, 255, 0)');
    ctx.beginPath();
    ctx.arc(t.x, t.y, core + 6, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

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

    for (let i = 1; i < t.shots; i++) {
      const off = (i - (t.shots - 1) / 2) * 10;
      const nx = Math.cos(t.angle + Math.PI / 2) * off;
      const ny = Math.sin(t.angle + Math.PI / 2) * off;
      ctx.beginPath();
      ctx.arc(ex + nx, ey + ny, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd166';
      ctx.fill();
    }

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

      ctx.strokeStyle = b.crit ? 'rgba(255, 130, 130, 0.7)' : 'rgba(255, 209, 102, 0.5)';
      ctx.lineWidth = b.crit ? 9 : 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.crit ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = b.crit ? '#ffd0d0' : '#fff3c4';
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

    if (!G.paused && G.state === 'playing') {
      let remain = dt;
      while (remain > 1e-6) {
        const step = Math.min(remain, 1 / 60);
        update(step);
        remain -= step;
        if (G.state !== 'playing' || G.paused) break;
      }
    } else {
      updateParticles(dt);
    }

    // 选卡面板的对错停留（暂停中也要走）
    if (G.cards.hold > 0) {
      G.cards.hold -= dt / FAST;
      if (G.cards.hold <= 0) {
        G.cards.hold = 0;
        finishCardHold();
      }
    }

    render();
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------
     控件
     ---------------------------------------------------------- */

  pauseBtn.addEventListener('click', () => setPaused(!G.paused));
  document.getElementById('again').addEventListener('click', reset);

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      setPaused(!G.paused);
    }
  });

  /* ----------------------------------------------------------
     启动
     ---------------------------------------------------------- */

  resize();
  reset();
  if (QS.has('debug')) {
    window.__g = G;
    window.__api = {
      openCards,
      pickCard,
      answerLetter,
      reset,
      goal: () => ({
        wave: G.wave,
        level: G.level,
        exp: G.exp,
        hp: G.hp,
        pending: G.pendingLevels,
        open: G.cards.open,
        picked: G.cards.picked,
        options: G.cards.options.map((o) => ({
          word: o.word, correct: o.correct, dead: o.dead,
          letters: o.letters.map((l) => ({ l: l.l, gone: l.gone })),
        })),
        state: G.state,
      }),
    };
  }
  requestAnimationFrame(frame);
})();
