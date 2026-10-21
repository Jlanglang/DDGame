/* 豆豆暗黑传奇 · M1.1
   本轮改动（对应评审 P0）：
   1. 所有行动（含移动）推进回合；攻击会激怒怪物，怪物会追击、反击
   2. 点击地面/怪物自动寻路（BFS），鼠标与触摸通用
   3. MP 每回合回复 + 技能 CD，技能按钮显示冷却
   4. 村口商人：药水/铁剑/皮甲，金币有出口
   5. 死亡回村复活，等级与装备保留；通关后可继续刷
   6. 装备稀有度/词缀/掉落对比/自动换装 + 掉落卡
   7. 怪物密度提高、按房间梯度刷怪、小地图、最近敌人提示
   规则依据：docs/豆豆暗黑传奇-规则与任务.md（M1 范围内做了可玩性微调，见注释）
*/
(() => {
  'use strict';

  const TILE = 32;
  const VIEW_W = 720;
  const VIEW_H = 1120;
  const SAVE_KEY = 'darklegend-save-v2';
  const LEGACY_KEY = 'darklegend-save-v1';
  const BAG_MAX = 24;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const el = {};
  [
    'lv', 'hpFill', 'hpText', 'mpFill', 'mpText', 'gold', 'exp', 'gear', 'tips', 'log',
    'btnAtk', 'btnHalf', 'btnFire', 'btnPotion', 'btnShop', 'btnMenu',
    'halfCd', 'fireCd', 'potionCount', 'potionCd',
    'over', 'overK', 'overT', 'overS', 'overBtn', 'overAlt',
    'shop', 'shopGold', 'shopClose', 'buyPotion', 'buySword', 'buyArmor',
    'menu', 'menuClose', 'menuRetreat', 'menuRestart',
    'btnChar', 'char', 'charLv', 'charExpFill', 'charExpText', 'charPower', 'charGold',
    'charTabs', 'paneGear', 'paneBag',
    'charStats', 'charSlots', 'bagCount', 'bagList', 'charClose', 'autoPot',
    'loot', 'lootName', 'lootStats', 'lootAffix',
    'intro', 'introBtn', 'seedText',
  ].forEach((id) => { el[id] = document.getElementById(id); });

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 区域划分：地图从左到右，x 越大越危险（图 1 固定村庄在左、洞穴入口在右）
  const zoneLevel = (x) => clamp(1 + Math.floor(x / 5), 1, 10);
  const zoneName = (x) => {
    const lv = zoneLevel(x);
    if (lv <= 2) return '鸡鸣村外';
    if (lv <= 4) return '荒田外圈';
    if (lv <= 6) return '荒田内圈';
    if (lv <= 8) return '深处';
    return '洞穴外围';
  };
  const zoneRange = (x) => {
    const lv = zoneLevel(x);
    if (lv <= 2) return 'Lv.1-2';
    if (lv <= 4) return 'Lv.3-4';
    if (lv <= 6) return 'Lv.5-6';
    if (lv <= 8) return 'Lv.7-8';
    return 'Lv.9-10';
  };
  const ZONE_FLOOR = [
    '#1c2638', '#1d273a', '#1f283c', '#21293e', '#232a40',
    '#262b42', '#292c44', '#2d2d46', '#322e48', '#372f4a',
  ];

  // 固定地图用的确定性随机：同一个 seed 永远生成同一张图
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randomSeed = () => ((Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0);
  const roll = (v) => v * (0.75 + Math.random() * 0.5);
  const key = (x, y) => x + ',' + y;
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  /* ---------------- 数据 ---------------- */
  const MON = [
    { id: 'chicken', name: '鸡', glyph: '🐔', aggro: 0 },
    { id: 'rat', name: '田鼠', glyph: '🐭', aggro: 0 },
    { id: 'dog', name: '野狗', glyph: '🐕', aggro: 5 },
    { id: 'bee', name: '蜜蜂', glyph: '🐝', aggro: 5 },
    { id: 'scarecrow', name: '稻草人', glyph: '🎃', aggro: 0 },
    { id: 'boar', name: '野猪', glyph: '🐗', aggro: 5 },
    { id: 'queen', name: '蜂后', glyph: '🐝', aggro: 5 },
    { id: 'treant', name: '树精', glyph: '🌳', aggro: 5 },
  ];
  const BOSS = { id: 'boss', name: '巨型稻草人', glyph: '👹', aggro: 6 };

  const RARITY = {
    white: { key: 'white', name: '普通', mult: 1 },
    blue: { key: 'blue', name: '魔法', mult: 1.15 },
    yellow: { key: 'yellow', name: '稀有', mult: 1.35 },
  };
  const WEAPON_NAMES = ['铁剑', '精铁剑', '裁决之刃'];
  const ARMOR_NAMES = ['皮甲', '锁子甲', '重盔甲'];

  const SHOP = {
    potion: { price: 50, label: '药水' },
    sword: { price: 80, label: '铁剑' },
    armor: { price: 70, label: '皮甲' },
  };

  /* ---------------- 玩家 ---------------- */
  const P = {
    x: 4, y: 24, dir: 'r',
    lv: 1, exp: 0, hp: 60, mp: 15, gold: 0, potions: 3,
    weapon: null, armor: null, bag: [],
    cd: { half: 0, fire: 0 },
    autoPot: 50, potionCd: 0,
    kills: 0,
  };

  const maxHp = () => 60 + 18 * (P.lv - 1) + eqHp(P.armor);
  const maxMp = () => 15 + 3 * (P.lv - 1);
  const atkMean = () => 5 + 1.5 * (P.lv - 1) + eqAtk(P.weapon);
  const defMean = () => 3 + 1 * (P.lv - 1) + eqDef(P.armor);
  const needExp = () => Math.round(100 * Math.pow(1.18, P.lv - 1));

  function eqAtk(eq) {
    if (!eq) return 0;
    let v = eq.atk || 0;
    if (eq.affix && eq.affix.id === 'sharp') v *= 1 + eq.affix.pct;
    return Math.round(v);
  }
  function eqDef(eq) {
    if (!eq) return 0;
    let v = eq.def || 0;
    if (eq.affix && eq.affix.id === 'tough') v *= 1 + eq.affix.pct;
    return Math.round(v);
  }
  function eqHp(eq) { return (eq && eq.hp) || 0; }
  const eqScore = (eq) => (eq ? eqAtk(eq) * 2 + eqDef(eq) * 1.5 + eqHp(eq) * 0.12 : 0);

  /* ---------------- 状态 ---------------- */
  let map = [];
  let seen = new Set();
  let enemies = [];
  let npc = null;
  let inCave = false;
  let turn = 0;
  let over = false;
  let door = { x: 0, y: 0 };
  let back = { x: 0, y: 0 };
  let logs = [];
  let walkTimer = null;
  let walkToken = 0;
  let pendingTarget = null;
  let lootTimer = null;
  let hurtTimer = null;
  const floaters = [];
  const cam = { x: 0, y: 0 };
  const IDLE_MS = 1000;          // 不操作时每 1 秒自动走一回合
  let idleTimer = null;
  let refreshTimer = null;
  let clockTimer = null;
  let clock = 8 * 60;            // 游戏内时间（分钟），默认 08:00
  let autoDisabled = false;
  let lastZoneLv = 1;
  let zoneMsgTurn = -99;
  let leveledUp = false;
  let combatLock = false;
  let combatMsgTurn = -99;
  let halfFlash = 0;
  let halfFlashCells = [];
  let worldSeed = 0;
  let mapRng = Math.random;
  let villagePos = { x: 6, y: 25 };
  let worldSnapshot = null;
  const mrand = (a, b) => a + mapRng() * (b - a);
  const mrandi = (a, b) => Math.floor(mrand(a, b + 1));

  const isWall = (x, y) => x < 0 || y < 0 || x >= map[0].length || y >= map.length || map[y][x] === 1;
  const enemyAt = (x, y) => enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
  const visible = (x, y) => Math.max(Math.abs(x - P.x), Math.abs(y - P.y)) <= 8;
  const uiOpen = () => !el.shop.hidden || !el.menu.hidden || !el.char.hidden || !el.intro.hidden || !el.over.hidden;

  /* ---------------- 地图 ---------------- */
  function blank(w, h) {
    return Array.from({ length: h }, () => Array.from({ length: w }, () => 1));
  }

  function carve(m, x, y, w, h) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j > 0 && i > 0 && j < m.length - 1 && i < m[0].length - 1) m[j][i] = 0;
      }
    }
  }

  function corridor(m, a, b) {
    let x = a.x, y = a.y;
    while (x !== b.x) { x += x < b.x ? 1 : -1; m[y][x] = 0; }
    while (y !== b.y) { y += y < b.y ? 1 : -1; m[y][x] = 0; }
  }

  function centerCam() {
    cam.x = clamp(P.x * TILE + TILE / 2 - VIEW_W / 2, 0, Math.max(0, map[0].length * TILE - VIEW_W));
    cam.y = clamp(P.y * TILE + TILE / 2 - VIEW_H / 2, 0, Math.max(0, map.length * TILE - VIEW_H));
  }

  function genOverworld() {
    mapRng = mulberry32(worldSeed);
    const m = blank(48, 48);

    // 开阔野外：内部全部打通，只放少量树丛/石头障碍，不做房间+走廊迷宫
    for (let y = 1; y < 47; y++) {
      for (let x = 1; x < 47; x++) m[y][x] = 0;
    }

    const village = { x: 3, y: 22, w: 7, h: 6, cx: 6, cy: 25 };
    const gate = { x: 40, y: 22, w: 5, h: 5, cx: 42, cy: 24 };

    // 村庄到洞穴入口的主路，保证连通
    for (let x = village.cx; x <= gate.cx; x++) {
      for (let y = 23; y <= 26; y++) m[y][x] = 0;
    }
    carve(m, village.x, village.y, village.w, village.h);
    carve(m, gate.x, gate.y, gate.w, gate.h);

    // 随机障碍：避开村庄、入口和主路
    for (let i = 0; i < 55; i++) {
      const x = mrandi(2, 45), y = mrandi(2, 45);
      if (x >= village.x - 2 && x <= village.x + village.w + 2 &&
        y >= village.y - 2 && y <= village.y + village.h + 2) continue;
      if (x >= gate.x - 2 && x <= gate.x + gate.w + 2 &&
        y >= gate.y - 2 && y <= gate.y + gate.h + 2) continue;
      if (y >= 23 && y <= 26) continue;
      m[y][x] = 1;
      if (mrand() < 0.4 && x + 1 < 47) m[y][x + 1] = 1;
    }

    map = m;
    seen = new Set();
    enemies = [];
    inCave = false;
    over = false;
    P.x = village.cx;
    P.y = village.cy;
    villagePos = { x: village.cx, y: village.cy };
    npc = { x: village.cx + 1, y: village.cy };
    door = { x: gate.cx, y: gate.cy };
    map[door.y][door.x] = 2;

    // 野外怪：随机撒在空地上，等级只看 x；村庄 8 格内不刷怪
    let placed = 0;
    for (let tries = 0; tries < 240 && placed < 26; tries++) {
      const x = mrandi(2, 45), y = mrandi(2, 45);
      if (isWall(x, y) || enemyAt(x, y)) continue;
      if (Math.abs(x - village.cx) + Math.abs(y - village.cy) < 8) continue;
      if (x === door.x && y === door.y) continue;
      const lv = zoneLevel(x);
      const type = MON[clamp(Math.round((lv - 1) * 0.85), 0, MON.length - 1)];
      const e = makeEnemy(lv, type);
      e.x = x;
      e.y = y;
      enemies.push(e);
      placed++;
    }
    lastZoneLv = zoneLevel(P.x);
    centerCam();
    log('你回到了鸡鸣村外。', 'good');
  }

  function genCave() {
    const m = blank(26, 26);
    carve(m, 2, 9, 6, 8);
    carve(m, 14, 8, 8, 10);
    corridor(m, { x: 5, y: 13 }, { x: 17, y: 13 });
    map = m;
    seen = new Set();
    inCave = true;
    over = false;
    npc = null;
    P.x = 4;
    P.y = 13;
    back = { x: 3, y: 13 };
    map[back.y][back.x] = 2;
    enemies = [
      Object.assign(makeEnemy(9, MON[7], false, true), { x: 6, y: 11 }),  // 树精只放 1 只
      Object.assign(makeEnemy(8, MON[5]), { x: 7, y: 16 }),               // 野猪
      Object.assign(makeEnemy(10, BOSS, true), { x: 19, y: 13 }),
    ];
    centerCam();
    log('稻草垛洞：潮湿、发霉，深处有东西在动。', 'bad');
  }

  // 进洞时把野外世界存起来，出洞原样恢复（地图、怪、迷雾、位置）
  function enterCave() {
    worldSnapshot = {
      map, enemies, seen, npc, door,
      px: P.x, py: P.y,
    };
    genCave();
  }

  function leaveCave() {
    if (!worldSnapshot) { genOverworld(); return; }
    const s = worldSnapshot;
    map = s.map;
    enemies = s.enemies;
    seen = s.seen;
    npc = s.npc;
    door = s.door;
    inCave = false;
    over = false;
    P.x = s.px;
    P.y = s.py;
    worldSnapshot = null;
    lastZoneLv = zoneLevel(P.x);
    centerCam();
    log('你回到了村外。', 'good');
  }

  // 野外低强度重生：在玩家附近 9-24 格随机空地上刷，等级按 x 区域
  function spawnWild() {
    if (inCave) return;
    const alive = enemies.filter((e) => e.hp > 0).length;
    if (alive >= 32) return;
    let spawned = 0;
    for (let tries = 0; tries < 60 && spawned < 2; tries++) {
      const x = randi(2, 45), y = randi(2, 45);
      if (isWall(x, y) || enemyAt(x, y)) continue;
      const d = Math.abs(x - P.x) + Math.abs(y - P.y);
      if (d < 9 || d > 24) continue;
      if (npc && x === npc.x && y === npc.y) continue;
      if (x === door.x && y === door.y) continue;
      const lv = zoneLevel(x);
      const type = MON[clamp(Math.round((lv - 1) * 0.85), 0, MON.length - 1)];
      const e = makeEnemy(lv, type);
      e.x = x;
      e.y = y;
      enemies.push(e);
      spawned++;
    }
  }

  function makeEnemy(lv, type, boss = false, elite = false) {
    const hp = 18 * Math.pow(1.16, lv) * (boss ? 4 : elite ? 3 : 1);
    return {
      name: type.name,
      glyph: type.glyph,
      boss,
      elite,
      aggro: type.aggro,
      aggroOn: false,
      lv,
      x: 0, y: 0,
      hp: Math.round(hp),
      maxHp: Math.round(hp),
      atk: (10 + 4 * lv) * (boss ? 1.0 : elite ? 1.5 : 0.8),
      def: 2 * Math.pow(1.075, lv) * (boss ? 1.5 : elite ? 1.2 : 1),
      exp: Math.round(10 * Math.pow(1.12, lv - 1) * (boss ? 12 : elite ? 3 : 1)),
      gold: boss ? randi(80, 120) : randi(2, 4 + lv),
    };
  }

  /* ---------------- 装备 ---------------- */
  function rollRarity(ilvl) {
    const yellow = 0.06 + Math.min(0.06, ilvl * 0.004);
    const r = Math.random();
    if (r < yellow) return 'yellow';
    if (r < yellow + 0.30) return 'blue';
    return 'white';
  }

  function makeEquip(slot, ilvl, rarity, opts = {}) {
    const mult = RARITY[rarity].mult;
    const names = slot === 'weapon' ? WEAPON_NAMES : ARMOR_NAMES;
    const name = names[rarity === 'yellow' ? 2 : rarity === 'blue' ? 1 : 0];
    const baseAtk = slot === 'weapon' ? randi(3 + Math.ceil(ilvl / 4), 5 + Math.ceil(ilvl / 2)) : 0;
    const baseDef = slot === 'armor' ? randi(2 + Math.ceil(ilvl / 2), 4 + Math.ceil(ilvl / 2)) : 0;
    const baseHp = slot === 'armor' ? randi(8 + ilvl, 10 + ilvl * 3) : 0;
    const eq = {
      slot, name, rarity, ilvl,
      atk: opts.atk ?? Math.round(baseAtk * mult),
      def: opts.def ?? Math.round(baseDef * mult),
      hp: opts.hp ?? Math.round(baseHp * mult),
      affix: null,
    };
    const affixChance = rarity === 'yellow' ? 1 : rarity === 'blue' ? 0.45 : 0;
    if (Math.random() < affixChance) {
      const preferSharp = slot === 'weapon' ? 0.7 : 0.25;
      if (Math.random() < preferSharp) eq.affix = { id: 'sharp', name: '锋锐', pct: rand(0.05, 0.12) };
      else eq.affix = { id: 'tough', name: '坚韧', pct: rand(0.12, 0.22) };
    }
    return eq;
  }

  function affixText(eq) {
    return eq.affix ? ` · ${eq.affix.name} ${Math.round(eq.affix.pct * 100)}%` : '';
  }

  function sellPrice(eq) {
    return Math.max(5, Math.round((eqScore(eq) + 4) * 2 * (1 + (eq.ilvl || 1) * 0.05)));
  }

  function eqStatText(eq) {
    return [
      eq.atk ? `攻击 +${eqAtk(eq)}` : '',
      eq.def ? `防御 +${eqDef(eq)}` : '',
      eq.hp ? `HP +${eq.hp}` : '',
    ].filter(Boolean).join(' · ');
  }

  function trimBag() {
    while (P.bag.length > BAG_MAX) {
      let worst = 0;
      for (let i = 1; i < P.bag.length; i++) {
        if (eqScore(P.bag[i]) < eqScore(P.bag[worst])) worst = i;
      }
      const removed = P.bag.splice(worst, 1)[0];
      const price = sellPrice(removed);
      P.gold += price;
      log(`背包满了，自动卖掉 ${removed.name}（+${price} 金币）。`);
    }
  }

  function addToBag(eq) {
    const cur = eq.slot === 'weapon' ? P.weapon : P.armor;
    if (eqScore(eq) > eqScore(cur) + 0.001) {
      if (cur) P.bag.push(cur);
      if (eq.slot === 'weapon') P.weapon = eq;
      else P.armor = eq;
      P.hp = Math.min(P.hp, maxHp());
      trimBag();
      showLoot(eq, true);
      log(`装备 ${eq.name}（${RARITY[eq.rarity].name}）${affixText(eq)}。`, 'good');
      return true;
    }
    P.bag.push(eq);
    trimBag();
    showLoot(eq, false);
    log(`获得 ${eq.name}（${RARITY[eq.rarity].name}）${affixText(eq)}，已放背包。`);
    return false;
  }

  function giveEquip(eq) {
    return addToBag(eq);
  }

  function equipFromBag(i) {
    const eq = P.bag[i];
    if (!eq) return;
    P.bag.splice(i, 1);
    const cur = eq.slot === 'weapon' ? P.weapon : P.armor;
    if (cur) P.bag.push(cur);
    if (eq.slot === 'weapon') P.weapon = eq;
    else P.armor = eq;
    P.hp = Math.min(P.hp, maxHp());
    if (!el.char.hidden) renderChar();
    syncHud();
    save();
  }

  function sellFromBag(i) {
    const eq = P.bag[i];
    if (!eq) return;
    P.bag.splice(i, 1);
    const price = sellPrice(eq);
    P.gold += price;
    log(`卖掉 ${eq.name}（+${price} 金币）。`, 'good');
    if (!el.char.hidden) renderChar();
    syncHud();
    save();
  }

  function showLoot(eq, equipped) {
    if (!el.loot) return;
    el.lootName.textContent = `${eq.name}${equipped ? '（已装备）' : '（已放背包）'}`;
    el.lootName.className = 'loot-name ' + eq.rarity;
    el.lootStats.textContent = `Lv.${eq.ilvl || 1} · ${[
      eq.atk ? `攻击 +${eqAtk(eq)}` : '',
      eq.def ? `防御 +${eqDef(eq)}` : '',
      eq.hp ? `HP +${eq.hp}` : '',
    ].filter(Boolean).join(' · ')} · 评分 ${Math.round(eqScore(eq))}`;
    el.lootAffix.textContent = eq.affix ? `${eq.affix.name} ${Math.round(eq.affix.pct * 100)}%` : '';
    el.loot.hidden = false;
    clearTimeout(lootTimer);
    lootTimer = setTimeout(() => { el.loot.hidden = true; }, 2800);
  }

  /* ---------------- 日志 / HUD ---------------- */
  function log(text, cls) {
    logs.push({ text, cls });
    if (logs.length > 30) logs.shift();
    const last = logs.slice(-3).map((l) => `<div class="${l.cls || ''}">${l.text}</div>`).join('');
    el.log.innerHTML = last;
  }

  function gearText() {
    const w = P.weapon ? `${P.weapon.name} +${eqAtk(P.weapon)}` : '空手';
    const a = P.armor ? `${P.armor.name} +${eqDef(P.armor)}` : '布衣';
    const wa = P.weapon && P.weapon.affix ? `（${P.weapon.affix.name}）` : '';
    const aa = P.armor && P.armor.affix ? `（${P.armor.affix.name}）` : '';
    return `⚔ ${w}${wa}　🛡 ${a}${aa}`;
  }

  function slotHtml(label, eq, icon) {
    if (!eq) return `<div class="slot empty"><div class="name">${icon} ${label}：未装备</div><div class="stats">去打怪，或去背包换一件。</div></div>`;
    return `<div class="slot rarity-${eq.rarity}"><div class="name rarity-${eq.rarity}">${icon} ${label}：${eq.name} <span class="ilvl">Lv.${eq.ilvl || 1}</span></div><div class="stats">${eqStatText(eq)}${affixText(eq)} · 评分 ${Math.round(eqScore(eq))}</div></div>`;
  }

  function bagItemHtml(eq, i) {
    const cur = eq.slot === 'weapon' ? P.weapon : P.armor;
    const up = eqScore(eq) > eqScore(cur) + 0.001;
    return `<div class="bag-item rarity-${eq.rarity}">
      <div class="bag-main"><div class="name rarity-${eq.rarity}">${eq.name} <span class="ilvl">Lv.${eq.ilvl || 1}</span>${up ? ' <span class="up">↑ 提升</span>' : ''}</div><div class="stats">${eqStatText(eq)}${affixText(eq)} · 评分 ${Math.round(eqScore(eq))}</div></div>
      <button data-equip="${i}">装备</button>
      <button class="sell" data-sell="${i}">卖 ${sellPrice(eq)}</button>
    </div>`;
  }

  function powerOf() {
    return Math.round(atkMean() * 4 + defMean() * 3 + maxHp() * 0.5 + maxMp() * 0.3);
  }

  function renderChar() {
    if (el.char.hidden) return;
    el.charLv.textContent = P.lv;
    el.charExpText.textContent = `${P.exp}/${needExp()}`;
    el.charExpFill.style.width = `${clamp(P.exp / needExp(), 0, 1) * 100}%`;
    el.charPower.textContent = powerOf();
    el.charGold.textContent = P.gold;
    const baseAtk = 5 + 1.5 * (P.lv - 1);
    const baseDef = 3 + (P.lv - 1);
    el.charStats.innerHTML = `
      <div>等级 <b>Lv.${P.lv}</b></div>
      <div>经验 <b>${P.exp}/${needExp()}</b></div>
      <div>HP <b>${Math.ceil(P.hp)}/${maxHp()}</b></div>
      <div>MP <b>${Math.ceil(P.mp)}/${maxMp()}</b></div>
      <div>攻击 <b>${Math.round(atkMean())}</b><small>基础 ${Math.round(baseAtk)} + 装备 ${eqAtk(P.weapon)}</small></div>
      <div>防御 <b>${Math.round(defMean())}</b><small>基础 ${Math.round(baseDef)} + 装备 ${eqDef(P.armor)}</small></div>
    `;
    el.charSlots.innerHTML = slotHtml('武器', P.weapon, '⚔') + slotHtml('护甲', P.armor, '🛡');
    el.autoPot.value = String(P.autoPot);
    el.bagCount.textContent = P.bag.length;
    el.bagList.innerHTML = P.bag.length
      ? P.bag.map((eq, i) => bagItemHtml(eq, i)).join('')
      : '<p class="menu-help">背包是空的。打怪会掉装备，更好的会自动穿上。</p>';
  }

  let charTab = 'gear';

  function switchCharTab(tab) {
    charTab = tab;
    el.paneGear.hidden = tab !== 'gear';
    el.paneBag.hidden = tab !== 'bag';
    if (el.charTabs && el.charTabs.querySelectorAll) {
      el.charTabs.querySelectorAll('.char-tab').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
    }
  }

  function openChar() {
    el.char.hidden = false;
    renderChar();
    switchCharTab(charTab);
  }

  function toggleChar() {
    if (el.char.hidden) openChar();
    else el.char.hidden = true;
  }

  function nearShop() {
    return !!npc && dist(npc, P) <= 1;
  }

  function updateTips() {
    if (over) return;
    const zone = inCave ? '稻草垛洞' : zoneName(P.x);
    const range = inCave ? 'Lv.9-10' : zoneRange(P.x);
    const tag = inCombat() ? '⚔ ' : '';
    const n = nearestEnemy();
    if (!n) {
      el.tips.textContent = `${tag}${zone} ${range}　这一带暂时安全。`;
      return;
    }
    const d = dist(n, P);
    const dx = n.x - P.x, dy = n.y - P.y;
    const arrow = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
    el.tips.textContent = `${tag}${zone} ${range}　最近：Lv.${n.lv} ${n.name} ${d}格${arrow}`;
  }

  function nearestEnemy() {
    let best = null, bd = 999;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = dist(e, P);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function clockText() {
    const total = ((Math.floor(clock) % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function updateClockLabel() {
    el.lv.textContent = `Lv.${P.lv} · 🕐 ${clockText()}`;
  }

  function syncHud() {
    updateClockLabel();
    el.hpFill.style.width = `${clamp(P.hp / maxHp(), 0, 1) * 100}%`;
    el.hpText.textContent = `${Math.max(0, Math.ceil(P.hp))} / ${maxHp()}`;
    el.mpFill.style.width = `${clamp(P.mp / maxMp(), 0, 1) * 100}%`;
    el.mpText.textContent = `${Math.ceil(P.mp)} / ${maxMp()}`;
    el.gold.textContent = `💰 ${P.gold}`;
    el.exp.textContent = `经验 ${P.exp}/${needExp()}`;
    el.gear.textContent = gearText();
    el.potionCount.textContent = P.potions;
    el.btnAtk.disabled = over;
    el.btnPotion.disabled = over || P.potions <= 0 || P.potionCd > 0;
    el.potionCd.textContent = P.potionCd > 0 ? `⏳${P.potionCd}` : '';
    el.btnShop.disabled = over || !nearShop();
    setSkillBtn(el.btnHalf, el.halfCd, 6, P.cd.half);
    setSkillBtn(el.btnFire, el.fireCd, 12, P.cd.fire);
    updateTips();
  }

  function setSkillBtn(btn, cdEl, cost, cd) {
    btn.disabled = over || cd > 0 || P.mp < cost;
    btn.classList.toggle('cooling', cd > 0);
    cdEl.textContent = cd > 0 ? `⏳${cd}` : '';
  }

  /* ---------------- 存档 ---------------- */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 2, lv: P.lv, exp: P.exp, hp: P.hp, mp: P.mp, gold: P.gold,
        potions: P.potions, weapon: P.weapon, armor: P.armor, kills: P.kills,
        bag: P.bag, seed: worldSeed, clock, autoPot: P.autoPot,
      }));
    } catch { /* 忽略 */ }
  }

  function normalizeEquip(raw, slot) {
    if (!raw) return null;
    if (typeof raw === 'number') {
      return slot === 'weapon'
        ? { slot, name: '铁剑', rarity: 'white', atk: raw, def: 0, hp: 0, affix: null }
        : { slot, name: '皮甲', rarity: 'white', atk: 0, def: raw, hp: raw * 6, affix: null };
    }
    return raw;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_KEY); } catch { /* 忽略 */ }
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);
      P.lv = Math.max(1, s.lv || 1);
      P.exp = Math.max(0, s.exp || 0);
      P.gold = Math.max(0, s.gold || 0);
      P.potions = Math.max(0, s.potions ?? 3);
      P.kills = s.kills || 0;
      P.bag = Array.isArray(s.bag) ? s.bag.slice(0, BAG_MAX) : [];
      P.autoPot = Number.isFinite(s.autoPot) ? s.autoPot : 50;
      worldSeed = (s.seed >>> 0) || 0;
      clock = Number.isFinite(s.clock) ? s.clock : 8 * 60;
      P.weapon = normalizeEquip(s.weapon, 'weapon');
      P.armor = normalizeEquip(s.armor, 'armor');
      const rawHp = s.hp ?? maxHp();
      P.hp = rawHp <= 0 ? Math.ceil(maxHp() * 0.5) : Math.min(rawHp, maxHp());
      P.mp = Math.max(0, Math.min(s.mp ?? maxMp(), maxMp()));
      return true;
    } catch { return false; }
  }

  /* ---------------- 战斗 ---------------- */
  function strike(e, mult, tag) {
    const dmg = Math.max(1, Math.round(roll(atkMean()) * mult - roll(e.def)));
    e.hp -= dmg;
    e.aggroOn = true;
    addFloater(e.x, e.y - 0.4, `-${dmg}`, '#ffd166');
    log(`${tag}对${e.name}造成 <b>${dmg}</b> 伤害，剩余 ${Math.max(0, Math.ceil(e.hp))}。`);
    if (e.hp <= 0) kill(e);
    return dmg;
  }

  function kill(e) {
    e.hp = 0;
    P.exp += e.exp;
    P.gold += e.gold;
    P.kills++;
    log(`${e.name}倒下了，+${e.exp} 经验、+${e.gold} 金币。`, 'good');
    if (Math.random() < 0.18) { P.potions++; log('捡到 1 瓶药水。', 'good'); }
    if (e.boss) {
      dropEquip(e, 'blue');
      dropEquip(e, 'yellow');
    } else if (e.elite) {
      dropEquip(e, Math.random() < 0.25 ? 'yellow' : 'blue');
    } else if (Math.random() < 0.30) {
      dropEquip(e);
    }
    while (P.exp >= needExp()) {
      P.exp -= needExp();
      P.lv++;
      P.hp = maxHp();
      P.mp = maxMp();
      leveledUp = true;
      log(`升级！现在是 Lv.${P.lv}，HP/MP 已回满。`, 'good');
    }
    if (e.boss) win();
  }

  function dropEquip(e, forceRarity) {
    const ilvl = clamp((e.lv || 1) + (e.boss ? 10 : e.elite ? 5 : 0), 1, 30);
    const slot = Math.random() < 0.5 ? 'weapon' : 'armor';
    const eq = makeEquip(slot, ilvl, forceRarity || rollRarity(ilvl));
    giveEquip(eq);
  }

  function enemiesTurn() {
    if (over) return;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = dist(e, P);
      if (d > 14) { e.aggroOn = false; continue; }
      // 比玩家低 5 级以上的怪不主动；同段位/更高等级照常追（BOSS 永远主动）
      if (!e.boss && e.lv < P.lv - 5 && !e.aggroOn) continue;
      if (d === 1) {
        let dmg = Math.max(1, Math.round(roll(e.atk) - roll(defMean() * 0.9)));
        dmg = Math.min(dmg, Math.ceil(maxHp() * (e.boss ? 0.5 : 0.35)));
        P.hp -= dmg;
        addFloater(P.x, P.y - 0.4, `-${dmg}`, '#ff6b6b');
        hurtFlash();
        log(`${e.name}攻击你，<span class="bad">-${dmg} HP</span>。`, 'bad');
        if (P.hp <= 0) { die(); return; }
      } else if (e.aggroOn || d <= e.aggro) {
        e.aggroOn = true;
        stepToward(e);
      }
    }
  }

  function stepToward(e) {
    const dx = Math.sign(P.x - e.x), dy = Math.sign(P.y - e.y);
    const horizFirst = Math.abs(P.x - e.x) >= Math.abs(P.y - e.y);
    const steps = horizFirst ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    for (const [mx, my] of steps) {
      if (!mx && !my) continue;
      const nx = e.x + mx, ny = e.y + my;
      if (!isWall(nx, ny) && !enemyAt(nx, ny) && !(nx === P.x && ny === P.y)) {
        e.x = nx; e.y = ny;
        return;
      }
    }
  }

  function die() {
    over = true;
    P.hp = 0;
    P.exp = Math.floor(P.exp * 0.95);
    save();
    showOver('倒下', '你被稻草垛里的东西拖了进去',
      `Lv.${P.lv} · 经验 -5%，等级与装备保留。回村可以再来。`,
      '回村复活', revive);
  }

  function revive() {
    over = false;
    leveledUp = false;
    if (inCave) leaveCave();
    P.x = villagePos.x;
    P.y = villagePos.y;
    P.hp = Math.ceil(maxHp() * 0.6);
    P.mp = Math.ceil(maxMp() * 0.5);
    lastZoneLv = zoneLevel(P.x);
    centerCam();
    syncHud();
    save();
    log('你在村口醒来，商人在旁边打盹。', 'good');
    scheduleIdle();
  }

  function win() {
    over = true;
    save();
    showOver('通关', '你击败了巨型稻草人',
      `Lv.${P.lv} · 金币 ${P.gold} · 图 1 结束。可以继续刷装备。`,
      '回村继续刷', continueAfterWin);
  }

  function continueAfterWin() {
    over = false;
    leveledUp = false;
    if (inCave) leaveCave();
    P.x = villagePos.x;
    P.y = villagePos.y;
    lastZoneLv = zoneLevel(P.x);
    centerCam();
    syncHud();
    save();
    log('图 1 已通关。洞里的首领还会再出现，继续刷。', 'good');
    scheduleIdle();
  }

  function showOver(kicker, title, sub, btnText, action) {
    el.overK.textContent = kicker;
    el.overT.textContent = title;
    el.overS.textContent = sub;
    el.overBtn.textContent = btnText;
    el.overBtn.onclick = () => { el.over.hidden = true; action(); };
    el.overAlt.hidden = false;
    el.over.hidden = false;
  }

  function hurtFlash() {
    document.body.classList.add('hurt');
    clearTimeout(hurtTimer);
    hurtTimer = setTimeout(() => document.body.classList.remove('hurt'), 180);
  }

  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 1 });
    if (floaters.length > 24) floaters.shift();
  }

  /* ---------------- 行动 ---------------- */
  function after() {
    if (over) return;
    P.mp = Math.min(maxMp(), P.mp + Math.max(1, Math.round(maxMp() * 0.08)));
    if (P.cd.half > 0) P.cd.half--;
    if (P.cd.fire > 0) P.cd.fire--;
    if (P.potionCd > 0) P.potionCd--;
    if (!leveledUp) enemiesTurn();   // 升级当回合不挨打，保证回满能看见
    leveledUp = false;
    if (over) return;
    turn++;
    checkCombat();
    checkZone();
    if (turn % 18 === 0) spawnWild();
    syncHud();
    save();
    scheduleIdle();
  }

  function checkZone() {
    if (inCave) return;
    const lv = zoneLevel(P.x);
    if (lv > lastZoneLv && turn - zoneMsgTurn >= 3) {
      zoneMsgTurn = turn;
      log(`前方是 ${zoneName(P.x)}（${zoneRange(P.x)}），小心。`, 'bad');
    }
    lastZoneLv = lv;
  }

  // 战斗锁定：相邻有活怪时人物钉住，只能打/喝药/技能，移动要按 R 撤退
  function combatTargets() {
    return enemies.filter((e) => e.hp > 0 && dist(e, P) === 1);
  }

  function inCombat() {
    return enemies.some((e) => e.hp > 0 && dist(e, P) === 1);
  }

  function checkCombat() {
    const now = inCombat();
    if (now && !combatLock) {
      combatLock = true;
      const t = combatTargets()[0];
      log(`战斗锁定：${t.name} Lv.${t.lv}。打倒它，或按 R 撤退。`, 'bad');
    } else if (!now && combatLock) {
      combatLock = false;
      log('战斗结束，可以继续走了。', 'good');
    }
  }

  // 时间驱动：不操作也会自动走一回合（有敌人就普攻，没有就警戒）
  function autoStep() {
    if (over || uiOpen() || walkTimer) return false;
    const t = turn;
    // 自动喝药优先：血量低于阈值、有药、不在 CD
    if (P.autoPot > 0 && P.potions > 0 && P.potionCd <= 0 &&
      P.hp <= maxHp() * P.autoPot / 100) {
      if (drink()) { after(); return true; }
    }
    const target = adjacentTarget();
    if (target) {
      faceTo(target.x, target.y);
      const halfHits = halfMoonTargets().length;
      // 自动战斗优先级：半月打 2 只 > 烈火 > 半月打 1 只 > 普攻
      if (P.cd.half <= 0 && P.mp >= 6 && halfHits >= 2) act('half');
      else if (P.cd.fire <= 0 && P.mp >= 12) act('fire');
      else if (P.cd.half <= 0 && P.mp >= 6 && halfHits >= 1) act('half');
      else act('attack');
    } else {
      after();
    }
    return turn !== t;
  }

  function scheduleIdle() {
    if (autoDisabled) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (autoStep()) return;   // autoStep 内部 after() 会重新排下一拍
      scheduleIdle();
    }, IDLE_MS);
  }

  function pauseAuto() {
    autoDisabled = true;
    clearTimeout(idleTimer);
    idleTimer = null;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  function facingVec() {
    if (P.dir === 'l') return [-1, 0];
    if (P.dir === 'r') return [1, 0];
    if (P.dir === 'u') return [0, -1];
    return [0, 1];
  }

  function faceTo(x, y) {
    const dx = x - P.x, dy = y - P.y;
    if (Math.abs(dx) >= Math.abs(dy)) P.dir = dx < 0 ? 'l' : 'r';
    else P.dir = dy < 0 ? 'u' : 'd';
  }

  function adjacentTarget() {
    const [fx, fy] = facingVec();
    const front = enemies.find((e) => e.hp > 0 && e.x === P.x + fx && e.y === P.y + fy);
    if (front) return front;
    return enemies.filter((e) => e.hp > 0 && dist(e, P) === 1)
      .sort((a, b) => a.hp - b.hp)[0] || null;
  }

  function attack(mult, tag) {
    const t = adjacentTarget();
    if (!t) { log('身边没有敌人。'); return false; }
    strike(t, mult, tag);
    return true;
  }

  // 半月：朝向前方的九宫格半边 5 格（正前、前左、前右、正左、正右）
  function halfMoonCells() {
    const [fx, fy] = facingVec();
    const [px, py] = fx !== 0 ? [0, 1] : [1, 0];
    return [
      [P.x + fx, P.y + fy],
      [P.x + fx + px, P.y + fy + py],
      [P.x + fx - px, P.y + fy - py],
      [P.x + px, P.y + py],
      [P.x - px, P.y - py],
    ];
  }

  function halfMoonTargets() {
    const out = [];
    for (const [x, y] of halfMoonCells()) {
      const e = enemies.find((en) => en.hp > 0 && en.x === x && en.y === y);
      if (e) out.push(e);
    }
    return out;
  }

  function halfMoon() {
    if (P.cd.half > 0) { log(`半月还在冷却（${P.cd.half} 回合）。`); return false; }
    if (P.mp < 6) { log('MP 不足（需要 6）。', 'bad'); return false; }
    P.mp -= 6;
    P.cd.half = 2;
    halfFlash = 1;
    halfFlashCells = halfMoonCells();
    const targets = halfMoonTargets();
    for (const e of targets) strike(e, 1.1, '半月');
    if (!targets.length) log('半月劈在空气里。');
    return true;
  }

  function fireSword() {
    if (P.cd.fire > 0) { log(`烈火还在冷却（${P.cd.fire} 回合）。`); return false; }
    if (P.mp < 12) { log('MP 不足（需要 12）。', 'bad'); return false; }
    const t = adjacentTarget();
    if (!t) { log('身边没有敌人。'); return false; }
    P.mp -= 12;
    P.cd.fire = 3;
    strike(t, 2.2, '烈火');
    return true;
  }

  function drink() {
    if (P.potionCd > 0) { log(`药水还在冷却（${P.potionCd} 回合）。`); return false; }
    if (P.potions <= 0) { log('没有药水了。', 'bad'); return false; }
    P.potions--;
    P.potionCd = 3;
    const heal = Math.round(maxHp() * 0.4);
    P.hp = Math.min(maxHp(), P.hp + heal);
    addFloater(P.x, P.y - 0.4, `+${heal}`, '#7ee0a0');
    log(`喝下药水，回复 ${heal} HP。`, 'good');
    return true;
  }

  function act(kind) {
    if (over || uiOpen()) return;
    stopWalk();
    if (kind === 'attack') { if (attack(1.2, '攻击')) after(); }
    else if (kind === 'half') { if (halfMoon()) after(); }
    else if (kind === 'fire') { if (fireSword()) after(); }
    else if (kind === 'potion') { if (drink()) after(); }
    else if (kind === 'wait') { log('你按兵不动。'); after(); }
  }

  function move(dx, dy, fromWalk = false) {
    if (over) return false;
    if (inCombat()) {
      const target = enemyAt(P.x + dx, P.y + dy);
      if (!target) {
        if (!fromWalk && turn - combatMsgTurn >= 2) {
          combatMsgTurn = turn;
          log('被缠住了，先解决眼前的敌人（R 撤退）。', 'bad');
        }
        return false;
      }
      // 朝怪移动 = 撞怪攻击，继续往下走
    }
    if (dx < 0) P.dir = 'l'; else if (dx > 0) P.dir = 'r';
    else if (dy < 0) P.dir = 'u'; else if (dy > 0) P.dir = 'd';
    const nx = P.x + dx, ny = P.y + dy;
    if (isWall(nx, ny)) {
      if (!fromWalk) log('那边是墙。');
      return false;
    }
    const e = enemyAt(nx, ny);
    if (e) {
      // 撞怪 = 攻击；这一下也会让怪物进入仇恨并反击
      strike(e, 1.2, '攻击');
      if (fromWalk) stopWalk();
      after();
      return true;
    }
    P.x = nx;
    P.y = ny;
    if (map[ny][nx] === 2) {
      if (inCave) leaveCave();
      else enterCave();
      centerCam();
      syncHud();
      save();
      scheduleIdle();
      if (fromWalk) stopWalk();
      return true;
    }
    after();
    return true;
  }

  function retreat() {
    if (over || uiOpen()) return;
    const foes = combatTargets();
    if (!foes.length) { log('没有敌人，不用撤。'); return; }
    const nearest = foes.slice().sort((a, b) => dist(a, P) - dist(b, P))[0];
    let dmg = Math.max(1, Math.round(roll(nearest.atk) - roll(defMean() * 0.9)));
    dmg = Math.min(dmg, Math.ceil(maxHp() * (nearest.boss ? 0.5 : 0.35)));
    P.hp -= dmg;
    addFloater(P.x, P.y - 0.4, `-${dmg}`, '#ff6b6b');
    log(`${nearest.name}趁机咬了你一口，<span class="bad">-${dmg} HP</span>。`, 'bad');
    if (P.hp <= 0) { die(); return; }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const away = dirs.filter(([dx, dy]) => {
      const nx = P.x + dx, ny = P.y + dy;
      return !isWall(nx, ny) && !enemyAt(nx, ny);
    }).sort((a, b) => {
      const da = dist({ x: P.x + a[0], y: P.y + a[1] }, nearest);
      const db = dist({ x: P.x + b[0], y: P.y + b[1] }, nearest);
      return db - da;
    });
    if (!away.length) {
      log('被围死了，撤不出去。', 'bad');
      after();
      return;
    }
    const [dx, dy] = away[0];
    P.x += dx;
    P.y += dy;
    log('你且战且退。', 'good');
    after();
  }

  /* ---------------- 寻路 ---------------- */
  function bfs(sx, sy, tx, ty) {
    const W = map[0].length, H = map.length;
    if (sx === tx && sy === ty) return [];
    const prev = new Int32Array(W * H).fill(-1);
    const start = sy * W + sx;
    prev[start] = start;
    const q = [start];
    let head = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < q.length) {
      const cur = q[head++];
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx === tx && cy === ty) {
        const path = [];
        let k = cur;
        while (k !== prev[k]) {
          path.push({ x: k % W, y: (k / W) | 0 });
          k = prev[k];
        }
        path.reverse();
        return path;
      }
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (map[ny][nx] === 1) continue;
        if (enemyAt(nx, ny) && !(nx === tx && ny === ty)) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    return null;
  }

  function bestAdjacent(x, y) {
    const opts = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!isWall(nx, ny) && !enemyAt(nx, ny) && !(nx === P.x && ny === P.y)) {
        opts.push({ x: nx, y: ny });
      }
    }
    opts.sort((a, b) => dist(a, P) - dist(b, P));
    return opts[0] || null;
  }

  function stopWalk() {
    walkToken++;
    if (walkTimer) {
      clearTimeout(walkTimer);
      walkTimer = null;
    }
    pendingTarget = null;
  }

  function walk(path) {
    const target = pendingTarget;   // 保留"走到后打谁"
    stopWalk();
    pendingTarget = target;
    const token = walkToken;
    let i = 0;
    const step = () => {
      if (token !== walkToken) return;
      if (over || uiOpen()) { stopWalk(); return; }
      if (pendingTarget && pendingTarget.hp > 0 && dist(pendingTarget, P) === 1) {
        const t = pendingTarget;
        pendingTarget = null;
        faceTo(t.x, t.y);
        act('attack');
        return;
      }
      if (i >= path.length) { stopWalk(); return; }
      const n = path[i++];
      if (Math.abs(n.x - P.x) + Math.abs(n.y - P.y) !== 1) { stopWalk(); return; }
      if (enemyAt(n.x, n.y)) {
        faceTo(n.x, n.y);
        act('attack');
        return;
      }
      const moved = move(n.x - P.x, n.y - P.y, true);
      if (!moved) { stopWalk(); return; }
      if (token !== walkToken) return;   // 撞怪/换图会取消剩余路径
      if (over || uiOpen()) { stopWalk(); return; }
      walkTimer = setTimeout(step, 130);
    };
    step();
  }

  /* ---------------- 输入 ---------------- */
  function onPointer(e) {
    if (over || uiOpen()) return;
    if (e.cancelable) e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (VIEW_W / rect.width);
    const py = (e.clientY - rect.top) * (VIEW_H / rect.height);
    if (px >= VIEW_W - 152 && py <= 152) return;   // 点在小地图上不移动
    const wx = Math.floor((px + cam.x) / TILE);
    const wy = Math.floor((py + cam.y) / TILE);
    if (wx < 0 || wy < 0 || wx >= map[0].length || wy >= map.length) return;
    if (isWall(wx, wy)) return;
    stopWalk();
    const enemy = enemyAt(wx, wy);
    if (enemy) {
      if (inCombat() && dist(enemy, P) !== 1) {
        log('战斗中不能走远，先解决敌人（R 撤退）。', 'bad');
        return;
      }
      if (dist(enemy, P) === 1) { faceTo(wx, wy); act('attack'); return; }
      const goal = bestAdjacent(wx, wy);
      if (!goal) { log('没有落脚点。'); return; }
      const path = bfs(P.x, P.y, goal.x, goal.y);
      if (!path) { log('过不去。'); return; }
      pendingTarget = enemy;
      walk(path);
      return;
    }
    if (inCombat()) {
      log('战斗中不能走远，先解决敌人（R 撤退）。', 'bad');
      return;
    }
    if (npc && wx === npc.x && wy === npc.y) {
      const goal = bestAdjacent(wx, wy);
      if (!goal) return;
      const path = bfs(P.x, P.y, goal.x, goal.y);
      if (!path) { log('过不去。'); return; }
      pendingTarget = null;
      walk(path);
      return;
    }
    const path = bfs(P.x, P.y, wx, wy);
    if (!path) { log('走不过去。'); return; }
    pendingTarget = null;
    walk(path);
  }

  function onKey(e) {
    if (e.target && /input|textarea/i.test(e.target.tagName || '')) return;
    const k = (e.key || '').toLowerCase();
    if (uiOpen()) {
      if (k === 'escape') closeAll();
      else if (k === 'c' && !el.char.hidden) el.char.hidden = true;
      return;
    }
    const moves = {
      w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
      arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0],
    };
    if (moves[k]) {
      e.preventDefault();
      stopWalk();
      move(moves[k][0], moves[k][1]);
      return;
    }
    if (k === 'j') { e.preventDefault(); act('attack'); }
    else if (k === '1') { e.preventDefault(); act('half'); }
    else if (k === '2') { e.preventDefault(); act('fire'); }
    else if (k === 'q') { e.preventDefault(); act('potion'); }
    else if (k === 'e') { e.preventDefault(); toggleShop(); }
    else if (k === 'r') { e.preventDefault(); retreat(); }
    else if (k === 'c') { e.preventDefault(); toggleChar(); }
    else if (k === 'escape') closeAll();
  }

  function openShop() {
    if (over) return;
    if (!nearShop()) { log('商人不在附近，回村口找他。', 'bad'); return; }
    el.shop.hidden = false;
    refreshShop();
  }

  function toggleShop() {
    if (!el.shop.hidden) { el.shop.hidden = true; return; }
    openShop();
  }

  function refreshShop() {
    el.shopGold.textContent = P.gold;
    el.buyPotion.disabled = P.gold < SHOP.potion.price;
    el.buySword.disabled = P.gold < SHOP.sword.price;
    el.buyArmor.disabled = P.gold < SHOP.armor.price;
  }

  function buy(kind) {
    const it = SHOP[kind];
    if (!it) return false;
    if (P.gold < it.price) {
      log(`金币不够，还差 ${it.price - P.gold}。`, 'bad');
      return false;
    }
    P.gold -= it.price;
    if (kind === 'potion') {
      P.potions++;
      log('买了 1 瓶药水。', 'good');
    } else if (kind === 'sword') {
      giveEquip(makeEquip('weapon', 3, 'white', { atk: 3, def: 0, hp: 0 }));
    } else if (kind === 'armor') {
      giveEquip(makeEquip('armor', 3, 'white', { atk: 0, def: 2, hp: 15 }));
    }
    syncHud();
    refreshShop();
    save();
    return true;
  }

  function restart() {
    if (!confirm('重开新档？当前进度会清空。')) return;
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* 忽略 */ }
    location.reload();
  }

  function closeAll() {
    el.shop.hidden = true;
    el.menu.hidden = true;
    el.char.hidden = true;
  }

  function bind() {
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointer);
    if (document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          clearTimeout(idleTimer);
          idleTimer = null;
        } else {
          scheduleIdle();
        }
      });
    }
    el.btnAtk.addEventListener('click', () => act('attack'));
    el.btnHalf.addEventListener('click', () => act('half'));
    el.btnFire.addEventListener('click', () => act('fire'));
    el.btnPotion.addEventListener('click', () => act('potion'));
    el.btnShop.addEventListener('click', openShop);
    el.btnMenu.addEventListener('click', () => {
      el.seedText.textContent = String(worldSeed);
      el.menu.hidden = false;
    });
    el.menuClose.addEventListener('click', () => { el.menu.hidden = true; });
    el.menuRetreat.addEventListener('click', () => { el.menu.hidden = true; retreat(); });
    el.gear.addEventListener('click', openChar);
    el.btnChar.addEventListener('click', openChar);
    el.charTabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) switchCharTab(b.dataset.tab);
    });
    el.charClose.addEventListener('click', () => { el.char.hidden = true; });
    el.autoPot.addEventListener('change', () => {
      P.autoPot = Number(el.autoPot.value) || 0;
      save();
      log(P.autoPot ? `自动喝药：血量低于 ${P.autoPot}% 时喝。` : '自动喝药已关闭。');
    });
    el.bagList.addEventListener('click', (e) => {
      const eqBtn = e.target.closest('[data-equip]');
      if (eqBtn) { equipFromBag(Number(eqBtn.dataset.equip)); return; }
      const sellBtn = e.target.closest('[data-sell]');
      if (sellBtn) sellFromBag(Number(sellBtn.dataset.sell));
    });
    el.menuRestart.addEventListener('click', restart);
    el.shopClose.addEventListener('click', () => { el.shop.hidden = true; });
    el.buyPotion.addEventListener('click', () => buy('potion'));
    el.buySword.addEventListener('click', () => buy('sword'));
    el.buyArmor.addEventListener('click', () => buy('armor'));
    el.introBtn.addEventListener('click', () => {
      el.intro.hidden = true;
      save();
      log('鸡鸣村外：先打鸡，学会走位；打不动就换武器——破防靠装备。', 'good');
    });
    el.overAlt.onclick = restart;
  }

  /* ---------------- 渲染 ---------------- */
  function draw() {
    if (!map.length) return;
    const mw = map[0].length * TILE;
    const mh = map.length * TILE;
    const tx = clamp(P.x * TILE + TILE / 2 - VIEW_W / 2, 0, Math.max(0, mw - VIEW_W));
    const ty = clamp(P.y * TILE + TILE / 2 - VIEW_H / 2, 0, Math.max(0, mh - VIEW_H));
    cam.x += (tx - cam.x) * 0.18;
    cam.y += (ty - cam.y) * 0.18;

    ctx.fillStyle = '#070a11';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const x0 = Math.floor(cam.x / TILE) - 1;
    const y0 = Math.floor(cam.y / TILE) - 1;
    const x1 = x0 + Math.ceil(VIEW_W / TILE) + 3;
    const y1 = y0 + Math.ceil(VIEW_H / TILE) + 3;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= map[0].length || y >= map.length) continue;
        const t = map[y][x];
        const vis = visible(x, y);
        if (vis) seen.add(key(x, y));
        if (!seen.has(key(x, y))) continue;
        const sx = x * TILE - cam.x;
        const sy = y * TILE - cam.y;
        if (t === 1) ctx.fillStyle = vis ? '#151f33' : '#0d1422';
        else if (t === 2) ctx.fillStyle = vis ? '#b8860b' : '#5b440f';
        else if (vis) ctx.fillStyle = inCave ? '#1b1a2e' : ZONE_FLOOR[zoneLevel(x) - 1];
        else ctx.fillStyle = '#111827';
        ctx.fillRect(sx, sy, TILE - 1, TILE - 1);
        if (t === 2 && vis) {
          ctx.font = '18px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('🕳', sx + TILE / 2, sy + TILE - 6);
        }
      }
    }

    // 商人
    if (npc && seen.has(key(npc.x, npc.y))) {
      const sx = npc.x * TILE - cam.x + TILE / 2;
      const sy = npc.y * TILE - cam.y + TILE / 2;
      ctx.font = '24px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🧑‍🌾', sx, sy + 8);
      ctx.font = '10px system-ui';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('商人', sx, sy - 16);
    }

    // 敌人
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (!visible(e.x, e.y) || !seen.has(key(e.x, e.y))) continue;
      const sx = e.x * TILE - cam.x + TILE / 2;
      const sy = e.y * TILE - cam.y + TILE / 2;
      ctx.textAlign = 'center';
      ctx.font = `${e.boss ? 34 : e.elite ? 28 : 24}px system-ui`;
      ctx.fillText(e.glyph, sx, sy + 8);
      ctx.font = '10px system-ui';
      ctx.fillStyle = e.boss ? '#ffd166' : 'rgba(220, 228, 245, 0.85)';
      ctx.fillText(`Lv.${e.lv} ${e.name}`, sx, sy - 24);
      const w = 26;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(sx - w / 2, sy - 20, w, 4);
      ctx.fillStyle = '#e05a5a';
      ctx.fillRect(sx - w / 2, sy - 20, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }

    // 玩家
    const px = P.x * TILE - cam.x + TILE / 2;
    const py = P.y * TILE - cam.y + TILE / 2;
    ctx.font = '26px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🧙', px, py + 8);
    const [fx, fy] = facingVec();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(px + fx * 15, py + fy * 15, 3, 0, Math.PI * 2);
    ctx.fill();

    // 半月的扇形高亮
    if (halfFlash > 0) {
      halfFlash = Math.max(0, halfFlash - 0.06);
      ctx.fillStyle = `rgba(255, 209, 102, ${0.28 * halfFlash})`;
      for (const [hx, hy] of halfFlashCells) {
        ctx.fillRect(hx * TILE - cam.x, hy * TILE - cam.y, TILE - 1, TILE - 1);
      }
    }

    // 飘字
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= 0.03;
      f.y -= 0.02;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x * TILE - cam.x + TILE / 2, f.y * TILE - cam.y);
    }
    ctx.globalAlpha = 1;

    // 视野暗角
    const g = ctx.createRadialGradient(px, py, 120, px, py, 520);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    drawMinimap();
    requestAnimationFrame(draw);
  }

  function drawMinimap() {
    const size = 132, pad = 10;
    const x0 = VIEW_W - size - pad;
    const y0 = pad;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(6, 10, 18, 0.82)';
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = 'rgba(150, 176, 220, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);

    const mw = map[0].length, mh = map.length;
    const s = (size - 8) / Math.max(mw, mh);
    const ox = x0 + 4, oy = y0 + 4;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (!seen.has(key(x, y))) continue;
        const t = map[y][x];
        if (t === 1) continue;
        ctx.fillStyle = t === 2 ? '#b8860b' : (inCave ? '#2a2745' : ZONE_FLOOR[zoneLevel(x) - 1]);
        ctx.fillRect(ox + x * s, oy + y * s, Math.max(1, s), Math.max(1, s));
      }
    }
    // 区域边界（每 10 格一条竖线）
    if (!inCave) {
      for (let zx = 10; zx < mw; zx += 10) {
        ctx.strokeStyle = 'rgba(255, 138, 61, 0.22)';
        ctx.beginPath();
        ctx.moveTo(ox + zx * s, oy);
        ctx.lineTo(ox + zx * s, oy + mh * s);
        ctx.stroke();
      }
    }
    if (npc && seen.has(key(npc.x, npc.y))) {
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(ox + npc.x * s - 1, oy + npc.y * s - 1, 3, 3);
    }
    for (const e of enemies) {
      if (e.hp <= 0 || !visible(e.x, e.y)) continue;
      ctx.fillStyle = e.boss ? '#ff8a3d' : '#ff5a5a';
      ctx.fillRect(ox + e.x * s - 1, oy + e.y * s - 1, 2.5, 2.5);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + P.x * s - 1, oy + P.y * s - 1, 3, 3);
    ctx.restore();
  }

  /* ---------------- 启动 ---------------- */
  const loaded = load();
  if (!worldSeed) worldSeed = randomSeed();
  genOverworld();
  if (!loaded) {
    P.hp = maxHp();
    P.mp = maxMp();
    el.intro.hidden = false;
  } else {
    P.hp = Math.max(1, Math.min(P.hp, maxHp()));
    P.mp = Math.min(P.mp, maxMp());
  }
  bind();
  syncHud();
  draw();
  scheduleIdle();
  refreshTimer = setInterval(() => {
    if (autoDisabled || over || inCave || uiOpen()) return;
    if (document.hidden) return;
    spawnWild();
    syncHud();
  }, 7000);
  clockTimer = setInterval(() => {
    if (document.hidden) return;
    clock = (clock + 1) % 1440;
    updateClockLabel();
  }, 1000);
  save();

  if (location.search.includes('debug')) {
    window.__dl = {
      P, act, move, attack, halfMoon, fireSword, drink, buy,
      revive, continueAfterWin, die, win, dropEquip, makeEquip, giveEquip,
      addToBag, equipFromBag, sellFromBag, sellPrice, openChar,
      enemies: () => enemies, map: () => map, npc: () => npc, door: () => door,
      genCave, genOverworld, bfs, save, load, spawnWild,
      zoneLevel, zoneName, zoneRange,
      setSeed: (n) => { worldSeed = n >>> 0; },
      seed: () => worldSeed,
      retreat, inCombat, combatTargets,
      maxHp: () => maxHp(), maxMp: () => maxMp(),
      idleMs: () => IDLE_MS,
      clock: () => clock,
      clockText,
      tick: autoStep, pauseAuto,
      hideIntro: () => { el.intro.hidden = true; },
      setPos: (x, y) => { P.x = x; P.y = y; },
      setHp: (v) => { P.hp = v; },
      setMp: (v) => { P.mp = v; },
      setGold: (v) => { P.gold = v; },
      rest: () => { P.hp = maxHp(); P.mp = maxMp(); },
      state: () => ({
        lv: P.lv, hp: P.hp, mp: P.mp, gold: P.gold, potions: P.potions,
        turn, over, inCave, weapon: P.weapon, armor: P.armor,
        cd: { ...P.cd }, enemyCount: enemies.filter((e) => e.hp > 0).length,
      }),
    };
  }
})();
