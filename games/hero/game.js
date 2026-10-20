/* ============================================================
   豆豆勇者 · 竖屏横版动作（枫之谷战斗味道的单机切片）
   ------------------------------------------------------------
   核心循环：拖屏左右跑 → 跳上平台 → 三段连击 / 旋风斩 → 割草
             → 升级变强 → 蘑菇王 → 结算
   手感三件套：前摇后摇、命中停顿、受击无敌帧
   ============================================================ */

(() => {
  'use strict';

  /* ----------------------------------------------------------
     常量
     ---------------------------------------------------------- */

  const W = 1280;
  const H = 720;
  const GROUND_Y = 600;
  const WORLD_W = 3200;          // 背景素材的铺开宽度（森林）

  /* 两张图：0 = 蘑菇森林（割草），1 = 蘑菇王巢穴（单挑） */
  const STAGE_W = [3200, 1500];

  const GRAV = 2100;
  const MOVE_SPEED = 470;
  const ACCEL = 5400;
  const AIR_ACCEL = 3500;
  const FRICTION = 4200;
  const JUMP_V = 950;
  const JUMP2_V = 820;

  const ATTACK_DUR = [0.26, 0.28, 0.36];
  const ATTACK_MUL = [1, 1.18, 1.8];
  const ATTACK_REACH = [150, 158, 196];

  const SKILL_CD = 8;
  const SKILL_TIME = 0.72;

  const TOTAL_KILLS = 20;      // 杀够这么多小怪，森林尽头出现传送门
  const MAX_ALIVE = 7;

  const CAM_LERP = 9;
  const PORTAL_X = 3040;

  /* 平台：x 左边缘，y 顶面，w 宽 */
  const PLATFORMS_FOREST = [
    { x: 240, y: 430, w: 280 },
    { x: 620, y: 260, w: 280 },
    { x: 1000, y: 430, w: 260 },
    { x: 1340, y: 260, w: 280 },
    { x: 1700, y: 430, w: 280 },
    { x: 2060, y: 260, w: 280 },
    { x: 2420, y: 430, w: 260 },
    { x: 2760, y: 260, w: 260 },
  ];

  /* 巢穴：小一点、空一点，留出躲招的空间；右侧不挡 BOSS */
  const PLATFORMS_LAIR = [
    { x: 200, y: 430, w: 220 },
    { x: 660, y: 300, w: 200 },
  ];

  const STAGE_PLATFORMS = [PLATFORMS_FOREST, PLATFORMS_LAIR];

  const ENEMY = {
    shroom: { w: 70, h: 76, hp: 60, speed: 66, dmg: 16, exp: 16, gold: [2, 5] },
    ghost:  { w: 64, h: 72, hp: 46, speed: 92, dmg: 20, exp: 14, gold: [3, 7] },
    stump:  { w: 78, h: 94, hp: 110, speed: 0, dmg: 14, exp: 22, gold: [4, 9] },
  };

  const BOSS = {
    w: 200, h: 210, hp: 2200, dmg: 30, exp: 260,
  };

  /* ----------------------------------------------------------
     工具
     ---------------------------------------------------------- */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const sign = (v) => (v < 0 ? -1 : 1);
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  function rr(c, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad);
    c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad);
    c.arcTo(x, y, x + w, y, rad);
    c.closePath();
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function fmt(n) {
    n = Math.max(0, Math.round(n));
    if (n < 10000) return String(n);
    if (n < 1e8) return `${(n / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
    return `${(n / 1e8).toFixed(2).replace(/\.00$/, '')}亿`;
  }

  /* ----------------------------------------------------------
     声音（WebAudio 合成，不引外部资源）
     ---------------------------------------------------------- */

  let AC = null;
  function ac() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { AC = null; }
    }
    if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  }

  function tone(freq, dur, type = 'square', vol = 0.05, slide = 0, delay = 0) {
    const a = ac();
    if (!a) return;
    try {
      const t0 = a.currentTime + delay;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch { /* 忽略音频错误 */ }
  }

  const SFX = {
    swing: () => tone(200, 0.07, 'sawtooth', 0.035, -120),
    hit: () => tone(150, 0.05, 'square', 0.045, -60),
    crit: () => tone(520, 0.09, 'square', 0.05, -180),
    jump: () => tone(330, 0.1, 'sine', 0.045, 220),
    hurt: () => tone(140, 0.16, 'sawtooth', 0.055, -70),
    level: () => { tone(523, 0.1, 'triangle', 0.06); tone(659, 0.1, 'triangle', 0.06, 0, 0.09); tone(784, 0.16, 'triangle', 0.06, 0, 0.18); },
    skill: () => tone(220, 0.35, 'sawtooth', 0.045, 620),
    boss: () => { tone(70, 0.4, 'sawtooth', 0.08, -20); tone(120, 0.3, 'square', 0.05, 0, 0.12); },
    die: () => tone(300, 0.5, 'sawtooth', 0.07, -240),
  };

  /* ----------------------------------------------------------
     状态
     ---------------------------------------------------------- */

  const G = {
    state: 'play',        // play | win | lose
    paused: false,
    stage: 0,             // 0 森林 | 1 巢穴
    worldW: STAGE_W[0],
    platforms: STAGE_PLATFORMS[0],
    time: 0,
    camX: 0,
    shake: 0,
    hitstop: 0,
    kills: 0,
    toSpawn: TOTAL_KILLS,
    spawnT: 1.2,
    boss: null,
    bossSpawned: false,
    bossDelay: 0,
    portal: null,
    fade: 0,
    fadeDir: 0,
    pendingStage: -1,
    enemies: [],
    projectiles: [],
    orbs: [],
    texts: [],
    particles: [],
    player: null,
    skillTick: 0,
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const el = {
    lv: document.getElementById('lv'),
    hpFill: document.getElementById('hpFill'),
    hpText: document.getElementById('hpText'),
    expFill: document.getElementById('expFill'),
    gold: document.getElementById('gold'),
    bossbar: document.getElementById('bossbar'),
    bossName: document.getElementById('bossName'),
    bossHp: document.getElementById('bossHp'),
    bossFill: document.getElementById('bossFill'),
    stageName: document.getElementById('stageName'),
    hint: document.getElementById('hint'),
    pause: document.getElementById('pause'),
    pauseVeil: document.getElementById('pauseVeil'),
    over: document.getElementById('over'),
    overK: document.getElementById('overK'),
    overTitle: document.getElementById('overTitle'),
    overSub: document.getElementById('overSub'),
    skillCd: document.getElementById('skillCd'),
    btnAtk: document.getElementById('btnAtk'),
    btnJump: document.getElementById('btnJump'),
    btnSkill: document.getElementById('btnSkill'),
  };

  /* ----------------------------------------------------------
     重置
     ---------------------------------------------------------- */

  function reset() {
    G.state = 'play';
    G.paused = false;
    G.stage = 0;
    G.worldW = STAGE_W[0];
    G.platforms = STAGE_PLATFORMS[0];
    G.time = 0;
    G.camX = 0;
    G.shake = 0;
    G.hitstop = 0;
    G.kills = 0;
    G.toSpawn = TOTAL_KILLS;
    G.spawnT = 1.4;
    G.boss = null;
    G.bossSpawned = false;
    G.bossDelay = 0;
    G.portal = null;
    G.fade = 0;
    G.fadeDir = 0;
    G.pendingStage = -1;
    G.enemies = [];
    G.projectiles = [];
    G.orbs = [];
    G.texts = [];
    G.particles = [];
    G.skillTick = 0;
    G.player = {
      x: 340, y: GROUND_Y,
      vx: 0, vy: 0,
      w: 60, h: 120,
      dir: 1,
      onGround: true,
      jumps: 0,
      coyote: 0,
      hp: 400, maxHp: 400,
      atk: 28,
      level: 1, exp: 0, expNeed: 55,
      attackT: 0, attackDur: 1, attackStep: 0, hitDone: true,
      comboT: 0, combo: 0,
      invuln: 0, hurtT: 0,
      skillT: 0, skillCd: 0, skillTick: 0,
      gold: 0,
      dead: false,
      anim: 0,
    };
    el.over.hidden = true;
    el.pauseVeil.hidden = true;
    el.bossbar.hidden = true;
    el.stageName.textContent = '豆豆勇者 · 蘑菇森林';
    el.hint.classList.remove('gone');
    el.pause.classList.remove('paused');
    setHint('拖动屏幕左右跑 · 跳上平台 · 砍光蘑菇', 4.5);
    hideSkillCd();
    last = 0;
    syncHUD(true);
  }

  /* ----------------------------------------------------------
     提示
     ---------------------------------------------------------- */

  let hintT = 0;
  function setHint(txt, sec) {
    el.hint.textContent = txt;
    el.hint.classList.remove('gone');
    hintT = sec || 3;
  }

  /* ----------------------------------------------------------
     玩家动作
     ---------------------------------------------------------- */

  function attack() {
    const p = G.player;
    if (G.state !== 'play' || G.paused || p.dead) return;
    if (p.attackT > 0.05) return;
    if (p.skillT > 0) return;

    let step = 0;
    if (p.comboT > 0 && p.attackT <= 0) step = (p.combo + 1) % 3;
    p.combo = step;
    p.comboT = 0.62;
    p.attackT = ATTACK_DUR[step];
    p.attackDur = ATTACK_DUR[step];
    p.hitDone = false;
    p.attackStep = step;
    if (p.onGround) p.vx *= 0.35;
    SFX.swing();
  }

  function jump() {
    const p = G.player;
    if (G.state !== 'play' || G.paused || p.dead) return;
    if (p.onGround || p.coyote > 0) {
      p.vy = -JUMP_V;
      p.onGround = false;
      p.coyote = 0;
      p.jumps = 1;
      SFX.jump();
      puff(p.x, p.y, 6, '#9fd8ff');
    } else if (p.jumps < 2) {
      p.vy = -JUMP2_V;
      p.jumps = 2;
      SFX.jump();
      puff(p.x, p.y - 10, 9, '#c9b3ff');
    }
  }

  function castSkill() {
    const p = G.player;
    if (G.state !== 'play' || G.paused || p.dead) return;
    if (p.skillCd > 0 || p.skillT > 0) return;
    p.skillT = SKILL_TIME;
    p.skillCd = SKILL_CD;
    p.skillTick = 0;
    p.attackT = 0;
    if (window.__castLog) window.__castLog.push(Math.round(performance.now()));
    SFX.skill();
    G.shake = Math.max(G.shake, 5);
  }

  /* ----------------------------------------------------------
     伤害
     ---------------------------------------------------------- */

  function addText(x, y, txt, color, size) {
    // AOE 连续命中时，把附近同色数字并起来，别刷屏
    if (/^\d+$/.test(txt)) {
      for (const t of G.texts) {
        if (t.color === color && t.life > 0.15 &&
            Math.abs(t.x - x) < 100 && Math.abs(t.y - y) < 100 &&
            /^\d+$/.test(t.txt)) {
          t.txt = String(Number(t.txt) + Number(txt));
          t.life = Math.min(0.9, t.life + 0.12);
          return;
        }
      }
    }

    if (G.texts.length > 34) G.texts.shift();
    G.texts.push({
      x: x + rand(-30, 30),
      y: y + rand(-22, 12),
      vy: rand(-96, -66), life: 0.68, max: 0.68,
      txt, color, size: size || 25,
      drift: rand(-26, 26),
    });
  }

  function puff(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      if (G.particles.length > 140) G.particles.shift();
      G.particles.push({
        x, y,
        vx: rand(-160, 160), vy: rand(-220, 40),
        life: rand(0.25, 0.55), max: 0.55,
        size: rand(3, 8), color,
      });
    }
  }

  function hurtEnemy(e, dmg, crit, fromX) {
    e.hp -= dmg;
    e.hitT = 0.14;
    e.stun = 0.16;
    const dir = e.x < fromX ? -1 : 1;
    e.vx += dir * (crit ? 320 : 210);
    e.vy = Math.min(e.vy, -150);
    G.hitstop = Math.max(G.hitstop, crit ? 0.07 : 0.035);
    G.shake = Math.max(G.shake, crit ? 6 : 3);
    addText(e.x + rand(-12, 12), e.y - e.h * 0.85, fmt(dmg), crit ? '#ffd166' : '#ffffff', crit ? 33 : 25);
    puff(e.x, e.y - e.h * 0.55, crit ? 9 : 5, crit ? '#ffd166' : '#ffb3a0');
    crit ? SFX.crit() : SFX.hit();
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    e.deadT = 0.42;
    G.kills++;
    gainExp(e.exp);
    const gold = randi(e.gold[0], e.gold[1]);
    const n = Math.min(3, 1 + Math.floor(gold / 4));
    for (let i = 0; i < n; i++) {
      dropOrb(e.x + rand(-24, 24), e.y - e.h * 0.6, 'gold', Math.max(1, Math.round(gold / n)));
    }
    if (Math.random() < 0.1) dropOrb(e.x, e.y - e.h * 0.6, 'heart', 0);
    puff(e.x, e.y - e.h * 0.5, 14, e.type === 'ghost' ? '#b8c6ff' : '#ff8a6e');
    G.shake = Math.max(G.shake, 5);

    if (G.kills >= TOTAL_KILLS && !G.bossSpawned) {
      G.bossDelay = 1.6;
    }
  }

  function hurtPlayer(dmg, fromX) {
    const p = G.player;
    if (p.invuln > 0 || p.dead || G.state !== 'play') return;
    p.hp -= dmg;
    p.invuln = 0.95;
    p.hurtT = 0.3;
    const dir = p.x < fromX ? -1 : 1;
    p.vx = dir * 300;
    p.vy = -240;
    p.onGround = false;
    G.shake = Math.max(G.shake, 9);
    G.hitstop = Math.max(G.hitstop, 0.06);
    addText(p.x, p.y - p.h - 6, `-${dmg}`, '#ff7a6b', 30);
    puff(p.x, p.y - p.h * 0.6, 8, '#ff7a6b');
    SFX.hurt();
    if (p.hp <= 0) { p.hp = 0; lose(); }
  }

  function dropOrb(x, y, kind, value) {
    G.orbs.push({
      x, y, kind, value,
      vx: rand(-120, 120), vy: rand(-330, -160),
      life: 14, bob: rand(0, 6.28),
    });
  }

  function gainExp(n) {
    const p = G.player;
    p.exp += n;
    while (p.exp >= p.expNeed) {
      p.exp -= p.expNeed;
      p.level++;
      p.expNeed = Math.round(55 * Math.pow(1.34, p.level - 1));
      p.maxHp += 22;
      p.hp = Math.min(p.maxHp, p.hp + 90);
      p.atk += 3;
      addText(p.x, p.y - p.h - 118, `LEVEL UP!`, '#ffd166', 36);
      addText(p.x, p.y - p.h - 80, `Lv.${p.level}  攻击 +3`, '#ffe9a8', 26);
      puff(p.x, p.y - p.h * 0.5, 22, '#ffd166');
      SFX.level();
    }
  }

  /* ----------------------------------------------------------
     结算
     ---------------------------------------------------------- */

  function win() {
    if (G.state !== 'play') return;
    G.state = 'win';
    el.overK.textContent = '通关';
    el.overTitle.textContent = '蘑菇王倒下了';
    el.overSub.innerHTML = `击杀 ${G.kills} 只 · 等级 Lv.${G.player.level} · 金币 ${fmt(G.player.gold)}<br>森林暂时安静了。`;
    el.over.hidden = false;
  }

  function lose() {
    if (G.state !== 'play') return;
    G.state = 'lose';
    G.player.dead = true;
    el.overK.textContent = '倒下';
    el.overTitle.textContent = '豆豆勇者被抬回去了';
    el.overSub.innerHTML = `击杀 ${G.kills} 只 · 等级 Lv.${G.player.level} · 金币 ${fmt(G.player.gold)}<br>下次记得先跳起来再砍。`;
    el.over.hidden = false;
    SFX.die();
  }

  /* ----------------------------------------------------------
     物理
     ---------------------------------------------------------- */

  function moveBody(b, dt, dropThrough) {
    const prevFeet = b.y;

    b.x += b.vx * dt;
    b.x = clamp(b.x, 30, G.worldW - 30);

    b.vy += GRAV * dt;
    if (b.vy > 1500) b.vy = 1500;
    b.y += b.vy * dt;

    b.onGround = false;

    if (b.y >= GROUND_Y) {
      b.y = GROUND_Y;
      b.vy = 0;
      b.onGround = true;
    } else if (b.vy > 0 && !dropThrough) {
      for (const pl of G.platforms) {
        if (prevFeet <= pl.y + 2 && b.y >= pl.y &&
            b.x + b.w * 0.34 > pl.x && b.x - b.w * 0.34 < pl.x + pl.w) {
          b.y = pl.y;
          b.vy = 0;
          b.onGround = true;
          break;
        }
      }
    }
  }

  /* ----------------------------------------------------------
     生成
     ---------------------------------------------------------- */

  function spawnPoint(type) {
    const p = G.player;
    let baseX;

    if (Math.random() < 0.72) {
      baseX = p.x + rand(540, 860);
      if (baseX > G.worldW - 80) baseX = p.x - rand(540, 860);
    } else {
      baseX = p.x - rand(540, 860);
      if (baseX < 80) baseX = p.x + rand(540, 860);
    }
    baseX = clamp(baseX, 80, G.worldW - 80);

    if (type === 'ghost') {
      return { x: baseX, y: p.y - rand(240, 430) };
    }

    if (type === 'stump' && Math.random() < 0.5) {
      const pl = G.platforms[randi(0, G.platforms.length - 1)];
      if (Math.abs(pl.x + pl.w / 2 - p.x) > 260) {
        return { x: pl.x + pl.w / 2, y: pl.y };
      }
    }

    return { x: baseX, y: GROUND_Y };
  }

  function spawnEnemy(type) {
    const d = ENEMY[type];
    const pt = spawnPoint(type);
    const e = {
      type,
      x: pt.x, y: pt.y,
      w: d.w, h: d.h,
      vx: 0, vy: 0,
      dir: -1,
      hp: d.hp, maxHp: d.hp,
      onGround: type !== 'ghost',
      speed: d.speed,
      dmg: d.dmg,
      exp: d.exp,
      gold: d.gold,
      stun: 0,
      hitT: 0,
      touchCd: 0,
      shootT: rand(1.4, 2.6),
      dead: false,
      deadT: 0,
      bob: rand(0, 6.28),
      homeY: pt.y,
    };
    G.enemies.push(e);
    return e;
  }

  function spawnWave(dt) {
    if (G.stage !== 0) return;
    if (G.kills >= TOTAL_KILLS) return;
    const alive = G.enemies.filter((e) => !e.dead).length;
    if (alive >= MAX_ALIVE) return;

    G.spawnT -= dt;
    if (G.spawnT > 0) return;
    G.spawnT = rand(1.3, 2.2);

    const r = Math.random();
    let type = 'shroom';
    if (r < 0.28) type = 'ghost';
    else if (r < 0.46) type = 'stump';
    spawnEnemy(type);
    if (Math.random() < 0.3 && G.enemies.length < MAX_ALIVE + 2) {
      spawnEnemy(Math.random() < 0.5 ? 'shroom' : 'ghost');
    }
  }

  /* ----------------------------------------------------------
     两张图之间的切换
     ---------------------------------------------------------- */

  function startTransition(stage) {
    if (G.fadeDir !== 0) return;
    G.pendingStage = stage;
    G.fadeDir = 1;
    G.portal = null;
    SFX.skill();
  }

  function enterStage(n) {
    G.stage = n;
    G.worldW = STAGE_W[n];
    G.platforms = STAGE_PLATFORMS[n];
    G.enemies = [];
    G.projectiles = [];
    G.orbs = [];
    G.texts = [];
    G.particles = [];
    G.boss = null;
    G.bossSpawned = false;
    G.bossDelay = 0;
    G.portal = null;
    G.spawnT = 1.6;

    const p = G.player;
    p.x = n === 0 ? 340 : 180;
    p.y = GROUND_Y;
    p.vx = 0;
    p.vy = 0;
    p.invuln = 1.4;
    p.attackT = 0;
    p.skillT = 0;
    G.camX = clamp(p.x - W / 2, 0, Math.max(0, G.worldW - W));

    el.bossbar.hidden = true;
    el.stageName.textContent = n === 1 ? '豆豆勇者 · 蘑菇王巢穴' : '豆豆勇者 · 蘑菇森林';

    if (n === 1) {
      spawnBoss();
      setHint('蘑菇王巢穴：跳起来躲开落地冲击波', 4.5);
    } else {
      setHint('回到蘑菇森林', 3);
    }
    G.shake = 6;
  }

  /* ----------------------------------------------------------
     BOSS
     ---------------------------------------------------------- */

  function spawnBoss() {
    const p = G.player;
    let x = G.stage === 1 ? 820 : p.x + 520;
    if (G.stage === 0 && x > G.worldW - 220) x = p.x - 520;
    x = clamp(x, 240, G.worldW - 240);

    G.boss = {
      x, y: GROUND_Y,
      w: BOSS.w, h: BOSS.h,
      vx: 0, vy: 0,
      dir: -1,
      hp: BOSS.hp, maxHp: BOSS.hp,
      onGround: true,
      mode: 'idle',
      modeT: 1.1,
      hitT: 0,
      touchCd: 0,
      air: false,
      phase: 1,
      dead: false,
      deadT: 0,
      anim: 0,
    };
    G.bossSpawned = true;
    el.bossbar.hidden = false;
    el.bossName.textContent = '蘑菇王';
    setHint('蘑菇王来了：跳起来躲开落地冲击波！', 4);
    SFX.boss();
    G.shake = 10;
  }

  function bossPickAttack() {
    const b = G.boss;
    const p = G.player;
    const r = Math.random();
    if (r < 0.38) {
      b.mode = 'charge';
      b.modeT = 0.85;
      b.dir = p.x < b.x ? -1 : 1;
    } else if (r < 0.72) {
      b.mode = 'slam';
      b.modeT = 0.2;
      b.air = true;
      b.vy = -1180;
      b.vx = clamp((p.x - b.x) * 1.6, -320, 320);
      b.onGround = false;
    } else {
      b.mode = 'summon';
      b.modeT = 0.9;
    }
    b.phase = b.hp < b.maxHp * 0.45 ? 2 : 1;
  }

  function bossShockwaves() {
    const b = G.boss;
    for (const d of [-1, 1]) {
      G.projectiles.push({
        kind: 'wave', x: b.x + d * 40, y: GROUND_Y,
        vx: d * 420, vy: 0, w: 90, h: 64,
        dmg: 26, life: 2.4, hit: false, dead: false,
      });
    }
    G.shake = 14;
    puff(b.x, GROUND_Y - 10, 22, '#ffb36b');
    SFX.hurt();
  }

  function updateBoss(dt) {
    const b = G.boss;
    const p = G.player;
    if (!b || b.dead) {
      if (b && b.dead) {
        b.deadT -= dt;
        b.anim += dt;
        if (b.deadT <= 0 && G.state === 'play') win();
      }
      return;
    }

    b.anim += dt;
    b.hitT = Math.max(0, b.hitT - dt);
    b.touchCd = Math.max(0, b.touchCd - dt);

    if (b.mode === 'idle') {
      b.vx *= 0.86;
      b.dir = p.x < b.x ? -1 : 1;
      b.modeT -= dt;
      if (b.modeT <= 0) bossPickAttack();
    } else if (b.mode === 'charge') {
      b.vx = b.dir * (b.phase === 2 ? 500 : 400);
      b.modeT -= dt;
      if (b.modeT <= 0 || b.x <= 60 || b.x >= G.worldW - 60) {
        b.mode = 'idle';
        b.modeT = b.phase === 2 ? 0.55 : 0.9;
        b.vx = 0;
      }
    } else if (b.mode === 'slam') {
      b.modeT -= dt;
      if (b.air && b.onGround) {
        b.air = false;
        bossShockwaves();
        b.mode = 'idle';
        b.modeT = b.phase === 2 ? 0.5 : 0.85;
        b.vx = 0;
      }
    } else if (b.mode === 'summon') {
      b.vx *= 0.8;
      b.modeT -= dt;
      if (b.modeT <= 0) {
        for (let i = 0; i < 3; i++) {
          const e = spawnEnemy('shroom');
          e.x = clamp(b.x + rand(-180, 180), 60, G.worldW - 60);
          e.y = GROUND_Y;
          e.hp *= 0.6;
          e.maxHp = e.hp;
        }
        b.mode = 'idle';
        b.modeT = 1.0;
      }
    }

    // BOSS 只认地面，跳砸会穿过浮空平台落回地面
    moveBody(b, dt, true);

    // 接触伤害
    if (b.touchCd <= 0) {
      const hb = { x: b.x - b.w / 2 + 16, y: b.y - b.h + 20, w: b.w - 32, h: b.h - 20 };
      const pb = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
      if (overlap(hb, pb)) {
        hurtPlayer(BOSS.dmg, b.x);
        b.touchCd = 0.7;
      }
    }

    // 软推挤：别让玩家站进蘑菇王的身体里
    if (!b.dead && !p.dead) {
      const minDist = b.w / 2 + 18;
      const dx = p.x - b.x;
      if (Math.abs(dx) < minDist && p.y > b.y - b.h + 30) {
        const dir = dx < 0 ? -1 : 1;
        p.x = b.x + dir * minDist;
        p.vx = dir * 140;
      }
    }

    if (b.hp <= 0 && !b.dead) {
      b.dead = true;
      b.deadT = 1.4;
      b.mode = 'dead';
      G.shake = 18;
      G.hitstop = 0.18;
      el.bossbar.hidden = true;
      puff(b.x, b.y - b.h * 0.5, 40, '#ffd166');
      SFX.boss();
      gainExp(BOSS.exp);
      for (let i = 0; i < 12; i++) dropOrb(b.x + rand(-80, 80), b.y - rand(30, 140), 'gold', 6);
    }
  }

  /* ----------------------------------------------------------
     主更新
     ---------------------------------------------------------- */

  function update(rawDt) {
    if (G.paused || G.state !== 'play') {
      updateFx(rawDt);
      return;
    }

    let dt = rawDt;
    if (G.hitstop > 0) {
      G.hitstop -= rawDt;
      dt *= 0.16;
    }

    // 切图黑幕：全黑时换地图，再淡入
    if (G.fadeDir !== 0) {
      G.fade += G.fadeDir * rawDt * 2.4;
      if (G.fade >= 1) {
        G.fade = 1;
        G.fadeDir = -1;
        enterStage(G.pendingStage);
      } else if (G.fade <= 0) {
        G.fade = 0;
        G.fadeDir = 0;
      }
      updateFx(rawDt);
      return;
    }

    G.time += dt;
    const p = G.player;

    /* --- 输入 → 水平速度 --- */
    let want = 0;
    if (keys.left) want -= 1;
    if (keys.right) want += 1;
    if (pointer.active && !pointer.usedByButton) {
      const dx = pointer.x - (p.x - G.camX);
      if (dx < -26) want = -1;
      else if (dx > 26) want = 1;
      else want = 0;
    }

    if (want) {
      const acc = p.onGround ? ACCEL : AIR_ACCEL;
      p.vx += want * acc * dt;
      const cap = p.skillT > 0 ? MOVE_SPEED * 0.62 : MOVE_SPEED;
      p.vx = clamp(p.vx, -cap, cap);
      p.dir = want;
    } else {
      const fr = FRICTION * dt;
      if (Math.abs(p.vx) <= fr) p.vx = 0;
      else p.vx -= sign(p.vx) * fr;
    }
    if (p.attackT > 0 && p.onGround && p.skillT <= 0) p.vx *= 0.82;

    /* --- 动作计时 --- */
    p.comboT = Math.max(0, p.comboT - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.coyote = Math.max(0, p.coyote - dt);

    if (p.attackT > 0) {
      p.attackT -= dt;
      const prog = 1 - Math.max(0, p.attackT) / p.attackDur;
      if (!p.hitDone && prog >= 0.28) {
        p.hitDone = true;
        doAttackHit(p.attackStep);
      }
      if (p.attackT < 0) p.attackT = 0;
    }

    if (p.skillT > 0) {
      p.skillT -= dt;
      p.skillTick -= dt;
      if (p.skillTick <= 0) {
        p.skillTick = 0.13;
        doSkillHit();
      }
      if (p.skillT < 0) p.skillT = 0;
    }

    /* --- 玩家物理 --- */
    moveBody(p, dt, false);

    if (p.onGround) {
      p.jumps = 0;
      p.coyote = 0.1;
    }

    p.anim += dt * (2 + Math.abs(p.vx) / 90);

    /* --- 掉坑？没有坑，只有地面 --- */

    /* --- 相机 --- */
    const targetCam = clamp(p.x - W / 2, 0, G.worldW - W);
    G.camX = lerp(G.camX, targetCam, Math.min(1, CAM_LERP * dt));

    /* --- 生成 --- */
    spawnWave(dt);

    // 杀满之后：森林尽头开一道传送门
    if (G.stage === 0 && !G.portal && !G.bossSpawned && G.kills >= TOTAL_KILLS) {
      G.portal = { x: PORTAL_X, y: GROUND_Y, t: 0 };
      setHint('森林尽头出现了传送门 → 去蘑菇王巢穴', 5);
      addText(PORTAL_X, GROUND_Y - 150, '传送门', '#c9a3ff', 30);
    }
    if (G.portal) {
      G.portal.t += dt;
      if (Math.abs(p.x - G.portal.x) < 74 && Math.abs(p.y - G.portal.y) < 130) {
        startTransition(1);
      }
    }

    if (G.bossDelay > 0) {
      G.bossDelay -= dt;
      if (G.bossDelay <= 0 && !G.bossSpawned) spawnBoss();
    }

    updateEnemies(dt);
    updateProjectiles(dt);
    updateBoss(dt);
    updateOrbs(dt);
    updateFx(dt);

    G.shake = Math.max(0, G.shake - dt * 42);
    if (hintT > 0) {
      hintT -= dt;
      if (hintT <= 0) el.hint.classList.add('gone');
    }
  }

  /* --- 玩家攻击判定 --- */

  function doAttackHit(step) {
    const p = G.player;
    const reach = ATTACK_REACH[step];
    const rect = {
      x: p.dir > 0 ? p.x + 6 : p.x - 6 - reach,
      y: p.y - p.h - 16,
      w: reach,
      h: p.h + 34,
    };
    hitArea(rect, ATTACK_MUL[step]);

    // 空中下劈额外再判一次脚下方
    if (!p.onGround) {
      hitArea({ x: p.x - 70, y: p.y - 60, w: 140, h: 110 }, 0.9);
    }
  }

  function doSkillHit() {
    const p = G.player;
    const cx = p.x;
    const cy = p.y - p.h * 0.55;
    const r = 158;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const ex = e.x;
      const ey = e.y - e.h * 0.5;
      if ((ex - cx) ** 2 + (ey - cy) ** 2 < (r + e.w * 0.4) ** 2) {
        hurtEnemy(e, Math.round(p.atk * 1.05), false, p.x);
      }
    }
    const b = G.boss;
    if (b && !b.dead) {
      const bx = b.x;
      const by = b.y - b.h * 0.5;
      if ((bx - cx) ** 2 + (by - cy) ** 2 < (r + 100) ** 2) {
        damageBoss(Math.round(p.atk * 1.05), false);
      }
    }
    puff(cx + rand(-60, 60), cy + rand(-30, 30), 2, '#c9a3ff');
  }

  function hitArea(rect, mul) {
    const p = G.player;
    let hitAny = false;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const eb = { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
      if (overlap(rect, eb)) {
        const crit = Math.random() < 0.12;
        let dmg = p.atk * mul * rand(0.92, 1.08);
        if (crit) dmg *= 1.8;
        hurtEnemy(e, Math.round(dmg), crit, p.x);
        hitAny = true;
      }
    }
    const b = G.boss;
    if (b && !b.dead) {
      const bb = { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h };
      if (overlap(rect, bb)) {
        const crit = Math.random() < 0.12;
        let dmg = p.atk * mul * rand(0.92, 1.08);
        if (crit) dmg *= 1.8;
        damageBoss(Math.round(dmg), crit);
        hitAny = true;
      }
    }
    return hitAny;
  }

  function damageBoss(dmg, crit) {
    const b = G.boss;
    if (!b || b.dead) return;
    b.hp -= dmg;
    b.hitT = 0.12;
    G.hitstop = Math.max(G.hitstop, crit ? 0.07 : 0.03);
    G.shake = Math.max(G.shake, crit ? 7 : 3);
    addText(b.x + rand(-30, 30), b.y - b.h - 10, fmt(dmg), crit ? '#ffd166' : '#ffffff', crit ? 38 : 28);
    puff(b.x + rand(-40, 40), b.y - b.h * 0.55, crit ? 8 : 4, '#ffb3a0');
    crit ? SFX.crit() : SFX.hit();
  }

  /* --- 小怪 --- */

  function updateEnemies(dt) {
    const p = G.player;

    for (const e of G.enemies) {
      if (e.dead) {
        e.deadT -= dt;
        continue;
      }
      e.hitT = Math.max(0, e.hitT - dt);
      e.stun = Math.max(0, e.stun - dt);
      e.touchCd = Math.max(0, e.touchCd - dt);
      e.bob += dt * 3;

      if (e.type === 'ghost') {
        if (e.stun <= 0) {
          const dx = p.x - e.x;
          const dy = (p.y - p.h * 0.5) - (e.y - e.h * 0.5);
          const d = Math.hypot(dx, dy) || 1;
          e.vx = (dx / d) * e.speed;
          e.vy = (dy / d) * e.speed * 0.85;
        } else {
          e.vx *= 0.92;
          e.vy *= 0.92;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.y = clamp(e.y, 200, GROUND_Y);
        e.x = clamp(e.x, 40, G.worldW - 40);
        e.dir = e.vx < 0 ? -1 : 1;
      } else if (e.type === 'stump') {
        e.vx *= 0.9;
        moveBody(e, dt, false);
        e.dir = p.x < e.x ? -1 : 1;
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = rand(2.2, 3.2);
          const sx = e.x;
          const sy = e.y - e.h * 0.62;
          const dx = p.x - sx;
          const dy = (p.y - p.h * 0.5) - sy;
          const d = Math.hypot(dx, dy) || 1;
          G.projectiles.push({
            kind: 'seed', x: sx, y: sy,
            vx: (dx / d) * 310, vy: (dy / d) * 310,
            w: 26, h: 26, dmg: e.dmg, life: 4, hit: false, dead: false,
          });
        }
      } else {
        if (e.stun <= 0) {
          const dx = p.x - e.x;
          e.dir = dx < 0 ? -1 : 1;
          if (Math.abs(dx) > 26) e.vx = e.dir * e.speed;
          else e.vx = 0;
        } else {
          e.vx *= 0.9;
        }
        moveBody(e, dt, false);
      }

      // 接触伤害
      if (e.touchCd <= 0) {
        const eb = { x: e.x - e.w * 0.42, y: e.y - e.h + 6, w: e.w * 0.84, h: e.h - 6 };
        const pb = { x: p.x - p.w * 0.44, y: p.y - p.h, w: p.w * 0.88, h: p.h };
        if (overlap(eb, pb)) {
          hurtPlayer(e.dmg, e.x);
          e.touchCd = 0.6;
          e.vx = (e.x < p.x ? -1 : 1) * 160;
        }
      }
    }

    G.enemies = G.enemies.filter((e) => !(e.dead && e.deadT <= 0));
  }

  /* --- 弹幕 / 冲击波 --- */

  function updateProjectiles(dt) {
    const p = G.player;
    for (const b of G.projectiles) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }

      if (b.kind === 'wave') {
        b.x += b.vx * dt;
        b.y = GROUND_Y;
        if (b.x < 20 || b.x > G.worldW - 20) { b.dead = true; continue; }
        const bb = { x: b.x - b.w / 2, y: GROUND_Y - b.h, w: b.w, h: b.h };
        const pb = { x: p.x - p.w * 0.42, y: p.y - p.h, w: p.w * 0.84, h: p.h };
        if (!b.hit && overlap(bb, pb)) {
          b.hit = true;
          b.dead = true;
          hurtPlayer(b.dmg, b.x);
        }
        if (Math.random() < 0.3) puff(b.x, GROUND_Y - 12, 1, '#ffb36b');
      } else {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const bb = { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h };
        const pb = { x: p.x - p.w * 0.42, y: p.y - p.h, w: p.w * 0.84, h: p.h };
        if (!b.hit && overlap(bb, pb)) {
          b.hit = true;
          b.dead = true;
          hurtPlayer(b.dmg, b.x);
        }
        if (b.x < 20 || b.x > G.worldW - 20 || b.y > GROUND_Y) b.dead = true;
      }
    }
    G.projectiles = G.projectiles.filter((b) => !b.dead);
  }

  /* --- 金币 / 红心 --- */

  function updateOrbs(dt) {
    const p = G.player;
    for (const o of G.orbs) {
      o.life -= dt;
      o.bob += dt * 6;

      const dx = p.x - o.x;
      const dy = (p.y - p.h * 0.55) - o.y;
      const d = Math.hypot(dx, dy);
      if (o.life < 12 && d < 190 && d > 1) {
        o.vx += (dx / d) * 2100 * dt;
        o.vy += (dy / d) * 2100 * dt;
        o.vx *= 0.94;
        o.vy *= 0.94;
      } else {
        o.vy += GRAV * 0.55 * dt;
        o.vx *= 0.99;
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;

      if (o.y > GROUND_Y - 8) {
        o.y = GROUND_Y - 8;
        o.vy *= -0.32;
        o.vx *= 0.7;
        if (Math.abs(o.vy) < 40) o.vy = 0;
      }

      if (d < 42) {
        o.life = 0;
        if (o.kind === 'gold') {
          p.gold += o.value;
        } else {
          p.hp = Math.min(p.maxHp, p.hp + 70);
          addText(o.x, o.y - 16, '+70', '#7ef2a4', 22);
          puff(o.x, o.y, 8, '#7ef2a4');
        }
      }
    }
    G.orbs = G.orbs.filter((o) => o.life > 0);
  }

  /* --- 特效 --- */

  function updateFx(dt) {
    for (const t of G.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy += 90 * dt;
      t.x += t.drift * dt;
    }
    G.texts = G.texts.filter((t) => t.life > 0);

    for (const q of G.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 900 * dt;
      q.vx *= 0.98;
    }
    G.particles = G.particles.filter((q) => q.life > 0);
  }

  /* ============================================================
     渲染
     ============================================================ */

  let sx = 1;
  let sy = 1;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    sx = canvas.width / W;
    sy = canvas.height / H;
    // CSS 里的按钮 / 字号都按逻辑像素走，这里把 1 逻辑像素换成 CSS 像素
    document.documentElement.style.setProperty('--u', String((r.width / W).toFixed(5)));
  }

  /* --- 背景素材（启动时生成一次） --- */

  const STARS = Array.from({ length: 70 }, () => ({
    x: Math.random() * W,
    y: Math.random() * 480,
    r: rand(0.7, 1.9),
    p: rand(0, 6.28),
    s: rand(1.4, 3.4),
  }));

  const TREES = Array.from({ length: 34 }, (_, i) => ({
    x: (i / 34) * WORLD_W * 1.2 + rand(-40, 40),
    h: rand(230, 400),
    w: rand(50, 86),
  }));

  const GROUND_DOTS = Array.from({ length: 300 }, () => ({
    x: Math.random() * WORLD_W,
    y: GROUND_Y + 10 + Math.random() * 100,
    r: rand(1.5, 4),
    c: Math.random() < 0.5 ? '#1d2434' : '#333d52',
  }));

  function hills(off, amp, baseY, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-40, H);
    const step = 60;
    for (let x = -40; x <= W + 60; x += step) {
      const wx = x + off;
      const y = baseY - Math.sin(wx * 0.0016) * amp - Math.sin(wx * 0.0041 + 1.7) * amp * 0.45;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 60, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawBackground() {
    const cam = G.camX;
    const lair = G.stage === 1;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (lair) {
      g.addColorStop(0, '#120612');
      g.addColorStop(0.34, '#1e0a18');
      g.addColorStop(0.62, '#2b0e1e');
      g.addColorStop(0.82, '#35122a');
      g.addColorStop(1, '#1c0a14');
    } else {
      g.addColorStop(0, '#070c1a');
      g.addColorStop(0.34, '#101c38');
      g.addColorStop(0.62, '#1b2c4c');
      g.addColorStop(0.82, '#24384f');
      g.addColorStop(1, '#1a2733');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 星星
    for (const s of STARS) {
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(G.time * s.s + s.p));
      ctx.globalAlpha = (0.35 + tw * 0.55) * (lair ? 0.55 : 1);
      ctx.fillStyle = lair ? '#ffd6e0' : '#dfe9ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 月亮（巢穴是血月）
    const mx = W * 0.78 - cam * 0.04;
    const my = lair ? 150 : 178;
    const mg = ctx.createRadialGradient(mx, my, 20, mx, my, 150);
    mg.addColorStop(0, lair ? 'rgba(255, 120, 110, 0.22)' : 'rgba(255, 240, 200, 0.30)');
    mg.addColorStop(1, lair ? 'rgba(255, 120, 110, 0)' : 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, 150, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = lair ? '#c94a4a' : '#f7ecc9';
    ctx.beginPath();
    ctx.arc(mx, my, 46, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = lair ? 'rgba(120, 30, 30, 0.5)' : 'rgba(220, 205, 165, 0.5)';
    ctx.beginPath();
    ctx.arc(mx - 14, my - 10, 9, 0, 6.28);
    ctx.arc(mx + 15, my + 7, 6, 0, 6.28);
    ctx.arc(mx + 3, my + 20, 4, 0, 6.28);
    ctx.fill();

    // 远山 + 近山
    hills(cam * 0.1, 120, 470, lair ? '#1a0a16' : '#0e1830');
    hills(cam * 0.22, 90, 540, lair ? '#25101f' : '#132039');

    // 树（视差）
    for (const t of TREES) {
      const x = t.x - cam * 0.55;
      if (x < -120 || x > W + 120) continue;
      drawTree(x, GROUND_Y - 10, t.h, t.w, lair ? '#120711' : '#0b1424');
    }

    // 地面雾
    const fg = ctx.createLinearGradient(0, GROUND_Y - 220, 0, GROUND_Y + 40);
    fg.addColorStop(0, lair ? 'rgba(40, 12, 28, 0)' : 'rgba(24, 40, 62, 0)');
    fg.addColorStop(1, lair ? 'rgba(28, 8, 20, 0.92)' : 'rgba(20, 34, 48, 0.9)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, GROUND_Y - 220, W, 260);
  }

  function drawTree(x, y, h, w, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x - w * 0.16, y - h * 0.55);
    ctx.lineTo(x - w * 0.34, y - h * 0.5);
    ctx.lineTo(x - w * 0.08, y - h * 0.86);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + w * 0.08, y - h * 0.86);
    ctx.lineTo(x + w * 0.34, y - h * 0.5);
    ctx.lineTo(x + w * 0.16, y - h * 0.55);
    ctx.lineTo(x + w / 2, y);
    ctx.closePath();
    ctx.fill();
  }

  /* --- 世界 --- */

  function drawGroundAndPlatforms() {
    const lair = G.stage === 1;
    // 地面
    ctx.fillStyle = lair ? '#241820' : '#232b3c';
    ctx.fillRect(0, GROUND_Y, G.worldW, H - GROUND_Y);
    ctx.fillStyle = lair ? '#6f2b38' : '#2f6b4f';
    ctx.fillRect(0, GROUND_Y, G.worldW, 16);
    ctx.fillStyle = lair ? '#8f3a48' : '#3f8a63';
    ctx.fillRect(0, GROUND_Y, G.worldW, 6);

    for (const d of GROUND_DOTS) {
      if (d.x > G.worldW) continue;
      ctx.fillStyle = lair ? '#2a1a24' : d.c;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, 6.28);
      ctx.fill();
    }

    // 平台
    for (const pl of G.platforms) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      rr(ctx, pl.x + 6, pl.y + 10, pl.w, 26, 10);
      ctx.fill();

      ctx.fillStyle = lair ? '#3a2430' : '#2a3548';
      rr(ctx, pl.x, pl.y, pl.w, 30, 10);
      ctx.fill();

      ctx.fillStyle = lair ? '#5c3040' : '#365a4b';
      rr(ctx, pl.x, pl.y, pl.w, 12, 8);
      ctx.fill();

      ctx.fillStyle = lair ? '#8f4a5c' : '#4f9a72';
      rr(ctx, pl.x, pl.y, pl.w, 6, 4);
      ctx.fill();
    }
  }

  /* --- 玩家 --- */

  function drawPlayer() {
    const p = G.player;
    // 只在前 0.35 秒快闪，后面保持可见，别让玩家在乱战里跟丢自己
    const flash = p.invuln > 0.6 && Math.floor(p.invuln * 26) % 2 === 0;

    // 影子
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, Math.min(p.y, GROUND_Y) + 4, 40, 10, 0, 0, 6.28);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1.16, 1.16);

    if (flash) ctx.globalAlpha = 0.62;

    // 受击压扁
    const squash = p.hurtT > 0 ? 0.9 : 1;

    ctx.save();
    ctx.scale(p.dir * (p.skillT > 0 ? 1 : 1), squash);

    const bob = p.onGround && Math.abs(p.vx) > 40
      ? Math.abs(Math.sin(p.anim * 8)) * 4
      : 0;
    const baseY = -bob;

    // 腿
    const legSwing = p.onGround ? Math.sin(p.anim * 8) * 12 : -8;
    ctx.fillStyle = '#e8eef8';
    rr(ctx, -20, baseY - 34, 15, 34, 7);
    ctx.fill();
    rr(ctx, 6, baseY - 34, 15, 34, 7);
    ctx.fill();

    // 靴子
    ctx.fillStyle = '#3f4d6b';
    rr(ctx, -22 + legSwing * 0.2, baseY - 10, 20, 14, 6);
    ctx.fill();
    rr(ctx, 2 - legSwing * 0.2, baseY - 10, 20, 14, 6);
    ctx.fill();

    // 身体（豆子）
    const bodyGrad = ctx.createLinearGradient(0, baseY - 104, 0, baseY - 26);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.55, '#eef3fb');
    bodyGrad.addColorStop(1, '#cdd8ea');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, baseY - 64, 30, 44, 0, 0, 6.28);
    ctx.fill();

    // 围巾
    ctx.fillStyle = '#e0523f';
    ctx.beginPath();
    ctx.ellipse(0, baseY - 92, 27, 11, -0.08, 0, 6.28);
    ctx.fill();
    const flap = Math.sin(G.time * 12) * 6;
    ctx.beginPath();
    ctx.moveTo(-20, baseY - 92);
    ctx.quadraticCurveTo(-44, baseY - 84 + flap, -50, baseY - 62 + flap);
    ctx.quadraticCurveTo(-36, baseY - 72, -18, baseY - 80);
    ctx.closePath();
    ctx.fill();

    // 脸
    ctx.fillStyle = '#1b2233';
    ctx.beginPath();
    ctx.arc(10, baseY - 72, 3.6, 0, 6.28);
    ctx.arc(23, baseY - 72, 3.6, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 158, 196, 0.55)';
    ctx.beginPath();
    ctx.arc(6, baseY - 62, 5, 0, 6.28);
    ctx.arc(27, baseY - 62, 5, 0, 6.28);
    ctx.fill();

    // 剑
    drawSword(p, baseY);

    ctx.restore();
    ctx.restore();
  }

  function drawSword(p, baseY) {
    let angle = -0.35;
    let hx = 18;
    let hy = baseY - 62;

    if (p.attackT > 0) {
      const prog = 1 - p.attackT / p.attackDur;
      angle = lerp(-1.35, 0.85, easeOut(clamp(prog * 1.25, 0, 1)));
      hx = 14;
      hy = baseY - 66;
    } else if (p.skillT > 0) {
      angle = G.time * 22;
      hx = 0;
      hy = baseY - 60;
    }

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);

    // 剑柄
    ctx.fillStyle = '#7a5a32';
    rr(ctx, -8, -5, 24, 10, 4);
    ctx.fill();
    ctx.fillStyle = '#d7a545';
    rr(ctx, 12, -13, 8, 26, 3);
    ctx.fill();

    // 剑身
    const bg = ctx.createLinearGradient(20, 0, 150, 0);
    bg.addColorStop(0, '#e8f2ff');
    bg.addColorStop(0.6, '#a9c6ef');
    bg.addColorStop(1, '#f4f9ff');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(20, -9);
    ctx.lineTo(120, -7);
    ctx.lineTo(146, 0);
    ctx.lineTo(120, 7);
    ctx.lineTo(20, 9);
    ctx.closePath();
    ctx.fill();

    // 挥砍残影
    if (p.attackT > 0) {
      const prog = 1 - p.attackT / p.attackDur;
      ctx.globalAlpha = Math.max(0, 0.42 - prog * 0.38);
      ctx.strokeStyle = '#e8f4ff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 110, -1.2, 1.0);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // 旋风斩光环
    if (p.skillT > 0) {
      const k = 1 - p.skillT / SKILL_TIME;
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - k * 0.4);
      ctx.strokeStyle = '#c9a3ff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, baseY - 58, 120 + k * 40, G.time * 9, G.time * 9 + 4.4);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#8a5cff';
      ctx.beginPath();
      ctx.arc(0, baseY - 58, 135, 0, 6.28);
      ctx.fill();
      ctx.restore();
    }
  }

  /* --- 怪物 --- */

  function drawEnemy(e) {
    const bob = Math.sin(e.bob) * 3;
    let alpha = 1;
    let scale = 1.16;
    if (e.dead) {
      const k = clamp(e.deadT / 0.42, 0, 1);
      alpha = k;
      scale = 0.46 + k * 0.7;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(e.x, e.y + (e.dead ? -20 * (1 - e.deadT / 0.42) : bob));
    ctx.scale(e.dir * scale, scale);

    if (e.hitT > 0) {
      ctx.globalAlpha = 0.85;
    }

    if (e.type === 'shroom') drawShroom(e);
    else if (e.type === 'ghost') drawGhost(e);
    else drawStump(e);

    ctx.restore();
  }

  function drawShroom(e) {
    const hit = e.hitT > 0;
    // 腿
    ctx.fillStyle = '#f0e6d6';
    rr(ctx, -20, -16, 16, 18, 7);
    ctx.fill();
    rr(ctx, 4, -16, 16, 18, 7);
    ctx.fill();

    // 身体
    ctx.fillStyle = hit ? '#ffffff' : '#f7efe1';
    ctx.beginPath();
    ctx.ellipse(0, -28, 24, 22, 0, 0, 6.28);
    ctx.fill();

    // 伞盖
    ctx.fillStyle = hit ? '#ffffff' : '#d94a38';
    ctx.beginPath();
    ctx.ellipse(0, -46, 36, 26, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    // 白点
    ctx.fillStyle = 'rgba(255, 245, 235, 0.92)';
    ctx.beginPath();
    ctx.arc(-16, -54, 6, 0, 6.28);
    ctx.arc(8, -60, 5, 0, 6.28);
    ctx.arc(22, -50, 4, 0, 6.28);
    ctx.fill();

    // 脸
    ctx.fillStyle = '#2a1c1a';
    ctx.beginPath();
    ctx.arc(-8, -32, 3.4, 0, 6.28);
    ctx.arc(8, -32, 3.4, 0, 6.28);
    ctx.fill();
    ctx.strokeStyle = '#2a1c1a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, -26, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  function drawGhost(e) {
    const hit = e.hitT > 0;
    ctx.fillStyle = hit ? 'rgba(255,255,255,0.9)' : 'rgba(178, 198, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(0, -44, 28, Math.PI, 0);
    const tail = Math.sin(e.bob * 1.4) * 5;
    ctx.quadraticCurveTo(26, -14 + tail, 14, -20);
    ctx.quadraticCurveTo(6, -10 - tail, -4, -20);
    ctx.quadraticCurveTo(-14, -10 + tail, -24, -22);
    ctx.quadraticCurveTo(-30, -34, -28, -44);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#2a3350';
    ctx.beginPath();
    ctx.arc(-9, -50, 4, 0, 6.28);
    ctx.arc(9, -50, 4, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 140, 160, 0.65)';
    ctx.beginPath();
    ctx.arc(-16, -42, 5, 0, 6.28);
    ctx.arc(16, -42, 5, 0, 6.28);
    ctx.fill();
  }

  function drawStump(e) {
    const hit = e.hitT > 0;
    // 树干
    ctx.fillStyle = hit ? '#fff' : '#6b4a2f';
    rr(ctx, -26, -58, 52, 58, 12);
    ctx.fill();

    // 树皮纹
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -52); ctx.lineTo(-12, -18);
    ctx.moveTo(6, -46); ctx.lineTo(6, -8);
    ctx.stroke();

    // 顶面年轮
    ctx.fillStyle = hit ? '#fff' : '#c08a52';
    ctx.beginPath();
    ctx.ellipse(0, -58, 27, 10, 0, 0, 6.28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 55, 25, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -58, 17, 6, 0, 0, 6.28);
    ctx.stroke();

    // 脸
    ctx.fillStyle = '#2a1c1a';
    ctx.beginPath();
    ctx.arc(-10, -34, 4, 0, 6.28);
    ctx.arc(10, -34, 4, 0, 6.28);
    ctx.fill();

    // 嘴：要吐种子时张嘴
    if (e.shootT < 0.4) {
      ctx.fillStyle = '#2a1c1a';
      ctx.beginPath();
      ctx.ellipse(0, -18, 7, 8, 0, 0, 6.28);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#2a1c1a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-7, -18);
      ctx.lineTo(7, -18);
      ctx.stroke();
    }
  }

  /* --- BOSS --- */

  function drawBoss() {
    const b = G.boss;
    if (!b) return;

    let alpha = 1;
    let scale = 1;
    let sink = 0;
    if (b.dead) {
      const k = clamp(b.deadT / 1.4, 0, 1);
      alpha = k;
      scale = 0.7 + k * 0.3;
      sink = (1 - k) * 40;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.x, b.y + sink);
    ctx.scale(b.dir * scale, scale);

    // 影子
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 6, 96, 18, 0, 0, 6.28);
    ctx.fill();
    ctx.globalAlpha = alpha;

    // 腿
    ctx.fillStyle = '#e9dcc8';
    rr(ctx, -58, -34, 40, 36, 14);
    ctx.fill();
    rr(ctx, 18, -34, 40, 36, 14);
    ctx.fill();

    // 身体
    ctx.fillStyle = b.hitT > 0 ? '#ffffff' : '#f4ead8';
    ctx.beginPath();
    ctx.ellipse(0, -62, 62, 46, 0, 0, 6.28);
    ctx.fill();

    // 伞盖
    const grad = ctx.createLinearGradient(0, -190, 0, -70);
    grad.addColorStop(0, b.hitT > 0 ? '#ffffff' : '#e4573f');
    grad.addColorStop(1, b.hitT > 0 ? '#ffffff' : '#a32b22');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, -108, 96, 66, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    // 白点
    ctx.fillStyle = 'rgba(255, 246, 236, 0.92)';
    ctx.beginPath();
    ctx.arc(-48, -132, 14, 0, 6.28);
    ctx.arc(-4, -150, 12, 0, 6.28);
    ctx.arc(42, -128, 11, 0, 6.28);
    ctx.arc(66, -110, 7, 0, 6.28);
    ctx.fill();

    // 王冠
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(-40, -168);
    ctx.lineTo(-30, -196);
    ctx.lineTo(-12, -178);
    ctx.lineTo(0, -204);
    ctx.lineTo(12, -178);
    ctx.lineTo(30, -196);
    ctx.lineTo(40, -168);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff9ec4';
    ctx.beginPath();
    ctx.arc(0, -180, 5, 0, 6.28);
    ctx.fill();

    // 怒眼
    ctx.fillStyle = '#241417';
    ctx.beginPath();
    ctx.ellipse(-26, -86, 10, 8, -0.2, 0, 6.28);
    ctx.ellipse(26, -86, 10, 8, 0.2, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = '#ff6b5e';
    ctx.beginPath();
    ctx.arc(-24, -87, 4, 0, 6.28);
    ctx.arc(28, -87, 4, 0, 6.28);
    ctx.fill();

    // 嘴
    ctx.strokeStyle = '#241417';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -58, 18, 0.25, Math.PI - 0.25);
    ctx.stroke();

    // 冲锋提示
    if (b.mode === 'charge') {
      ctx.globalAlpha = 0.4 + Math.sin(G.time * 20) * 0.2;
      ctx.strokeStyle = '#ff7a6b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(0, -100, 110, 100, 0, 0, 6.28);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* --- 弹幕 --- */

  function drawProjectiles() {
    for (const b of G.projectiles) {
      if (b.kind === 'wave') {
        const k = clamp(b.life / 2.4, 0, 1);
        ctx.globalAlpha = 0.7 * k + 0.2;
        ctx.fillStyle = '#ff9a4d';
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.08, GROUND_Y);
        ctx.lineTo(b.x - b.vx * 0.14, GROUND_Y - 70);
        ctx.lineTo(b.x, GROUND_Y - 96);
        ctx.lineTo(b.x + b.vx * 0.05, GROUND_Y - 60);
        ctx.lineTo(b.x + b.vx * 0.1, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#8a5a33';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 11, 0, 6.28);
        ctx.fill();
        ctx.fillStyle = '#b57b45';
        ctx.beginPath();
        ctx.arc(b.x - 3, b.y - 3, 5, 0, 6.28);
        ctx.fill();
      }
    }
  }

  /* --- 掉落物 --- */

  function drawOrbs() {
    for (const o of G.orbs) {
      const bob = Math.sin(o.bob) * 3;
      if (o.kind === 'gold') {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(o.x, o.y - 10 + bob, 9, 0, 6.28);
        ctx.fill();
        ctx.fillStyle = '#b98a1f';
        ctx.beginPath();
        ctx.arc(o.x, o.y - 10 + bob, 4.5, 0, 6.28);
        ctx.fill();
      } else {
        ctx.fillStyle = '#ff6b8a';
        ctx.beginPath();
        ctx.arc(o.x - 6, o.y - 14 + bob, 7, 0, 6.28);
        ctx.arc(o.x + 6, o.y - 14 + bob, 7, 0, 6.28);
        ctx.moveTo(o.x - 12, o.y - 12 + bob);
        ctx.lineTo(o.x, o.y - 1 + bob);
        ctx.lineTo(o.x + 12, o.y - 12 + bob);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /* --- 特效层 --- */

  function drawFx() {
    for (const q of G.particles) {
      const a = clamp(q.life / q.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * (0.4 + a * 0.8), 0, 6.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const t of G.texts) {
      const a = clamp(t.life / t.max, 0, 1);
      const pop = 1 + (1 - a) * 0.12;
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size * pop}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(8, 10, 18, 0.85)';
      ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  /* --- 主渲染 --- */

  function render() {
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const shakeX = G.shake > 0 ? rand(-1, 1) * G.shake : 0;
    const shakeY = G.shake > 0 ? rand(-1, 1) * G.shake : 0;

    drawBackground();

    ctx.save();
    ctx.translate(-Math.round(G.camX) + shakeX, shakeY);

    drawGroundAndPlatforms();
    drawPortal();
    drawOrbs();
    for (const e of G.enemies) drawEnemy(e);
    drawBoss();
    drawProjectiles();
    drawPlayer();
    drawFx();

    ctx.restore();

    drawVignette();

    // 切图黑幕
    if (G.fade > 0) {
      ctx.fillStyle = `rgba(4, 6, 12, ${clamp(G.fade, 0, 1)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* 森林尽头的传送门 */
  function drawPortal() {
    const po = G.portal;
    if (!po) return;

    const t = po.t;
    const cy = po.y - 74;
    const pulse = 1 + Math.sin(t * 3.2) * 0.05;

    ctx.save();
    ctx.translate(po.x, cy);
    ctx.scale(pulse, pulse);

    // 光晕
    const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 120);
    glow.addColorStop(0, 'rgba(180, 140, 255, 0.55)');
    glow.addColorStop(0.5, 'rgba(140, 90, 240, 0.22)');
    glow.addColorStop(1, 'rgba(140, 90, 240, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, 6.28);
    ctx.fill();

    // 门框
    ctx.strokeStyle = 'rgba(220, 200, 255, 0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 48, 86, 0, 0, 6.28);
    ctx.stroke();

    // 漩涡
    ctx.strokeStyle = 'rgba(240, 232, 255, 0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let a = 0; a < 6.28 * 2.6; a += 0.12) {
      const r = 6 + a * 5.2;
      const x = Math.cos(a + t * 2.4) * Math.min(r, 46);
      const y = Math.sin(a + t * 2.4) * Math.min(r, 82);
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 粒子
    for (let i = 0; i < 4; i++) {
      const a = t * 1.8 + i * 1.57;
      const px = Math.cos(a) * 54;
      const py = Math.sin(a) * 94;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#e6d5ff';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, 6.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 门下的提示
    ctx.font = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(230, 213, 255, 0.95)';
    ctx.fillText('蘑菇王巢穴', po.x, po.y - 186);
    ctx.textAlign = 'left';
  }

  function drawVignette() {
    const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.28, W / 2, H * 0.55, H * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /* ----------------------------------------------------------
     HUD
     ---------------------------------------------------------- */

  let hudKey = '';
  function syncHUD(force) {
    const p = G.player;
    if (!p) return;
    const hpPct = clamp(p.hp / p.maxHp, 0, 1) * 100;
    const expPct = clamp(p.exp / p.expNeed, 0, 1) * 100;
    const bossKey = G.boss && !G.boss.dead ? `B${Math.ceil(G.boss.hp)}` : '-';
    const key = `${Math.round(hpPct)}|${Math.round(expPct)}|${p.level}|${p.gold}|${Math.ceil(p.hp)}|${Math.ceil(p.maxHp)}|${p.expNeed}|${bossKey}`;
    if (!force && key === hudKey) return;
    hudKey = key;

    el.lv.textContent = `Lv.${p.level}`;
    el.hpFill.style.width = `${hpPct}%`;
    el.hpText.textContent = `${Math.ceil(p.hp)} / ${Math.ceil(p.maxHp)}`;
    el.expFill.style.width = `${expPct}%`;
    el.gold.textContent = fmt(p.gold);

    if (G.boss && !G.boss.dead) {
      el.bossHp.textContent = `${fmt(Math.max(0, G.boss.hp))} / ${fmt(G.boss.maxHp)}`;
      el.bossFill.style.width = `${clamp(G.boss.hp / G.boss.maxHp, 0, 1) * 100}%`;
    }
  }

  function syncSkill() {
    const p = G.player;
    if (!p) return;
    if (p.skillCd > 0) {
      el.btnSkill.classList.add('cooling');
      if (el.skillCd.hidden) el.skillCd.hidden = false;
      const txt = p.skillCd > 0.95 ? String(Math.ceil(p.skillCd)) : p.skillCd.toFixed(1);
      if (el.skillCd.textContent !== txt) el.skillCd.textContent = txt;
    } else {
      el.btnSkill.classList.remove('cooling');
      if (!el.skillCd.hidden) el.skillCd.hidden = true;
    }
  }

  function hideSkillCd() {
    el.skillCd.hidden = true;
    el.btnSkill.classList.remove('cooling');
  }

  /* ----------------------------------------------------------
     输入
     ---------------------------------------------------------- */

  const keys = { left: false, right: false };
  const pointer = { active: false, id: null, x: 0, usedByButton: false };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; e.preventDefault(); }
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); jump(); }
    if (e.key === 'j' || e.key === 'J' || e.key === 'z' || e.key === 'Z') { e.preventDefault(); attack(); }
    if (e.key === 'k' || e.key === 'K' || e.key === 'x' || e.key === 'X') { e.preventDefault(); castSkill(); }
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  /* 画布拖动：手指在角色右边就往右跑，在左边就往左跑。
     只认第一根手指；按钮在 DOM 层，事件不会漏到这里。 */

  function toLogicalX(clientX) {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return ((clientX - r.left) / r.width) * W;
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointer.active) return;
    pointer.active = true;
    pointer.id = e.pointerId;
    pointer.x = toLogicalX(e.clientX);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    ac();
    if (!keys.left && !keys.right) {
      const dx = pointer.x - (G.player.x - G.camX);
      if (dx < -26) keys.left = true;
    }
    try { e.preventDefault(); } catch { /* 忽略 */ }
  }

  function onMove(e) {
    if (!pointer.active || e.pointerId !== pointer.id) return;
    pointer.x = toLogicalX(e.clientX);
    try { e.preventDefault(); } catch { /* 忽略 */ }
  }

  function onUp(e) {
    if (e.pointerId !== pointer.id) return;
    pointer.active = false;
    pointer.id = null;
    keys.left = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* 忽略 */ }
  }

  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);
  } else {
    const t0 = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
    canvas.addEventListener('touchstart', (e) => {
      const t = t0(e);
      if (!t || pointer.active) return;
      pointer.active = true;
      pointer.id = 0;
      pointer.x = toLogicalX(t.clientX);
      ac();
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      const t = t0(e);
      if (!t || !pointer.active) return;
      pointer.x = toLogicalX(t.clientX);
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { pointer.active = false; keys.left = false; e.preventDefault(); };
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* 按钮：pointerdown 立即触发，按住攻击键可以连段 */

  let atkHeld = false;
  let atkRepeat = 0;

  el.btnAtk.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ac();
    atkHeld = true;
    attack();
  });
  el.btnAtk.addEventListener('pointerup', (e) => { e.preventDefault(); atkHeld = false; });
  el.btnAtk.addEventListener('pointercancel', () => { atkHeld = false; });
  el.btnAtk.addEventListener('pointerleave', () => { atkHeld = false; });

  el.btnJump.addEventListener('pointerdown', (e) => { e.preventDefault(); ac(); jump(); });
  el.btnSkill.addEventListener('pointerdown', (e) => { e.preventDefault(); ac(); castSkill(); });

  el.btnAtk.addEventListener('click', (e) => e.preventDefault());
  el.btnJump.addEventListener('click', (e) => e.preventDefault());
  el.btnSkill.addEventListener('click', (e) => e.preventDefault());

  /* ----------------------------------------------------------
     暂停 / 重开
     ---------------------------------------------------------- */

  function togglePause() {
    if (G.state !== 'play') return;
    G.paused = !G.paused;
    el.pauseVeil.hidden = !G.paused;
    el.pause.classList.toggle('paused', G.paused);
  }

  el.pause.addEventListener('click', togglePause);
  document.getElementById('again').addEventListener('click', reset);
  document.getElementById('restartTop').addEventListener('click', reset);

  // 竖屏提示：横过来最好，实在不想横也能点掉
  const rotateEl = document.getElementById('rotate');
  const rotateSkip = document.getElementById('rotateSkip');
  if (rotateSkip) {
    rotateSkip.addEventListener('click', () => {
      rotateEl.style.display = 'none';
      // 关掉提示后重算一次舞台尺寸
      setTimeout(resize, 30);
    });
  }

  /* ----------------------------------------------------------
     尺寸 / 循环
     ---------------------------------------------------------- */

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  let last = 0;
  const QS = new URLSearchParams(location.search);
  const FAST = Math.max(1, Math.min(6, Number(QS.get('fast')) || 1));

  function frame(now) {
    if (!last) last = now;
    let dt = Math.min((now - last) / 1000, 0.033);
    last = now;

    update(dt * FAST);

    if (atkHeld && G.state === 'play' && !G.paused) {
      atkRepeat -= dt;
      if (atkRepeat <= 0) { attack(); atkRepeat = 0.12; }
    }

    syncHUD();
    syncSkill();
    render();

    requestAnimationFrame(frame);
  }

  resize();
  reset();
  if (QS.has('debug')) {
    window.__g = G;
    window.__castLog = [];
    window.__hero = { attack, jump, castSkill, reset, keys, pointer, spawnBoss, enterStage };
  }
  requestAnimationFrame(frame);
})();
