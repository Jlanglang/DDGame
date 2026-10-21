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

  const D = (window.DL && window.DL.DATA) || {};
  if (!D.TILE) throw new Error('data.js 未加载');
  const TILE = D.TILE;
  const VIEW_W = D.VIEW_W;
  const VIEW_H = D.VIEW_H;
  const SAVE_KEY = D.SAVE_KEY;
  const LEGACY_KEY = D.LEGACY_KEY;
  const BAG_MAX = D.BAG_MAX;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // 等比铺满：逻辑坐标 720×1120；canvas 覆盖整个舞台（超出裁剪），UI 浮在上面
  function resizeCanvas() {
    const wrap = canvas.parentElement;
    const availW = (wrap && wrap.clientWidth) || VIEW_W;
    const availH = (wrap && wrap.clientHeight) || VIEW_H;
    const scale = Math.max(availW / VIEW_W, availH / VIEW_H);
    if (!(scale > 0)) return;
    canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
    canvas.style.height = Math.floor(VIEW_H * scale) + 'px';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(VIEW_W * dpr);
    const h = Math.round(VIEW_H * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

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
    'doorConfirm', 'doorTitle', 'doorDesc', 'doorYes', 'doorNo',
    'pStatus',
    'lootPick', 'pickTitle', 'pickHint', 'pickList', 'pickAll', 'pickClose',
  ].forEach((id) => { el[id] = document.getElementById(id); });

  const {
    rand, randi, clamp, roll, key, dist, mulberry32, randomSeed,
    eqAtkMin, eqAtkMax, eqDefMin, eqDefMax, eqAtk, eqDef, eqHp, eqScore,
    atkRange, defRange,
  } = DL.Core;
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
  // ZONE_FLOOR 见 data.js

  // 固定地图用的确定性随机：同一个 seed 永远生成同一张图（mulberry32 / randomSeed 见 core.js）

  /* ---------------- 数据（来自 data.js） ---------------- */
  const MON = D.MON;
  const BOSS = D.BOSS;
  const GRADE = D.GRADE;
  const CRUSH = D.CRUSH;
  const AI = D.AI || {};
  const RARITY = D.RARITY;
  const WEAPON_NAMES = D.WEAPON_NAMES;
  const ARMOR_NAMES = D.ARMOR_NAMES;
  const SHOP = D.SHOP;
  const ZONE_FLOOR = D.ZONE_FLOOR;
  const FLOAT_P = D.FLOAT_P;
  const FLOAT_MIN = D.FLOAT_MIN;
  const FLOAT_MAX = D.FLOAT_MAX;
  const DROP = D.DROP || {};
  const DEATH = D.DEATH || { dropP: 0, expLoss: 0.05 };

  /* ---------------- 玩家 ---------------- */
  const P = {
    x: 4, y: 24, dir: 'r',
    lv: 1, exp: 0, hp: 60, mp: 15, gold: 0, potions: 3,
    weapon: null, armor: null, bag: [],
    cd: { half: 0, fire: 0 },
    skills: { half: false, fire: false },   // 技能书解锁：半月 / 烈火
    autoPot: 50, potionCd: 0,
    kills: 0,
    statuses: {},                           // R5：中毒 / 灼烧 / 眩晕 / 麻痹（见 status.js）
  };

  const S = DL.Status;                      // 状态层

  const maxHp = () => DL.Core.maxHp(P);
  const maxMp = () => DL.Core.maxMp(P);
  const atkMean = () => DL.Core.atkMean(P);
  const defMean = () => DL.Core.defMean(P);
  const needExp = () => DL.Core.needExp(P);

  // 装备属性函数见 core.js（eqAtk / eqDef / eqHp / eqScore 已解构）

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
  const IDLE_MS = D.IDLE_MS;     // 不操作时每 1 秒自动走一回合
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

  const isWall = (x, y) => DL.World.isWall(map, x, y);
  const enemyAt = (x, y) => enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
  // 全亮视角：取消迷雾；以后想恢复视野，把这里换回 DL.World.visible(P.x, P.y, x, y, 半径)
  const visible = () => true;
  const uiOpen = () => !el.shop.hidden || !el.menu.hidden || !el.char.hidden || !el.intro.hidden || !el.over.hidden || !el.doorConfirm.hidden || !el.lootPick.hidden;

  /* ---------------- 地图（生成器在 world.js） ---------------- */
  function centerCam() {
    const mw = map[0].length * TILE, mh = map.length * TILE;
    cam.x = camTarget(P.x * TILE + TILE / 2 - VIEW_W / 2, mw, VIEW_W);
    cam.y = camTarget(P.y * TILE + TILE / 2 - VIEW_H / 2, mh, VIEW_H);
  }

  /* ---------------- 主城 / 小世界 ---------------- */
  const ROOMS = DL.DATA.ROOMS;
  let currentRoom = null;        // 当前房间 id；在主城为 null
  let doors = [];                // 主城传送门列表
  const roomClearedAt = {};      // 房间最后清空时间（游戏内分钟）

  /* ---------------- 地面掉落袋（R9 改） ----------------
     怪死掉的装备不再直接进背包，而是落在地上一个袋子；走过去/点它才捡，
     捡起来先看清单，自己决定拿走哪几件。金币和药水照旧即时结算。 */
  let groundBags = {};           // roomKey -> [bag]
  let activeBags = [];           // 当前地图上的袋子
  const bagKey = () => currentRoom || 'hub';
  const bagAt = (x, y) => activeBags.find((b) => b.x === x && b.y === y) || null;
  function loadBags() {
    const k = bagKey();
    if (!groundBags[k]) groundBags[k] = [];
    activeBags = groundBags[k];
  }

  const roomSpec = (id) => ROOMS.find((r) => r.id === id) || null;

  function hashId(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  // 主城：固定小村庄 + 传送门
  function genHub() {
    mapRng = mulberry32(worldSeed);
    const h = DL.World.genHub(ROOMS);
    map = h.map;
    seen = new Set();
    enemies = [];
    inCave = false;
    currentRoom = null;
    over = false;
    P.x = h.spawn.x;
    P.y = h.spawn.y;
    villagePos = { x: h.spawn.x, y: h.spawn.y };
    npc = h.npc;
    doors = h.doors;
    door = doors[0] || { x: 0, y: 0 };
    lastZoneLv = 1;
    S.clear(P);                     // 换图脱战：状态清零
    loadBags();
    centerCam();
    log('你回到了主城。', 'good');
  }

  // 品级 roll：94% 普通、5% 精英、1% 稀有
  function rollGrade() {
    const r = Math.random();
    if (r < GRADE.rare.p) return 'rare';
    if (r < GRADE.rare.p + GRADE.elite.p) return 'elite';
    return 'normal';
  }

  function spawnRoomMobs(spec) {
    const out = [];
    const spots = [];
    const W = map[0].length, H = map.length;
    for (let tries = 0; tries < 300 && spots.length < spec.mobs; tries++) {
      const x = randi(2, W - 3), y = randi(2, H - 3);
      if (isWall(x, y) || enemyAt(x, y)) continue;
      if (Math.abs(x - P.x) + Math.abs(y - P.y) < 4) continue;
      if (x === back.x && y === back.y) continue;
      spots.push({ x, y });
    }
    // 怪池：按房间的 pool 刷（每道门怪不一样）；没配就退回全表
    let pool = (spec.pool || []).map((id) => MON.find((m) => m.id === id)).filter(Boolean);
    if (!pool.length) pool = MON.slice();
    for (const s of spots) {
      const mon = pool[randi(0, pool.length - 1)];
      const e = makeEnemy(mon, rollGrade());
      e.x = s.x; e.y = s.y;
      out.push(e);
    }
    if (spec.boss) {
      let best = null, bd = -1;
      for (let tries = 0; tries < 200; tries++) {
        const x = randi(2, W - 3), y = randi(2, H - 3);
        if (isWall(x, y) || enemyAt(x, y)) continue;
        const d = Math.abs(x - P.x) + Math.abs(y - P.y);
        if (d > bd) { bd = d; best = { x, y }; }
      }
      if (best) {
        const b = makeEnemy(BOSS, 'boss');
        b.x = best.x; b.y = best.y;
        out.push(b);
      }
    }
    return out;
  }

  // 进入小世界房间
  function enterRoom(roomId) {
    const spec = roomSpec(roomId);
    if (!spec) return;
    mapRng = mulberry32(worldSeed ^ hashId(roomId));
    const r = DL.World.genRoom(spec, mapRng);
    map = r.map;
    seen = new Set();
    inCave = true;
    currentRoom = roomId;
    over = false;
    npc = null;
    P.x = r.spawn.x;
    P.y = r.spawn.y;
    back = r.exit;
    S.clear(P);                     // 换图脱战：状态清零
    loadBags();
    enemies = spawnRoomMobs(spec);

    // 刷新 CD：Boss 房清过且还在冷却，就不刷 Boss
    const cleared = roomClearedAt[roomId];
    if (spec.boss && cleared != null && clock - cleared < spec.cd) {
      enemies = enemies.filter((e) => !e.boss);
      log(`${spec.name}：首领还在休整（${Math.ceil(spec.cd - (clock - cleared))} 分钟后刷新）。`, 'bad');
    }

    centerCam();
    log(`进入 ${spec.name}（Lv.${spec.lvMin}–${spec.lvMax}）。`, 'good');
  }

  // 离开房间回主城
  function leaveRoom() {
    if (!currentRoom) return;
    const alive = enemies.filter((e) => e.hp > 0).length;
    if (alive === 0) {
      roomClearedAt[currentRoom] = clock;
      log('房间已清空，首领进入刷新冷却。', 'good');
    }
    genHub();
  }

  // 房间内不再野外重生
  function spawnWild() { /* 小世界房间不自动刷怪 */ }

  // 碾压：只对普通怪生效。精英/稀有/BOSS 永远能打你，也永远给全额收益。
  function isCrush(playerLv, monLv, isSpecial) {
    if (isSpecial) return false;
    const gap = playerLv >= CRUSH.lateFrom ? CRUSH.lateGap : CRUSH.earlyGap;
    return playerLv - monLv >= gap;
  }

  // mon：MON / BOSS 表项；gradeKey：normal / elite / rare / boss
  function makeEnemy(mon, gradeKey = 'normal') {
    const g = GRADE[gradeKey] || GRADE.normal;
    const lv = mon.lv + (g.lvAdd || 0);
    const isBoss = gradeKey === 'boss';
    const hp = 18 * Math.pow(1.16, lv) * g.hp;
    return {
      id: mon.id,
      name: mon.name + (g.name ? `·${g.name}` : ''),
      glyph: mon.glyph,
      ai: mon.ai || 'active',          // R14.6：passive / active
      harmless: !!mon.harmless,        // 新手兜底：打玩家 0 伤害（鸡）
      boss: isBoss,
      elite: gradeKey === 'elite',
      rare: gradeKey === 'rare',
      grade: gradeKey,
      aggro: mon.aggro,
      aggroOn: false,
      lv,
      x: 0, y: 0,
      hp: Math.round(hp),
      maxHp: Math.round(hp),
      statuses: {},
      atk: (10 + 4 * lv) * g.atk,
      def: 2 * Math.pow(1.075, lv) * (isBoss ? 1.5 : gradeKey === 'rare' ? 1.4 : gradeKey === 'elite' ? 1.2 : 1),
      exp: Math.round(10 * Math.pow(1.12, lv - 1) * g.exp),
      gold: isBoss ? randi(200, 300) : (() => {
        // 怪物表给了自己的金币区间（鸡 1–5）就用自己的，否则按等级
        const base = mon.gold ? randi(mon.gold[0], mon.gold[1]) : randi(8 + 2 * lv, 12 + 3 * lv);
        return Math.round(base * (gradeKey === 'elite' ? 3 : gradeKey === 'rare' ? 8 : 1));
      })(),
      goldP: mon.goldP != null ? mon.goldP : 1,   // 金币掉落概率（鸡不是必掉）
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
    const names = slot === 'weapon' ? WEAPON_NAMES : ARMOR_NAMES;
    const name = names[rarity === 'yellow' ? 2 : rarity === 'blue' ? 1 : 0];

    // 基础区间：所有品质相同（品质不碰属性）
    const atkMin0 = slot === 'weapon' ? Math.round(4 + 0.2 * ilvl) : 0;
    const atkMax0 = slot === 'weapon' ? Math.round(8 + 0.4 * ilvl) : 0;
    const defMin0 = slot === 'armor' ? Math.round(2 + 0.2 * ilvl) : 0;
    const defMax0 = slot === 'armor' ? Math.round(4 + 0.4 * ilvl) : 0;
    const hp0 = slot === 'armor' ? Math.round(15 + 3 * ilvl) : 0;

    // 浮动：上下限各自独立判定；幅度所有品质相同；C（白）不浮
    const p = FLOAT_P[rarity] ?? 0;
    const upMin = p > 0 && Math.random() < p ? randi(0, FLOAT_MIN) : 0;
    const upMax = p > 0 && Math.random() < p ? randi(0, FLOAT_MAX) : 0;

    const eq = {
      slot, name, rarity, ilvl,
      // 浮动只加在本来就有这一项上：武器不会凭空长防御，护甲也不会长攻击
      atkMin: opts.atkMin ?? (slot === 'weapon' ? atkMin0 + upMin : 0),
      atkMax: opts.atkMax ?? (slot === 'weapon' ? atkMax0 + upMax : 0),
      defMin: opts.defMin ?? (slot === 'armor' ? defMin0 + upMin : 0),
      defMax: opts.defMax ?? (slot === 'armor' ? defMax0 + upMax : 0),
      hp: opts.hp ?? hp0,
      affix: null,
      elite: (upMin > 0 && upMax > 0),        // 双浮 = 极品标记
    };
    const affixChance = rarity === 'yellow' ? 1 : rarity === 'blue' ? 0.45 : 0;
    if (Math.random() < affixChance) {
      const preferSharp = slot === 'weapon' ? 0.7 : 0.25;
      if (Math.random() < preferSharp) eq.affix = { id: 'sharp', name: '锋锐', pct: rand(0.05, 0.12) };
      else eq.affix = { id: 'tough', name: '坚韧', pct: rand(0.12, 0.22) };
    }
    return eq;
  }

  // 词缀系统在 M2：装备身上会带 affix，但界面上先不显示名字（R8）

  function sellPrice(eq) {
    return Math.max(5, Math.round((eqScore(eq) + 4) * 2 * (1 + (eq.ilvl || 1) * 0.05)));
  }

  // 装备属性（含词缀加成）。词缀系统在 M2，现在词缀位显示"未鉴定"，但数值照算
  function eqStatText(eq) {
    const aMin = eqAtkMin(eq), aMax = eqAtkMax(eq);
    const dMin = eqDefMin(eq), dMax = eqDefMax(eq);
    return [
      aMax ? `攻击 ${aMin}-${aMax}` : '',
      dMax ? `防御 ${dMin}-${dMax}` : '',
      eq.hp ? `HP +${eq.hp}` : '',
    ].filter(Boolean).join(' · ');
  }

  // 词缀位：词缀系统 M2 才做，现在统一显示"未鉴定"（R8）
  const affixSlot = () => '<span class="affix-todo">词缀 未鉴定</span>';

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
      log(`装备 ${eq.name}（${RARITY[eq.rarity].name}）。`, 'good');
      return true;
    }
    P.bag.push(eq);
    trimBag();
    showLoot(eq, false);
    log(`获得 ${eq.name}（${RARITY[eq.rarity].name}），已放背包。`);
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
    const r = RARITY[eq.rarity] || RARITY.white;
    el.lootName.textContent = `【${r.letter} ${r.name}】${eq.name}${equipped ? '（已装备）' : '（已放背包）'}`;
    el.lootName.className = 'loot-name ' + eq.rarity;
    el.lootStats.textContent = `Lv.${eq.ilvl || 1} · ${eqStatText(eq)}`;
    el.lootAffix.textContent = '词缀 未鉴定';
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
    const tag = (eq) => (eq ? `[${(RARITY[eq.rarity] || RARITY.white).letter}]` : '');
    const w = P.weapon ? `${P.weapon.name}${tag(P.weapon)} +${eqAtk(P.weapon)}` : '空手';
    const a = P.armor ? `${P.armor.name}${tag(P.armor)} +${eqDef(P.armor)}` : '布衣';
    return `⚔ ${w}　🛡 ${a}`;
  }

  function slotHtml(label, eq, icon) {
    if (!eq) return `<div class="slot empty"><div class="name">${icon} ${label}：未装备</div><div class="stats">去打怪，或去背包换一件。</div></div>`;
    return `<div class="slot rarity-${eq.rarity}"><div class="name rarity-${eq.rarity}">${icon} ${label}：${eq.name} ${rarBadge(eq)} <span class="ilvl">Lv.${eq.ilvl || 1}</span></div><div class="stats">${eqStatText(eq)} · ${affixSlot()} · 评分 ${Math.round(eqScore(eq))}</div></div>`;
  }

  function rarBadge(eq) {
    const r = RARITY[eq.rarity] || RARITY.white;
    return `<span class="rbadge ${eq.rarity}">${r.letter}</span>`;
  }

  function bagItemHtml(eq, i) {
    const cur = eq.slot === 'weapon' ? P.weapon : P.armor;
    const up = eqScore(eq) > eqScore(cur) + 0.001;
    return `<div class="bag-item rarity-${eq.rarity}">
      ${rarBadge(eq)}
      <div class="bag-main"><div class="name rarity-${eq.rarity}">${eq.name} <span class="ilvl">Lv.${eq.ilvl || 1}</span> ${rarTag(eq)}${up ? ' <span class="up">↑ 提升</span>' : ''}</div><div class="stats">${eqStatText(eq)} · ${affixSlot()} · 评分 ${Math.round(eqScore(eq))}</div></div>
      <button data-equip="${i}">装备</button>
      <button class="sell" data-sell="${i}">卖 ${sellPrice(eq)}</button>
    </div>`;
  }

  // 鉴定这套先不做（品级直接显示、词缀 M2 再做），保留占位说明

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
    const spec = currentRoom ? roomSpec(currentRoom) : null;
    const zone = spec ? spec.name : zoneName(P.x);
    const range = spec ? `Lv.${spec.lvMin}-${spec.lvMax}` : zoneRange(P.x);
    const tag = inCombat() ? '⚔ ' : '';
    const n = nearestEnemy();
    if (!n) {
      el.tips.textContent = `${tag}${zone} ${range}　这一带暂时安全。${bagNearby() ? '　💰 脚边有袋子' : ''}`;
      return;
    }
    const d = dist(n, P);
    const dx = n.x - P.x, dy = n.y - P.y;
    const arrow = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
    const aiTag = n.ai === 'passive' ? '被动' : '主动';
    const stTxt = S.text(n);
    const nearBag = bagNearby();
    el.tips.textContent = `${tag}${zone} ${range}　最近：Lv.${n.lv} ${n.name}·${aiTag} ${d}格${arrow}${stTxt ? '　' + stTxt : ''}${nearBag ? '　💰 脚边有袋子' : ''}`;
  }

  // 3 格内有袋子就提示一下，免得玩家不知道要过去捡
  function bagNearby() {
    return activeBags.some((b) => Math.abs(b.x - P.x) + Math.abs(b.y - P.y) <= 3);
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
    setSkillBtn(el.btnHalf, el.halfCd, 6, P.cd.half, P.skills.half);
    setSkillBtn(el.btnFire, el.fireCd, 12, P.cd.fire, P.skills.fire);
    renderStatus();
    updateTips();
  }

  // 玩家状态条（R15.2 符号 + 数字；R5.16 剩余 ≤2 回合闪烁）
  function renderStatus() {
    if (!el.pStatus) return;
    const list = S.list(P);
    el.pStatus.hidden = !list.length;
    el.pStatus.innerHTML = list.map((s) => {
      const n = s.stacks > 1 ? `<b>·${s.stacks}</b>` : '';
      return `<span class="st ${s.key}${s.blink ? ' blink' : ''}" title="${s.name} 剩 ${s.left} 回合">${s.sym}${s.left}${n}</span>`;
    }).join('');
  }

  function setSkillBtn(btn, cdEl, cost, cd, learned) {
    btn.disabled = over || !learned || cd > 0 || P.mp < cost;
    btn.classList.toggle('cooling', cd > 0);
    btn.classList.toggle('locked', !learned);
    cdEl.textContent = learned ? (cd > 0 ? `⏳${cd}` : '') : '未学';
  }

  /* ---------------- 存档 ---------------- */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 2, lv: P.lv, exp: P.exp, hp: P.hp, mp: P.mp, gold: P.gold,
        potions: P.potions, weapon: P.weapon, armor: P.armor, kills: P.kills,
        bag: P.bag, seed: worldSeed, clock, autoPot: P.autoPot,
        skills: P.skills,
        rooms: roomClearedAt,
        ground: groundBags,          // 地上的袋子（含死亡遗物）
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
      S.clear(P);                       // 状态不存档：读档后从干净状态开始
      if (s.rooms && typeof s.rooms === 'object') Object.assign(roomClearedAt, s.rooms);
      if (s.ground && typeof s.ground === 'object') groundBags = s.ground;
      P.skills = Object.assign({ half: false, fire: false }, s.skills || {});
      const rawHp = s.hp ?? maxHp();
      P.hp = rawHp <= 0 ? Math.ceil(maxHp() * 0.5) : Math.min(rawHp, maxHp());
      P.mp = Math.max(0, Math.min(s.mp ?? maxMp(), maxMp()));
      return true;
    } catch { return false; }
  }

  /* ---------------- 战斗 ---------------- */
  function strike(e, mult, tag) {
    const ar = atkRange(P);
    const dmg = DL.Combat.playerDamage(ar.min, ar.max, e.def, mult);
    e.hp -= dmg;
    e.aggroOn = true;
    S.onHit(e);                 // R5.8：眩晕受击解除
    addFloater(e.x, e.y - 0.4, `-${dmg}`, '#ffd166');
    log(`${tag}对${e.name}造成 <b>${dmg}</b> 伤害，剩余 ${Math.max(0, Math.ceil(e.hp))}。`);
    if (e.hp <= 0) kill(e);
    return dmg;
  }

  function kill(e) {
    e.hp = 0;
    const crushed = isCrush(P.lv, e.lv, e.boss || e.elite || e.rare);
    // 金币不是必掉（鸡只有 60%），掉了才按碾压打折
    const gotGold = Math.random() < (e.goldP == null ? 1 : e.goldP);
    const goldGain = !gotGold ? 0 : crushed ? Math.max(1, Math.round(e.gold * CRUSH.goldMul)) : e.gold;
    // 等级差经验（R2.2c）：比怪高 4 级起没经验，防止靠刷鸡升级
    const expGain = Math.round(e.exp * DL.Core.expMulByGap(P.lv - e.lv));
    const noExp = expGain === 0 && e.exp > 0;
    P.exp += expGain;
    P.gold += goldGain;
    P.kills++;
    log(`${e.name}倒下了，+${expGain} 经验、${goldGain > 0 ? `+${goldGain} 金币` : '没掉金币'}。${noExp ? '（等级差太大，没经验了）' : ''}`, 'good');
    if (Math.random() < (crushed ? DROP.potionCrush : DROP.potion)) { P.potions++; log('捡到 1 瓶药水。', 'good'); }

    // 装备掉落：普通按概率；精英保底 B；稀有保底 A；BOSS 保底 B+A
    // 碾压时只衰减"额外掉落"，保底照旧。掉出来的进地面袋，不直接进包。
    const dropMul = crushed ? CRUSH.dropMul : 1;
    const drops = [];
    const push = (eq) => { if (eq) drops.push(eq); };
    if (e.boss) {
      push(rollDrop(e, 'blue'));
      push(rollDrop(e, 'yellow'));
      if (Math.random() < (DROP.boss.s) * dropMul) push(rollDrop(e, 'orange'));
    } else if (e.rare) {
      push(rollDrop(e, 'yellow'));                                   // 保底 A
      if (Math.random() < DROP.rare.s * dropMul) push(rollDrop(e, 'orange'));
    } else if (e.elite) {
      push(rollDrop(e, 'blue'));                                     // 保底 B
      if (Math.random() < DROP.elite.a * dropMul) push(rollDrop(e, 'yellow'));
      if (Math.random() < DROP.elite.s * dropMul) push(rollDrop(e, 'orange'));
    } else {
      const N = DROP.normal;
      const r = Math.random();
      const s = N.s * dropMul, a = s + N.a * dropMul, b = a + N.b * dropMul, c = b + N.c * dropMul;
      if (r < s) push(rollDrop(e, 'orange'));
      else if (r < a) push(rollDrop(e, 'yellow'));
      else if (r < b) push(rollDrop(e, 'blue'));
      else if (r < c) push(rollDrop(e));
    }
    if (drops.length) dropBag(e.x, e.y, drops);
    while (P.exp >= needExp()) {
      P.exp -= needExp();
      P.lv++;
      P.hp = maxHp();
      P.mp = maxMp();
      leveledUp = true;
      log(`升级！现在是 Lv.${P.lv}，HP/MP 已回满。`, 'good');
    }
    tryDropSkill(e);
    if (e.boss) win();
  }

  // 技能书：精英 40% 掉一本、首领必掉一本；已学完就不掉
  function tryDropSkill(e) {
    if (!e.boss && !e.elite) return;
    if (e.elite && Math.random() > 0.4) return;
    const canHalf = !P.skills.half;
    const canFire = !P.skills.fire;
    if (!canHalf && !canFire) return;
    const halfFirst = canHalf && (!canFire || Math.random() < 0.6);
    if (halfFirst) {
      P.skills.half = true;
      log('拾得《半月弯刀》技能书，已学会！按 1 释放。', 'good');
    } else if (canFire) {
      P.skills.fire = true;
      log('拾得《烈火剑法》技能书，已学会！按 2 释放。', 'good');
    }
    syncHud();
  }

  // 生成一件掉落（还没落地）；ilvl 取怪等级，精英 +5、首领 +10
  function rollDrop(e, forceRarity) {
    const ilvl = clamp((e.lv || 1) + (e.boss ? 10 : e.elite ? 5 : 0), 1, 30);
    const slot = Math.random() < 0.5 ? 'weapon' : 'armor';
    return makeEquip(slot, ilvl, forceRarity || rollRarity(ilvl));
  }

  // 调试/兼容：直接掉进背包（正常击杀走地面袋）
  function dropEquip(e, forceRarity) {
    const eq = rollDrop(e, forceRarity);
    giveEquip(eq);
    return eq;
  }

  /* ---------------- 地面掉落袋 ---------------- */

  // 把掉落物放在地上；同格已有袋子就合并
  function dropBag(x, y, items, opts = {}) {
    if (!items || !items.length) return null;
    const exist = bagAt(x, y);
    if (exist) {
      exist.items.push(...items);
      if (opts.relic) exist.relic = true;
      return exist;
    }
    const bag = { x, y, items: items.slice(), relic: !!opts.relic };
    activeBags.push(bag);
    while (activeBags.length > 40) {
      activeBags.shift();
      log('地上旧的袋子散落了。');
    }
    return bag;
  }

  /* ---------------- 拾取清单 ---------------- */
  let pickBag = null;

  function pickupBag(bag) {
    if (!bag || !bag.items.length) return;
    pickBag = bag;
    renderPick();
    el.lootPick.hidden = false;
    log(`打开地上的${bag.relic ? '遗物袋' : '钱袋'}：${bag.items.length} 件装备，挑一挑。`, 'good');
    syncHud();
    save();
  }

  function closePick() {
    el.lootPick.hidden = true;
    pickBag = null;
    syncHud();
    save();
  }

  // 袋子空了就从地上消失
  function removeBagIfEmpty(bag) {
    if (bag && !bag.items.length) {
      const i = activeBags.indexOf(bag);
      if (i >= 0) activeBags.splice(i, 1);
    }
  }

  function rarTag(eq) {
    const r = RARITY[eq.rarity] || RARITY.white;
    return `<span class="rarity-tag ${eq.rarity}">${r.letter} ${r.name}</span>`;
  }

  function pickRow(eq, i) {
    const r = RARITY[eq.rarity] || RARITY.white;
    const cur = eq.slot === 'weapon' ? P.weapon : P.armor;
    const up = eqScore(eq) > eqScore(cur) + 0.001;
    return `<div class="bag-item rarity-${eq.rarity}">
      <span class="rbadge ${eq.rarity}">${r.letter}</span>
      <div class="bag-main">
        <div class="name rarity-${eq.rarity}">${eq.name} <span class="ilvl">Lv.${eq.ilvl || 1}</span> ${rarTag(eq)}${up ? ' <span class="up">↑ 比身上好</span>' : ''}</div>
        <div class="stats">${eqStatText(eq)} · ${affixSlot()}</div>
      </div>
      <button data-pick="${i}">捡起</button>
    </div>`;
  }

  function renderPick() {
    if (!el.pickList) return;
    if (!pickBag || !pickBag.items.length) {
      el.pickList.innerHTML = '<p class="menu-help">袋子空了。</p>';
      return;
    }
    el.pickTitle.textContent = pickBag.relic ? '你的遗物' : '地上的钱袋';
    el.pickHint.textContent = pickBag.relic
      ? '死在这里时掉的装备。捡回来它就回到你身上。'
      : '品级和属性都看得见，看中了再拿；不拿的话袋子继续留在原地。';
    el.pickList.innerHTML = pickBag.items.map((eq, i) => pickRow(eq, i)).join('');
  }

  function takeFromBag(i) {
    if (!pickBag) return;
    const eq = pickBag.items[i];
    if (!eq) return;
    pickBag.items.splice(i, 1);
    addToBag(eq);
    removeBagIfEmpty(pickBag);
    if (!pickBag.items.length) closePick();
    else renderPick();
    syncHud();
  }

  function takeAllFromBag() {
    if (!pickBag) return;
    const items = pickBag.items.splice(0);
    for (const eq of items) addToBag(eq);
    removeBagIfEmpty(pickBag);
    closePick();
  }

  function enemiesTurn() {
    if (over) return;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = dist(e, P);
      const action = DL.Combat.decide(e, P.lv, d);
      if (action === 'leash') { e.aggroOn = false; continue; }
      if (action === 'idle') continue;
      if (action === 'giveup') { e.aggroOn = false; continue; }   // 被动怪追 3 格就放弃
      if (action === 'attack') {
        // 新手兜底：鸡啄不动你，新手可以安全刷鸡续命，不用一直回城
        if (e.harmless) {
          addFloater(P.x, P.y - 0.4, '无伤', '#8d99b5');
          continue;
        }
        if (isCrush(P.lv, e.lv, e.boss || e.elite || e.rare)) continue;   // 碾压：只有普通怪打不动你
        const dr = defRange(P);
        const dmg = DL.Combat.enemyDamage(e.atk, dr.min, dr.max, maxHp(), e.boss);
        P.hp -= dmg;
        S.onHit(P);                                                   // R5.8：眩晕受击解除
        addFloater(P.x, P.y - 0.4, `-${dmg}`, '#ff6b6b');
        hurtFlash();
        log(`${e.name}攻击你，<span class="bad">-${dmg} HP</span>。`, 'bad');
        if (e.boss) bossTrick(e);                                     // R5.2 / R5.8
        if (P.hp <= 0) { die(); return; }
      } else if (action === 'chase') {
        e.aggroOn = true;
        stepToward(e);
      }
    }
  }

  // BOSS 出招：相邻攻击时按概率附带眩晕 / 麻痹（数值见 data.js 的 AI 表）
  function bossTrick(e) {
    if (over) return;
    const stunP = AI.bossStunP || 0;
    const paraP = AI.bossParalyzeP || 0;
    const r = Math.random();
    if (r < stunP) {
      S.apply(P, 'stun', { turn, turns: 1 });
      addFloater(P.x, P.y - 0.8, '💫', '#ffd54a');
      log(`${e.name}一记横扫把你打得眼冒金星，这一回合动不了。`, 'bad');
    } else if (r < stunP + paraP) {
      const t = randi(AI.bossParalyzeMin || 1, AI.bossParalyzeMax || 2);
      S.apply(P, 'paralyze', { turn, turns: t });
      addFloater(P.x, P.y - 0.8, '⚡', '#ffd54a');
      log(`${e.name}喷出的腐气让你浑身发麻（⚡${t} 回合）。`, 'bad');
    }
  }

  // 回合末状态结算（R5.14：先毒后灼烧，玩家和怪都算）
  function tickStatuses() {
    if (over) return;
    const pr = S.tick(P, turn);
    for (const h of pr.hits) {
      addFloater(P.x, P.y - 0.4, `-${h.dmg}`, h.key === 'poison' ? '#9ad06a' : '#ff9a5a');
    }
    if (pr.dead) { log('你被持续伤害拖垮了。', 'bad'); die(); return; }
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const r = S.tick(e, turn);
      for (const h of r.hits) addFloater(e.x, e.y - 0.4, `-${h.dmg}`, h.key === 'poison' ? '#9ad06a' : '#ff9a5a');
      for (const k of r.expired) {
        if (k === 'burn') log(`${e.name}身上的火熄了。`);
      }
      if (e.hp <= 0) kill(e);
      if (over) return;
    }
  }

  function stepToward(e) {
    const next = DL.Combat.nextStep(e.x, e.y, P.x, P.y,
      (x, y) => isWall(x, y) || enemyAt(x, y) || (x === P.x && y === P.y));
    if (next) { e.x = next.x; e.y = next.y; }
  }

  function die() {
    over = true;
    P.hp = 0;
    P.exp = Math.floor(P.exp * (1 - (DEATH.expLoss || 0.05)));
    // R3.19：按概率掉一件身上穿的装备，留在倒下的地方；回去能捡回来
    let lost = null;
    const worn = ['weapon', 'armor'].filter((s) => P[s]);
    if (currentRoom && worn.length && Math.random() < (DEATH.dropP || 0)) {
      const slot = worn[randi(0, worn.length - 1)];
      lost = P[slot];
      P[slot] = null;
      dropBag(P.x, P.y, [lost], { relic: true });
    }
    S.clear(P);
    save();
    const r = lost ? RARITY[lost.rarity] : null;
    syncHud();
    showOver('倒下', '你被稻草垛里的东西拖了进去',
      [`Lv.${P.lv} · 经验 -${Math.round((DEATH.expLoss || 0.05) * 100)}%，等级不掉。`]
        .concat(lost ? [`${lost.name}【${r.letter} ${r.name}】掉在了原地，回那个房间还能捡回来。`] : [])
        .concat(['回村可以再来。'])
        .join('<br>'),
      '回村复活', revive);
  }

  function revive() {
    over = false;
    leveledUp = false;
    if (currentRoom) leaveRoom();
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
    if (currentRoom) leaveRoom();
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
    el.overS.innerHTML = sub;
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
    tickStatuses();                 // R5.14：回合末结算毒 / 灼烧
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

  // 主城 + 房间制：不再按 x 分区域；保留空函数避免改动调用点
  function checkZone() { }

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
    if (!S.canAct(P)) { blockAction(); return turn !== t; }   // 被控：这一回合什么也做不了（含自动喝药）
    // 自动喝药优先：血量低于阈值、有药、不在 CD
    if (P.autoPot > 0 && P.potions > 0 && P.potionCd <= 0 &&
      P.hp <= maxHp() * P.autoPot / 100) {
      if (drink()) { after(); return true; }
    }
    const target = adjacentTarget();
    if (target) {
      faceTo(target.x, target.y);
      const halfHits = halfMoonTargets().length;
      const canHalf = P.skills.half && P.cd.half <= 0 && P.mp >= 6;
      const canFire = P.skills.fire && P.cd.fire <= 0 && P.mp >= 12;
      // 自动战斗优先级：半月打 2 只 > 烈火 > 半月打 1 只 > 普攻（未学的技能跳过）
      if (canHalf && halfHits >= 2) act('half');
      else if (canFire) act('fire');
      else if (canHalf && halfHits >= 1) act('half');
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

  // 恢复自动回合（pauseAuto 之后必须调用，否则自动攻击永久停摆）
  function resumeAuto() {
    autoDisabled = false;
    scheduleIdle();
  }

  function facingVec() {
    return DL.Combat.dirVec(P.dir);
  }

  function faceTo(x, y) {
    const dx = x - P.x, dy = y - P.y;
    if (Math.abs(dx) >= Math.abs(dy)) P.dir = dx < 0 ? 'l' : 'r';
    else P.dir = dy < 0 ? 'u' : 'd';
  }

  function adjacentTarget() {
    return DL.Combat.adjacentTarget(enemies, P.x, P.y, P.dir);
  }

  function attack(mult, tag) {
    const t = adjacentTarget();
    if (!t) { log('身边没有敌人。'); return false; }
    strike(t, mult, tag);
    return true;
  }

  // 半月：朝向前方的九宫格半边 5 格（规则见 combat.js）
  function halfMoonCells() {
    return DL.Combat.halfMoonCells(P.x, P.y, P.dir);
  }

  function halfMoonTargets() {
    return DL.Combat.targetsAt(enemies, halfMoonCells());
  }

  function halfMoon() {
    if (!P.skills.half) { log('还没学会半月弯刀——打精英或首领掉技能书。', 'bad'); return false; }
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
    if (!P.skills.fire) { log('还没学会烈火剑法——打精英或首领掉技能书。', 'bad'); return false; }
    if (P.cd.fire > 0) { log(`烈火还在冷却（${P.cd.fire} 回合）。`); return false; }
    if (P.mp < 12) { log('MP 不足（需要 12）。', 'bad'); return false; }
    const t = adjacentTarget();
    if (!t) { log('身边没有敌人。'); return false; }
    P.mp -= 12;
    P.cd.fire = 3;
    strike(t, 2.2, '烈火');
    // R4.1：烈火剑法 = 单体 ×2.2 + 灼烧 3 回合（R3.12 灼烧 = 攻击 ×15% × 层数）
    if (t.hp > 0) {
      const st = S.apply(t, 'burn', { turn, dmg: S.damageFrom('burn', atkMean()) });
      if (st) log(`${t.name}被点燃了（🔥${st.stacks}，剩 ${st.left} 回合）。`, 'good');
    }
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

  // 眩晕 / 麻痹：这一回合什么也做不了（R5.2 / R5.8）。能行动返回 true。
  function blockAction() {
    if (S.canAct(P)) return true;
    const st = P.statuses || {};
    log(st.stun ? '你眼冒金星，动弹不得。' : '你被麻痹了，动弹不得。', 'bad');
    addFloater(P.x, P.y - 0.7, st.stun ? '💫' : '⚡', '#ffd54a');
    after();
    return false;
  }

  function act(kind) {
    if (over || uiOpen()) return;
    stopWalk();
    if (!blockAction()) return;
    if (kind === 'attack') { if (attack(1.2, '攻击')) after(); }
    else if (kind === 'half') { if (halfMoon()) after(); }
    else if (kind === 'fire') { if (fireSword()) after(); }
    else if (kind === 'potion') { if (drink()) after(); }
    else if (kind === 'wait') { log('你按兵不动。'); after(); }
  }

  /* ---------------- 传送门确认 ---------------- */
  let pendingDoor = null;
  let doorReturnPos = null;

  function promptDoor(d, ox, oy) {
    pendingDoor = d;
    doorReturnPos = { x: ox, y: oy };
    const spec = roomSpec(d.room) || {};
    const names = (spec.pool || [])
      .map((id) => (MON.find((m) => m.id === id) || {}).name)
      .filter(Boolean).join('、');
    el.doorTitle.textContent = `进入「${d.name}」？`;
    const tail = spec.boss
      ? `清空后首领 ${spec.cd} 分钟内不再刷新。`
      : '每次进来都会重新刷满。';
    el.doorDesc.textContent = `Lv.${spec.lvMin ?? d.lv}–${spec.lvMax ?? ''}　怪：${names || '杂兵'}${spec.boss ? ' + 首领' : ''}。${tail}`;
    el.doorConfirm.hidden = false;
    pauseAuto();
  }

  function confirmDoor() {
    if (!pendingDoor) return;
    const d = pendingDoor;
    pendingDoor = null;
    doorReturnPos = null;
    el.doorConfirm.hidden = true;
    enterRoom(d.room);
    centerCam();
    syncHud();
    save();
    resumeAuto();
  }

  function cancelDoor() {
    if (!pendingDoor) return;
    pendingDoor = null;
    if (doorReturnPos) { P.x = doorReturnPos.x; P.y = doorReturnPos.y; }
    doorReturnPos = null;
    el.doorConfirm.hidden = true;
    resumeAuto();
  }

  function move(dx, dy, fromWalk = false) {
    if (over) return false;
    if (!S.canAct(P)) {                 // 麻痹/眩晕：走不动
      if (!fromWalk) blockAction();
      return false;
    }
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
    const ox = P.x, oy = P.y;
    P.x = nx;
    P.y = ny;
    if (map[ny][nx] === 2) {
      if (currentRoom) {
        leaveRoom();
      } else {
        const d = doors.find((x) => x.x === nx && x.y === ny);
        if (d) {
          promptDoor(d, ox, oy);
          if (fromWalk) stopWalk();
          return true;
        }
        log('这扇门还没接上。', 'bad');
      }
      centerCam();
      syncHud();
      save();
      scheduleIdle();
      if (fromWalk) stopWalk();
      return true;
    }
    // 走到袋子上就捡（拾取后弹清单）
    const bag = bagAt(nx, ny);
    if (bag) pickupBag(bag);
    after();
    return true;
  }

  function retreat() {
    if (over || uiOpen()) return;
    if (!blockAction()) return;
    const foes = combatTargets();
    if (!foes.length) { log('没有敌人，不用撤。'); return; }
    const nearest = foes.slice().sort((a, b) => dist(a, P) - dist(b, P))[0];
    const dr = defRange(P);
    const dmg = DL.Combat.enemyDamage(nearest.atk, dr.min, dr.max, maxHp(), nearest.boss);
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
    return DL.World.bfs(map, sx, sy, tx, ty, enemyAt);
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
    if (!S.canAct(P)) { blockAction(); return; }   // 被控：点哪儿都只消耗一回合
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
    // 脚下有袋子：点一下就重新打开清单
    if (P.x === wx && P.y === wy) {
      const here = bagAt(wx, wy);
      if (here) { pickupBag(here); return; }
    }
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
      giveEquip(makeEquip('weapon', 3, 'white', { atkMin: 3, atkMax: 3, defMin: 0, defMax: 0, hp: 0 }));
    } else if (kind === 'armor') {
      giveEquip(makeEquip('armor', 3, 'white', { atkMin: 0, atkMax: 0, defMin: 2, defMax: 2, hp: 15 }));
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
    el.lootPick.hidden = true;
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
    el.doorYes.addEventListener('click', confirmDoor);
    el.doorNo.addEventListener('click', cancelDoor);
    el.pickAll.addEventListener('click', takeAllFromBag);
    el.pickClose.addEventListener('click', closePick);
    el.pickList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) takeFromBag(Number(b.dataset.pick));
    });
    el.introBtn.addEventListener('click', () => {
      el.intro.hidden = true;
      save();
      log('鸡鸣村外：先打鸡，学会走位；打不动就换武器——破防靠装备。', 'good');
    });
    el.overAlt.onclick = restart;
  }

  /* ---------------- 渲染 ---------------- */
  /* ---------------- 渲染分层 ----------------
     第 0 层：背景色
     第 1 层：地图（地面 / 墙 / 门）
     1.5 层：地面特效（半月扇形）
     第 2 层：实体（商人 / 怪 / 玩家）
     2.5 层：上层特效（飘字）
     第 3 层：UI（暗角 + 小地图；DOM HUD 独立）
  */
  // 相机夹取：地图比视野大时夹在 [0, size-view]；比视野小时允许负值，让玩家保持居中
  function camTarget(v, mapSize, viewSize) {
    const min = Math.min(0, mapSize - viewSize);
    const max = Math.max(0, mapSize - viewSize);
    return clamp(v, min, max);
  }

  function updateCamera() {
    const mw = map[0].length * TILE;
    const mh = map.length * TILE;
    const tx = camTarget(P.x * TILE + TILE / 2 - VIEW_W / 2, mw, VIEW_W);
    const ty = camTarget(P.y * TILE + TILE / 2 - VIEW_H / 2, mh, VIEW_H);
    cam.x += (tx - cam.x) * 0.18;
    cam.y += (ty - cam.y) * 0.18;
  }

  // 第 1 层：地图
  function drawMap() {
    const x0 = Math.floor(cam.x / TILE) - 1;
    const y0 = Math.floor(cam.y / TILE) - 1;
    const x1 = x0 + Math.ceil(VIEW_W / TILE) + 3;
    const y1 = y0 + Math.ceil(VIEW_H / TILE) + 3;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= map[0].length || y >= map.length) continue;
        const t = map[y][x];
        // 画面全亮；探索记录只更新玩家周围 8 格，留给小地图做迷雾
        if (Math.max(Math.abs(x - P.x), Math.abs(y - P.y)) <= 8) seen.add(key(x, y));
        // 取整 + 整格填充：保证每格都是同样大小的正方形
        const sx = Math.round(x * TILE - cam.x);
        const sy = Math.round(y * TILE - cam.y);
        if (t === 1) ctx.fillStyle = '#151f33';
        else if (t === 2) ctx.fillStyle = '#2a2410';
        else ctx.fillStyle = inCave ? '#1b1a2e' : '#232a3d';
        ctx.fillRect(sx, sy, TILE, TILE);
        // 极淡网格线，让"正方形"看得出来
        ctx.strokeStyle = 'rgba(255,255,255,0.035)';
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
        // 玩家脚下这格亮起来
        if (x === P.x && y === P.y) {
          ctx.fillStyle = 'rgba(120, 210, 255, 0.20)';
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.strokeStyle = 'rgba(120, 210, 255, 0.6)';
          ctx.strokeRect(sx + 1.5, sy + 1.5, TILE - 3, TILE - 3);
        }
      }
    }
  }

  // 传送门 / 出口：光晕 + 大图标 + 名称
  function drawPortal(x, y, icon, color, label) {
    if (!visible(x, y)) return;
    const sx = Math.round(x * TILE - cam.x + TILE / 2);
    const sy = Math.round(y * TILE - cam.y + TILE / 2);
    const g = ctx.createRadialGradient(sx, sy, 3, sx, sy, TILE * 1.1);
    g.addColorStop(0, color + '66');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, TILE * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '30px system-ui';
    ctx.fillText(icon, sx, sy + 10);
    if (label) {
      ctx.font = 'bold 11px system-ui';
      ctx.fillStyle = color;
      ctx.fillText(label, sx, sy - 14);
    }
  }

  // 1.5 层：地面特效（在实体下面）
  function drawGroundFx() {
    if (currentRoom) {
      drawPortal(back.x, back.y, '🕳', '#8ab4ff', '出口');
    } else {
      for (const d of doors) drawPortal(d.x, d.y, '🚪', '#ffd166', d.name);
    }
    if (halfFlash > 0) {
      halfFlash = Math.max(0, halfFlash - 0.06);
      ctx.fillStyle = `rgba(255, 209, 102, ${0.28 * halfFlash})`;
      for (const [hx, hy] of halfFlashCells) {
        ctx.fillRect(Math.round(hx * TILE - cam.x), Math.round(hy * TILE - cam.y), TILE, TILE);
      }
    }
  }

  // 1.6 层：地上的掉落袋（颜色/字母 = 袋里最好的品级，品级本来就该直接看得见）
  const RAR_ORDER = ['white', 'blue', 'yellow', 'orange'];
  function bestRarityOf(items) {
    let best = 'white';
    for (const eq of items) {
      if (RAR_ORDER.indexOf(eq.rarity) > RAR_ORDER.indexOf(best)) best = eq.rarity;
    }
    return RARITY[best] || RARITY.white;
  }

  function drawBags() {
    if (!activeBags.length) return;
    const t = Date.now() / 380;
    for (const b of activeBags) {
      const sx = Math.round(b.x * TILE - cam.x + TILE / 2);
      const sy = Math.round(b.y * TILE - cam.y + TILE / 2);
      if (sx < -TILE || sy < -TILE || sx > VIEW_W + TILE || sy > VIEW_H + TILE) continue;
      const rar = b.relic ? RARITY.yellow : bestRarityOf(b.items);
      const col = rar.color;
      const pulse = 0.5 + 0.3 * Math.sin(t + b.x + b.y);
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, TILE * 0.95);
      g.addColorStop(0, col + 'cc');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = pulse;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, TILE * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = '22px system-ui';
      ctx.fillText(b.relic ? '🎒' : '💰', sx, sy + 8);
      // 品级字母：地上就能看见
      ctx.font = 'bold 11px system-ui';
      const lw = ctx.measureText ? ctx.measureText(rar.letter).width : 8;
      ctx.fillStyle = 'rgba(6, 10, 18, 0.8)';
      ctx.fillRect(sx - lw / 2 - 3, sy - 21, lw + 6, 12);
      ctx.fillStyle = col;
      ctx.fillText(rar.letter, sx, sy - 12);
      if (b.items.length > 1) {
        ctx.font = 'bold 10px system-ui';
        ctx.fillStyle = col;
        ctx.fillText(`×${b.items.length}`, sx + 15, sy + 2);
      }
    }
  }

  // 第 2 层：实体
  function drawEntities() {
    // 商人
    if (npc) {
      const sx = npc.x * TILE - cam.x + TILE / 2;
      const sy = npc.y * TILE - cam.y + TILE / 2;
      ctx.font = '30px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🧑‍🌾', sx, sy + 10);
      ctx.font = 'bold 10px system-ui';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('商人', sx, sy - 18);
    }

    // 敌人
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (!visible(e.x, e.y)) continue;
      const sx = e.x * TILE - cam.x + TILE / 2;
      const sy = e.y * TILE - cam.y + TILE / 2;
      const grade = GRADE[e.grade] || GRADE.normal;
      ctx.textAlign = 'center';
      ctx.font = `${e.boss ? 40 : e.elite ? 34 : 30}px system-ui`;
      // 精英/稀有：脚下画一圈，远处也能认出来
      if (e.elite || e.rare || e.boss) {
        ctx.strokeStyle = grade.color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, TILE * 0.56, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillText(e.glyph, sx, sy + 10);
      // 品级染色 + 深色底衬，贴在一起时也读得清
      const label = `Lv.${e.lv} ${e.name}`;
      ctx.font = 'bold 10px system-ui';
      const lw = (ctx.measureText ? ctx.measureText(label).width : 40) || 40;
      const ly = sy - 22 - (((e.x * 7 + e.y * 3) % 2) * 8);
      ctx.fillStyle = 'rgba(6, 10, 18, 0.72)';
      ctx.fillRect(sx - lw / 2 - 3, ly - 9, lw + 6, 12);
      ctx.fillStyle = grade.color;
      ctx.fillText(label, sx, ly);
      const w = 28;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(sx - w / 2, sy - 18, w, 4);
      ctx.fillStyle = '#e05a5a';
      ctx.fillRect(sx - w / 2, sy - 18, w * clamp(e.hp / e.maxHp, 0, 1), 4);
      // 状态图标（R15.2 符号 + 剩余回合）
      const stTxt = S.text(e);
      if (stTxt) {
        ctx.font = 'bold 10px system-ui';
        ctx.fillStyle = '#ffb066';
        ctx.fillText(stTxt, sx, sy - 34);
      }
    }

    // 玩家
    const px = P.x * TILE - cam.x + TILE / 2;
    const py = P.y * TILE - cam.y + TILE / 2;
    ctx.font = '36px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🧙', px, py + 12);
    const [fx, fy] = facingVec();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(px + fx * 18, py + fy * 18, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2.5 层：上层特效（在实体上面）
  function drawFloaters() {
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
  }

  // 第 3 层：暗角
  function drawVignette() {
    const px = P.x * TILE - cam.x + TILE / 2;
    const py = P.y * TILE - cam.y + TILE / 2;
    const g = ctx.createRadialGradient(px, py, 120, px, py, 520);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function draw() {
    if (!map.length) return;
    updateCamera();
    ctx.fillStyle = '#070a11';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawMap();        // 1
    drawGroundFx();   // 1.5
    drawBags();       // 1.6
    drawEntities();   // 2
    drawFloaters();   // 2.5
    drawVignette();   // 3
    drawMinimap();    // 3
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
    for (const b of activeBags) {
      ctx.fillStyle = (b.relic ? RARITY.yellow : bestRarityOf(b.items)).color;
      ctx.fillRect(ox + b.x * s - 1.5, oy + b.y * s - 1.5, 3, 3);
    }
    for (const e of enemies) {
      if (e.hp <= 0 || !visible(e.x, e.y)) continue;
      ctx.fillStyle = (GRADE[e.grade] || GRADE.normal).color;
      ctx.fillRect(ox + e.x * s - 1, oy + e.y * s - 1, 2.5, 2.5);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + P.x * s - 1, oy + P.y * s - 1, 3, 3);
    ctx.restore();
  }

  /* ---------------- 启动 ---------------- */
  const loaded = load();
  if (!worldSeed) worldSeed = randomSeed();
  genHub();
  if (!loaded) {
    P.hp = maxHp();
    P.mp = maxMp();
    el.intro.hidden = false;
  } else {
    P.hp = Math.max(1, Math.min(P.hp, maxHp()));
    P.mp = Math.min(P.mp, maxMp());
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);
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
  // 主城缓慢回血：每秒 1% 最大 HP
  function hubRegen() {
    if (currentRoom || over || P.hp <= 0) return false;
    if (P.hp >= maxHp()) return false;
    P.hp = Math.min(maxHp(), P.hp + maxHp() * 0.01);
    return true;
  }

  clockTimer = setInterval(() => {
    if (document.hidden) return;
    clock = (clock + 1) % 1440;
    updateClockLabel();
    if (hubRegen()) syncHud();
  }, 1000);
  save();

  if (location.search.includes('debug')) {
    window.__dl = {
      P, act, move, attack, halfMoon, fireSword, drink, buy,
      revive, continueAfterWin, die, win, dropEquip, makeEquip, giveEquip,
      makeEnemy, rollGrade, isCrush,
      hubRegen,
      addToBag, equipFromBag, sellFromBag, sellPrice, openChar,
      enemies: () => enemies, map: () => map, npc: () => npc, door: () => door,
      genHub, enterRoom, leaveRoom, bfs, save, load, spawnWild,
      currentRoom: () => currentRoom,
      cam: () => ({ x: cam.x, y: cam.y }),
      camTarget,
      doors: () => doors,
      roomSpec,
      roomClearedAt: () => ({ ...roomClearedAt }),
      zoneLevel, zoneName, zoneRange,
      setSeed: (n) => { worldSeed = n >>> 0; },
      seed: () => worldSeed,
      retreat, inCombat, combatTargets,
      Status: S,
      tickStatuses, enemiesTurn, bossTrick,
      statusText: (unit) => S.text(unit || P),
      after,
      bags: () => activeBags,
      groundBags: () => groundBags,
      bagAt, dropBag, pickupBag, takeFromBag, takeAllFromBag, closePick, rollDrop,
      eqText: (eq) => eqStatText(eq),
      pickOpen: () => !el.lootPick.hidden,
      pickItems: () => (pickBag ? pickBag.items.slice() : []),
      maxHp: () => maxHp(), maxMp: () => maxMp(),
      idleMs: () => IDLE_MS,
      clock: () => clock,
      clockText,
      tick: autoStep, pauseAuto, resumeAuto,
      autoEnabled: () => !autoDisabled,
      hideIntro: () => { el.intro.hidden = true; },
      setPos: (x, y) => { P.x = x; P.y = y; },
      setHp: (v) => { P.hp = v; },
      setMp: (v) => { P.mp = v; },
      setGold: (v) => { P.gold = v; },
      rest: () => { P.hp = maxHp(); P.mp = maxMp(); },
      state: () => ({
        lv: P.lv, exp: P.exp, hp: P.hp, mp: P.mp, gold: P.gold, potions: P.potions,
        turn, over, inCave, room: currentRoom, weapon: P.weapon, armor: P.armor,
        cd: { ...P.cd }, skills: { ...P.skills },
        enemyCount: enemies.filter((e) => e.hp > 0).length,
      }),
    };
  }
})();
