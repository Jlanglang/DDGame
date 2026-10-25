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
    hpGrowth: 1.11,     // 每波 ×1.11（100 波通关，实测 75% 认识率约 55% 通关）
    surgeFrom: 999,     // 额外加速已关掉（原来第 15 波 ×1.2 太陡，100 波撑不住）
    surge: 1.2,         // 保留字段，surgeFrom 设很大就等于不触发
    speed: 84,          // 小怪推进速度（像素/秒）
    waves: 100,         // 撑过 100 波算通关，每 20 波一个 BOSS
    spawnGap: 0.26,     // 同一波里两只怪的间隔（越小越挤）
    waveGap: 0.8,       // 清场后的休息
    bossMul: 14,        // BOSS 血量 = 当波血量 ×14
    bossSpeed: 30,
    bossEvery: 20,      // 每 N 波出一只 BOSS

    expGrunt: 1,
    expElite: 3,
    expBoss: 40,
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

    // 新词缀
    splashRange: 72,    // 溅射半径（像素）
    splashMax: 0.9,     // 溅射倍率上限
    chainRange: 190,    // 连锁找下一个目标的半径
    chainMax: 4,        // 连锁跳数上限
    chainFalloff: 0.65, // 每跳伤害衰减
    stunMax: 0.25,      // 定身触发概率上限
    regenEvery: 18,     // 自动修复间隔（秒）
  }, (typeof globalThis !== 'undefined' && globalThis.__BALANCE) || {});

  /* ----------------------------------------------------------
     怪物种类：波数越高，出现的种类越多、也越强
     ---------------------------------------------------------- */

  const TYPES = {
    grunt:    { hp: 1,   spd: 1,    r: 20, exp: 1 },
    elite:    { hp: 2.6, spd: 0.78, r: 26, exp: 3 },
    armor:    { hp: 2.2, spd: 0.8,  r: 25, exp: 3 },   // 减伤 + 挡穿透
    ranged:   { hp: 1.3, spd: 1,    r: 22, exp: 3 },   // 停下来远程打塔
    splitter: { hp: 1.7, spd: 1,    r: 26, exp: 2 },   // 死了分裂
    healer:   { hp: 1.9, spd: 0.7,  r: 24, exp: 3 },   // 给周围怪回血
    leveler:  { hp: 1.2, spd: 1.15, r: 22, exp: 0 },   // 死了直接升 1 级
  };

  /** 这一波会出哪些种类（权重） */
  function typeWeights(wave) {
    const w = { grunt: 100 };
    if (wave >= 3) w.elite = 26;
    if (wave >= 4) w.armor = 24;
    if (wave >= 5) w.ranged = 22;
    if (wave >= 6) w.splitter = 20;
    if (wave >= 8) w.healer = 16;
    if (wave >= 10) w.leveler = 2;
    return w;
  }

  function pickType(wave) {
    const w = typeWeights(wave);
    let total = 0;
    for (const k in w) total += w[k];
    let r = Math.random() * total;
    for (const k in w) {
      r -= w[k];
      if (r <= 0) return k;
    }
    return 'grunt';
  }

  /** 200 波无尽：人数随波数涨，40 封顶 */
  function waveCount(wave) {
    return Math.min(40, 8 + Math.floor(wave * 1.1));
  }

  /* ----------------------------------------------------------
     升级卡池：每张卡绑一个 buff，单词从词库里按 buff 抽
     ---------------------------------------------------------- */

  /** 卡片分级：每张卡自己掷；波数越靠后越容易出高级卡 */
  const GRADES = {
    B: { key: 'B', mul: 1,   color: '#8fb4ff' },
    A: { key: 'A', mul: 1.5, color: '#ffd166' },
    S: { key: 'S', mul: 2.2, color: '#ff9ec4' },
  };

  /** 年级难度：3-4 / 3-5 / 3-6（1、2 年级不学英语，单词已并入 3 年级） */
  const GRADE_RANGES = [
    { key: '3-4', min: 3, max: 4 },
    { key: '3-5', min: 3, max: 5 },
    { key: '3-6', min: 3, max: 6 },
  ];

  function storedRange() {
    try {
      const k = window.localStorage.getItem('wordtower-grade-range');
      const found = GRADE_RANGES.find((r) => r.key === k);
      if (found) return found;
    } catch (err) { /* 无痕模式 */ }
    return GRADE_RANGES[0];   // 默认 3-4（最简单）
  }

  function gradeWeights(wave) {
    if (wave <= 4) return { B: 80, A: 20, S: 0 };      // 前期：B 多 A 少
    if (wave <= 8) return { B: 55, A: 35, S: 10 };     // 中期：三种都有
    if (wave <= 14) return { B: 35, A: 40, S: 25 };    // 后期：S 开始常见
    return { B: 20, A: 40, S: 40 };                    // 深水区
  }

  function rollGrade(wave) {
    const w = gradeWeights(wave);
    const total = w.B + w.A + w.S;
    let r = Math.random() * total;
    for (const k of ['B', 'A', 'S']) {
      r -= w[k];
      if (r <= 0) return GRADES[k];
    }
    return GRADES.B;
  }

  // 离散加成：B 1 档 / A 2 档 / S 3 档
  const stepOf = (m) => Math.max(1, Math.round(m * 1.2));

  const CARDS = [
    { id: 'dmg', name: '强化弹头', icon: '✦', buff: 'dmg',
      desc: (m) => `攻击 +${Math.round(10 * m)}%`,
      apply: (t, m) => { t.dmgMul *= 1 + 0.1 * m; } },

    { id: 'rate', name: '速射机匣', icon: '⇈', buff: 'rate',
      desc: (m) => `攻速 +${(0.35 * m).toFixed(2)}`,
      apply: (t, m) => { t.rate = Math.min(BAL.rateMax, t.rate + BAL.buffRate * m); },
      maxed: (t) => t.rate >= BAL.rateMax - 1e-6 },

    { id: 'split', name: '分裂弹道', icon: '⌇', buff: 'split',
      desc: (m) => `弹道 +${stepOf(m)}`,
      apply: (t, m) => { t.shots = Math.min(BAL.shotsMax, t.shots + stepOf(m)); },
      maxed: (t) => t.shots >= BAL.shotsMax },

    { id: 'shield', name: '护盾装甲', icon: '◈', buff: 'shield',
      desc: (m) => `回血 +${stepOf(m)}`,
      apply: (t, m) => {
        const n = stepOf(m);
        t.shield += n;
        G.maxHp += n;
        G.hp = Math.min(G.maxHp, G.hp + n);
      } },

    { id: 'slow', name: '冰冻弹', icon: '❄', buff: 'slow',
      desc: (m) => `减速 ×${stepOf(m)}`,
      apply: (t, m) => { t.slowLevel = Math.min(BAL.slowMax, t.slowLevel + stepOf(m)); },
      maxed: (t) => t.slowLevel >= BAL.slowMax },

    { id: 'burn', name: '燃烧弹', icon: '♨', buff: 'burn',
      desc: (m) => `燃烧 ×${stepOf(m)}`,
      apply: (t, m) => { t.burnLevel = Math.min(BAL.burnMax, t.burnLevel + stepOf(m)); },
      maxed: (t) => t.burnLevel >= BAL.burnMax },

    { id: 'pierce', name: '穿甲弹', icon: '➤', buff: 'pierce',
      desc: (m) => `穿透 +${stepOf(m)}`,
      apply: (t, m) => { t.pierce += stepOf(m); } },

    { id: 'crit', name: '瞄准镜', icon: '◎', buff: 'crit',
      desc: (m) => `暴击 +${Math.round(10 * m)}%`,
      apply: (t, m) => { t.crit = Math.min(0.75, t.crit + BAL.buffCrit * m); },
      maxed: (t) => t.crit >= 0.75 - 1e-6 },

    { id: 'splash', name: '溅射弹头', icon: '✸', buff: 'splash',
      desc: (m) => `溅射 ${Math.round(45 * m)}%`,
      apply: (t, m) => { t.splash = Math.min(BAL.splashMax, t.splash + 0.45 * m); },
      maxed: (t) => t.splash >= BAL.splashMax - 1e-6 },

    { id: 'chain', name: '连锁闪电', icon: '⚡', buff: 'chain',
      desc: (m) => `连锁 +${stepOf(m)}`,
      apply: (t, m) => { t.chain = Math.min(BAL.chainMax, t.chain + stepOf(m)); },
      maxed: (t) => t.chain >= BAL.chainMax },

    { id: 'stun', name: '眩晕弹', icon: '✶', buff: 'stun',
      desc: (m) => `定身 ${Math.round(9 * m)}%`,
      apply: (t, m) => { t.stun = Math.min(BAL.stunMax, t.stun + 0.09 * m); },
      maxed: (t) => t.stun >= BAL.stunMax - 1e-6 },

    { id: 'bounty', name: '战地赏金', icon: '¥', buff: 'bounty',
      desc: (m) => `经验 +${Math.round(25 * m)}%`,
      apply: (t, m) => { t.expMul = Math.min(4, t.expMul + 0.25 * m); },
      maxed: (t) => t.expMul >= 4 - 1e-6 },

    { id: 'regen', name: '自动修复', icon: '✚', buff: 'regen',
      desc: (m) => `每 ${BAL.regenEvery} 秒回 ${stepOf(m)} 血`,
      apply: (t, m) => { t.regen += stepOf(m); },
      maxed: (t) => t.regen >= 12 },

    { id: 'critdmg', name: '致命瞄具', icon: '⊙', buff: 'critdmg',
      desc: (m) => `暴伤 +${Math.round(30 * m)}%`,
      apply: (t, m) => { t.critMul = Math.min(4, t.critMul + 0.3 * m); },
      maxed: (t) => t.critMul >= 4 - 1e-6 },

    { id: 'armorpen', name: '破甲弹芯', icon: '⛏', buff: 'armorpen',
      desc: (m) => `无视 ${Math.round(12 * m)}% 护甲`,
      apply: (t, m) => { t.armorPen = Math.min(0.8, t.armorPen + 0.12 * m); },
      maxed: (t) => t.armorPen >= 0.8 - 1e-6 },
  ];

  /* ----------------------------------------------------------
     状态
     ---------------------------------------------------------- */

  function newTower() {
    return {
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
      // 新词缀
      splash: 0,
      chain: 0,
      stun: 0,
      expMul: 1,
      regen: 0,
      regenT: 0,
      critMul: 1,
      armorPen: 0,
    };
  }

  const G = {
    state: 'home',
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
    pendingQueue: [],   // 每次升级对应的目标等级，选卡面板按顺序消费
    wordRecent: [],     // 本局最近抽过的单词，避免短时间内重复
    gradeRange: storedRange(), // 年级难度：{key:'1-3', min, max}（单词只抽这个范围里的）

    enemies: [],
    bullets: [],
    ebullets: [],
    particles: [],
    floaters: [],
    zaps: [],
    queue: [],
    spawnTimer: 0,
    waveGap: 0,
    bossSpawned: false,
    bossPending: false,

    tower: newTower(),

    cards: {
      open: false,
      options: [],
      picked: -1,
      hold: 0,
      solved: 0,
      lost: 0,
      targetLv: 0,
      lastIds: '',
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
  const statsEl = document.getElementById('stats');
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
  const puzzleNext = document.getElementById('puzzleNext');
  const overEl = document.getElementById('over');
  const overSub = document.getElementById('overSub');
  const pauseBtn = document.getElementById('pause');
  const speedEl = document.getElementById('speed');
  const hintEl = document.getElementById('hint');

  const homeEl = document.getElementById('home');
  const battleEl = document.getElementById('battle');
  const startBtn = document.getElementById('startBtn');
  const exitBtn = document.getElementById('exitBtn');
  const gradeRow = document.getElementById('gradeRow');
  const homeBest = document.getElementById('homeBest');
  const overHome = document.getElementById('overHome');

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

    stageName.textContent = G.bossSpawned ? `BOSS · 第 ${G.wave} 波` : `第 ${G.wave} 波`;

    syncStats();
  }

  /** 当前强化：攻/速/弹常显，其余只在拿到后才出现 */
  let lastStatsKey = '';
  function syncStats() {
    const t = G.tower;
    const rows = [
      ['攻击', Math.round(t.damage * t.dmgMul)],
      ['攻速', t.rate.toFixed(1)],
      ['弹道', t.shots],
    ];
    if (t.pierce) rows.push(['穿透', t.pierce]);
    if (t.crit) rows.push(['暴击', `${Math.round(t.crit * 100)}%`]);
    if (t.critMul > 1) rows.push(['暴伤', `${Math.round(t.critMul * 100)}%`]);
    if (t.slowLevel) rows.push(['减速', t.slowLevel]);
    if (t.burnLevel) rows.push(['燃烧', t.burnLevel]);
    if (t.shield) rows.push(['回血', t.shield]);
    if (t.regen) rows.push(['修复', `+${t.regen}/${BAL.regenEvery}s`]);
    if (t.splash) rows.push(['溅射', `${Math.round(t.splash * 100)}%`]);
    if (t.chain) rows.push(['连锁', t.chain]);
    if (t.stun) rows.push(['定身', `${Math.round(t.stun * 100)}%`]);
    if (t.armorPen) rows.push(['破甲', `${Math.round(t.armorPen * 100)}%`]);
    if (t.expMul > 1) rows.push(['经验', `+${Math.round((t.expMul - 1) * 100)}%`]);

    const key = rows.map((r) => r.join(':')).join('|');
    if (key === lastStatsKey) return;
    lastStatsKey = key;

    statsEl.innerHTML = rows
      .map(
        ([k, v], i) =>
          `<div class="stat${i >= 3 ? ' on' : ''}"><span>${k}</span><b>${v}</b></div>`
      )
      .join('');
  }

  /* ----------------------------------------------------------
     经验 / 升级
     ---------------------------------------------------------- */

  /** 升级只在这一处发生：加一级 + 记一次待选卡（目标等级进队列） */
  function levelUp() {
    G.level += 1;
    G.expNext = BAL.levelBase + G.level * BAL.levelStep;
    G.pendingLevels += 1;
    G.pendingQueue.push(G.level);
  }

  function addExp(n) {
    G.exp += n;
    while (G.exp >= G.expNext) {
      G.exp -= G.expNext;
      levelUp();
    }
    syncHud();
  }

  /* ----------------------------------------------------------
     选卡
     ---------------------------------------------------------- */

  /** 卡面等级 ↔ 单词长度档位：B 短词 / A 中词 / S 长词 */
  const GRADE_TIER = { B: 'easy', A: 'mid', S: 'hard' };

  /** 按当前年级范围筛词；某个 buff 在这个范围一个词都没有时，退回全量 */
  function wordsWithBuff(buff) {
    const bank = window.WORD_BANK || {};
    const range = G.gradeRange || GRADE_RANGES[0];

    const gather = (useRange) => {
      const out = { easy: [], mid: [], hard: [] };
      for (const tier of ['easy', 'mid', 'hard']) {
        for (const w of bank[tier] || []) {
          if (w.buff !== buff) continue;
          const g = w.grade || 6;
          if (useRange && (g < range.min || g > range.max)) continue;
          out[tier].push({ w: w.w, zh: w.zh, grade: g, buff, tier });
        }
      }
      return out;
    };

    const out = gather(true);
    if (!out.easy.length && !out.mid.length && !out.hard.length) return gather(false);
    return out;
  }

  /**
   * 抽一个单词：词长档位直接跟卡面等级走（B→短词 / A→中词 / S→长词），
   * 所以「S 卡更强」也意味着「S 卡要拼的词更长」。
   * 同时优先避开本局已经出现过的词。
   */
  function wordForCard(buff, grade) {
    const tiers = wordsWithBuff(buff);
    const all = tiers.easy.concat(tiers.mid, tiers.hard);
    if (!all.length) return { w: 'POWER', zh: '力量', buff, tier: 'mid' };

    const recent = new Set(G.wordRecent);
    let pool = all.filter((x) => !recent.has(x.w));
    if (!pool.length) {
      // 这个词缀的词全抽过了，只把这个词缀从历史里放出来
      G.wordRecent = G.wordRecent.filter((w) => !all.some((x) => x.w === w));
      pool = all;
    }

    const wanted = GRADE_TIER[grade && grade.key] || 'easy';
    const order =
      wanted === 'hard' ? ['hard', 'mid', 'easy'] :
      wanted === 'mid' ? ['mid', 'easy', 'hard'] :
      ['easy', 'mid', 'hard'];

    let item = null;
    for (const t of order) {
      const cand = pool.filter((x) => x.tier === t);
      if (cand.length) { item = pick(cand); break; }
    }
    if (!item) item = pick(pool);

    G.wordRecent.push(item.w);
    if (G.wordRecent.length > 90) G.wordRecent.shift();
    return item;
  }

  function buildOption(card, grade) {
    const item = wordForCard(card.buff, grade);
    const w = item.w;
    const blank = w.length <= 3 ? w.length - 1 : 1 + Math.floor(Math.random() * (w.length - 2));
    const correct = w[blank];

    // 三个候选字母必须互不相同
    const others = [...new Set(w.split('').filter((c, i) => i !== blank && c !== correct))];
    const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((c) => c !== correct);
    const d1 = others.length ? pick(others) : pick(pool);
    const d2 = pick(pool.filter((c) => c !== d1));

    return {
      card,
      grade,
      mul: grade.mul,
      desc: card.desc(grade.mul),
      word: w,
      zh: item.zh,
      wordGrade: item.grade || 6,
      blank,
      correct,
      letters: shuffle([correct, d1, d2]),
      dead: false,
    };
  }

  /** 三张卡里至少给一张输出卡，免得 15 张卡池把伤害稀释得太狠 */
  const CORE_CARDS = ['dmg', 'rate', 'split'];

  /** 抽三张：已经满级的卡不再出现；连续两次不出现一模一样的三张 */
  function pickOffer() {
    let pool = CARDS.filter((c) => !c.maxed || !c.maxed(G.tower));
    if (pool.length < 3) pool = CARDS.slice();

    let picks = pool.slice(0, 3);
    for (let tries = 0; tries < 12; tries++) {
      const chosen = [];
      const cores = pool.filter((c) => CORE_CARDS.indexOf(c.id) !== -1);
      if (cores.length) chosen.push(pick(cores));

      const rest = shuffle(pool.filter((c) => chosen.indexOf(c) === -1));
      for (const c of rest) {
        if (chosen.length >= 3) break;
        chosen.push(c);
      }
      if (chosen.length < 3) chosen.push(pool[0]);
      picks = chosen.slice(0, 3);

      const key = picks.map((c) => c.id).sort().join(',');
      if (key !== G.cards.lastIds) {
        G.cards.lastIds = key;
        return picks;
      }
    }
    G.cards.lastIds = picks.map((c) => c.id).sort().join(',');
    return picks;
  }

  function openCards() {
    if (G.state !== 'playing') return;
    const targetLv = G.pendingQueue.length ? G.pendingQueue.shift() : G.level;
    G.pendingLevels = Math.max(0, G.pendingLevels - 1);
    G.cards.open = true;
    G.cards.picked = -1;
    G.cards.hold = 0;
    G.cards.targetLv = targetLv;
    G.paused = true;
    hideHint();

    // 固定三张，但每张卡自己掷等级（前期多 B，后期多 S）
    const pool = pickOffer();
    G.cards.options = pool.map((c) => buildOption(c, rollGrade(G.wave)));

    renderCardPanel();
    cardsEl.hidden = false;
  }

  function renderCardPanel() {
    cardsK.textContent = `升级 Lv.${G.cards.targetLv || G.level}`;
    cardsK.style.color = '';
    const left = G.pendingLevels;
    cardsTip.textContent = left > 0
      ? `三选一 · 连续升 ${left + 1} 级，还有 ${left} 次选卡`
      : '三选一 · B 短词 / A 中词 / S 长词，等级越高越强';

    cardList.hidden = false;
    puzzleEl.hidden = true;
    cardList.innerHTML = '';

    G.cards.options.forEach((opt, i) => {
      const g = opt.grade;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'up grade-' + g.key + (opt.dead ? ' dead' : '');
      b.innerHTML = `
        <span class="up-icon">${opt.card.icon}</span>
        <span class="up-body">
          <span class="up-line">
            <span class="up-name">${opt.card.name}</span>
            <i class="up-grade" style="color:${g.color}">${g.key}</i>
          </span>
          <span class="up-desc">${opt.desc}</span>
        </span>
        <span class="up-zh">${opt.zh}</span>`;
      b.addEventListener('click', () => pickCard(i));
      cardList.appendChild(b);
    });
  }

  /** 单词按正常书写显示：首字母大写，其余小写，缺的字母是下划线 */
  function wordHtml(opt, fillBlank) {
    return opt.word
      .split('')
      .map((c, i) => {
        const ch = i === 0 ? c : c.toLowerCase();
        if (i !== opt.blank) return ch;
        return fillBlank
          ? `<span class="filled">${ch}</span>`
          : '<span class="blank">&nbsp;</span>';
      })
      .join('');
  }

  function blankHtml(opt) {
    return wordHtml(opt, false);
  }

  /** 字母块跟单词保持同一种大小写（空格在中段时用小写） */
  function letterText(opt, letter) {
    return opt.blank === 0 ? letter : letter.toLowerCase();
  }

  /** 结果提示里用的正常写法：Morning */
  function pretty(opt) {
    return opt.word[0] + opt.word.slice(1).toLowerCase();
  }

  function pickCard(i) {
    const opt = G.cards.options[i];
    if (!opt || opt.dead || G.cards.picked >= 0) return;

    G.cards.picked = i;
    cardList.hidden = true;
    puzzleEl.hidden = false;

    puzzleName.textContent = `${opt.card.name} · ${opt.desc}`;
    puzzleZh.textContent = opt.zh;
    puzzleWord.innerHTML = blankHtml(opt);
    // 单词不再逐字母空格，长词按长度缩字号（词库最长 12 字母）
    const n = opt.word.length;
    const size = n >= 12 ? 26 : n === 11 ? 28 : n === 10 ? 30
      : n === 9 ? 32 : n === 8 ? 35 : n === 7 ? 39 : 44;
    puzzleWord.style.fontSize = `${size}px`;
    puzzleWord.style.letterSpacing = '0.06em';
    puzzleTip.textContent = '拼错这级就拿不到卡';
    puzzleTip.className = 'puzzle-tip';
    puzzleNext.hidden = true;

    puzzleLetters.innerHTML = '';
    for (const letter of opt.letters) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = letterText(opt, letter);
      b.addEventListener('click', () => answerLetter(letter));
      puzzleLetters.appendChild(b);
    }
  }

  function answerLetter(letter) {
    const opt = G.cards.options[G.cards.picked];
    if (!opt || opt.dead || G.cards.hold > 0) return;

    if (letter === opt.correct) {
      applyCard(opt);
      G.cards.solved += 1;
      puzzleTip.textContent = `✔ ${pretty(opt)} ${opt.zh} · ${opt.desc}`;
      puzzleTip.className = 'puzzle-tip ok';
      floatText(TOWER_Y - 190, opt.card.name, '#7ee0a0');
      G.cards.hold = 0.75;
      return;
    }

    // 错了：面板不自动关，把正确答案摆出来，玩家自己点「继续」
    opt.dead = true;
    G.cards.lost += 1;
    puzzleTip.textContent = `✘ 正确答案是 ${letterText(opt, opt.correct)} · 这一级拿不到卡了`;
    puzzleTip.className = 'puzzle-tip bad';
    // 把缺的字母补上，让人看到完整的词
    puzzleWord.innerHTML = wordHtml(opt, true);
    puzzleLetters.innerHTML = '';
    puzzleNext.hidden = false;
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

  function applyCard(opt) {
    opt.card.apply(G.tower, opt.mul);
    syncHud();
  }

  /* ----------------------------------------------------------
     波次
     ---------------------------------------------------------- */

  function enemyHp(wave) {
    const surge = wave > BAL.surgeFrom ? Math.pow(BAL.surge, wave - BAL.surgeFrom) : 1;
    return Math.round(BAL.hpBase * Math.pow(BAL.hpGrowth, wave - 1) * surge);
  }

  function startWave() {
    const n = waveCount(G.wave);
    const hp = enemyHp(G.wave);
    const q = [];
    for (let i = 0; i < n; i++) q.push({ kind: pickType(G.wave), hp });
    G.queue = q;
    G.spawnTimer = 0.2;
    syncHud();
  }

  function makeEnemy(kind, hp, x, y, gen, maxGen) {
    const t = TYPES[kind] || TYPES.grunt;
    // 波数越高，怪走得越快（最多 +60%）：不然后期清得动就永远死不了，变成无限磨
    const rush = 1 + Math.min(0.6, Math.max(0, (G.wave - 1) * 0.005));
    return {
      kind,
      x,
      y,
      r: t.r,
      hp,
      maxHp: hp,
      speed: BAL.speed * t.spd * rush,
      exp: t.exp,
      dead: false,
      hitFlash: 0,
      slowT: 0,
      burnT: 0,
      burnDps: 0,
      stunT: 0,
      wob: Math.random() * Math.PI * 2,
      gen: gen || 0,
      maxGen: maxGen || 0,
      // 专属状态
      armor: kind === 'armor' ? 0.45 : 0,
      stopY: kind === 'ranged' ? 620 : 0,
      stopped: false,
      shotCd: 1.6,
      healCd: 2.4,
      healPulse: 0,
    };
  }

  function spawnFromQueue() {
    const item = G.queue.shift();
    if (!item) return;

    const t = TYPES[item.kind] || TYPES.grunt;
    const x = BRIDGE.left + 55 + Math.random() * (BRIDGE.right - BRIDGE.left - 110);
    const hp = Math.max(1, Math.round(item.hp * t.hp));
    const maxGen = item.kind === 'splitter' ? (Math.random() < 0.5 ? 1 : 2) : 0;

    G.enemies.push(makeEnemy(item.kind, hp, x, SPAWN_Y + Math.random() * 26 - 13, 0, maxGen));
  }

  function spawnBoss() {
    const hp = Math.round(enemyHp(BAL.waves > 0 ? G.wave : 1) * BAL.bossMul);
    const e = makeEnemy('boss', hp, W / 2, SPAWN_Y - 70, 0, 0);
    e.r = 56;
    e.speed = BAL.bossSpeed;
    e.exp = BAL.expBoss;
    G.enemies.push(e);
    G.bossSpawned = true;
    syncHud();
  }

  function updateSpawner(dt) {
    if (G.queue.length) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        spawnFromQueue();
        G.spawnTimer = BAL.spawnGap;
      }
      return;
    }

    if (G.enemies.length > 0) return;

    // 本波该出 BOSS：清完杂兵后放出来，打死才进下一波
    if (G.bossPending) {
      G.bossPending = false;
      spawnBoss();
      return;
    }

    G.waveGap -= dt;
    if (G.waveGap > 0) return;

    if (G.wave >= BAL.waves) {
      win();
      return;
    }

    G.wave += 1;
    G.bossPending = G.wave % BAL.bossEvery === 0;
    G.bossSpawned = false;
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
        damage: crit ? base * 2 * (t.critMul || 1) : base,
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

    // 分裂怪：死了裂成两只小的，最多裂 maxGen 代
    if (e.kind === 'splitter' && e.gen < e.maxGen) {
      const childHp = Math.max(1, Math.round(e.maxHp * 0.35));
      for (let i = 0; i < 2; i++) {
        const c = makeEnemy('grunt', childHp, e.x + (i ? 26 : -26), e.y + 6, e.gen + 1, e.maxGen);
        c.speed = e.speed * 1.15;
        G.enemies.push(c);
      }
      floatText(e.y - 20, '分裂！', '#ffd166');
    }

    // 升级怪：打死真的升一级（以前只加了一次选卡，等级没变，所以面板会重复弹）
    if (e.kind === 'leveler') {
      levelUp();
      floatText(e.y - 20, `升级 Lv.${G.level}`, '#7ee0a0');
    }

    const baseExp = e.exp != null ? e.exp : TYPES[e.kind] ? TYPES[e.kind].exp : 1;
    addExp(baseExp * (G.tower.expMul || 1));
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

      // 被眩晕：这一帧不动、不开火、不回血
      if (e.stunT > 0) {
        e.stunT = Math.max(0, e.stunT - dt);
      } else {
        // 远程怪：走到中途停下来朝塔开火
        if (e.kind === 'ranged') {
          if (!e.stopped && e.y >= e.stopY) e.stopped = true;
          if (e.stopped) {
            e.shotCd -= dt;
            if (e.shotCd <= 0) {
              e.shotCd = 2;
              enemyShoot(e);
            }
          }
        }

        // 奶妈：定期给周围 220px 内的怪回血
        if (e.kind === 'healer') {
          e.healCd -= dt;
          if (e.healCd <= 0) {
            e.healCd = 3;
            e.healPulse = 1;
            for (const o of G.enemies) {
              if (o.dead || o === e) continue;
              if (Math.hypot(o.x - e.x, o.y - e.y) > 220) continue;
              o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.12);
            }
          }
        }

        if (!(e.kind === 'ranged' && e.stopped)) {
          e.y += e.speed * dt * (e.slowT > 0 ? 0.62 : 1);
        }
      }
      if (e.healPulse > 0) e.healPulse = Math.max(0, e.healPulse - dt * 2);

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

          // 护甲怪：子弹打在它身上就停，穿透也穿不过去
          if (b.pierce > 0 && !e.armor) {
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

  /** 结算一次伤害（含破甲），不触发溅射/连锁，避免递归 */
  function damageRaw(e, dmg) {
    const t = G.tower;
    const real = dmg * (1 - Math.max(0, (e.armor || 0) - (t.armorPen || 0)));
    e.hp -= real;
    e.hitFlash = 1;
    if (e.hp <= 0) killEnemy(e);
    return real;
  }

  /** 溅射：命中点周围一圈吃 45%×层数 的伤害 */
  function splashDamage(src, dmg, mul) {
    const R = BAL.splashRange;
    for (const o of G.enemies) {
      if (o === src || o.dead) continue;
      if (Math.hypot(o.x - src.x, o.y - src.y) > R) continue;
      damageRaw(o, dmg * mul);
      puff(o.x, o.y, '#ffb347', 4);
    }
  }

  /** 连锁：从命中点跳向最近的怪，每跳衰减 */
  function chainDamage(src, dmg, jumps) {
    let from = src;
    let cur = dmg * 0.6;
    const hit = new Set([src]);

    for (let i = 0; i < jumps; i++) {
      let best = null;
      let bestD = Infinity;
      for (const o of G.enemies) {
        if (o.dead || hit.has(o)) continue;
        const d = Math.hypot(o.x - from.x, o.y - from.y);
        if (d < bestD && d <= BAL.chainRange) { bestD = d; best = o; }
      }
      if (!best) break;

      hit.add(best);
      G.zaps.push({ x1: from.x, y1: from.y, x2: best.x, y2: best.y, life: 0.16, max: 0.16 });
      damageRaw(best, cur);
      puff(best.x, best.y, '#9fd0ff', 3);
      from = best;
      cur *= BAL.chainFalloff;
    }
  }

  function hitEnemy(e, b) {
    const t = G.tower;
    const dmg = b.damage * (1 - Math.max(0, (e.armor || 0) - (t.armorPen || 0)));
    e.hp -= dmg;
    e.hitFlash = 1;

    if (b.crit) {
      puff(b.x, b.y, '#ff7d7d', 8);
    } else {
      puff(b.x, b.y, '#ffd166', 3);
    }

    if (t.slowLevel > 0) e.slowT = 0.9;

    if (t.burnLevel > 0) {
      e.burnT = 2;
      e.burnDps = dmg * BAL.buffBurn * t.burnLevel;
    }

    if (t.stun > 0 && Math.random() < t.stun) {
      e.stunT = Math.max(e.stunT, 0.6);
    }

    if (e.hp <= 0) killEnemy(e);
    if (t.splash > 0) splashDamage(e, dmg, t.splash);
    if (t.chain > 0) chainDamage(e, b.damage, t.chain);
  }

  /** 远程怪朝塔开火 */
  function enemyShoot(e) {
    const dx = G.tower.x - e.x;
    const dy = TOWER_Y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    G.ebullets.push({
      x: e.x,
      y: e.y,
      vx: (dx / d) * 330,
      vy: (dy / d) * 330,
      dead: false,
    });
    puff(e.x, e.y, '#ff8a6b', 4);
  }

  function updateEnemyBullets(dt) {
    for (const b of G.ebullets) {
      if (b.dead) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (Math.hypot(b.x - G.tower.x, b.y - TOWER_Y) < 46) {
        b.dead = true;
        puff(b.x, b.y, '#ff7a6b', 16);
        shake = 1;
        G.hp -= 1;
        syncHud();
        if (G.hp <= 0) {
          lose();
          return;
        }
        continue;
      }

      if (b.y > TOWER_Y + 60 || b.y < -60 || b.x < -40 || b.x > W + 40) b.dead = true;
    }
    G.ebullets = G.ebullets.filter((b) => !b.dead);
  }

  /** 自动修复：每 regenEvery 秒回一次血 */
  function updateRegen(dt) {
    const t = G.tower;
    if (t.regen <= 0 || G.hp >= G.maxHp) {
      t.regenT = 0;
      return;
    }
    t.regenT += dt;
    if (t.regenT < BAL.regenEvery) return;

    t.regenT -= BAL.regenEvery;
    const heal = Math.min(t.regen, G.maxHp - G.hp);
    G.hp += heal;
    floatText(TOWER_Y - 170, `+${heal} HP`, '#7ee0a0');
    syncHud();
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

    for (const z of G.zaps) z.life -= dt;
    G.zaps = G.zaps.filter((z) => z.life > 0);

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
    saveBestWave();
    document.getElementById('overK').textContent = '守住了';
    document.getElementById('overK').classList.remove('lost');
    document.getElementById('overTitle').textContent = '豆豆塔还在';
    overSub.innerHTML = resultLine();
    overEl.hidden = false;
  }

  function lose() {
    G.state = 'over';
    G.result = 'lose';
    saveBestWave();
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
    G.pendingQueue = [];
    G.wordRecent = [];
    G.enemies = [];
    G.bullets = [];
    G.ebullets = [];
    G.particles = [];
    G.floaters = [];
    G.zaps = [];
    G.queue = [];
    G.spawnTimer = 0;
    G.waveGap = 0;
    G.bossSpawned = false;
    G.bossPending = false;
    G.tower = newTower();
    G.cards = {
      open: false, options: [], picked: -1, hold: 0, solved: 0, lost: 0,
      targetLv: 0, lastIds: '',
    };

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
    updateEnemyBullets(dt);
    updateRegen(dt);
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
    drawZaps();
    drawTower();
    drawBullets();
    drawEnemyBullets();
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

  const TYPE_COLOR = {
    grunt: ['#9be26a', '#3f7a2c'],
    elite: ['#ffe6a8', '#c98f2a'],
    armor: ['#c3d2e8', '#5a6c86'],
    ranged: ['#ffb09a', '#a83b2c'],
    splitter: ['#8ce6d8', '#2f7d72'],
    healer: ['#b4f5c0', '#2f8a45'],
    leveler: ['#b6dcff', '#2f6da8'],
    boss: ['#ff9b8a', '#b83a30'],
  };

  const TYPE_ICON = {
    armor: '◍',
    ranged: '◎',
    splitter: '✂',
    healer: '＋',
    leveler: '★',
  };

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
      const col = TYPE_COLOR[e.kind] || TYPE_COLOR.grunt;
      bodyGrad.addColorStop(0, col[0]);
      bodyGrad.addColorStop(1, col[1]);
      ctx.beginPath();
      ctx.arc(e.x, y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // 护甲怪：外面套一层壳
      if (e.armor) {
        ctx.beginPath();
        ctx.arc(e.x, y, e.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200, 215, 235, 0.6)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 奶妈回血时的绿光
      if (e.healPulse > 0) {
        ctx.beginPath();
        ctx.arc(e.x, y, e.r + 6 + e.healPulse * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(126, 224, 160, ${e.healPulse * 0.6})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 种类标记
      if (TYPE_ICON[e.kind]) {
        ctx.font = '800 18px "PingFang SC", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.strokeText(TYPE_ICON[e.kind], e.x + e.r * 0.9, y - e.r * 0.9);
        ctx.fillStyle = col[0];
        ctx.fillText(TYPE_ICON[e.kind], e.x + e.r * 0.9, y - e.r * 0.9);
      }

      // 点燃：外圈红焰
      if (e.burnT > 0) {
        ctx.beginPath();
        ctx.arc(e.x, y, e.r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 140, 80, ${0.35 + Math.sin(G.time * 20) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 定身：头顶 z + 虚线环
      if (e.stunT > 0) {
        ctx.save();
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.arc(e.x, y, e.r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(180, 214, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        ctx.font = '800 16px "PingFang SC", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#cfe4ff';
        ctx.fillText('z', e.x + e.r * 0.55, y - e.r - 12);
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

  /** 连锁闪电的折线 */
  function drawZaps() {
    for (const z of G.zaps) {
      const a = Math.max(0, z.life / z.max);
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#cfe8ff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(z.x1, z.y1);
      ctx.lineTo(
        (z.x1 + z.x2) / 2 + (Math.random() - 0.5) * 20,
        (z.y1 + z.y2) / 2 + (Math.random() - 0.5) * 20
      );
      ctx.lineTo(z.x2, z.y2);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
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

  function drawEnemyBullets() {
    for (const b of G.ebullets) {
      if (b.dead) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ff7a6b';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 122, 107, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
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
  const SPEEDS = [1, 2, 4];
  let speed = Math.max(1, Math.min(4, Number(QS.get('fast')) || 1));
  if (SPEEDS.indexOf(speed) === -1) speed = 1;

  function applySpeed() {
    speedEl.textContent = `×${speed}`;
    speedEl.classList.toggle('on', speed > 1);
  }

  function cycleSpeed() {
    const i = SPEEDS.indexOf(speed);
    speed = SPEEDS[(i + 1) % SPEEDS.length];
    applySpeed();
  }

  /* ----------------------------------------------------------
     主页 / 战斗页
     ---------------------------------------------------------- */

  function bestWave() {
    try { return Number(window.localStorage.getItem('wordtower-best-wave')) || 0; } catch (err) { return 0; }
  }

  function saveBestWave() {
    try {
      if (G.wave > bestWave()) window.localStorage.setItem('wordtower-best-wave', String(G.wave));
    } catch (err) { /* 无痕模式 */ }
  }

  function renderHomeBest() {
    const v = bestWave();
    homeBest.textContent = v ? `最高到过第 ${v} 波` : '还没打过 · 试试能撑多久';
  }

  function renderGradeButtons() {
    const btns = document.querySelectorAll('.grade-btn');
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].dataset.grade === G.gradeRange.key);
    }
  }

  function setGrade(key) {
    if (G.state === 'playing') return;   // 战斗中不能改难度
    const found = GRADE_RANGES.find((r) => r.key === key);
    if (!found) return;
    G.gradeRange = found;
    try { window.localStorage.setItem('wordtower-grade-range', found.key); } catch (err) { /* 同上 */ }
    renderGradeButtons();
  }

  function showHome() {
    G.state = 'home';
    G.paused = false;
    battleEl.hidden = true;
    homeEl.hidden = false;
    overEl.hidden = true;
    cardsEl.hidden = true;
    pauseBtn.classList.remove('paused');
    renderGradeButtons();
    renderHomeBest();
  }

  function startBattle() {
    homeEl.hidden = true;
    battleEl.hidden = false;
    overEl.hidden = true;
    resize();
    reset();
  }

  function exitBattle() {
    showHome();
  }

  function frame(now) {
    if (!last) last = now;
    if (G.state === 'home') { last = now; requestAnimationFrame(frame); return; }
    let dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    dt *= speed;

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

    // 选卡面板的对错停留（暂停中也要走，按真实时间）
    if (G.cards.hold > 0) {
      G.cards.hold -= dt / speed;
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
  speedEl.addEventListener('click', cycleSpeed);
  puzzleNext.addEventListener('click', () => closeCards());
  document.getElementById('again').addEventListener('click', reset);
  exitBtn.addEventListener('click', exitBattle);
  overHome.addEventListener('click', exitBattle);
  startBtn.addEventListener('click', startBattle);
  gradeRow.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('.grade-btn') : null;
    if (b) setGrade(b.dataset.grade);
  });

  window.addEventListener('keydown', (e) => {
    if (G.state !== 'playing') return;
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      setPaused(!G.paused);
    }
    if (e.key === 'f' || e.key === 'F') cycleSpeed();
  });

  /* ----------------------------------------------------------
     启动
     ---------------------------------------------------------- */

  resize();
  showHome();
  applySpeed();
  if (QS.has('debug')) {
    window.__g = G;
    window.__api = {
      openCards,
      pickCard,
      answerLetter,
      closeCards,
      reset,
      startBattle,
      exitBattle,
      setGrade,
      bestWave,
      goal: () => ({
        wave: G.wave,
        level: G.level,
        exp: G.exp,
        hp: G.hp,
        pending: G.pendingLevels,
        open: G.cards.open,
        picked: G.cards.picked,
        gradeMax: G.gradeRange.key,
        options: G.cards.options.map((o) => ({
          word: o.word, correct: o.correct, dead: o.dead,
          letters: o.letters.slice(),
          grade: o.grade.key, mul: o.mul,
          wordGrade: o.wordGrade,
        })),
        state: G.state,
      }),
    };
  }
  requestAnimationFrame(frame);
})();
