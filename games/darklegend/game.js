/* 豆豆暗黑传奇 · M1.1
   本轮改动（对应评审 P0）：
   1. 所有行动（含移动）推进回合；攻击会激怒怪物，怪物会追击、反击
   2. 点击地面/怪物自动寻路（BFS），鼠标与触摸通用
   3. MP 每回合回复 + 技能 CD，技能按钮显示冷却
   4. 空格/交谈与 NPC 对话（商人开商店）；技能栏挂机（E）
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
    'lv', 'hpFill', 'hpText', 'mpFill', 'mpText', 'expFill', 'expText', 'gold', 'gear', 'tips', 'log',
    'btnAtk', 'btnHalf', 'btnFire', 'btnPotion', 'btnMpPotion', 'btnFarm', 'btnInteract', 'btnRetreat', 'btnMenu',
    'halfCd', 'fireCd', 'potionCount', 'potionCd', 'mpPotionCount', 'mpPotionCd',
    'logWrap', 'logToggle', 'dpad', 'stickBase', 'stickKnob',
    'over', 'overK', 'overT', 'overS', 'overBtn', 'overAlt',
    'shop', 'shopGold', 'shopClose', 'shopStock', 'shopBag',
    'menu', 'menuClose', 'menuRetreat', 'menuRestart',
    'btnChar', 'char', 'charLv', 'charExpFill', 'charExpText', 'charPower', 'charGold',
    'charTabs', 'paneGear', 'paneBag',
    'charStats', 'charSlots', 'bagCount', 'bagList', 'charClose', 'autoPot', 'autoMp', 'potStock',
    'eqTip', 'eqTipName', 'eqTipStats', 'eqTipActs', 'eqTipClose',
    'loot', 'lootName', 'lootStats', 'lootAffix',
    'intro', 'introBtn', 'seedText',
    'doorConfirm', 'doorTitle', 'doorDesc', 'doorYes', 'doorNo',
    'pStatus',
    'lootPick', 'pickTitle', 'pickHint', 'pickList', 'pickAll', 'pickClose',
  ].forEach((id) => { el[id] = document.getElementById(id); });

  const {
    rand, randi, clamp, roll, key, dist, mulberry32, randomSeed,
    eqAtkMin, eqAtkMax, eqDefMin, eqDefMax, eqAtk, eqDef, eqHp, eqScore,
    sumEqAtk, sumEqDef,
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
  const EQUIP_SLOTS = D.EQUIP_SLOTS || [
    { id: 'weapon', name: '武器', group: 'weapon', unlock: 0, ico: '⚔' },
    { id: 'armor', name: '护甲', group: 'armor', unlock: 0, ico: '🛡' },
  ];
  const EQUIP_BASES = D.EQUIP_BASES || {};
  const EQUIP_NAMES = D.EQUIP_NAMES || {};
  const EQUIP_STAT_MUL = D.EQUIP_STAT_MUL || {};
  const DROP_SLOT_WEIGHT = D.DROP_SLOT_WEIGHT || { weapon: 1, jewelry: 2, armor: 3 };
  const WEAPON_NAMES = D.WEAPON_NAMES;
  const ARMOR_NAMES = D.ARMOR_NAMES;
  const SHOP = D.SHOP;
  const SLOT_IDS = EQUIP_SLOTS.map((s) => s.id);
  const slotMeta = (id) => EQUIP_SLOTS.find((s) => s.id === id) || { id, name: id, group: 'armor', unlock: 0, ico: '?' };
  const slotUnlocked = (id, lv) => (lv != null ? lv : P.lv) >= (slotMeta(id).unlock || 0);
  const ZONE_FLOOR = D.ZONE_FLOOR;
  const FLOAT_P = D.FLOAT_P;
  const FLOAT_MIN = D.FLOAT_MIN;
  const FLOAT_MAX = D.FLOAT_MAX;
  const DROP = D.DROP || {};
  const DEATH = D.DEATH || { dropP: 0, expLoss: 0.05 };
  const AUTO_FARM = D.AUTO_FARM || { autoLootMax: 'blue' };
  const RESPAWN = D.RESPAWN || {};
  const POTIONS = D.POTIONS || {
    cd: 3,
    tiers: [
      { id: 'low', name: '初级', amount: 50 },
      { id: 'mid', name: '中级', amount: 300 },
      { id: 'high', name: '高级', amount: 1000 },
    ],
    redMul: 1,
    blueMul: 2,
  };
  const POT_TIERS = POTIONS.tiers;
  const RAR_RANK = { white: 0, blue: 1, yellow: 2, orange: 3 };

  function emptyPots() {
    const o = { red: {}, blue: {} };
    for (const t of POT_TIERS) { o.red[t.id] = 0; o.blue[t.id] = 0; }
    return o;
  }
  function defaultPots() {
    const o = emptyPots();
    o.red.low = 3;
    o.blue.low = 3;
    return o;
  }
  // 旧档 potions:number → 初级红；新档 pots:{red,blue}
  function normalizePots(raw) {
    const o = emptyPots();
    if (raw && typeof raw === 'object' && raw.red) {
      for (const t of POT_TIERS) {
        o.red[t.id] = Math.max(0, (raw.red[t.id] | 0));
        o.blue[t.id] = Math.max(0, ((raw.blue && raw.blue[t.id]) | 0));
      }
      return o;
    }
    if (typeof raw === 'number') o.red.low = Math.max(0, raw);
    else { o.red.low = 3; o.blue.low = 3; }
    return o;
  }
  function potTier(id) { return POT_TIERS.find((t) => t.id === id) || POT_TIERS[0]; }
  function potPrice(kind, tierId) {
    const amt = potTier(tierId).amount;
    return Math.round(amt * (kind === 'blue' ? (POTIONS.blueMul || 2) : (POTIONS.redMul || 1)));
  }
  function potTotal(kind) {
    let n = 0;
    for (const t of POT_TIERS) n += P.pots[kind][t.id] || 0;
    return n;
  }
  // 优先最低档有货的
  function pickPotTier(kind) {
    for (const t of POT_TIERS) {
      if ((P.pots[kind][t.id] || 0) > 0) return t;
    }
    return null;
  }

  /* ---------------- 玩家 ---------------- */
  const P = {
    x: 4, y: 24, dir: 'r',
    lv: 1, exp: 0, hp: 60, mp: 15, gold: 0,
    pots: defaultPots(),
    weapon: null, armor: null,
    glovesL: null, glovesR: null, shoes: null, helmet: null,
    necklace: null, earring: null, ringL: null, ringR: null,
    bag: [],
    cd: { half: 0, fire: 0 },
    skills: { half: false, fire: false },   // 技能书解锁：半月 / 烈火
    autoPot: 50, autoMp: 0,
    potionCd: { red: 0, blue: 0 },
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
  const COMBAT_MS = D.COMBAT_MS || D.IDLE_MS || 1000;  // 打怪节奏
  const MOVE_MS = D.MOVE_MS || 180;                     // 走路节奏（快得多）
  const ENEMY_ACT_MS = D.ENEMY_ACT_MS || 1000;          // 怪行动：1 次/秒
  const WALK_STEP_MS = D.WALK_STEP_MS || 70;            // 点地寻路每格
  const IDLE_MS = COMBAT_MS;                            // 旧名兼容
  let idleTimer = null;
  let nextIdleMs = COMBAT_MS;                           // after() 排下一拍用
  let enemyNextActAt = 0;                               // 兼容旧逻辑
  let statusNextTickAt = 0;                             // DoT 最多 1 次/秒，防飘字狂冒
  let playerNextStrikeAt = 0;                           // 玩家普攻/撞怪最多约 1 次/秒
  let refreshTimer = null;
  let clockTimer = null;
  let clock = 8 * 60;            // 游戏内时间（分钟），默认 08:00
  let autoDisabled = false;
  let autoFarm = false;          // 挂机开关（默认关，不写档）
  let killFromFarm = false;      // 本击杀是否来自挂机（仅标记，无收益折扣）
  let killsToElite = 0;          // 本周期已杀普通（精英保底）
  let killsToRare = 0;           // 本周期已杀普通（稀有保底）
  let eliteThreshold = 1;        // 本周期精英出现阈值（1..pityMax 随机）
  let rareThreshold = 1;         // 本周期稀有出现阈值
  let normalRespawnDue = [];     // 普通怪补刷到期时刻（Date.now ms）
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
    normalRespawnDue = [];
    enemyNextActAt = 0;
    for (const e of enemies) e.nextActAt = 0;
    rollPityThresholds();
    setAutoFarm(false);             // 每次进房默认关挂机

    // 刷新 CD：Boss 房清过且还在冷却，就不刷 Boss
    const cd = bossCdOf(spec);
    const cleared = roomClearedAt[roomId];
    if (spec.boss && cleared != null && clock - cleared < cd) {
      enemies = enemies.filter((e) => !e.boss);
      log(`${spec.name}：首领还在休整（${Math.ceil(cd - (clock - cleared))} 分钟后刷新）。`, 'bad');
    }

    centerCam();
    log(`进入 ${spec.name}（Lv.${spec.lvMin}–${spec.lvMax}）。点技能栏「挂机」刷普通/精英。`, 'good');
  }

  // 离开房间回主城
  function leaveRoom() {
    if (!currentRoom) return;
    const alive = enemies.filter((e) => e.hp > 0).length;
    if (alive === 0) {
      roomClearedAt[currentRoom] = clock;
      log('房间已清空，首领进入刷新冷却。', 'good');
    }
    setAutoFarm(false);
    normalRespawnDue = [];
    genHub();
  }

  function bossCdOf(spec) {
    if (!spec) return RESPAWN.bossDefaultCd || 20;
    return spec.cd != null ? spec.cd : (RESPAWN.bossDefaultCd || 20);
  }

  function living(pred) {
    return enemies.filter((e) => e.hp > 0 && (!pred || pred(e)));
  }

  function pickSpawnSpot() {
    const W = map[0].length, H = map.length;
    const minD = RESPAWN.minDist || 4;
    for (let tries = 0; tries < 80; tries++) {
      const x = randi(2, W - 3), y = randi(2, H - 3);
      if (isWall(x, y) || enemyAt(x, y)) continue;
      if (back && x === back.x && y === back.y) continue;
      if (Math.abs(x - P.x) + Math.abs(y - P.y) < minD) continue;
      return { x, y };
    }
    return null;
  }

  function poolMon(spec) {
    let pool = (spec.pool || []).map((id) => MON.find((m) => m.id === id)).filter(Boolean);
    if (!pool.length) pool = MON.slice();
    return pool[randi(0, pool.length - 1)];
  }

  function spawnOneInRoom(gradeKey) {
    const spec = currentRoom ? roomSpec(currentRoom) : null;
    if (!spec) return null;
    const spot = pickSpawnSpot();
    if (!spot) return null;
    const mon = poolMon(spec);
    const e = makeEnemy(mon, gradeKey || 'normal');
    e.x = spot.x;
    e.y = spot.y;
    enemies.push(e);
    return e;
  }

  function spawnBossInRoom() {
    const spec = currentRoom ? roomSpec(currentRoom) : null;
    if (!spec || !spec.boss) return null;
    if (living((e) => e.boss).length) return null;
    let best = null, bd = -1;
    const W = map[0].length, H = map.length;
    for (let tries = 0; tries < 200; tries++) {
      const x = randi(2, W - 3), y = randi(2, H - 3);
      if (isWall(x, y) || enemyAt(x, y)) continue;
      const d = Math.abs(x - P.x) + Math.abs(y - P.y);
      if (d > bd) { bd = d; best = { x, y }; }
    }
    if (!best) return null;
    const b = makeEnemy(BOSS, 'boss');
    b.x = best.x;
    b.y = best.y;
    enemies.push(b);
    log('👹 首领刷新了！不主动追人——去手打换装，再开挂机升级。', 'bad');
    syncHud();
    return b;
  }

  function normalCount() {
    return living((e) => !e.boss && !e.elite && !e.rare).length;
  }

  // 普通怪死后排队：满员（在场+排队 ≥ mobs）不再排；dueAt 可选（测用）
  function queueNormalRespawn(dueAt) {
    if (!currentRoom || over) return;
    const spec = roomSpec(currentRoom);
    if (!spec) return;
    const cap = spec.mobs || 0;
    if (normalCount() + normalRespawnDue.length >= cap) return;
    const delay = RESPAWN.normalDelayMs || 5000;
    normalRespawnDue.push(dueAt != null ? dueAt : Date.now() + delay);
  }

  // 房内刷新（世界时钟每秒）：到期补普通；BOSS 按 CD
  function tryRoomRespawn(nowMs) {
    if (!currentRoom || over) return;
    const spec = roomSpec(currentRoom);
    if (!spec) return;

    const now = nowMs != null ? nowMs : Date.now();
    normalRespawnDue.sort((a, b) => a - b);
    while (normalRespawnDue.length && normalRespawnDue[0] <= now) {
      normalRespawnDue.shift();
      if (normalCount() >= (spec.mobs || 0)) continue;
      spawnOneInRoom('normal');
    }

    // 精英/稀有走击杀保底；这里只补 BOSS
    if (spec.boss) {
      const cd = bossCdOf(spec);
      const cleared = roomClearedAt[currentRoom];
      const ready = cleared == null || clock - cleared >= cd;
      if (ready && !living((e) => e.boss).length) spawnBossInRoom();
    }
  }

  // 稀有刷出：只提示，不关挂机（玩家自己关再去手打）
  function onRareSpawned(e) {
    log(`★ 稀有的${e.name}出现了！挂机不会打它——关掉「挂机」再去手打拿 A 装。`, 'good');
    syncHud();
  }

  function elitePityMax() { return RESPAWN.elitePityMax || 50; }
  function rarePityMax() { return RESPAWN.rarePityMax || 200; }

  // 随机保底阈值：本周期在 1..max 之间某只必出（每次进房/刷出后重掷）
  function rollEliteThreshold() {
    eliteThreshold = randi(1, elitePityMax());
    killsToElite = 0;
  }
  function rollRareThreshold() {
    rareThreshold = randi(1, rarePityMax());
    killsToRare = 0;
  }
  function rollPityThresholds() {
    rollEliteThreshold();
    rollRareThreshold();
  }

  function eliteLeft() {
    if (living((e) => e.elite).length >= (RESPAWN.eliteCap || 2)) return 0;
    return Math.max(0, eliteThreshold - killsToElite);
  }
  function rareLeft() {
    if (living((e) => e.rare).length >= (RESPAWN.rareCap || 1)) return 0;
    return Math.max(0, rareThreshold - killsToRare);
  }
  function spawnProgressText() {
    if (!currentRoom) return '';
    const eCap = living((e) => e.elite).length >= (RESPAWN.eliteCap || 2);
    const rHere = living((e) => e.rare).length > 0;
    const ePart = eCap ? '精英已满' : `精英保底还差${eliteLeft()}`;
    const rPart = rHere ? '稀有在场' : `稀有保底还差${rareLeft()}`;
    return `　${ePart} · ${rPart}`;
  }

  function trySpawnEliteGuaranteed() {
    const cap = RESPAWN.eliteCap || 2;
    if (living((e) => e.elite).length >= cap) return null;
    const e = spawnOneInRoom('elite');
    if (e) {
      log(`精英${e.name}加入战场（本轮阈值 ${eliteThreshold} 只）。`, 'good');
      rollEliteThreshold();
      syncHud();
    }
    return e;
  }

  function trySpawnRareGuaranteed() {
    if (living((e) => e.rare).length >= (RESPAWN.rareCap || 1)) return null;
    const e = spawnOneInRoom('rare');
    if (e) {
      rollRareThreshold();
      onRareSpawned(e);
    }
    return e;
  }

  // 杀普通累计；达到本轮随机阈值必出（满员则暂停计数）
  function onNormalKillProgress() {
    const eCap = RESPAWN.eliteCap || 2;
    if (living((e) => e.elite).length < eCap) {
      killsToElite++;
      if (killsToElite >= eliteThreshold) trySpawnEliteGuaranteed();
    }
    if (living((e) => e.rare).length < (RESPAWN.rareCap || 1)) {
      killsToRare++;
      if (killsToRare >= rareThreshold) trySpawnRareGuaranteed();
    }
  }

  function spawnWild() { /* 旧野外刷怪已废；房内走 tryRoomRespawn */ }

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
      playerEngaged: false,            // 玩家主动打过才锁战；靠近≠开战
      nextActAt: 0,                    // 本怪下一次可追/打的时刻
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
    const base = String(slot || '').replace(/[LR]$/, '');
    const bases = EQUIP_BASES[base] || [];
    let pick = bases[0] || null;
    for (const b of bases) {
      if (b.ilvl <= (ilvl | 0)) pick = b;
    }
    const lv = pick ? pick.ilvl : Math.max(1, ilvl | 0);
    const name = pick ? pick.name : '未知装备';
    const mul = EQUIP_STAT_MUL[base] || { atk: 0, def: 0, hp: 0 };

    // 基础区间：所有品质相同（品质不碰属性）；按槽位倍率折算。等级=固定穿戴需求
    const atkMin0 = mul.atk ? Math.round((4 + 0.2 * lv) * mul.atk) : 0;
    const atkMax0 = mul.atk ? Math.max(atkMin0, Math.round((8 + 0.4 * lv) * mul.atk)) : 0;
    const defMin0 = mul.def ? Math.round((2 + 0.2 * lv) * mul.def) : 0;
    const defMax0 = mul.def ? Math.max(defMin0, Math.round((4 + 0.4 * lv) * mul.def)) : 0;
    const hp0 = mul.hp ? Math.round((15 + 3 * lv) * mul.hp) : 0;

    // 浮动：上下限各自独立；C 不浮；只加在该件本来有的攻/防上
    const p = FLOAT_P[rarity] ?? 0;
    const rolledMin = p > 0 && Math.random() < p ? randi(0, FLOAT_MIN) : 0;
    const rolledMax = p > 0 && Math.random() < p ? randi(0, FLOAT_MAX) : 0;
    const floatAtk = mul.atk > 0 && mul.atk >= mul.def; // 主攻件浮攻，否则浮防
    const floatDef = mul.def > 0 && !floatAtk;

    // opts 给最终值时视为基础、无浮动（商店固定货）
    const hasAtkOpt = opts.atkMin != null || opts.atkMax != null || opts.atkBaseMin != null;
    const hasDefOpt = opts.defMin != null || opts.defMax != null || opts.defBaseMin != null;
    const atkBaseMin = opts.atkBaseMin ?? opts.atkMin ?? (mul.atk ? atkMin0 : 0);
    const atkBaseMax = opts.atkBaseMax ?? opts.atkMax ?? (mul.atk ? atkMax0 : 0);
    const defBaseMin = opts.defBaseMin ?? opts.defMin ?? (mul.def ? defMin0 : 0);
    const defBaseMax = opts.defBaseMax ?? opts.defMax ?? (mul.def ? defMax0 : 0);
    const atkFloatMin = opts.atkFloatMin != null ? opts.atkFloatMin
      : (hasAtkOpt ? 0 : (floatAtk ? rolledMin : 0));
    const atkFloatMax = opts.atkFloatMax != null ? opts.atkFloatMax
      : (hasAtkOpt ? 0 : (floatAtk ? rolledMax : 0));
    const defFloatMin = opts.defFloatMin != null ? opts.defFloatMin
      : (hasDefOpt ? 0 : (floatDef ? rolledMin : 0));
    const defFloatMax = opts.defFloatMax != null ? opts.defFloatMax
      : (hasDefOpt ? 0 : (floatDef ? rolledMax : 0));

    const eq = {
      slot, name, rarity, ilvl: lv,
      atkBaseMin, atkBaseMax, atkFloatMin, atkFloatMax,
      defBaseMin, defBaseMax, defFloatMin, defFloatMax,
      atkMin: atkBaseMin + atkFloatMin,
      atkMax: atkBaseMax + atkFloatMax,
      defMin: defBaseMin + defFloatMin,
      defMax: defBaseMax + defFloatMax,
      hp: opts.hp ?? hp0,
      affix: null,
      elite: (atkFloatMin > 0 && atkFloatMax > 0) || (defFloatMin > 0 && defFloatMax > 0),
    };
    const affixChance = rarity === 'yellow' ? 1 : rarity === 'blue' ? 0.45 : 0;
    if (Math.random() < affixChance) {
      const preferSharp = mul.atk >= mul.def ? 0.7 : 0.25;
      if (Math.random() < preferSharp) eq.affix = { id: 'sharp', name: '锋锐', pct: rand(0.05, 0.12) };
      else eq.affix = { id: 'tough', name: '坚韧', pct: rand(0.12, 0.22) };
    }
    return eq;
  }

  // 装备等级 = 穿戴需求（固定）；另需槽位解锁
  function eqReqLv(eq) {
    return Math.max(1, (eq && (eq.ilvl | 0)) || 1);
  }
  function canWearEq(eq, lv) {
    if (!eq || !eq.slot) return false;
    const L = lv != null ? lv : P.lv;
    return slotUnlocked(eq.slot, L) && L >= eqReqLv(eq);
  }

  function wornOf(slot) {
    return (slot && P[slot]) || null;
  }

  function setWorn(slot, eq) {
    if (!slot || !SLOT_IDS.includes(slot)) return;
    P[slot] = eq || null;
  }

  function wornSlotIds() {
    return SLOT_IDS.filter((id) => P[id]);
  }

  // 怪等级开放可掉部位；权重 武器 < 首饰 < 防具
  function rollDropSlot(monsterLv) {
    const lv = Math.max(1, monsterLv | 0);
    const pool = EQUIP_SLOTS.filter((s) => lv >= (s.unlock || 0));
    if (!pool.length) return 'weapon';
    let total = 0;
    const weights = pool.map((s) => {
      const w = DROP_SLOT_WEIGHT[s.group] || 1;
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i].id;
    }
    return pool[pool.length - 1].id;
  }

  // 词缀系统在 M2：装备身上会带 affix，但界面上先不显示名字（R8）

  function sellPrice(eq) {
    return Math.max(5, Math.round((eqScore(eq) + 4) * 2 * (1 + (eq.ilvl || 1) * 0.05)));
  }

  // 浮动角标：基础区间后加 (+下限/+上限) 或只写一边 (+N)
  function floatTag(fMin, fMax) {
    const a = fMin | 0;
    const b = fMax | 0;
    if (!a && !b) return '';
    if (a && b) return `(+${a}/+${b})`;
    return `(+${a || b})`;
  }

  // 装备属性：基础区间 + 浮动；词缀加成仍计入战斗，界面词缀位显示"未鉴定"
  function eqStatText(eq) {
    if (!eq) return '';
    const parts = [];
    const aBaseMin = eq.atkBaseMin != null ? eq.atkBaseMin : (eq.atkMin ?? eq.atk ?? 0);
    const aBaseMax = eq.atkBaseMax != null ? eq.atkBaseMax : (eq.atkMax ?? eq.atk ?? 0);
    const aFMin = eq.atkFloatMin | 0;
    const aFMax = eq.atkFloatMax | 0;
    if (aBaseMax || aFMax || aBaseMin || aFMin) {
      parts.push(`攻击 ${aBaseMin}-${aBaseMax}${floatTag(aFMin, aFMax)}`);
    }
    const dBaseMin = eq.defBaseMin != null ? eq.defBaseMin : (eq.defMin ?? eq.def ?? 0);
    const dBaseMax = eq.defBaseMax != null ? eq.defBaseMax : (eq.defMax ?? eq.def ?? 0);
    const dFMin = eq.defFloatMin | 0;
    const dFMax = eq.defFloatMax | 0;
    if (dBaseMax || dFMax || dBaseMin || dFMin) {
      parts.push(`防御 ${dBaseMin}-${dBaseMax}${floatTag(dFMin, dFMax)}`);
    }
    if (eq.hp) parts.push(`HP +${eq.hp}`);
    return parts.join(' · ');
  }

  // 词缀位：词缀系统 M2 才做，现在统一显示"未鉴定"（R8）
  const affixSlot = () => '<span class="affix-todo">词缀 未鉴定</span>';

  // 能否收下：更好装且等级够可直接穿（换下的需 1 格）；否则需背包有空位
  function canAcceptEquip(eq) {
    if (!eq || !eq.slot) return false;
    const cur = wornOf(eq.slot);
    if (canWearEq(eq) && eqScore(eq) > eqScore(cur) + 0.001) {
      return !cur || P.bag.length < BAG_MAX;
    }
    return P.bag.length < BAG_MAX;
  }

  function addToBag(eq) {
    if (!eq || !eq.slot) return false;
    if (!canAcceptEquip(eq)) {
      log('背包满了，请先丢掉或换装腾位。', 'bad');
      return false;
    }
    const cur = wornOf(eq.slot);
    if (canWearEq(eq) && eqScore(eq) > eqScore(cur) + 0.001) {
      if (cur) P.bag.push(cur);
      setWorn(eq.slot, eq);
      P.hp = Math.min(P.hp, maxHp());
      showLoot(eq, true);
      log(`装备 ${eq.name}（${RARITY[eq.rarity].name}）。`, 'good');
      return true;
    }
    P.bag.push(eq);
    showLoot(eq, false);
    const need = eqReqLv(eq);
    if (!canWearEq(eq) && P.lv < need) {
      log(`获得 ${eq.name}（需 Lv.${need}，已放背包）。`);
    } else {
      log(`获得 ${eq.name}（${RARITY[eq.rarity].name}），已放背包。`);
    }
    return false;
  }

  function giveEquip(eq) {
    return addToBag(eq);
  }

  function equipFromBag(i) {
    const eq = P.bag[i];
    if (!eq) return false;
    if (!slotUnlocked(eq.slot)) {
      const need = slotMeta(eq.slot).unlock || 0;
      log(`${slotMeta(eq.slot).name}需 Lv.${need} 才能穿（当前 ${P.lv}）。`, 'bad');
      return false;
    }
    if (P.lv < eqReqLv(eq)) {
      log(`${eq.name}需 Lv.${eqReqLv(eq)} 才能穿（当前 ${P.lv}）。`, 'bad');
      return false;
    }
    const cur = wornOf(eq.slot);
    // 先拿出再塞回旧装：满包且有旧装时，拿出后必有空位
    P.bag.splice(i, 1);
    if (cur) P.bag.push(cur);
    setWorn(eq.slot, eq);
    P.hp = Math.min(P.hp, maxHp());
    log(`装备 ${eq.name}（${(RARITY[eq.rarity] || RARITY.white).name}）。`, 'good');
    if (!el.char.hidden) renderChar();
    syncHud();
    save();
    return true;
  }

  function sellFromBag(i) {
    const eq = P.bag[i];
    if (!eq) return false;
    P.bag.splice(i, 1);
    const price = sellPrice(eq);
    P.gold += price;
    log(`卖掉 ${eq.name}（+${price} 金币）。`, 'good');
    if (!el.char.hidden) renderChar();
    if (el.shop && !el.shop.hidden) refreshShop();
    syncHud();
    save();
    return true;
  }

  // 丢掉：落到脚下钱袋，玩家可再捡
  function discardFromBag(i) {
    const eq = P.bag[i];
    if (!eq) return false;
    P.bag.splice(i, 1);
    dropBag(P.x, P.y, [eq]);
    log(`丢掉了 ${eq.name}，落在脚下。`);
    hideEqTip();
    if (!el.char.hidden) renderChar();
    syncHud();
    save();
    return true;
  }

  function discardWorn(slot) {
    const eq = wornOf(slot);
    if (!eq) return false;
    setWorn(slot, null);
    dropBag(P.x, P.y, [eq]);
    P.hp = Math.min(P.hp, maxHp());
    log(`脱掉并丢掉了 ${eq.name}，落在脚下。`);
    hideEqTip();
    if (!el.char.hidden) renderChar();
    syncHud();
    save();
    return true;
  }

  function showLoot(eq, equipped) {
    if (!el.loot) return;
    const r = RARITY[eq.rarity] || RARITY.white;
    el.lootName.textContent = `【${r.letter} ${r.name}】${eq.name}${equipped ? '（已装备）' : '（已放背包）'}`;
    el.lootName.className = 'loot-name ' + eq.rarity;
    el.lootStats.textContent = `需要 Lv.${eqReqLv(eq)} · ${eqStatText(eq)}`;
    el.lootAffix.textContent = '词缀 未鉴定';
    el.loot.hidden = false;
    clearTimeout(lootTimer);
    lootTimer = setTimeout(() => { el.loot.hidden = true; }, 2800);
  }

  /* ---------------- 日志 / HUD ---------------- */
  function log(text, cls) {
    logs.push({ text, cls });
    if (logs.length > 40) logs.shift();
    renderLog();
  }

  // 日志：展开 5 条，折叠 1 条（默认折叠省屏）
  let logCollapsed = true;
  function renderLog() {
    if (!el.log) return;
    const n = logCollapsed ? 1 : 5;
    el.log.innerHTML = logs.slice(-n).map((l) => `<div class="${l.cls || ''}">${l.text}</div>`).join('');
    el.log.classList.toggle('collapsed', logCollapsed);
    if (el.logToggle) {
      el.logToggle.textContent = logCollapsed ? '日志 ▾' : '日志 ▴';
      el.logToggle.setAttribute('aria-expanded', logCollapsed ? 'false' : 'true');
    }
  }
  function toggleLogFold() {
    logCollapsed = !logCollapsed;
    renderLog();
  }

  function gearText() {
    const tag = (eq) => (eq ? `[${(RARITY[eq.rarity] || RARITY.white).letter}]` : '');
    const w = P.weapon ? `${P.weapon.name}${tag(P.weapon)} +${eqAtk(P.weapon)}` : '空手';
    const a = P.armor ? `${P.armor.name}${tag(P.armor)} +${eqDef(P.armor)}` : '布衣';
    const extra = SLOT_IDS.filter((id) => id !== 'weapon' && id !== 'armor' && P[id]).length;
    return extra ? `⚔ ${w}　🛡 ${a}　+${extra}` : `⚔ ${w}　🛡 ${a}`;
  }

  function rarBadge(eq) {
    const r = RARITY[eq.rarity] || RARITY.white;
    return `<span class="rbadge ${eq.rarity}">${r.letter}</span>`;
  }

  // 装备格子：品质边框；比身上好显示 ↑；详情靠悬停/点击
  function isUpgrade(eq) {
    if (!canWearEq(eq)) return false;
    return eqScore(eq) > eqScore(wornOf(eq.slot)) + 0.001;
  }

  function eqCellHtml(eq, opts) {
    opts = opts || {};
    if (opts.locked) {
      const lab = opts.label || '空';
      const need = opts.unlockLv || 0;
      return `<button type="button" class="eq-cell empty locked" disabled aria-label="${lab} Lv.${need}">`
        + `<span class="eq-slot">${lab}</span><span class="eq-lock">Lv.${need}</span></button>`;
    }
    if (!eq) {
      const lab = opts.label || '空';
      return `<button type="button" class="eq-cell empty" disabled aria-label="${lab}"><span class="eq-slot">${lab}</span></button>`;
    }
    const r = RARITY[eq.rarity] || RARITY.white;
    const ico = (slotMeta(eq.slot).ico) || '◆';
    const up = !opts.worn && isUpgrade(eq);
    let attr = `data-worn="${opts.worn}"`;
    if (opts.bagIndex != null) attr = `data-bag="${opts.bagIndex}"`;
    else if (opts.pickIndex != null) attr = `data-pick="${opts.pickIndex}"`;
    else if (opts.shopBag != null) attr = `data-shop-bag="${opts.shopBag}"`;
    else if (opts.shopStock != null) attr = `data-shop-stock="${opts.shopStock}"`;
    const priceTag = opts.price != null
      ? `<span class="eq-price" title="价格">${opts.price}</span>`
      : '';
    const unaff = opts.shopStock != null && opts.price != null && P.gold < opts.price;
    return `<button type="button" class="eq-cell rarity-${eq.rarity}${up ? ' up' : ''}${unaff ? ' unafford' : ''}" ${attr} aria-label="${eq.name}">
      <span class="eq-ico">${ico}</span>
      <span class="eq-lv">${eq.ilvl || 1}</span>
      <span class="eq-ltr">${r.letter}</span>
      ${up ? '<span class="eq-up" title="比身上好">↑</span>' : ''}
      ${priceTag}
    </button>`;
  }

  function potCellHtml(item, index) {
    const ico = item.potKind === 'blue' ? '💙' : '🧪';
    const tag = item.potKind === 'blue' ? '蓝' : '红';
    const can = P.gold >= item.price;
    return `<button type="button" class="eq-cell shop-pot${can ? '' : ' unafford'}" data-shop-stock="${index}" aria-label="${item.name}">
      <span class="eq-ico">${ico}</span>
      <span class="eq-lv">+${item.amount}</span>
      <span class="eq-ltr">${tag}</span>
      <span class="eq-price">${item.price}</span>
    </button>`;
  }

  // 单件详情正文：需要等级 + 基础/浮动属性（品级已在标题）
  function eqDetailHtml(eq) {
    if (!eq) return '';
    const need = eqReqLv(eq);
    const low = P.lv < need ? ' <span class="eq-need-low">（不足）</span>' : '';
    return `需要 Lv.${need}${low}<br>${eqStatText(eq)} · ${affixSlot()}`;
  }

  // 身上同槽：上下同风格；底下那件标「穿」方便认
  function eqCompareHtml(eq) {
    if (!eq) return '';
    const cur = wornOf(eq.slot);
    if (!cur || cur === eq) return '';
    const r = RARITY[cur.rarity] || RARITY.white;
    return `<div class="eq-cmp">`
      + `<div class="eq-tip-name rarity-${cur.rarity}">${cur.name} 【${r.letter}】`
      + `<span class="eq-worn-tag">穿</span></div>`
      + `<div class="eq-tip-body">${eqDetailHtml(cur)}</div>`
      + `</div>`;
  }

  let tipSticky = false;
  let tipSrc = null; // { kind:'bag'|'worn'|'pick', i }
  let tipAnchor = null;

  function hideEqTip() {
    tipSticky = false;
    tipSrc = null;
    tipAnchor = null;
    if (el.eqTip) el.eqTip.hidden = true;
  }

  function findTipAnchor(src) {
    if (!src) return null;
    if (src.kind === 'bag' && el.bagList) return el.bagList.querySelector(`[data-bag="${src.i}"]`);
    if (src.kind === 'worn' && el.charSlots) return el.charSlots.querySelector(`[data-worn="${src.i}"]`);
    if (src.kind === 'pick' && el.pickList) return el.pickList.querySelector(`[data-pick="${src.i}"]`);
    if (src.kind === 'shopStock' && el.shopStock) return el.shopStock.querySelector(`[data-shop-stock="${src.i}"]`);
    if (src.kind === 'shopBag' && el.shopBag) return el.shopBag.querySelector(`[data-shop-bag="${src.i}"]`);
    return null;
  }

  // 浮在锚点格子上方；上方不够则改到下方，并夹在舞台内
  function placeEqTip(anchor) {
    if (!el.eqTip || !anchor) return;
    tipAnchor = anchor;
    const stage = document.getElementById('stage');
    if (!stage) return;
    const sr = stage.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const tip = el.eqTip;
    const tw = tip.offsetWidth || 280;
    const th = tip.offsetHeight || 120;
    const gap = 8;
    const pad = 6;
    let left = ar.left + ar.width / 2 - sr.left - tw / 2;
    let top = ar.top - sr.top - th - gap;
    if (top < pad) top = ar.bottom - sr.top + gap;
    left = Math.max(pad, Math.min(left, sr.width - tw - pad));
    top = Math.max(pad, Math.min(top, sr.height - th - pad));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function showEqTip(eq, src, sticky, anchor) {
    if (!el.eqTip || !eq) return;
    tipSrc = src;
    tipSticky = !!sticky;
    const r = RARITY[eq.rarity] || RARITY.white;
    el.eqTipName.className = 'eq-tip-name rarity-' + eq.rarity;
    el.eqTipName.textContent = `${eq.name} 【${r.letter}】`;
    const showCmp = !src || (src.kind !== 'worn' && src.kind !== 'shopStock');
    let extra = '';
    if (src && src.kind === 'shopStock' && src.price != null) {
      extra = `<div class="eq-tip-price">售价 <b>${src.price}</b> 金</div>`;
    } else if (src && src.kind === 'shopBag') {
      extra = `<div class="eq-tip-price">可卖 <b>${sellPrice(eq)}</b> 金</div>`;
    }
    el.eqTipStats.innerHTML = eqDetailHtml(eq) + extra + (showCmp ? eqCompareHtml(eq) : '');
    const acts = (src && src.kind === 'pick')
      ? `<button type="button" data-tip-pick="${src.i}">捡起</button>`
      : '';
    el.eqTipActs.innerHTML = acts;
    el.eqTipActs.hidden = !acts;
    el.eqTip.hidden = false;
    const node = anchor || tipAnchor || findTipAnchor(src);
    if (node) placeEqTip(node);
  }

  function showPotTip(item, src, sticky, anchor) {
    if (!el.eqTip || !item) return;
    tipSrc = src;
    tipSticky = !!sticky;
    el.eqTipName.className = 'eq-tip-name';
    el.eqTipName.textContent = item.name;
    el.eqTipStats.innerHTML =
      `${item.potKind === 'blue' ? '回复 MP' : '回复 HP'} <b>+${item.amount}</b><br>`
      + `<div class="eq-tip-price">售价 <b>${item.price}</b> 金</div>`;
    el.eqTipActs.innerHTML = '';
    el.eqTipActs.hidden = true;
    el.eqTip.hidden = false;
    const node = anchor || tipAnchor || findTipAnchor(src);
    if (node) placeEqTip(node);
  }

  function resolveEqFromSrc(src) {
    if (!src) return null;
    if (src.kind === 'bag') return P.bag[src.i] || null;
    if (src.kind === 'worn') return wornOf(src.i);
    if (src.kind === 'pick') return (pickBag && pickBag.items[src.i]) || null;
    if (src.kind === 'shopBag') return P.bag[src.i] || null;
    if (src.kind === 'shopStock') {
      const it = ensureShopCatalog()[src.i];
      return (it && it.kind === 'equip') ? it.eq : null;
    }
    return null;
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
      <div>攻击 <b>${Math.round(atkMean())}</b><small>基础 ${Math.round(baseAtk)} + 装备 ${sumEqAtk(P)}</small></div>
      <div>防御 <b>${Math.round(defMean())}</b><small>基础 ${Math.round(baseDef)} + 装备 ${sumEqDef(P)}</small></div>
    `;
    el.charSlots.innerHTML = EQUIP_SLOTS.map((s) => {
      if (!slotUnlocked(s.id)) {
        return eqCellHtml(null, { locked: true, label: s.name, unlockLv: s.unlock });
      }
      return eqCellHtml(P[s.id], { worn: s.id, label: s.name });
    }).join('');
    el.autoPot.value = String(P.autoPot);
    if (el.autoMp) el.autoMp.value = String(P.autoMp);
    if (el.potStock) {
      el.potStock.innerHTML = POT_TIERS.map((t) =>
        `<div>🧪${t.name}红 <b>${P.pots.red[t.id] || 0}</b></div><div>💙${t.name}蓝 <b>${P.pots.blue[t.id] || 0}</b></div>`
      ).join('');
    }
    el.bagCount.textContent = P.bag.length;
    const cells = [];
    for (let i = 0; i < BAG_MAX; i++) {
      cells.push(eqCellHtml(P.bag[i] || null, P.bag[i] ? { bagIndex: i } : { label: '' }));
    }
    el.bagList.innerHTML = cells.join('');
    // 刷新后若提示还开着，同步内容并重新锚到格子
    if (tipSrc && !el.eqTip.hidden) {
      const eq = resolveEqFromSrc(tipSrc);
      if (eq) showEqTip(eq, tipSrc, tipSticky, findTipAnchor(tipSrc));
      else hideEqTip();
    }
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
    hideEqTip();
    renderChar();
    switchCharTab(charTab);
  }

  function toggleChar() {
    if (el.char.hidden) openChar();
    else { hideEqTip(); el.char.hidden = true; }
  }

  function updateTips() {
    if (over) return;
    const spec = currentRoom ? roomSpec(currentRoom) : null;
    const zone = spec ? spec.name : zoneName(P.x);
    const range = spec ? `Lv.${spec.lvMin}-${spec.lvMax}` : zoneRange(P.x);
    const farmTag = autoFarm ? '【挂机】' : '';
    const tag = inCombat() ? '⚔ ' : farmTag;
    const nearBag = bagNearby() ? '　💰 脚边有袋子' : '';
    const talkHint = nearShop() ? '　💬 空格与商人交谈' : '';

    // 核心循环优先提示：稀有/首领在场 > 首领 CD > 经验墙 > 计数进度 > 最近怪
    const prog = currentRoom ? spawnProgressText() : '';
    if (nearShop() && !currentRoom && !inCombat()) {
      el.tips.textContent = `${tag}村口商人　按空格或点「交谈」开商店${nearBag}`;
      return;
    }
    const rare = living((e) => e.rare)[0];
    if (rare) {
      const d = dist(rare, P);
      el.tips.textContent = `${tag}★ 稀有 ${rare.name} 在场 ${d}格——手打拿 A 装${prog}${nearBag}`;
      return;
    }
    const boss = living((e) => e.boss)[0];
    if (boss) {
      const d = dist(boss, P);
      el.tips.textContent = `${tag}👹 首领在场（被动） ${d}格——手打换装后再挂机${prog}${nearBag}`;
      return;
    }
    if (spec && spec.boss) {
      const cleared = roomClearedAt[currentRoom];
      const cd = bossCdOf(spec);
      if (cleared != null && clock - cleared < cd) {
        const left = Math.ceil(cd - (clock - cleared));
        el.tips.textContent = `${tag}${zone} ${range}　首领 ${left} 分钟后刷新${prog}${nearBag}`;
        return;
      }
    }
    // 经验墙：比房间上限高 4 级起
    if (spec && P.lv >= (spec.lvMax || 1) + 4) {
      el.tips.textContent = `${tag}${zone}　普通怪已无经验/金币——打稀有/首领或换门${prog}${nearBag}`;
      return;
    }

    const n = nearestEnemy();
    if (!n) {
      el.tips.textContent = `${tag}${zone} ${range}${prog || '　这一带暂时安全。'}${nearBag}${talkHint}`;
      return;
    }
    const d = dist(n, P);
    const dx = n.x - P.x, dy = n.y - P.y;
    const arrow = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
    const aiTag = n.ai === 'passive' ? '被动' : '主动';
    const stTxt = S.text(n);
    el.tips.textContent = `${tag}${zone} ${range}${prog}　最近：Lv.${n.lv} ${n.name}·${aiTag} ${d}格${arrow}${stTxt ? '　' + stTxt : ''}${nearBag}${talkHint}`;
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
    const need = needExp();
    if (el.expFill) el.expFill.style.width = `${clamp(need ? P.exp / need : 0, 0, 1) * 100}%`;
    if (el.expText) el.expText.textContent = `经验 ${P.exp} / ${need}`;
    el.gold.textContent = `💰 ${P.gold}`;
    el.gear.textContent = gearText();
    el.potionCount.textContent = potTotal('red');
    el.btnAtk.disabled = over;
    el.btnPotion.disabled = over || potTotal('red') <= 0 || P.potionCd.red > 0;
    el.potionCd.textContent = P.potionCd.red > 0 ? `⏳${P.potionCd.red}` : '';
    if (el.mpPotionCount) el.mpPotionCount.textContent = potTotal('blue');
    if (el.btnMpPotion) el.btnMpPotion.disabled = over || potTotal('blue') <= 0 || P.potionCd.blue > 0;
    if (el.mpPotionCd) el.mpPotionCd.textContent = P.potionCd.blue > 0 ? `⏳${P.potionCd.blue}` : '';
    setSkillBtn(el.btnHalf, el.halfCd, 6, P.cd.half, P.skills.half);
    setSkillBtn(el.btnFire, el.fireCd, 12, P.cd.fire, P.skills.fire);
    syncFarmBtn();
    syncInteractBtn();
    renderStatus();
    updateTips();
  }

  function nearShop() {
    return !!npc && dist(npc, P) <= 1;
  }

  // 可交互目标：目前主城商人；以后门卫等可扩
  function interactTarget() {
    if (over || uiOpen()) return null;
    if (nearShop()) return { kind: 'shop', name: '商人' };
    return null;
  }

  function syncInteractBtn() {
    if (!el.btnInteract) return;
    const t = interactTarget();
    el.btnInteract.disabled = !t;
    el.btnInteract.title = t ? `与${t.name}交谈（空格）` : '靠近 NPC 后可交谈';
    el.btnInteract.classList.toggle('on', !!t);
  }

  function tryInteract() {
    if (over || uiOpen()) return false;
    const t = interactTarget();
    if (!t) {
      log('附近没有可交谈的人。', 'bad');
      return false;
    }
    if (t.kind === 'shop') {
      openShop();
      return true;
    }
    return false;
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
      const gear = {};
      for (const id of SLOT_IDS) gear[id] = P[id];
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 4, lv: P.lv, exp: P.exp, hp: P.hp, mp: P.mp, gold: P.gold,
        pots: P.pots, ...gear, kills: P.kills,
        bag: P.bag, seed: worldSeed, clock, autoPot: P.autoPot, autoMp: P.autoMp,
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
      P.pots = normalizePots(s.pots != null ? s.pots : s.potions);
      P.kills = s.kills || 0;
      P.bag = Array.isArray(s.bag) ? s.bag.slice(0, BAG_MAX) : [];
      P.autoPot = Number.isFinite(s.autoPot) ? s.autoPot : 50;
      P.autoMp = Number.isFinite(s.autoMp) ? s.autoMp : 0;
      P.potionCd = { red: 0, blue: 0 };
      worldSeed = (s.seed >>> 0) || 0;
      clock = Number.isFinite(s.clock) ? s.clock : 8 * 60;
      for (const id of SLOT_IDS) {
        P[id] = normalizeEquip(s[id], id);
      }
      // 旧档单槽 → 左槽
      if (!P.glovesL && s.gloves) P.glovesL = Object.assign({}, s.gloves, { slot: 'glovesL' });
      if (!P.ringL && s.ring) P.ringL = Object.assign({}, s.ring, { slot: 'ringL' });
      // 槽位未解锁 / 装备等级不够：卸下进包
      for (const id of SLOT_IDS) {
        if (P[id] && !canWearEq(P[id], P.lv)) {
          P.bag.push(P[id]);
          P[id] = null;
        }
      }
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
  // 玩家主动开战（点击/撞怪/技能）；之后贴身才锁走位，须撤退才能脱
  function engage(e) {
    if (!e || e.hp <= 0) return;
    e.playerEngaged = true;
    e.aggroOn = true;
  }

  function strike(e, mult, tag) {
    const ar = atkRange(P);
    const dmg = DL.Combat.playerDamage(ar.min, ar.max, e.def, mult);
    e.hp -= dmg;
    engage(e);
    S.onHit(e);                 // R5.8：眩晕受击解除
    addFloater(e.x, e.y - 0.4, `-${dmg}`, '#ffd166');
    log(`${tag}对${e.name}造成 <b>${dmg}</b> 伤害，剩余 ${Math.max(0, Math.ceil(e.hp))}。`);
    if (e.hp <= 0) kill(e);
    return dmg;
  }

  function kill(e) {
    e.hp = 0;
    const crushed = isCrush(P.lv, e.lv, e.boss || e.elite || e.rare);
    killFromFarm = false;
    // 等级差：经验 EXP_GAP（≥4→0）；普通怪金币 GOLD_GAP_NORMAL（≥5→半、≥10→0）
    // 挂机无额外折扣（与手打同收益）
    const gap = P.lv - e.lv;
    const gapMul = DL.Core.expMulByGap(gap);
    const gotGold = Math.random() < (e.goldP == null ? 1 : e.goldP);
    let goldGain = !gotGold ? 0 : crushed ? Math.max(1, Math.round(e.gold * CRUSH.goldMul)) : e.gold;
    let expGain = Math.round(e.exp * gapMul);
    const isNormal = !e.boss && !e.elite && !e.rare;
    if (isNormal && goldGain > 0) {
      goldGain = Math.round(goldGain * DL.Core.goldMulByGapNormal(gap));
    }
    const noExp = expGain === 0 && e.exp > 0;
    P.exp += expGain;
    P.gold += goldGain;
    P.kills++;
    let gapTip = '';
    if (isNormal && gap >= 10) gapTip = '（高 10 级：普通怪无金币）';
    else if (isNormal && gap >= 5) gapTip = '（高 5 级：普通怪金币减半）';
    else if (noExp) gapTip = '（等级差太大，没经验了）';
    log(`${e.name}倒下了，+${expGain} 经验、${goldGain > 0 ? `+${goldGain} 金币` : '没掉金币'}。${gapTip}`, 'good');
    if (Math.random() < (crushed ? DROP.potionCrush : DROP.potion)) {
      const blue = Math.random() < (DROP.potionBlueShare || 0);
      const kind = blue ? 'blue' : 'red';
      P.pots[kind].low = (P.pots[kind].low || 0) + 1;
      log(`捡到 1 瓶初级${blue ? '蓝' : '红'}药。`, 'good');
    }
    if (!e.boss && !e.elite && !e.rare) {
      onNormalKillProgress();
      queueNormalRespawn();
    }
    if (e.boss && currentRoom) roomClearedAt[currentRoom] = clock;

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

  // 生成一件掉落（还没落地）；装备等级=怪等级（固定，作穿戴需求）；部位按怪等级解锁
  function rollDrop(e, forceRarity) {
    const baseLv = e.lv || 1;
    const ilvl = clamp(baseLv, 1, 60);
    const slot = rollDropSlot(baseLv);
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

  function renderPick() {
    if (!el.pickList) return;
    if (!pickBag || !pickBag.items.length) {
      el.pickList.innerHTML = '<p class="menu-help">袋子空了。</p>';
      hideEqTip();
      return;
    }
    el.pickTitle.textContent = pickBag.relic ? '你的遗物' : '地上的钱袋';
    el.pickHint.textContent = pickBag.relic
      ? '点格子看详情，↑ 比身上好。'
      : '点格子看详情再捡；↑ 表示比身上好。不拿的留在原地。';
    el.pickList.innerHTML = pickBag.items.map((eq, i) => eqCellHtml(eq, { pickIndex: i })).join('');
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

  /* ---------------- 挂机 ---------------- */
  function syncFarmBtn() {
    if (!el.btnFarm) return;
    el.btnFarm.classList.toggle('on', !!autoFarm);
    el.btnFarm.setAttribute('aria-pressed', autoFarm ? 'true' : 'false');
    el.btnFarm.innerHTML = `${autoFarm ? '挂·开' : '挂机'}<kbd>E</kbd>`;
    el.btnFarm.disabled = !currentRoom || over;
    el.btnFarm.title = !currentRoom
      ? '进房间后才能挂机'
      : (autoFarm ? '挂机中：再点关闭' : '挂机：自动打普通/精英');
  }

  function setAutoFarm(on) {
    const next = !!on && !!currentRoom && !over;
    if (autoFarm === next) { syncFarmBtn(); return autoFarm; }
    autoFarm = next;
    killFromFarm = false;
    if (autoFarm) {
      stopWalk();
      log('挂机开启：只打普通/精英（稀有/首领要自己关挂再打）；收益与手打相同。', 'good');
      scheduleIdle();
    } else {
      log('挂机已关闭。');
    }
    syncFarmBtn();
    return autoFarm;
  }

  function toggleFarm() {
    if (!currentRoom) { log('主城不能挂机，先进传送门。', 'bad'); return; }
    if (over) return;
    setAutoFarm(!autoFarm);
  }

  function bagBestRarityKey(bag) {
    let best = 'white';
    for (const eq of (bag.items || [])) {
      if ((RAR_RANK[eq.rarity] || 0) > (RAR_RANK[best] || 0)) best = eq.rarity;
    }
    return best;
  }

  function bagAutoLootable(bag) {
    if (!bag || !bag.items || !bag.items.length) return false;
    if (bag.relic) return false; // 遗物袋手捡
    const maxKey = AUTO_FARM.autoLootMax || 'blue';
    return (RAR_RANK[bagBestRarityKey(bag)] || 0) <= (RAR_RANK[maxKey] || 1);
  }

  // 挂机静默全捡（不弹清单）；满包返回 false
  function autoTakeBag(bag) {
    if (!bag || !bag.items.length) return true;
    while (bag.items.length) {
      if (P.bag.length >= BAG_MAX) {
        log('背包满了，挂机已停。清一清再开。', 'bad');
        setAutoFarm(false);
        return false;
      }
      addToBag(bag.items.shift());
    }
    removeBagIfEmpty(bag);
    log('挂机捡起地上的袋子（≤B）。', 'good');
    return true;
  }

  function nearestFarmEnemy() {
    return living((e) => DL.Combat.farmEligible(e))
      .sort((a, b) => dist(a, P) - dist(b, P))[0] || null;
  }

  function adjacentFarmTarget() {
    const [fx, fy] = facingVec();
    const front = enemies.find((e) => e.hp > 0 && e.x === P.x + fx && e.y === P.y + fy);
    if (front && DL.Combat.farmEligible(front)) return front;
    return living((e) => DL.Combat.isAdjacent(e.x, e.y, P.x, P.y) && DL.Combat.farmEligible(e))
      .sort((a, b) => a.hp - b.hp)[0] || null;
  }

  function rareThreatNear() {
    const threat = living((e) => e.rare);
    for (const e of threat) {
      const range = Math.max(e.aggro || 0, 5);
      if (dist(e, P) <= range) return e;
    }
    return null;
  }

  function nearestAutoLootBag() {
    return activeBags
      .filter((b) => b.items && b.items.length && bagAutoLootable(b))
      .sort((a, b) => dist(a, P) - dist(b, P))[0] || null;
  }

  // allowAttack=false：玩家走路回合只追不砍（避免 0.18s 贴身狂飘伤害字）
  function enemiesTurn(opts) {
    if (over) return;
    const allowAttack = !opts || opts.allowAttack !== false;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = dist(e, P);
      const action = DL.Combat.decide(e, P.lv, d);
      if (action === 'leash') { e.aggroOn = false; e.playerEngaged = false; continue; }
      if (action === 'idle') continue;
      if (action === 'giveup') { e.aggroOn = false; e.playerEngaged = false; continue; }   // 被动怪追 3 格就放弃
      if (action === 'attack' && !allowAttack) continue;
      if (action !== 'attack' && action !== 'chase') continue;
      if (now < (e.nextActAt || 0)) continue;
      e.nextActAt = now + ENEMY_ACT_MS;

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
      } else {
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
      (x, y) => isWall(x, y) || !!enemyAt(x, y) || (x === P.x && y === P.y),
      map);
    if (next) { e.x = next.x; e.y = next.y; }
  }

  function die() {
    over = true;
    P.hp = 0;
    P.exp = Math.floor(P.exp * (1 - (DEATH.expLoss || 0.05)));
    // R3.19：按概率掉一件身上穿的装备，留在倒下的地方；回去能捡回来
    let lost = null;
    const worn = wornSlotIds();
    if (currentRoom && worn.length && Math.random() < (DEATH.dropP || 0)) {
      const slot = worn[randi(0, worn.length - 1)];
      lost = P[slot];
      setWorn(slot, null);
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
  // pace: 'combat' 打怪节奏（~1s）| 'move' 走路节奏（更快，怪只追不砍）
  function after(opts) {
    if (over) return;
    const pace = (opts && opts.pace) || 'combat';
    nextIdleMs = pace === 'move' ? MOVE_MS : COMBAT_MS;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // 战斗回合照常结算 DoT；走路回合最多约 1 次/秒，避免狂冒字
    if (pace !== 'move' || now >= statusNextTickAt) {
      tickStatuses();                 // R5.14：毒 / 灼烧
      if (pace === 'move') statusNextTickAt = now + COMBAT_MS;
    }
    if (over) return;
    P.mp = Math.min(maxMp(), P.mp + Math.max(1, Math.round(maxMp() * 0.08)));
    if (P.cd.half > 0) P.cd.half--;
    if (P.cd.fire > 0) P.cd.fire--;
    if (P.potionCd.red > 0) P.potionCd.red--;
    if (P.potionCd.blue > 0) P.potionCd.blue--;
    // 走路回合：怪只追不打；战斗回合：可追可打（每怪仍约 1 次/秒）
    if (!leveledUp) enemiesTurn({ allowAttack: pace !== 'move' });
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

  // 战斗锁定：仅「玩家主动打过」且仍贴身的怪；靠近≠开战，可走开
  function combatTargets() {
    return enemies.filter((e) => e.hp > 0 && e.playerEngaged && dist(e, P) === 1);
  }

  function inCombat() {
    return combatTargets().length > 0;
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

  // 贴身自动出手（挂机打合格怪；手控打任意贴身）
  function autoStrikeAdjacent(target, fromFarm) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now < playerNextStrikeAt) return;
    playerNextStrikeAt = now + COMBAT_MS;
    faceTo(target.x, target.y);
    if (fromFarm) {
      const halfAll = halfMoonTargets();
      const halfFarm = halfAll.filter((e) => DL.Combat.farmEligible(e));
      const halfSafe = halfAll.length > 0 && halfAll.every((e) => DL.Combat.farmEligible(e));
      const canHalf = P.skills.half && P.cd.half <= 0 && P.mp >= 6 && halfSafe;
      const canFire = P.skills.fire && P.cd.fire <= 0 && P.mp >= 12;
      killFromFarm = true;
      if (canHalf && halfFarm.length >= 2) { act('half'); return; }
      if (canFire) {
        P.mp -= 12;
        P.cd.fire = 3;
        strike(target, 2.2, '烈火');
        if (target.hp > 0) {
          const st = S.apply(target, 'burn', { turn, dmg: S.damageFrom('burn', atkMean()) });
          if (st) log(`${target.name}被点燃了（🔥${st.stacks}，剩 ${st.left} 回合）。`, 'good');
        }
        after();
        return;
      }
      if (canHalf && halfFarm.length >= 1) { act('half'); return; }
    }
    if (fromFarm) killFromFarm = true;
    strike(target, 1.2, '攻击');
    after();
  }

  // 挂机寻路一步；身边只有稀有/BOSS 时允许走开（否则八向贴身后永远卡死）
  function farmStepTo(gx, gy) {
    const path = bfs(P.x, P.y, gx, gy);
    if (!path || !path.length) { after({ pace: 'move' }); return true; }
    const n = path[0];
    const dx = n.x - P.x, dy = n.y - P.y;
    if (move(dx, dy, true)) return true;
    // move 被战斗锁定挡住：硬挪一步（不撞稀有/BOSS 格）
    if (!DL.World.canStep(map, P.x, P.y, dx, dy)) { after({ pace: 'move' }); return true; }
    const nx = P.x + dx, ny = P.y + dy;
    const block = enemyAt(nx, ny);
    if (block && !DL.Combat.farmEligible(block)) { after({ pace: 'move' }); return true; }
    if (block) {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now < playerNextStrikeAt) { after({ pace: 'move' }); return true; }
      playerNextStrikeAt = now + COMBAT_MS;
      killFromFarm = true;
      strike(block, 1.2, '攻击');
      after();
      return true;
    }
    P.x = nx;
    P.y = ny;
    const bag = bagAt(nx, ny);
    if (bag && bag.items.length && bagAutoLootable(bag)) autoTakeBag(bag);
    after({ pace: 'move' });
    return true;
  }

  // 时间驱动：挂机关也要贴身普攻 + 有怪时警戒（怪才能追/打）；挂机另加寻路捡袋
  function autoStep() {
    if (!currentRoom || over || uiOpen() || walkTimer) return false;
    // 摇杆/方向键正在走：位移已由 stick 的 after(move) 推进（含怪追击）；
    // 这里若再插警戒 after(combat)，会被走路的 180ms 时钟带着狂结算 DoT/CD
    if ((stickDx || stickDy) || heldMove.size) return false;
    const t = turn;

    if (!S.canAct(P)) { blockAction(); return turn !== t; }

    // 自动喝药（挂机/手控都开；红优先于蓝）
    if (P.autoPot > 0 && P.potionCd.red <= 0 &&
      P.hp <= maxHp() * P.autoPot / 100) {
      if (drink('red')) { after(); return true; }
    }
    if (P.autoMp > 0 && P.potionCd.blue <= 0 &&
      P.mp <= maxMp() * P.autoMp / 100) {
      if (drink('blue')) { after(); return true; }
    }

    if (autoFarm) {
      const under = bagAt(P.x, P.y);
      if (under && under.items.length) {
        if (bagAutoLootable(under)) {
          if (!autoTakeBag(under)) return turn !== t;
          after();
          return true;
        }
      }

      const farmT = adjacentFarmTarget();
      if (farmT) {
        autoStrikeAdjacent(farmT, true);
        return turn !== t;
      }

      const loot = nearestAutoLootBag();
      const foe = nearestFarmEnemy();
      let gx = null, gy = null;
      if (loot && (!foe || dist(loot, P) <= dist(foe, P))) {
        gx = loot.x; gy = loot.y;
      } else if (foe) {
        const goal = bestAdjacent(foe.x, foe.y);
        if (goal) { gx = goal.x; gy = goal.y; }
      }
      if (gx == null) {
        // 无合格怪：用战斗节奏推进，避免 0.18s 狂结算
        after({ pace: 'combat' });
        return turn !== t;
      }
      farmStepTo(gx, gy);
      return turn !== t;
    }

    // —— 挂机关：已开战贴身才自动打；靠近未开战不砍，有怪则警戒让怪动 ——
    const handT = living((e) => e.playerEngaged && DL.Combat.isAdjacent(e.x, e.y, P.x, P.y))
      .sort((a, b) => a.hp - b.hp)[0] || null;
    if (handT) {
      autoStrikeAdjacent(handT, false);
      return turn !== t;
    }
    if (living().length) {
      after({ pace: 'combat' }); // 警戒约 1s 一拍，不跟走路同频冒字
      return turn !== t;
    }
    return false;
  }

  function scheduleIdle(ms) {
    if (autoDisabled) return;
    clearTimeout(idleTimer);
    const delay = ms != null ? ms : nextIdleMs;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      nextIdleMs = COMBAT_MS;       // 默认下一拍按战斗；走路 after 会改
      if (autoStep()) return;       // autoStep 内部 after() 会重新排下一拍
      scheduleIdle();
    }, delay);
  }

  function startClockTimer() {
    if (clockTimer) return;
    clockTimer = setInterval(() => {
      if (document.hidden) return;
      clock = (clock + 1) % 1440;
      updateClockLabel();
      if (currentRoom) tryRoomRespawn();
      if (hubRegen()) syncHud();
      else if (currentRoom) syncHud();
    }, 1000);
  }

  function pauseAuto() {
    autoDisabled = true;
    clearTimeout(idleTimer);
    idleTimer = null;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  // 恢复自动回合（pauseAuto 之后必须调用，否则自动攻击/补刷永久停摆）
  function resumeAuto() {
    autoDisabled = false;
    startClockTimer();
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

  // kind: 'red' | 'blue'；优先喝最低档有货的
  function drink(kind) {
    kind = kind === 'blue' ? 'blue' : 'red';
    const label = kind === 'blue' ? '蓝药' : '红药';
    if (P.potionCd[kind] > 0) {
      log(`${label}还在冷却（${P.potionCd[kind]} 回合）。`);
      return false;
    }
    const tier = pickPotTier(kind);
    if (!tier) { log(`没有${label}了。`, 'bad'); return false; }
    P.pots[kind][tier.id]--;
    P.potionCd[kind] = POTIONS.cd || 3;
    if (kind === 'blue') {
      const before = P.mp;
      P.mp = Math.min(maxMp(), P.mp + tier.amount);
      const got = Math.round(P.mp - before);
      addFloater(P.x, P.y - 0.4, `+${got}MP`, '#6ab0ff');
      log(`喝下${tier.name}蓝药，回复 ${got} MP。`, 'good');
    } else {
      const before = P.hp;
      P.hp = Math.min(maxHp(), P.hp + tier.amount);
      const got = Math.round(P.hp - before);
      addFloater(P.x, P.y - 0.4, `+${got}`, '#7ee0a0');
      log(`喝下${tier.name}红药，回复 ${got} HP。`, 'good');
    }
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
    else if (kind === 'potion' || kind === 'red') { if (drink('red')) after(); }
    else if (kind === 'blue') { if (drink('blue')) after(); }
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
    const cd = bossCdOf(spec);
    const tail = spec.boss
      ? `普通怪死后约 5 秒补一只；首领打倒后 ${cd} 分钟内不刷新（被动，不主动追人）。`
      : '普通怪死后约 5 秒补一只；可开挂机刷普通/精英。';
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
    dx = Math.sign(dx); dy = Math.sign(dy);
    if (!dx && !dy) return false;
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
    // 朝向：斜走取主轴，半月仍四向
    if (dx && dy) {
      if (Math.abs(dx) >= Math.abs(dy)) P.dir = dx < 0 ? 'l' : 'r';
      else P.dir = dy < 0 ? 'u' : 'd';
    } else if (dx < 0) P.dir = 'l';
    else if (dx > 0) P.dir = 'r';
    else if (dy < 0) P.dir = 'u';
    else if (dy > 0) P.dir = 'd';
    if (!DL.World.canStep(map, P.x, P.y, dx, dy)) {
      if (!fromWalk) log('那边过不去。');
      return false;
    }
    const nx = P.x + dx, ny = P.y + dy;
    const e = enemyAt(nx, ny);
    if (e) {
      // 撞怪 = 攻击；摇杆 180ms 连撞不能变成扫射，跟战斗节奏对齐
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now < playerNextStrikeAt) {
        if (fromWalk) stopWalk();
        return false;
      }
      playerNextStrikeAt = now + COMBAT_MS;
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
    // 走到袋子上：挂机自动捡 ≤B；否则弹清单
    const bag = bagAt(nx, ny);
    if (bag && bag.items.length) {
      if (autoFarm && bagAutoLootable(bag)) autoTakeBag(bag);
      else if (autoFarm) log(`地上有 ${bagBestRarityKey(bag).toUpperCase()} 级袋子，挂机不捡——请手控。`);
      else pickupBag(bag);
    }
    // 纯走路用快节奏；撞怪攻击走 strike→after 已是战斗节奏
    after({ pace: 'move' });
    return true;
  }

  function retreat() {
    if (over || uiOpen()) return;
    if (!blockAction()) return;
    const foes = combatTargets();
    if (!foes.length) { log('没有交战中的敌人，不用撤（靠近未打可直接走开）。'); return; }
    const nearest = foes.slice().sort((a, b) => dist(a, P) - dist(b, P))[0];
    const dr = defRange(P);
    const dmg = DL.Combat.enemyDamage(nearest.atk, dr.min, dr.max, maxHp(), nearest.boss);
    P.hp -= dmg;
    addFloater(P.x, P.y - 0.4, `-${dmg}`, '#ff6b6b');
    log(`${nearest.name}趁机咬了你一口，<span class="bad">-${dmg} HP</span>。`, 'bad');
    if (P.hp <= 0) { die(); return; }
    const dirs = DL.World.DIRS8;
    const away = dirs.filter(([dx, dy]) => DL.World.canStep(map, P.x, P.y, dx, dy)
      && !enemyAt(P.x + dx, P.y + dy)).sort((a, b) => {
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
    // 撤退成功：解除交战锁定（怪可能还在追，但不再钉死走位）
    for (const e of foes) e.playerEngaged = false;
    combatLock = false;
    log('你且战且退。', 'good');
    after();
  }

  /* ---------------- 寻路 ---------------- */
  function bfs(sx, sy, tx, ty) {
    return DL.World.bfs(map, sx, sy, tx, ty, enemyAt);
  }

  function bestAdjacent(x, y) {
    const opts = [];
    for (const [dx, dy] of DL.World.DIRS8) {
      const nx = x + dx, ny = y + dy;
      // 从玩家走到该邻格也要能走（含穿角）；落脚点本身可站
      if (isWall(nx, ny) || enemyAt(nx, ny) || (nx === P.x && ny === P.y)) continue;
      opts.push({ x: nx, y: ny });
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
      if (Math.max(Math.abs(n.x - P.x), Math.abs(n.y - P.y)) !== 1) { stopWalk(); return; }
      if (enemyAt(n.x, n.y)) {
        faceTo(n.x, n.y);
        act('attack');
        return;
      }
      const moved = move(n.x - P.x, n.y - P.y, true);
      if (!moved) { stopWalk(); return; }
      if (token !== walkToken) return;   // 撞怪/换图会取消剩余路径
      if (over || uiOpen()) { stopWalk(); return; }
      walkTimer = setTimeout(step, WALK_STEP_MS);
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
      if (nearShop()) { tryInteract(); return; }
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

  // 方向键状态：键盘 WASD；左侧为拖动轮盘（八向吸附）
  const heldMove = new Set();
  const MOVE_KEYS = {
    w: 1, a: 1, s: 1, d: 1,
    arrowup: 1, arrowleft: 1, arrowdown: 1, arrowright: 1,
  };
  let stickPtr = null;           // 轮盘只认第一根手指
  let stickDx = 0, stickDy = 0;
  let stickTimer = null;

  function heldMoveDelta() {
    let dx = 0, dy = 0;
    if (heldMove.has('a') || heldMove.has('arrowleft')) dx -= 1;
    if (heldMove.has('d') || heldMove.has('arrowright')) dx += 1;
    if (heldMove.has('w') || heldMove.has('arrowup')) dy -= 1;
    if (heldMove.has('s') || heldMove.has('arrowdown')) dy += 1;
    return [dx, dy];
  }

  function setKnobOffset(ox, oy, active) {
    if (!el.stickKnob) return;
    el.stickKnob.style.transform = `translate(${ox}px, ${oy}px)`;
    if (el.dpad) el.dpad.classList.toggle('active', !!active);
  }

  function syncDpadActive() {
    if (stickPtr != null) return; // 拖动中轮盘自己管旋钮
    const [dx, dy] = heldMoveDelta();
    const base = el.stickBase || el.dpad;
    if (!base) return;
    const r = Math.min(base.clientWidth, base.clientHeight) * 0.28;
    setKnobOffset(dx * r, dy * r, !!(dx || dy));
  }

  function pressMoveKey(k) {
    heldMove.add(k);
    stopWalk();
    const [dx, dy] = heldMoveDelta();
    if (dx || dy) move(dx, dy);
    syncDpadActive();
  }
  function releaseMoveKey(k) {
    heldMove.delete(k);
    syncDpadActive();
  }

  function stopStickRepeat() {
    if (stickTimer) { clearTimeout(stickTimer); stickTimer = null; }
  }

  function setStickDir(dx, dy) {
    const changed = dx !== stickDx || dy !== stickDy;
    const wasOn = !!(stickDx || stickDy);
    stickDx = dx;
    stickDy = dy;
    if (!(dx || dy)) {
      stopStickRepeat();
      return;
    }
    if (!wasOn || changed) {
      stopStickRepeat();
      if (!uiOpen() && !over) {
        stopWalk();
        move(dx, dy);
      }
      const tick = () => {
        if (!(stickDx || stickDy)) { stickTimer = null; return; }
        if (!uiOpen() && !over) {
          stopWalk();
          move(stickDx, stickDy);
        }
        stickTimer = setTimeout(tick, MOVE_MS);
      };
      stickTimer = setTimeout(tick, MOVE_MS);
    }
  }

  // 屏幕向量 → 八向（含死区）
  function vecToOctant(nx, ny, maxR) {
    const len = Math.hypot(nx, ny);
    if (len < maxR * 0.28) return [0, 0];
    const ang = Math.atan2(ny, nx);
    const sector = Math.round(ang / (Math.PI / 4));
    const dirs = [
      [1, 0], [1, 1], [0, 1], [-1, 1],
      [-1, 0], [-1, -1], [0, -1], [1, -1],
    ];
    return dirs[((sector % 8) + 8) % 8];
  }

  function updateStickFromEvent(e) {
    const base = el.stickBase || el.dpad;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.min(rect.width, rect.height) * 0.36;
    let nx = e.clientX - cx;
    let ny = e.clientY - cy;
    const len = Math.hypot(nx, ny);
    if (len > maxR && len > 0) {
      nx = nx / len * maxR;
      ny = ny / len * maxR;
    }
    setKnobOffset(nx, ny, true);
    const [dx, dy] = vecToOctant(nx, ny, maxR);
    setStickDir(dx, dy);
  }

  function endStick() {
    stickPtr = null;
    setStickDir(0, 0);
    setKnobOffset(0, 0, false);
    syncDpadActive();
  }

  function bindDpad() {
    if (!el.dpad) return;
    el.dpad.addEventListener('contextmenu', (e) => e.preventDefault());
    const down = (e) => {
      if (stickPtr != null && e.pointerId !== stickPtr) return; // 多指只认第一根
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (uiOpen() || over) return;
      stickPtr = e.pointerId;
      try { el.dpad.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
      updateStickFromEvent(e);
    };
    const move = (e) => {
      if (e.pointerId !== stickPtr) return;
      e.preventDefault();
      updateStickFromEvent(e);
    };
    const up = (e) => {
      if (e.pointerId !== stickPtr) return;
      e.preventDefault();
      endStick();
    };
    el.dpad.addEventListener('pointerdown', down);
    el.dpad.addEventListener('pointermove', move);
    el.dpad.addEventListener('pointerup', up);
    el.dpad.addEventListener('pointercancel', up);
    el.dpad.addEventListener('lostpointercapture', () => {
      if (stickPtr != null) endStick();
    });
  }

  function onKey(e) {
    if (e.target && /input|textarea/i.test(e.target.tagName || '')) return;
    const k = (e.key || '').toLowerCase();
    if (uiOpen()) {
      if (k === 'escape') closeAll();
      else if (k === 'c' && !el.char.hidden) el.char.hidden = true;
      return;
    }
    if (MOVE_KEYS[k]) {
      e.preventDefault();
      if (e.repeat) return; // 长按不连跳格，避免斜走抖成连走
      pressMoveKey(k);
      return;
    }
    if (k === 'j') { e.preventDefault(); act('attack'); }
    else if (k === '1') { e.preventDefault(); act('half'); }
    else if (k === '2') { e.preventDefault(); act('fire'); }
    else if (k === 'q') { e.preventDefault(); act('red'); }
    else if (k === 'f') { e.preventDefault(); act('blue'); }
    else if (k === 'e') { e.preventDefault(); toggleFarm(); }
    else if (k === ' ' || k === 'spacebar') { e.preventDefault(); tryInteract(); }
    else if (k === 'r') { e.preventDefault(); retreat(); }
    else if (k === 'c') { e.preventDefault(); toggleChar(); }
    else if (k === 'escape') closeAll();
  }

  function onKeyUp(e) {
    const k = (e.key || '').toLowerCase();
    if (MOVE_KEYS[k]) releaseMoveKey(k);
  }

  let shopCatalog = null; // 商人货架：药水 + 固定装备预览

  function ensureShopCatalog() {
    if (shopCatalog) return shopCatalog;
    const list = [];
    for (const kind of ['red', 'blue']) {
      for (const t of POT_TIERS) {
        const tag = kind === 'blue' ? '蓝' : '红';
        list.push({
          kind: 'pot', potKind: kind, tierId: t.id,
          name: `${t.name}${tag}药`, amount: t.amount,
          price: potPrice(kind, t.id),
        });
      }
    }
    list.push({
      kind: 'equip', buyId: 'sword', price: SHOP.sword.price,
      eq: makeEquip('weapon', 3, 'white', { atkMin: 3, atkMax: 3, defMin: 0, defMax: 0, hp: 0 }),
    });
    list.push({
      kind: 'equip', buyId: 'armor', price: SHOP.armor.price,
      eq: makeEquip('armor', 3, 'white', { atkMin: 0, atkMax: 0, defMin: 2, defMax: 2, hp: 15 }),
    });
    shopCatalog = list;
    return shopCatalog;
  }

  function openShop() {
    if (over) return;
    if (!nearShop()) { log('商人不在附近，回村口找他。', 'bad'); return; }
    hideEqTip();
    el.shop.hidden = false;
    refreshShop();
  }

  function refreshShop() {
    if (!el.shopGold) return;
    el.shopGold.textContent = P.gold;
    const stock = ensureShopCatalog();
    if (el.shopStock) {
      el.shopStock.innerHTML = stock.map((it, i) => {
        if (it.kind === 'pot') return potCellHtml(it, i);
        return eqCellHtml(it.eq, { shopStock: i, price: it.price });
      }).join('');
    }
    if (el.shopBag) {
      const cells = [];
      for (let i = 0; i < BAG_MAX; i++) {
        const eq = P.bag[i];
        cells.push(eq
          ? eqCellHtml(eq, { shopBag: i, price: sellPrice(eq) })
          : eqCellHtml(null, { label: '' }));
      }
      el.shopBag.innerHTML = cells.join('');
    }
  }

  function buyShopStock(i) {
    const it = ensureShopCatalog()[i];
    if (!it) return false;
    if (it.kind === 'pot') return buyPotion(it.potKind, it.tierId);
    return buy(it.buyId);
  }

  function buyPotion(kind, tierId) {
    kind = kind === 'blue' ? 'blue' : 'red';
    const tier = potTier(tierId);
    if (!tier) return false;
    const price = potPrice(kind, tier.id);
    if (P.gold < price) {
      log(`金币不够，还差 ${price - P.gold}。`, 'bad');
      return false;
    }
    P.gold -= price;
    P.pots[kind][tier.id] = (P.pots[kind][tier.id] || 0) + 1;
    log(`买了 1 瓶${tier.name}${kind === 'blue' ? '蓝' : '红'}药。`, 'good');
    syncHud();
    if (!el.shop.hidden) refreshShop();
    save();
    return true;
  }

  function buy(kind) {
    if (kind === 'potion' || kind === 'potRedLow') return buyPotion('red', 'low');
    const it = SHOP[kind];
    if (!it) return false;
    if (P.gold < it.price) {
      log(`金币不够，还差 ${it.price - P.gold}。`, 'bad');
      return false;
    }
    if (P.bag.length >= BAG_MAX) {
      // 若会自动穿上且不占包，仍可买；否则提示满包
      const preview = kind === 'sword'
        ? makeEquip('weapon', 3, 'white', { atkMin: 3, atkMax: 3, defMin: 0, defMax: 0, hp: 0 })
        : makeEquip('armor', 3, 'white', { atkMin: 0, atkMax: 0, defMin: 2, defMax: 2, hp: 15 });
      const cur = wornOf(preview.slot);
      const willAuto = canWearEq(preview) && eqScore(preview) > eqScore(cur) + 0.001;
      if (!willAuto || (cur && P.bag.length >= BAG_MAX)) {
        log('背包满了，先卖掉或丢掉一些再买。', 'bad');
        return false;
      }
    }
    P.gold -= it.price;
    if (kind === 'sword') {
      giveEquip(makeEquip('weapon', 3, 'white', { atkMin: 3, atkMax: 3, defMin: 0, defMax: 0, hp: 0 }));
    } else if (kind === 'armor') {
      giveEquip(makeEquip('armor', 3, 'white', { atkMin: 0, atkMax: 0, defMin: 2, defMax: 2, hp: 15 }));
    }
    syncHud();
    if (!el.shop.hidden) refreshShop();
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
    hideEqTip();
  }

  // 点遮罩空白处关闭（点卡片内部不关）
  function bindBackdropClose(overlay, closeFn) {
    if (!overlay) return;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeFn();
    });
  }

  function bind() {
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
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
    bindDpad();
    if (el.logToggle) el.logToggle.addEventListener('click', toggleLogFold);
    el.btnAtk.addEventListener('click', () => act('attack'));
    el.btnHalf.addEventListener('click', () => act('half'));
    el.btnFire.addEventListener('click', () => act('fire'));
    el.btnPotion.addEventListener('click', () => act('red'));
    if (el.btnMpPotion) el.btnMpPotion.addEventListener('click', () => act('blue'));
    if (el.btnRetreat) el.btnRetreat.addEventListener('click', retreat);
    if (el.btnFarm) el.btnFarm.addEventListener('click', toggleFarm);
    if (el.btnInteract) el.btnInteract.addEventListener('click', tryInteract);
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
    el.charClose.addEventListener('click', () => { hideEqTip(); el.char.hidden = true; });
    bindBackdropClose(el.char, () => { hideEqTip(); el.char.hidden = true; });
    bindBackdropClose(el.shop, () => { hideEqTip(); el.shop.hidden = true; });
    bindBackdropClose(el.menu, () => { el.menu.hidden = true; });
    bindBackdropClose(el.lootPick, () => { hideEqTip(); closePick(); });
    if (el.shopClose) el.shopClose.addEventListener('click', () => { hideEqTip(); el.shop.hidden = true; });
    // 商店左右窗：货架买 / 背包卖（悬停·点击详情，双击成交，右键卖）
    const bindShopGrid = (root, mode) => {
      if (!root) return;
      const read = (cell) => {
        if (mode === 'stock' && cell.dataset.shopStock != null) {
          const i = Number(cell.dataset.shopStock);
          return { i, it: ensureShopCatalog()[i] };
        }
        if (mode === 'bag' && cell.dataset.shopBag != null) {
          const i = Number(cell.dataset.shopBag);
          return { i, eq: P.bag[i] };
        }
        return null;
      };
      const preview = (cell, sticky) => {
        const info = read(cell);
        if (!info) return;
        if (mode === 'stock') {
          if (!info.it) return;
          const src = { kind: 'shopStock', i: info.i, price: info.it.price };
          if (info.it.kind === 'pot') showPotTip(info.it, src, sticky, cell);
          else showEqTip(info.it.eq, src, sticky, cell);
        } else if (info.eq) {
          showEqTip(info.eq, { kind: 'shopBag', i: info.i }, sticky, cell);
        }
      };
      root.addEventListener('pointerover', (e) => {
        const cell = e.target.closest('.eq-cell:not(.empty)');
        if (!cell || tipSticky) return;
        preview(cell, false);
      });
      root.addEventListener('pointerout', (e) => {
        if (tipSticky) return;
        const to = e.relatedTarget;
        if (to && (root.contains(to) || (el.eqTip && el.eqTip.contains(to)))) return;
        hideEqTip();
      });
      root.addEventListener('click', (e) => {
        const cell = e.target.closest('.eq-cell:not(.empty)');
        if (!cell || !root.contains(cell)) return;
        e.stopPropagation();
        preview(cell, true);
      });
      root.addEventListener('dblclick', (e) => {
        const cell = e.target.closest('.eq-cell:not(.empty)');
        if (!cell || !root.contains(cell)) return;
        e.preventDefault();
        e.stopPropagation();
        const info = read(cell);
        if (!info) return;
        if (mode === 'stock') {
          if (buyShopStock(info.i)) hideEqTip();
        } else if (info.eq) {
          if (sellFromBag(info.i)) hideEqTip();
        }
      });
      if (mode === 'bag') {
        root.addEventListener('contextmenu', (e) => {
          const cell = e.target.closest('.eq-cell:not(.empty)');
          if (!cell || !root.contains(cell)) return;
          e.preventDefault();
          const info = read(cell);
          if (info && info.eq && sellFromBag(info.i)) hideEqTip();
        });
      }
    };
    bindShopGrid(el.shopStock, 'stock');
    bindShopGrid(el.shopBag, 'bag');
    if (el.eqTipClose) el.eqTipClose.addEventListener('click', hideEqTip);
    // 装备格子：悬停预览，点击钉住详情（手机靠点击）
    const bindEqGrid = (root, kind) => {
      if (!root) return;
      root.addEventListener('pointerover', (e) => {
        const cell = e.target.closest('.eq-cell:not(.empty)');
        if (!cell || tipSticky) return;
        let src = null, eq = null;
        if (cell.dataset.bag != null) {
          src = { kind: 'bag', i: Number(cell.dataset.bag) };
          eq = P.bag[src.i];
        } else if (cell.dataset.worn) {
          src = { kind: 'worn', i: cell.dataset.worn };
          eq = resolveEqFromSrc(src);
        } else if (cell.dataset.pick != null) {
          src = { kind: 'pick', i: Number(cell.dataset.pick) };
          eq = resolveEqFromSrc(src);
        }
        if (eq) showEqTip(eq, src, false, cell);
      });
      root.addEventListener('pointerout', (e) => {
        if (tipSticky) return;
        const to = e.relatedTarget;
        if (to && (root.contains(to) || (el.eqTip && el.eqTip.contains(to)))) return;
        hideEqTip();
      });
      root.addEventListener('click', (e) => {
        // tip 按钮在 eqTip 里，这里只处理格子
        const cell = e.target.closest('.eq-cell:not(.empty)');
        if (!cell || !root.contains(cell)) return;
        e.stopPropagation();
        let src = null, eq = null;
        if (cell.dataset.bag != null) {
          src = { kind: 'bag', i: Number(cell.dataset.bag) };
          eq = P.bag[src.i];
        } else if (cell.dataset.worn) {
          src = { kind: 'worn', i: cell.dataset.worn };
          eq = resolveEqFromSrc(src);
        } else if (cell.dataset.pick != null) {
          src = { kind: 'pick', i: Number(cell.dataset.pick) };
          eq = resolveEqFromSrc(src);
        }
        if (eq) showEqTip(eq, src, true, cell);
      });
      // 背包双击直接穿戴
      if (kind === 'bag') {
        root.addEventListener('dblclick', (e) => {
          const cell = e.target.closest('.eq-cell:not(.empty)');
          if (!cell || cell.dataset.bag == null || !root.contains(cell)) return;
          e.preventDefault();
          e.stopPropagation();
          if (equipFromBag(Number(cell.dataset.bag))) hideEqTip();
        });
      }
    };
    bindEqGrid(el.charSlots, 'worn');
    bindEqGrid(el.bagList, 'bag');
    bindEqGrid(el.pickList, 'pick');
    if (el.eqTip) {
      el.eqTip.addEventListener('click', (e) => {
        const pickBtn = e.target.closest('[data-tip-pick]');
        if (pickBtn) {
          takeFromBag(Number(pickBtn.dataset.tipPick));
          hideEqTip();
          if (pickBag && pickBag.items.length) renderPick();
        }
      });
    }
    // 点角色卡空白处关掉提示（不关整个面板）
    if (el.char) {
      const card = el.char.querySelector('.char-card');
      if (card) {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.eq-cell, .eq-tip, button, select, label, a')) return;
          if (!el.eqTip.hidden) hideEqTip();
        });
      }
    }
    el.autoPot.addEventListener('change', () => {
      P.autoPot = Number(el.autoPot.value) || 0;
      save();
      log(P.autoPot ? `自动红药：血量低于 ${P.autoPot}% 时喝。` : '自动红药已关闭。');
    });
    if (el.autoMp) el.autoMp.addEventListener('change', () => {
      P.autoMp = Number(el.autoMp.value) || 0;
      save();
      log(P.autoMp ? `自动蓝药：蓝量低于 ${P.autoMp}% 时喝。` : '自动蓝药已关闭。');
    });
    el.menuRestart.addEventListener('click', restart);
    el.doorYes.addEventListener('click', confirmDoor);
    el.doorNo.addEventListener('click', cancelDoor);
    el.pickAll.addEventListener('click', () => { hideEqTip(); takeAllFromBag(); });
    el.pickClose.addEventListener('click', () => { hideEqTip(); closePick(); });
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

  startClockTimer();
  save();

  if (location.search.includes('debug')) {
    window.__dl = {
      P, act, move, attack, halfMoon, fireSword, drink, buy, buyPotion, buyShopStock,
      openShop, refreshShop, ensureShopCatalog,
      potTotal, potPrice, pickPotTier, normalizePots,
      revive, continueAfterWin, die, win, dropEquip, makeEquip, giveEquip,
      makeEnemy, rollGrade, isCrush,
      hubRegen,
      addToBag, equipFromBag, sellFromBag, sellPrice, openChar, eqCompareHtml, eqStatText, eqDetailHtml,
      eqReqLv, canWearEq,
      rollDropSlot, slotUnlocked, slotMeta, EQUIP_SLOTS, wornOf,
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
      retreat, inCombat, combatTargets, engage,
      resetEnemyClock: () => {
        enemyNextActAt = 0;
        statusNextTickAt = 0;
        playerNextStrikeAt = 0;
        for (const e of enemies) e.nextActAt = 0;
      },
      enemyActMs: () => ENEMY_ACT_MS,
      Status: S,
      tickStatuses, enemiesTurn, bossTrick,
      statusText: (unit) => S.text(unit || P),
      after,
      bags: () => activeBags,
      groundBags: () => groundBags,
      bagAt, dropBag, pickupBag, takeFromBag, takeAllFromBag, closePick, rollDrop,
      autoTakeBag, bagAutoLootable, bagBestRarityKey,
      setAutoFarm, toggleFarm, autoFarm: () => autoFarm,
      onRareSpawned, nearestFarmEnemy, adjacentFarmTarget, rareThreatNear,
      tryRoomRespawn, queueNormalRespawn, respawnPending: () => normalRespawnDue.length,
      trySpawnEliteGuaranteed, trySpawnRareGuaranteed,
      spawnOneInRoom, spawnBossInRoom, onNormalKillProgress,
      killsToElite: () => killsToElite, killsToRare: () => killsToRare,
      eliteThreshold: () => eliteThreshold, rareThreshold: () => rareThreshold,
      rollPityThresholds, rollEliteThreshold, rollRareThreshold,
      eliteLeft, rareLeft, spawnProgressText, elitePityMax, rarePityMax,
      killFromFarmFlag: () => killFromFarm,
      setKillFromFarm: (v) => { killFromFarm = !!v; },
      eqText: (eq) => eqStatText(eq),
      eqDefMin, eqDefMax, eqAtkMin, eqAtkMax,
      pickOpen: () => !el.lootPick.hidden,
      pickItems: () => (pickBag ? pickBag.items.slice() : []),
      maxHp: () => maxHp(), maxMp: () => maxMp(),
      idleMs: () => IDLE_MS,
      combatMs: () => COMBAT_MS,
      moveMs: () => MOVE_MS,
      walkStepMs: () => WALK_STEP_MS,
      clock: () => clock,
      clockText,
      tick: autoStep, pauseAuto, resumeAuto, startClockTimer,
      clockTimerOn: () => !!clockTimer,
      autoEnabled: () => !autoDisabled,
      hideIntro: () => { el.intro.hidden = true; },
      setPos: (x, y) => { P.x = x; P.y = y; },
      setHp: (v) => { P.hp = v; },
      setMp: (v) => { P.mp = v; },
      setGold: (v) => { P.gold = v; },
      rest: () => { P.hp = maxHp(); P.mp = maxMp(); },
      state: () => ({
        lv: P.lv, exp: P.exp, hp: P.hp, mp: P.mp, gold: P.gold,
        potions: potTotal('red'), potsRed: potTotal('red'), potsBlue: potTotal('blue'),
        pots: { red: { ...P.pots.red }, blue: { ...P.pots.blue } },
        turn, over, inCave, room: currentRoom, weapon: P.weapon, armor: P.armor,
        cd: { ...P.cd }, skills: { ...P.skills },
        enemyCount: enemies.filter((e) => e.hp > 0).length,
      }),
    };
  }
})();
