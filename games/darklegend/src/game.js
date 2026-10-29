/* 豆豆海岛幻想 · M1.1
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
import { DL } from './namespace.js';
import './data.js';
import './core.js';
import './world.js';
import './combat.js';
import './status.js';
import './sfx.js';

const D = DL.DATA;
  if (!D.ROOMS) throw new Error('data.js 未加载');
  const Sfx = (window.DL && window.DL.Sfx) || {
    unlock() {}, enable() {}, play() {}, drop() {},
    isMuted() { return false; }, isUnlocked() { return true; },
    setMuted() { return false; }, toggleMute() { return false; },
    onChange() {}, getLastError() { return ''; },
  };
  const SAVE_KEY = D.SAVE_KEY;
  const LEGACY_KEY = D.LEGACY_KEY;
  const BAG_MAX = D.BAG_MAX;
  const STASH_MAX = D.STASH_MAX || 100;

  const el = {};
  [
    'lv', 'hpFill', 'hpText', 'mpFill', 'mpText', 'expFill', 'expText', 'gold', 'gear', 'tips', 'log',
    'btnAtk', 'btnHalf', 'btnFire', 'btnPotion', 'btnMpPotion', 'btnFarm', 'btnInteract', 'btnRetreat', 'btnMenu', 'btnMute',
    'halfCd', 'fireCd', 'potionCount', 'potionCd', 'mpPotionCount', 'mpPotionCd',
    'logWrap', 'logToggle', 'dpad', 'stickBase', 'stickKnob',
    'over', 'overK', 'overT', 'overS', 'overBtn', 'overAlt',
    'shop', 'shopGold', 'shopClose', 'shopStock', 'shopBag',
    'stash', 'stashCount', 'stashGrid', 'stashBag', 'stashClose',
    'bookShop', 'bookShopGold', 'bookShopList', 'bookShopClose',
    'trial', 'trialRound', 'trialDesc', 'trialProg', 'trialReward', 'trialTurnIn', 'trialAbandon', 'trialClose', 'trialExpOrbs', 'trialUseOrb', 'trialMats', 'trialSellMats', 'trialModePick', 'trialSwitch',
    'menu', 'menuClose', 'menuRetreat', 'menuRestart', 'menuMute',
    'btnChar', 'char', 'charLv', 'charExpFill', 'charExpText', 'charPower', 'charGold',
    'charTabs', 'paneGear', 'paneBag', 'paneSkills', 'skillList',
    'charStats', 'charSlots', 'bagCount', 'bagList', 'charClose', 'autoPot', 'autoMp', 'autoTown', 'potStock',
    'eqTip', 'eqTipName', 'eqTipStats', 'eqTipActs', 'eqTipClose',
    'loot', 'lootName', 'lootStats', 'lootAffix',
    'intro', 'introBtn', 'seedText', 'sfxGate', 'sfxEnable',
    'doorConfirm', 'doorTitle', 'doorDesc', 'doorList', 'doorNo',
    'pStatus',
    'lootPick', 'pickTitle', 'pickHint', 'pickList', 'pickAll', 'pickClose',
  ].forEach((id) => { el[id] = document.getElementById(id); });
  if (el.bookShop) el.bookShop.hidden = true;
  if (el.trial) el.trial.hidden = true;
  if (el.stash) el.stash.hidden = true;

  const {
    rand, randi, clamp, roll, key, dist, mulberry32, randomSeed,
    eqAtkMin, eqAtkMax, eqDefMin, eqDefMax, eqAtk, eqDef, eqHp, eqScore,
    sumEqAtk, sumEqDef, sumEqAtkMin, sumEqAtkMax, sumEqDefMin, sumEqDefMax,
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
  const BOOK_SHOP = D.BOOK_SHOP || {};
  const MATS = D.MATS || {};
  const MAT_DROP_P = D.MAT_DROP_P != null ? D.MAT_DROP_P : 0.1;
  const TRIAL = D.TRIAL || {};
  const SLOT_IDS = EQUIP_SLOTS.map((s) => s.id);
  const slotMeta = (id) => EQUIP_SLOTS.find((s) => s.id === id) || { id, name: id, group: 'armor', unlock: 0, ico: '?' };
  const slotUnlocked = (id, lv) => (lv != null ? lv : P.lv) >= (slotMeta(id).unlock || 0);
  const ZONE_FLOOR = D.ZONE_FLOOR;
  const FLOAT_P = D.FLOAT_P;
  const FLOAT_MIN = D.FLOAT_MIN;
  const FLOAT_MAX = D.FLOAT_MAX;
  const DROP = D.DROP || {};
  const DEATH = D.DEATH || { dropP: 0, expLoss: 0.05 };
  const AUTO_FARM = D.AUTO_FARM || { autoLootMax: 'yellow' };
  const RESPAWN = D.RESPAWN || {};
  const ROOM_ENTER_SLACK = D.ROOM_ENTER_SLACK != null ? D.ROOM_ENTER_SLACK : 10;
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
  // 罐子余量：百点级扣减也要看得见（旧版 ≥10 万只显示「10万」，像没扣）
  function formatAmount(n) {
    const v = Math.max(0, Math.round(n || 0));
    if (v >= 100000000) {
      return (v / 100000000).toFixed(2).replace(/\.?0+$/, '') + '亿';
    }
    if (v >= 10000) {
      return (v / 10000).toFixed(2).replace(/\.?0+$/, '') + '万';
    }
    return String(v);
  }
  function potTotal(kind) {
    return Math.max(0, Math.round((P.potPool && P.potPool[kind]) || 0));
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
    potPool: { red: 100000, blue: 100000 },
    weapon: null, armor: null,
    glovesL: null, glovesR: null, shoes: null, helmet: null,
    necklace: null, earring: null, ringL: null, ringR: null,
    bag: [],
    stash: [],                              // 仓库：只存装备，上限 STASH_MAX
    cd: { half: 0, fire: 0 },
    skills: { half: false, fire: false, swordMaster: false },   // 技能书解锁：半月 / 烈火；被动：剑术精通
    autoPot: 50, autoMp: 0, autoTown: 0,
    townScrolls: 0,
    potionCd: { red: 0, blue: 0 },
    kills: 0,
    mats: {},                               // 材料 id -> 数量（堆叠）
    expOrbs: 0,                             // 经验球（30 级前使用升 1 级）
    trial: null,                            // 当前试炼任务
    trialMode: null,                        // 'gear' 要装备 / 'exp' 要经验
    trialRound: 1,                          // 试炼轮次
    trialStage: 0,                          // 本轮已完成次数 0-2
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
  let enemies = [];
  let npc = null;
  let bookNpc = null;
  let trialNpc = null;
  let stashNpc = null;
  let inCave = false;
  let turn = 0;
  let over = false;
  let door = { x: 0, y: 0 };
  let back = { x: 0, y: 0 };
  let logs = [];
  let walkTimer = null;
  let walkToken = 0;
  // A5 走路插值：逻辑整格跳；画面格心→格心匀速滑。变向等本格走完（传奇常规），转面立刻生效。
  let walkVis = null; // { fx, fy, tx, ty, start, dur } | null
  let walkVisPrev = null; // 上一步起点（拐角圆滑用）
  // 点地寻路的真直线折线（画面沿它走）。位置按**时间**在整条折线上取点：
  // { pts, total, done, t0, dur }。pts[0] 是「起步那一刻画面在哪儿」，不是格心——
  // 连点换目标时从这里接着走，否则画面会从上一段的斜线横跳回格心（镜头硬跟，看着就是抖）。
  let walkLine = null;
  let walkReadyAt = 0; // 下一格解锁时间
  let pendingTarget = null;
  // 摇杆/按键状态提前声明，供 walkInputHeld 闭包使用
  const heldMove = new Set();
  const moveKeyAt = new Map(); // 键 → 按下序号；对冲轴保留先按的（忽略后按）
  let moveKeySeq = 0;
  let stickDx = 0, stickDy = 0;
  let stickTimer = null;
  let keyMoveTimer = null;
  let lootTimer = null;
  let hurtTimer = null;
  const floaters = [];
  let terrain = null;
  const MOB_ROW = {
    chicken: 0, scarecrow: 1, dog: 2, boar: 3, wolf: 4, spider: 5,
    stone: 6, bandit: 7, ghoul: 8, mummy: 9, bat: 10, demon: 11, wraith: 12,
  };
  const COMBAT_MS = D.COMBAT_MS || D.IDLE_MS || 1000;  // 打怪节奏
  // 被动「剑术精通」：攻速 ×2（只影响玩家，不影响怪物）
  const playerCombatMs = () => (P.skills && P.skills.swordMaster ? Math.round(COMBAT_MS / 2) : COMBAT_MS);
  const MOVE_MS = D.MOVE_MS || 180;                     // 走路节奏（快得多）
  const ENEMY_ACT_MS = D.ENEMY_ACT_MS || 1000;          // 怪行动：1 次/秒
  // 拍子抖动容差：setTimeout 偶尔早到几毫秒，严格的 `now < CD` 会让整拍空转
  //（玩家不出手、enemiesTurn 也没跑 → 看着像「回血顿 1 秒、怪也不出手」）
  const ACT_GRACE_MS = 40;
  const WALK_STEP_MS = D.WALK_STEP_MS || 180;           // 点地/摇杆每格（R3.8）
  const IDLE_MS = COMBAT_MS;                            // 旧名兼容
  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  // 传奇同拍：直/斜一格一拍；变向不中途改目的地（会冲锋/瞬移），只转面 + 等本格走完
  function walkStepDur(_dx, _dy) {
    return WALK_STEP_MS;
  }
  function walkStepRemaining() {
    return Math.max(0, walkReadyAt - nowMs());
  }
  function walkStepBusy() {
    return walkStepRemaining() > 1;
  }
  function walkVisDur() {
    return walkStepBusy() ? Math.max(16, walkStepRemaining()) : WALK_STEP_MS;
  }
  function stepProgress() {
    if (!walkVis) return 1;
    const dur = walkVis.dur || WALK_STEP_MS;
    return Math.min(1, Math.max(0, (nowMs() - walkVis.start) / dur));
  }
  // 沿折线按「格数」取点：ks[i] 是 pts[i] 对应的逻辑格编号（第几格，可为负=半拍），
  // 段内直线插值。画面和逻辑同一拍（拐点处不会领先/落后），拐点又不跳。
  function pointOnSteps(pts, ks, s) {
    const n = pts.length;
    if (!n) return { x: P.x, y: P.y };
    if (n === 1 || !ks || ks.length !== n) return { x: pts[0].x, y: pts[0].y };
    if (s <= ks[0]) return { x: pts[0].x, y: pts[0].y };
    for (let i = 1; i < n; i++) {
      if (s <= ks[i]) {
        const d = ks[i] - ks[i - 1];
        const r = d > 1e-6 ? Math.min(1, Math.max(0, (s - ks[i - 1]) / d)) : 1;
        return {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r,
        };
      }
    }
    return { x: pts[n - 1].x, y: pts[n - 1].y };
  }
  function walkVisPos() {
    if (!walkVis) return { x: P.x, y: P.y, t: 1 };
    const dur = walkVis.dur || WALK_STEP_MS;
    const t = Math.min(1, Math.max(0, (nowMs() - walkVis.start) / dur));
    const bx = walkVis.fx, by = walkVis.fy, cx = walkVis.tx, cy = walkVis.ty;
    let x = bx + (cx - bx) * t;
    let y = by + (cy - by) * t;
    // 拐角圆滑：用 Catmull-Rom 过「上一步起点 → 本步起点 → 本步终点」，
    // t=0 正好在本步起点、t=1 正好在终点（端点不跳，否则每步开头会往回顿一下）。
    // 只抹平浅拐（45°）；90° 直角仍走硬拐，不然会切墙角。共线时曲线=直线。
    if (walkVisPrev) {
      const ax = walkVisPrev.x, ay = walkVisPrev.y;
      const ux = bx - ax, uy = by - ay, vx = cx - bx, vy = cy - by;
      const lu = Math.sqrt(ux * ux + uy * uy) || 1;
      const lv = Math.sqrt(vx * vx + vy * vy) || 1;
      const dot = (ux * vx + uy * vy) / (lu * lv);
      const k = Math.min(1, Math.max(0, (dot - 0.35) / 0.6));
      if (k > 0.01) {
        const ex = cx + (cx - bx), ey = cy + (cy - by);   // 末点外推
        const t2 = t * t, t3 = t2 * t;
        const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t
          + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
          + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        x += (cr(ax, bx, cx, ex) - x) * k;
        y += (cr(ay, by, cy, ey) - y) * k;
      }
    }
    return { x: x, y: y, t: t };
  }
  function beginWalkStep(ox, oy, nx, ny) {
    const now = nowMs();
    if (walkLine && walkLine.done < walkLine.total) walkLine.done += 1;
    // 从上一段画面位置接着滑，避免换步闪一下；时长固定满拍（匀速）
    const cur = walkVisPos();
    const fx = walkVis ? cur.x : ox;
    const fy = walkVis ? cur.y : oy;
    walkVisPrev = walkVis ? { x: walkVis.fx, y: walkVis.fy } : null;
    walkVis = { fx: fx, fy: fy, tx: nx, ty: ny, start: now, dur: WALK_STEP_MS };
    walkReadyAt = now + WALK_STEP_MS;
  }
  function snapWalkVis() {
    walkVis = null;
    walkVisPrev = null;
    walkLine = null;
    walkReadyAt = 0;
  }
  function faceWalkDir(dx, dy) {
    if (dx && dy) {
      if (Math.abs(dx) >= Math.abs(dy)) P.dir = dx < 0 ? 'l' : 'r';
      else P.dir = dy < 0 ? 'u' : 'd';
    } else if (dx < 0) P.dir = 'l';
    else if (dx > 0) P.dir = 'r';
    else if (dy < 0) P.dir = 'u';
    else if (dy > 0) P.dir = 'd';
  }
  function walkInputHeld() {
    return !!walkTimer || !!stickTimer || !!keyMoveTimer
      || !!(stickDx || stickDy) || (heldMove && heldMove.size > 0);
  }
  function walkStepVis() {
    const movingInput = walkInputHeld();
    // 点地寻路：画面沿拉直后的真直线折线走（逻辑仍一格一拍）。
    // 用「格数」在折线上取点：s = 已完成的格子数 + 本格进度，和逻辑同一拍；
    // 拐点不跳、斜线匀速，而且换目标时 pts[0] 就是上一帧的画面位置，连点不会横跳。
    if (walkLine && walkLine.pts && walkLine.pts.length > 1) {
      const s = (walkLine.done - 1) + stepProgress();
      const p = pointOnSteps(walkLine.pts, walkLine.ks, s);
      const t = Math.min(1, Math.max(0, s / Math.max(1, walkLine.total)));
      return { x: p.x + 0.5, y: p.y + 0.5, t: t, moving: s < walkLine.total - 1e-6 || movingInput || walkStepBusy() };
    }
    if (!walkVis) {
      return { x: P.x + 0.5, y: P.y + 0.5, t: 1, moving: movingInput };
    }
    const cur = walkVisPos();
    return {
      x: cur.x + 0.5,
      y: cur.y + 0.5,
      t: cur.t,
      moving: cur.t < 1 || movingInput || walkStepBusy(),
    };
  }
  let idleTimer = null;
  let nextIdleMs = playerCombatMs();                      // after() 排下一拍用
  let enemyNextActAt = 0;                               // 兼容旧逻辑
  let statusNextTickAt = 0;                             // DoT 最多 1 次/秒，防飘字狂冒
  let playerNextStrikeAt = 0;                           // 玩家普攻/撞怪最多约 1 次/秒
  let lastStrikeAt = 0;                                 // 3D 视图用来播挥砍
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
  const uiOpen = () => !el.shop.hidden || !el.menu.hidden || !el.char.hidden || !el.intro.hidden || !el.over.hidden || !el.doorConfirm.hidden || !el.lootPick.hidden || (el.sfxGate && !el.sfxGate.hidden) || (el.bookShop && el.bookShop.hidden === false) || (el.trial && el.trial.hidden === false) || (el.stash && el.stash.hidden === false);

  /* ---------------- 主城 / 小世界 ---------------- */
  const ROOMS = DL.DATA.ROOMS;
  let currentRoom = null;        // 当前房间 id；在主城为 null
  let doors = [];                // 主城传送门列表
  let hubReturnDoor = null;      // 进房前踩的门 { tierMin }；回城站该门西侧
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

  let overworldAtCave = false;
  let fieldSpawns = [];

  function useOverworld() {
    // 只剩 3D：野外（128×128）就是唯一的大地图，不再按协议 / 引擎参数切回主城小图
    return !!DL.Overworld;
  }

  function applyOverworld() {
    const ow = DL.Overworld.build();
    map = ow.map;
    npc = ow.npc;
    bookNpc = ow.bookNpc;
    trialNpc = ow.trialNpc;
    stashNpc = ow.stashNpc;
    doors = ow.doors;
    door = doors[0];
    currentRoom = null;
    inCave = false;
    enemies = [];
    fieldSpawns = ow.mobs;
    for (let i = 0; i < ow.mobs.length; i++) {
      const spot = ow.mobs[i];
      const mon = MON.find((m) => m.id === spot.id);
      if (!mon) continue;
      if (map[spot.y][spot.x] === 1) continue;
      const e = makeEnemy(mon, 'normal');
      e.x = spot.x;
      e.y = spot.y;
      e.fieldHome = spot;
      spot.alive = e;
      enemies.push(e);
    }
    if (overworldAtCave) {
      P.x = ow.cave.x;
      P.y = ow.cave.y + 2;
    } else {
      P.x = ow.spawn.x;
      P.y = ow.spawn.y;
    }
    snapWalkVis();
    overworldAtCave = false;
    villagePos = { x: P.x, y: P.y };
    refreshTerrain();
    terrain = ow.terrain;
    props = ow.props;
  }

  // 主城：固定小村庄 + 传送门；若有进门记录则站在该门西侧（不踩门）
  function genHub() {
    mapRng = mulberry32(worldSeed);
    const h = DL.World.genHub(ROOMS);
    map = h.map;
    enemies = [];
    inCave = false;
    currentRoom = null;
    over = false;
    villagePos = { x: h.spawn.x, y: h.spawn.y };
    npc = h.npc;
    bookNpc = h.bookNpc;
    trialNpc = h.trialNpc;
    stashNpc = h.stashNpc;
    doors = h.doors;
    door = doors[0] || { x: 0, y: 0 };
    let placed = false;
    if (hubReturnDoor != null) {
      const d = doors.find((x) => x.tierMin === hubReturnDoor.tierMin) || doors[0];
      if (d) {
        P.x = Math.max(1, d.x - 1);
        P.y = d.y;
        placed = true;
      }
    }
    if (!placed) {
      P.x = h.spawn.x;
      P.y = h.spawn.y;
    }
    snapWalkVis();
    lastZoneLv = 1;
    S.clear(P);                     // 换图脱战：状态清零
    loadBags();
    refreshTerrain();
    if (useOverworld()) applyOverworld();
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
    // 进房只刷普通；精英/稀有一律走击杀保底（刷出后重掷阈值）
    for (const s of spots) {
      const mon = poolMon(spec);
      const e = makeEnemy(mon, 'normal');
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
        const bossLv = spec.bossLv || spec.lvMax || BOSS.lv;
        const b = makeEnemy(Object.assign({}, BOSS, {
          lv: bossLv,
          name: spec.bossName || BOSS.name,
          glyph: spec.bossGlyph || BOSS.glyph,
        }), 'boss');
        b.x = best.x; b.y = best.y;
        out.push(b);
      }
    }
    return out;
  }

  // R11.14：只能进 lvMin ≤ 自身等级 + slack 的图
  function canEnterRoom(spec) {
    if (!spec) return false;
    return (spec.lvMin || 1) <= P.lv + ROOM_ENTER_SLACK;
  }
  function roomEnterNeedLv(spec) {
    if (!spec) return 1;
    return Math.max(1, (spec.lvMin || 1) - ROOM_ENTER_SLACK);
  }

  // 进入小世界房间
  function enterRoom(roomId) {
    const spec = roomSpec(roomId);
    if (!spec) return false;
    if (!canEnterRoom(spec)) {
      log(`${spec.name}太危险了（需 Lv.${roomEnterNeedLv(spec)}，你 Lv.${P.lv}）。`, 'bad');
      return false;
    }
    mapRng = mulberry32(worldSeed ^ hashId(roomId));
    const r = (useOverworld() && roomId === 'cave1' && DL.Overworld.caveMap)
      ? DL.Overworld.caveMap()
      : DL.World.genRoom(spec, mapRng);
    map = r.map;
    inCave = true;
    currentRoom = roomId;
    over = false;
    npc = null;
    bookNpc = null;
    trialNpc = null;
    stashNpc = null;
    P.x = r.spawn.x;
    P.y = r.spawn.y;
    snapWalkVis();
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

    refreshTerrain();
    log(`进入 ${spec.name}（Lv.${spec.lvMin}–${spec.lvMax}）。点技能栏「挂机」刷普通/精英。`, 'good');
    return true;
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
    overworldAtCave = useOverworld();
    genHub();
  }

  // 回城卷：消耗 1 张离开房间；自动回城也走这里
  function useTownScroll(opts) {
    opts = opts || {};
    if (!currentRoom) {
      if (!opts.silent) log('你已经在主城。');
      return false;
    }
    if ((P.townScrolls | 0) <= 0) {
      if (!opts.silent) log('没有回城卷，去商人处买（100 金/张）。', 'bad');
      return false;
    }
    P.townScrolls -= 1;
    const left = P.townScrolls;
    log(opts.auto
      ? `血量过低，使用回城卷回城（剩 ${left}）。`
      : `使用回城卷回城（剩 ${left}）。`, 'good');
    leaveRoom();
    syncHud();
    if (!el.char.hidden) renderChar();
    save();
    return true;
  }

  function tryAutoTown() {
    if (!currentRoom || over || P.hp <= 0) return false;
    if (!(P.autoTown > 0)) return false;
    if (P.hp > maxHp() * P.autoTown / 100) return false;
    if ((P.townScrolls | 0) <= 0) return false;
    return useTownScroll({ auto: true });
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
    // 普通怪等级固定（鸡 Lv.1）；精英/稀有由 GRADE.lvAdd +1/+2
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
    const bossLv = spec.bossLv || spec.lvMax || BOSS.lv;
    const b = makeEnemy(Object.assign({}, BOSS, {
      lv: bossLv,
      name: spec.bossName || BOSS.name,
      glyph: spec.bossGlyph || BOSS.glyph,
    }), 'boss');
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
    const prevNeed = eliteThreshold;
    const e = spawnOneInRoom('elite');
    if (e) {
      // 先重掷保底，再提示（还差 = 新阈值）
      rollEliteThreshold();
      log(`精英${e.name}加入战场（阈值 ${prevNeed}）· 保底已重置，还差 ${eliteLeft()}。`, 'good');
      syncHud();
    } else {
      // 刷不出：回退 1，避免顶栏卡在「还差 0」
      killsToElite = Math.max(0, eliteThreshold - 1);
    }
    return e;
  }

  function trySpawnRareGuaranteed() {
    if (living((e) => e.rare).length >= (RESPAWN.rareCap || 1)) return null;
    const e = spawnOneInRoom('rare');
    if (e) {
      rollRareThreshold();
      onRareSpawned(e);
      log(`稀有保底已重置，还差 ${rareLeft()}。`, 'good');
      syncHud();
    } else {
      killsToRare = Math.max(0, rareThreshold - 1);
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
      atkMin: mon.atkMin != null ? mon.atkMin : null,
      atkMax: mon.atkMax != null ? mon.atkMax : null,
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
    // 掉落解锁看 dropAt（如项链/耳环 25 级怪就掉，但玩家 30 级才能穿）
    const pool = EQUIP_SLOTS.filter((s) => lv >= (s.dropAt != null ? s.dropAt : (s.unlock || 0)));
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

  // 能否收下：一律进背包，不自动穿（自己双击穿才有对比感）
  function canAcceptEquip(eq) {
    if (!eq || !eq.slot) return false;
    return P.bag.length < BAG_MAX;
  }

  function addToBag(eq) {
    if (!eq || !eq.slot) return false;
    if (!canAcceptEquip(eq)) {
      log('背包满了，请先丢掉或换装腾位。', 'bad');
      return false;
    }
    P.bag.push(eq);
    showLoot(eq, false);
    const need = eqReqLv(eq);
    if (!canWearEq(eq) && P.lv < need) {
      log(`获得 ${eq.name}（需 Lv.${need}，已放背包）。`);
    } else if (isUpgrade(eq)) {
      log(`获得 ${eq.name}（${RARITY[eq.rarity].name}）↑ 比身上好，已放背包。`, 'good');
    } else {
      log(`获得 ${eq.name}（${RARITY[eq.rarity].name}），已放背包。`);
    }
    return true;
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
    Sfx.play('equip');
    log(`装备 ${eq.name}（${(RARITY[eq.rarity] || RARITY.white).name}）。`, 'good');
    if (!el.char.hidden) renderChar();
    syncHud();
    save();
    return true;
  }

  function sellFromBag(i) {
    const eq = P.bag[i];
    if (!eq) return false;
    if (eq.locked) {
      log(`${eq.name}已锁定，无法出售。`, 'bad');
      return false;
    }
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

  function afterStashChange() {
    if (el.stash && !el.stash.hidden) refreshStash();
    if (!el.char.hidden) renderChar();
    if (el.shop && !el.shop.hidden) refreshShop();
    syncHud();
    save();
  }

  // 背包 → 仓库。锁定只防卖，不防存。
  function depositFromBag(i) {
    const eq = P.bag[i];
    if (!eq || !eq.slot) return false;
    if (P.stash.length >= STASH_MAX) {
      log(`仓库满了（${STASH_MAX} 格）。`, 'bad');
      return false;
    }
    P.bag.splice(i, 1);
    P.stash.push(eq);
    log(`存入 ${eq.name}。`, 'good');
    afterStashChange();
    return true;
  }

  // 仓库 → 背包
  function withdrawFromStash(i) {
    const eq = P.stash[i];
    if (!eq || !eq.slot) return false;
    if (P.bag.length >= BAG_MAX) {
      log('背包满了，先腾出空位再取。', 'bad');
      return false;
    }
    P.stash.splice(i, 1);
    P.bag.push(eq);
    log(`取出 ${eq.name}。`, 'good');
    afterStashChange();
    return true;
  }

  function toggleLockEq(eq) {
    if (!eq || !eq.slot) return false;
    eq.locked = !eq.locked;
    log(eq.locked ? `锁定 ${eq.name}（不会被回收/卖掉）。` : `解锁 ${eq.name}。`, 'good');
    if (!el.char.hidden) renderChar();
    if (el.shop && !el.shop.hidden) refreshShop();
    if (el.stash && !el.stash.hidden) refreshStash();
    if (tipSrc && !el.eqTip.hidden) showEqTip(eq, tipSrc, tipSticky, findTipAnchor(tipSrc));
    save();
    return true;
  }

  // 按勾选品质批量卖（跳过锁定）；rarities 为 white/blue/yellow/orange
  function sellBagByRarity(rarities) {
    const want = new Set(Array.isArray(rarities) ? rarities : []);
    if (!want.size) {
      log('请先勾选要回收的品质（C/B/A/S）。', 'bad');
      return { n: 0, gold: 0 };
    }
    let n = 0;
    let gained = 0;
    for (let i = P.bag.length - 1; i >= 0; i--) {
      const eq = P.bag[i];
      if (!eq || eq.locked || !want.has(eq.rarity)) continue;
      const price = sellPrice(eq);
      P.bag.splice(i, 1);
      P.gold += price;
      gained += price;
      n += 1;
    }
    if (n) {
      log(`回收 ${n} 件，+${gained} 金币。`, 'good');
      if (!el.char.hidden) renderChar();
      if (el.shop && !el.shop.hidden) refreshShop();
      syncHud();
      save();
    } else {
      log('没有可回收的装备（已锁定或未勾选对应品质）。');
    }
    return { n, gold: gained };
  }

  function selectedRecycleRarities(root) {
    const box = root || document;
    return Array.from(box.querySelectorAll('[data-recycle-rar]:checked'))
      .map((el) => el.getAttribute('data-recycle-rar'))
      .filter(Boolean);
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
    const atkTag = (eq) => {
      const lo = eqAtkMin(eq), hi = eqAtkMax(eq);
      return lo === hi ? `+${lo}` : `+${lo}-${hi}`;
    };
    const defTag = (eq) => {
      const lo = eqDefMin(eq), hi = eqDefMax(eq);
      return lo === hi ? `+${lo}` : `+${lo}-${hi}`;
    };
    const w = P.weapon ? `${P.weapon.name}${tag(P.weapon)} ${atkTag(P.weapon)}` : '空手';
    const a = P.armor ? `${P.armor.name}${tag(P.armor)} ${defTag(P.armor)}` : '布衣';
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
    else if (opts.stashIndex != null) attr = `data-stash="${opts.stashIndex}"`;
    else if (opts.stashBag != null) attr = `data-stash-bag="${opts.stashBag}"`;
    const priceTag = opts.price != null
      ? `<span class="eq-price" title="价格">${opts.price}</span>`
      : '';
    const unaff = opts.shopStock != null && opts.price != null && P.gold < opts.price;
    const lockMark = eq.locked ? '<span class="eq-pin" title="已锁定">🔒</span>' : '';
    return `<button type="button" class="eq-cell rarity-${eq.rarity}${up ? ' up' : ''}${unaff ? ' unafford' : ''}${eq.locked ? ' pinned' : ''}" ${attr} aria-label="${eq.name}">
      <span class="eq-ico">${ico}</span>
      <span class="eq-lv">${eq.ilvl || 1}</span>
      <span class="eq-ltr">${r.letter}</span>
      ${up ? '<span class="eq-up" title="比身上好">↑</span>' : ''}
      ${lockMark}
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

  function scrollCellHtml(item, index) {
    const can = P.gold >= item.price;
    return `<button type="button" class="eq-cell shop-pot${can ? '' : ' unafford'}" data-shop-stock="${index}" aria-label="${item.name}">
      <span class="eq-ico">📜</span>
      <span class="eq-lv">×${P.townScrolls | 0}</span>
      <span class="eq-ltr">卷</span>
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
    if (src.kind === 'stash' && el.stashGrid) return el.stashGrid.querySelector(`[data-stash="${src.i}"]`);
    if (src.kind === 'stashBag' && el.stashBag) return el.stashBag.querySelector(`[data-stash-bag="${src.i}"]`);
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
    let acts = '';
    if (src && src.kind === 'pick') {
      acts = `<button type="button" data-tip-pick="${src.i}">捡起</button>`;
    } else if (src && src.kind === 'shopStock') {
      acts = shopBuyActsHtml();
    } else if (src && (src.kind === 'bag' || src.kind === 'shopBag')) {
      acts = `<button type="button" data-tip-lock>${eq.locked ? '解锁' : '锁定'}</button>`;
    } else if (src && src.kind === 'worn') {
      acts = `<button type="button" data-tip-lock>${eq.locked ? '解锁' : '锁定'}</button>`;
    } else if (src && src.kind === 'stash') {
      acts = `<button type="button" data-tip-stash="out">取出</button>`
        + `<button type="button" data-tip-lock>${eq.locked ? '解锁' : '锁定'}</button>`;
    } else if (src && src.kind === 'stashBag') {
      acts = `<button type="button" data-tip-stash="in">存入</button>`
        + `<button type="button" data-tip-lock>${eq.locked ? '解锁' : '锁定'}</button>`;
    }
    el.eqTipActs.innerHTML = acts;
    el.eqTipActs.hidden = !acts;
    el.eqTip.hidden = false;
    const node = anchor || tipAnchor || findTipAnchor(src);
    if (node) placeEqTip(node);
  }

  function shopBuyActsHtml() {
    return '<button type="button" data-tip-buy="1">买×1</button>'
      + '<button type="button" data-tip-buy="5">买×5</button>'
      + '<button type="button" data-tip-buy="10">买×10</button>';
  }

  function showPotTip(item, src, sticky, anchor) {
    if (!el.eqTip || !item) return;
    tipSrc = src;
    tipSticky = !!sticky;
    el.eqTipName.className = 'eq-tip-name';
    el.eqTipName.textContent = item.name;
    el.eqTipStats.innerHTML =
      `${item.potKind === 'blue' ? '回复 MP' : '回复 HP'} <b>+${item.amount}</b><br>`
      + `<div class="eq-tip-price">售价 <b>${item.price}</b> 金 / 份</div>`;
    const acts = (src && src.kind === 'shopStock') ? shopBuyActsHtml() : '';
    el.eqTipActs.innerHTML = acts;
    el.eqTipActs.hidden = !acts;
    el.eqTip.hidden = false;
    const node = anchor || tipAnchor || findTipAnchor(src);
    if (node) placeEqTip(node);
  }

  function showScrollTip(item, src, sticky, anchor) {
    if (!el.eqTip || !item) return;
    tipSrc = src;
    tipSticky = !!sticky;
    el.eqTipName.className = 'eq-tip-name';
    el.eqTipName.textContent = item.name;
    el.eqTipStats.innerHTML =
      '在野外使用可立刻回主城。自动回城也要消耗。<br>'
      + `<div class="eq-tip-price">售价 <b>${item.price}</b> 金 / 张 · 已有 <b>${P.townScrolls | 0}</b></div>`;
    const acts = (src && src.kind === 'shopStock') ? shopBuyActsHtml() : '';
    el.eqTipActs.innerHTML = acts;
    el.eqTipActs.hidden = !acts;
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
    if (src.kind === 'stash') return P.stash[src.i] || null;
    if (src.kind === 'stashBag') return P.bag[src.i] || null;
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
    const baseAtk = Math.round(5 + 1.5 * (P.lv - 1));
    const baseDef = Math.round(3 + (P.lv - 1));
    const ar = atkRange(P);
    const dr = defRange(P);
    const eqALo = sumEqAtkMin(P), eqAHi = sumEqAtkMax(P);
    const eqDLo = sumEqDefMin(P), eqDHi = sumEqDefMax(P);
    const eqAtkTxt = eqALo === eqAHi ? String(eqALo) : `${eqALo}-${eqAHi}`;
    const eqDefTxt = eqDLo === eqDHi ? String(eqDLo) : `${eqDLo}-${eqDHi}`;
    el.charStats.innerHTML = `
      <div>等级 <b>Lv.${P.lv}</b></div>
      <div>经验 <b>${P.exp}/${needExp()}</b></div>
      <div>HP <b>${Math.ceil(P.hp)}/${maxHp()}</b></div>
      <div>MP <b>${Math.ceil(P.mp)}/${maxMp()}</b></div>
      <div>攻击 <b>${ar.min}-${ar.max}</b><small>基础 ${baseAtk} + 装备 ${eqAtkTxt}</small></div>
      <div>防御 <b>${dr.min}-${dr.max}</b><small>基础 ${baseDef} + 装备 ${eqDefTxt}</small></div>
    `;
    el.charSlots.innerHTML = EQUIP_SLOTS.map((s) => {
      if (!slotUnlocked(s.id)) {
        return eqCellHtml(null, { locked: true, label: s.name, unlockLv: s.unlock });
      }
      return eqCellHtml(P[s.id], { worn: s.id, label: s.name });
    }).join('');
    el.autoPot.value = String(P.autoPot);
    if (el.autoMp) el.autoMp.value = String(P.autoMp);
    if (el.autoTown) el.autoTown.value = String(P.autoTown);
    if (el.potStock) {
      el.potStock.innerHTML =
        `<div>🩸红罐 <b>${formatAmount(P.potPool.red)}</b></div>`
        + `<div>💙蓝罐 <b>${formatAmount(P.potPool.blue)}</b></div>`
        + `<div>📜回城卷 <b>${P.townScrolls | 0}</b>`
        + ` <button type="button" class="ghost pot-use-scroll" data-use-scroll${currentRoom && (P.townScrolls | 0) > 0 ? '' : ' disabled'}>使用</button></div>`;
    }
    el.bagCount.textContent = `${P.bag.length}/${BAG_MAX}`;
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
    renderSkills();
  }

  function renderSkills() {
    if (!el.skillList) return;
    const rows = [
      { name: '攻杀剑术', kind: '主动', desc: '普攻，无消耗、无 CD', learned: true },
      { name: '半月弯刀', kind: '主动', desc: '周围 5 格，MP 12，CD 3 回合', learned: !!P.skills.half },
      { name: '烈火剑法', kind: '主动', desc: '单体 ×2.2 + 灼烧 3 回合，MP 18，CD 4 回合', learned: !!P.skills.fire },
      ...(D.PASSIVES || []).map((p) => ({
        name: p.name,
        kind: '被动',
        desc: `${p.desc}（${p.unlockLv} 级自动学习）`,
        learned: p.id === 'swordMaster' ? !!P.skills.swordMaster : false,
      })),
    ];
    el.skillList.innerHTML = rows.map((r) => `
      <div class="skill-row ${r.learned ? '' : 'locked'}">
        <div><b>${r.name}</b><small>${r.kind} · ${r.desc}</small></div>
        <span>${r.learned ? '已学' : '未学'}</span>
      </div>`).join('');
  }

  let charTab = 'gear';

  function switchCharTab(tab) {
    charTab = tab;
    el.paneGear.hidden = tab !== 'gear';
    el.paneBag.hidden = tab !== 'bag';
    if (el.paneSkills) el.paneSkills.hidden = tab !== 'skills';
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
    if (nearStash() && !currentRoom && !inCombat()) {
      el.tips.textContent = `${tag}仓库　按空格或点「交谈」存取装备${nearBag}`;
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

  function checkPassives() {
    if (P.lv >= 10 && !P.skills.swordMaster) {
      P.skills.swordMaster = true;
      log('被动技能「剑术精通」已领悟：攻速 ×2。', 'good');
    }
  }

  function syncHud() {
    checkPassives();
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
    el.potionCount.textContent = formatAmount(potTotal('red'));
    el.btnAtk.disabled = over;
    const nowMs = Date.now();
    el.btnPotion.disabled = over || potTotal('red') <= 0 || P.potionCd.red > nowMs;
    el.potionCd.textContent = P.potionCd.red > nowMs ? `⏳${Math.ceil((P.potionCd.red - nowMs) / 1000)}` : '';
    if (el.mpPotionCount) el.mpPotionCount.textContent = formatAmount(potTotal('blue'));
    if (el.btnMpPotion) el.btnMpPotion.disabled = over || potTotal('blue') <= 0 || P.potionCd.blue > nowMs;
    if (el.mpPotionCd) el.mpPotionCd.textContent = P.potionCd.blue > nowMs ? `⏳${Math.ceil((P.potionCd.blue - nowMs) / 1000)}` : '';
    if (el.potStock) {
      el.potStock.innerHTML = `<div>🩸红罐 <b>${formatAmount(P.potPool.red)}</b></div><div>💙蓝罐 <b>${formatAmount(P.potPool.blue)}</b></div>`;
    }
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
  function nearBookShop() {
    return !!bookNpc && dist(bookNpc, P) <= 1;
  }
  function nearStash() {
    return !!stashNpc && dist(stashNpc, P) <= 1;
  }

  // 可交互目标：商人 / 技能书商人 / 村长 / 仓库
  function interactTarget() {
    if (over || uiOpen()) return null;
    if (nearShop()) return { kind: 'shop', name: '商人' };
    if (nearBookShop()) return { kind: 'bookShop', name: '技能书商人' };
    if (nearTrial()) return { kind: 'trial', name: '村长' };
    if (nearStash()) return { kind: 'stash', name: '仓库' };
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
    if (t.kind === 'bookShop') {
      openBookShop();
      return true;
    }
    if (t.kind === 'trial') {
      openTrial();
      return true;
    }
    if (t.kind === 'stash') {
      openStash();
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
    cdEl.textContent = learned ? (cd > 0 ? `⏳${Math.ceil(cd * playerCombatMs() / 1000)}` : '') : '未学';
  }

  /* ---------------- 存档 ---------------- */
  function save() {
    // 单实例守卫：本页已经把锁交给别的页面了，绝不能再写存档（否则两边互相盖）
    if (DL.SingleTab && DL.SingleTab.isLost()) return;
    try {
      const gear = {};
      for (const id of SLOT_IDS) gear[id] = P[id];
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 4, lv: P.lv, exp: P.exp, hp: P.hp, mp: P.mp, gold: P.gold,
        pots: P.pots, potPool: P.potPool, ...gear, kills: P.kills,
        mats: P.mats, expOrbs: P.expOrbs, trial: P.trial, trialMode: P.trialMode, trialRound: P.trialRound, trialStage: P.trialStage,
        bag: P.bag, stash: P.stash, seed: worldSeed, clock, autoPot: P.autoPot, autoMp: P.autoMp,
        autoTown: P.autoTown, townScrolls: P.townScrolls,
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
      P.mats = (s.mats && typeof s.mats === 'object') ? s.mats : {};
      P.expOrbs = Number.isFinite(s.expOrbs) ? s.expOrbs : 0;
      P.trial = s.trial || null;
      P.trialMode = s.trialMode === 'gear' || s.trialMode === 'exp' ? s.trialMode : null;
      P.trialRound = Number.isFinite(s.trialRound) ? s.trialRound : 1;
      P.trialStage = Number.isFinite(s.trialStage) ? s.trialStage : 0;
      P.potPool = {
        red: s.potPool && Number.isFinite(s.potPool.red) ? s.potPool.red : 100000,
        blue: s.potPool && Number.isFinite(s.potPool.blue) ? s.potPool.blue : 100000,
      };
      P.kills = s.kills || 0;
      P.bag = Array.isArray(s.bag) ? s.bag.slice(0, BAG_MAX) : [];
      P.stash = Array.isArray(s.stash)
        ? s.stash.filter((eq) => eq && eq.slot).slice(0, STASH_MAX)
        : [];
      P.autoPot = Number.isFinite(s.autoPot) ? s.autoPot : 50;
      P.autoMp = Number.isFinite(s.autoMp) ? s.autoMp : 0;
      P.autoTown = Number.isFinite(s.autoTown) ? s.autoTown : 0;
      P.townScrolls = Math.max(0, s.townScrolls | 0);
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
    lastStrikeAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
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
    if (e.fieldHome) {
      e.fieldHome.alive = null;
      e.fieldHome.deadAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
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
      const amt = potTier('low').amount;
      P.potPool[kind] = (P.potPool[kind] || 0) + amt;
      log(`罐子补了 ${amt} 点${blue ? '蓝' : '红'}（剩 ${formatAmount(P.potPool[kind])}）。`, 'good');
    }
    // 材料：10% 自动拾取、堆叠
    if (e.mat && Math.random() < MAT_DROP_P) {
      P.mats[e.mat] = (P.mats[e.mat] || 0) + 1;
      const mn = (MATS[e.mat] && MATS[e.mat].name) || e.mat;
      log(`自动拾取 ${mn} ×1（共 ${P.mats[e.mat]}）。`, 'good');
    }
    onTrialKill(e);
    if (!e.boss && !e.elite && !e.rare) {
      onNormalKillProgress();
      queueNormalRespawn();
    }
    if (e.boss && currentRoom) roomClearedAt[currentRoom] = clock;
    Sfx.play('kill');

    // 装备掉落：见 rollKillEquipDrops；掉出来的进地面袋，不直接进包。
    const drops = rollKillEquipDrops(e, crushed);
    const book = rollSkillBookDrop(e);
    if (book) {
      drops.push(book);
      log(`${e.name}掉落了${book.name}！走到袋子里捡起学习。`, 'good');
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
    if (e.boss) win();
  }

  /* ---------------- 村长 ---------------- */
  function onTrialKill(e) {
    const t = P.trial;
    if (!t) return;
    if (t.type === 'kill' && e.id === t.target) t.prog = (t.prog || 0) + 1;
    else if (t.type === 'boss' && e.boss && String(e.lv) === String(t.target)) t.prog = (t.prog || 0) + 1;
  }

  function trialDone() {
    const t = P.trial;
    if (!t) return false;
    if (t.type === 'collect') return (P.mats[t.target] || 0) >= t.need;
    return (t.prog || 0) >= t.need;
  }

  function trialProgress() {
    const t = P.trial;
    if (!t) return 0;
    if (t.type === 'collect') return Math.min(t.need, P.mats[t.target] || 0);
    return Math.min(t.need, t.prog || 0);
  }

  function trialDesc() {
    const t = P.trial;
    if (!t) return '村长正在准备任务。';
    if (t.type === 'collect') return `收集 ${(MATS[t.target] && MATS[t.target].name) || t.target} ×${t.need}`;
    if (t.type === 'boss') return `击败 ${t.name} ×${t.need}`;
    return `击杀 ${t.name} ×${t.need}`;
  }

  function trialMode() {
    return P.trialMode === 'gear' ? 'gear' : 'exp';
  }

  function chooseTrialMode(mode) {
    P.trialMode = mode === 'gear' ? 'gear' : 'exp';
    P.trial = null;
    rollTrialTask();
    save();
    if (el.trial && !el.trial.hidden) renderTrial();
  }

  function resetTrialMode() {
    P.trialMode = null;
    P.trial = null;
    save();
    if (el.trial && !el.trial.hidden) renderTrial();
  }

  function rollTrialTask() {
    const stage = Math.min(TRIAL.stages || 3, (P.trialStage || 0) + 1);
    const mode = trialMode();
    // 装备路线：怪比玩家低（难度低）；经验路线：怪在当前等级附近
    let pool;
    if (mode === 'gear') {
      pool = MON.filter((m) => m.mat
        && m.lv <= Math.max(1, P.lv - 1) && m.lv >= Math.max(1, P.lv - 8));
    } else {
      pool = MON.filter((m) => m.mat
        && m.lv >= Math.max(1, P.lv - 1) && m.lv <= P.lv + 2);
    }
    const list = pool.length ? pool : MON.filter((m) => m.mat);
    const mon = list[randi(0, list.length - 1)];
    if (mode === 'exp' && stage === 3 && P.lv >= 10 && Math.random() < 0.35) {
      const bosses = (D.ROOMS || []).filter((r) => r.boss
        && r.bossLv <= P.lv + 5 && r.bossLv >= Math.max(1, P.lv - 10));
      if (bosses.length) {
        const b = bosses[randi(0, bosses.length - 1)];
        P.trial = { type: 'boss', target: String(b.bossLv), need: 1, prog: 0, stage, name: b.bossName || '首领' };
        return P.trial;
      }
    }
    const type = Math.random() < 0.5 ? 'collect' : 'kill';
    const need = type === 'collect'
      ? (TRIAL.collectNeed || [3, 6, 10])[stage - 1]
      : (TRIAL.killNeed || [5, 10, 15])[stage - 1];
    P.trial = { type, target: mon.id, need, prog: 0, stage, name: mon.name };
    return P.trial;
  }

  function trialReward() {
    const stage = (P.trial && P.trial.stage) || 1;
    const pct = (TRIAL.rewardPct || [0.04, 0.06, 0.09])[stage - 1] || 0.04;
    const gold = (TRIAL.goldBase || 100) + P.lv * (TRIAL.goldPerLv || 20);
    return {
      exp: trialMode() === 'exp' ? Math.round(needExp() * pct) : 0,
      gold: trialMode() === 'gear'
        ? Math.round(gold * (TRIAL.gearGoldMul != null ? TRIAL.gearGoldMul : 0.5))
        : gold,
    };
  }

  function turnInTrial() {
    const t = P.trial;
    if (!t) { rollTrialTask(); return false; }
    if (!trialDone()) { log('任务还没完成。', 'bad'); return false; }
    if (t.type === 'collect') {
      P.mats[t.target] = (P.mats[t.target] || 0) - t.need;
      if (P.mats[t.target] <= 0) delete P.mats[t.target];
    }
    const mode = trialMode();
    const r = trialReward();
    P.gold += r.gold;
    if (mode === 'gear') {
      if (t.stage === 3) {
        const rarity = Math.random() < 0.5 ? 'yellow' : 'blue';
        const eq = makeEquip(rollDropSlot(P.lv), P.lv, rarity);
        addToBag(eq);
        log(`试炼完成：获得${rarity === 'yellow' ? '黄装' : '蓝装'}「${eq.name}」，金币 +${r.gold}。`, 'good');
      } else {
        log(`试炼完成：金币 +${r.gold}。`, 'good');
      }
    } else {
      P.exp += r.exp;
      while (P.exp >= needExp()) {
        P.exp -= needExp();
        P.lv++;
        P.hp = maxHp();
        P.mp = maxMp();
        leveledUp = true;
      }
      log(`试炼完成：+${r.exp} 经验、+${r.gold} 金币。`, 'good');
    }
    P.trialStage = (P.trialStage || 0) + 1;
    if (P.trialStage >= (TRIAL.stages || 3)) {
      P.trialStage = 0;
      P.trialRound = (P.trialRound || 1) + 1;
      if (mode === 'exp') {
        P.expOrbs = (P.expOrbs || 0) + 1;
        log(`第 ${P.trialRound - 1} 轮试炼完成，获得 1 个经验球。`, 'good');
      }
    }
    rollTrialTask();
    syncHud();
    save();
    if (el.trial && !el.trial.hidden) renderTrial();
    return true;
  }

  function abandonTrial() {
    rollTrialTask();
    log('放弃任务，村长换了一个新的。');
    save();
    if (el.trial && !el.trial.hidden) renderTrial();
  }

  function useExpOrb() {
    if (P.lv >= 30) { log('30 级后经验球不能再用。', 'bad'); return false; }
    if ((P.expOrbs || 0) <= 0) { log('没有经验球。', 'bad'); return false; }
    P.expOrbs--;
    const gain = Math.round(needExp() * (TRIAL.orbPct != null ? TRIAL.orbPct : 0.5));
    P.exp += gain;
    while (P.exp >= needExp()) {
      P.exp -= needExp();
      P.lv++;
      P.hp = maxHp();
      P.mp = maxMp();
      leveledUp = true;
    }
    log(`使用经验球，获得 ${gain} 经验。`, 'good');
    syncHud();
    save();
    if (el.trial && !el.trial.hidden) renderTrial();
    return true;
  }

  function sellAllMats() {
    let total = 0;
    for (const [id, n] of Object.entries(P.mats || {})) {
      if (!n) continue;
      total += ((MATS[id] && MATS[id].price) || 1) * n;
      P.mats[id] = 0;
    }
    P.mats = Object.fromEntries(Object.entries(P.mats || {}).filter(([, n]) => n > 0));
    if (!total) { log('没有材料可卖。'); return false; }
    P.gold += total;
    log(`卖出材料，获得 ${total} 金币。`, 'good');
    syncHud();
    save();
    if (el.trial && !el.trial.hidden) renderTrial();
    return true;
  }

  function nearTrial() {
    return !!trialNpc && dist(trialNpc, P) <= 1;
  }

  function openTrial() {
    if (over) return;
    if (!nearTrial()) { log('村长不在附近。', 'bad'); return; }
    if (!P.trial) rollTrialTask();
    el.trial.hidden = false;
    renderTrial();
  }

  function renderTrial() {
    if (!el.trialDesc) return;
    const mode = P.trialMode;
    if (!mode) {
      if (el.trialModePick) el.trialModePick.hidden = false;
      if (el.trialSwitch) el.trialSwitch.hidden = true;
      el.trialRound.textContent = `第 ${P.trialRound || 1} 轮`;
      el.trialDesc.textContent = '这次想要什么奖励？';
      el.trialProg.textContent = '';
      el.trialReward.textContent = '装备路线：不给经验、怪更弱；经验路线：不给装备、怪同级。';
      el.trialTurnIn.disabled = true;
      el.trialAbandon.disabled = true;
      el.trialExpOrbs.textContent = `经验球 ×${P.expOrbs || 0}`;
      el.trialUseOrb.disabled = (P.expOrbs || 0) <= 0 || P.lv >= 30;
      return;
    }
    if (el.trialModePick) el.trialModePick.hidden = true;
    if (el.trialSwitch) el.trialSwitch.hidden = false;
    const t = P.trial;
    const prog = trialProgress();
    el.trialRound.textContent = `第 ${P.trialRound || 1} 轮 · ${(P.trialStage || 0) + (trialDone() ? 1 : 0)}/3`;
    el.trialDesc.textContent = trialDesc();
    el.trialProg.textContent = `进度 ${prog}/${t ? t.need : 0}`;
    const r = trialReward();
    if (mode === 'gear') {
      el.trialReward.textContent = `奖励：${t && t.stage === 3 ? '黄装' : '蓝装'} + ${r.gold} 金币`;
    } else {
      el.trialReward.textContent = `奖励：${r.exp} 经验 + ${r.gold} 金币${(t && t.stage === 3) ? ' · 经验球 ×1' : ''}`;
    }
    el.trialTurnIn.disabled = !trialDone();
    el.trialAbandon.disabled = false;
    el.trialExpOrbs.textContent = `经验球 ×${P.expOrbs || 0}`;
    el.trialUseOrb.disabled = (P.expOrbs || 0) <= 0 || P.lv >= 30;
    const mats = Object.entries(P.mats || {}).filter(([, n]) => n > 0);
    el.trialMats.textContent = mats.length
      ? mats.map(([id, n]) => `${(MATS[id] && MATS[id].name) || id}×${n}`).join('　')
      : '暂无材料';
    if (el.trialSellMats) el.trialSellMats.disabled = mats.length === 0;
  }

  function isSkillBook(it) {
    return !!(it && it.kind === 'skillbook');
  }

  function makeSkillBook(skill) {
    const half = skill === 'half';
    return {
      kind: 'skillbook',
      skill: half ? 'half' : 'fire',
      name: half ? '《半月弯刀》' : '《烈火剑法》',
      rarity: 'orange', // 技能书按 S 档：挂机 ≤A 不捡，须手捡学习
    };
  }

  // 仅 20 级 BOSS → 半月、30 级 BOSS → 烈火；10% 概率；已学会则不再掉
  function rollSkillBookDrop(e) {
    if (!e || !e.boss) return null;
    const map = (D.SKILL_BOOK && D.SKILL_BOOK.byBossLv) || {};
    const skill = map[e.lv] || map[String(e.lv)];
    if (skill !== 'half' && skill !== 'fire') return null;
    if (skill === 'half' && P.skills.half) return null;
    if (skill === 'fire' && P.skills.fire) return null;
    const chance = D.SKILL_BOOK && D.SKILL_BOOK.chance != null ? D.SKILL_BOOK.chance : 0.1;
    if (Math.random() >= chance) return null;
    return makeSkillBook(skill);
  }

  function learnSkillBook(it) {
    if (!isSkillBook(it)) return false;
    if (it.skill === 'half') {
      if (P.skills.half) {
        log('已经学会半月弯刀了，书页化作飞灰。');
      } else {
        P.skills.half = true;
        log('学会了《半月弯刀》！按 1 释放。', 'good');
      }
    } else {
      if (P.skills.fire) {
        log('已经学会烈火剑法了，书页化作飞灰。');
      } else {
        P.skills.fire = true;
        log('学会了《烈火剑法》！按 2 释放。', 'good');
      }
    }
    syncHud();
    save();
    return true;
  }

  function skillBookCellHtml(book, opts) {
    opts = opts || {};
    const ico = book.skill === 'half' ? '🌙' : '🔥';
    const attr = opts.pickIndex != null ? `data-pick="${opts.pickIndex}"` : '';
    return `<button type="button" class="eq-cell skill-book rarity-orange" ${attr} aria-label="${book.name}">
      <span class="eq-ico">${ico}</span>
      <span class="eq-ltr">书</span>
    </button>`;
  }

  function showSkillBookTip(book, src, sticky, anchor) {
    if (!el.eqTip || !book) return;
    tipSrc = src;
    tipSticky = !!sticky;
    el.eqTipName.className = 'eq-tip-name rarity-orange';
    el.eqTipName.textContent = book.name;
    const known = book.skill === 'half' ? P.skills.half : P.skills.fire;
    el.eqTipStats.innerHTML = known
      ? '已经学会，捡起会消耗掉。'
      : (book.skill === 'half'
        ? '技能书。捡起后学会半月弯刀（按 1）。'
        : '技能书。捡起后学会烈火剑法（按 2）。');
    const acts = (src && src.kind === 'pick')
      ? `<button type="button" data-tip-pick="${src.i}">${known ? '捡起' : '学习'}</button>`
      : '';
    el.eqTipActs.innerHTML = acts;
    el.eqTipActs.hidden = !acts;
    el.eqTip.hidden = false;
    const node = anchor || tipAnchor || findTipAnchor(src);
    if (node) placeEqTip(node);
  }

  // 生成一件掉落（还没落地）；装备等级=怪等级（固定，作穿戴需求）；部位按怪等级解锁
  function rollDrop(e, forceRarity) {
    const baseLv = e.lv || 1;
    const ilvl = clamp(baseLv, 1, 60);
    const slot = rollDropSlot(baseLv);
    // forceRarity 必传品级；未传才走 rollRarity（调试用）
    return makeEquip(slot, ilvl, forceRarity || rollRarity(ilvl));
  }

  // 击杀掉装表：普通按概率；精英保底 B；稀有保底 A；BOSS 保底 B+A
  // 1–10 级怪：只有稀有/BOSS 掉 A（普通与精英不出 A）
  function rollKillEquipDrops(e, crushed) {
    const dropMul = crushed ? CRUSH.dropMul : 1;
    const lowTier = (e.lv || 1) <= 10;
    const drops = [];
    const push = (eq) => { if (eq) drops.push(eq); };
    if (e.boss) {
      push(rollDrop(e, 'blue'));
      push(rollDrop(e, 'yellow'));
      if (Math.random() < (DROP.boss.s) * dropMul) push(rollDrop(e, 'orange'));
    } else if (e.rare) {
      push(rollDrop(e, 'yellow'));
      if (Math.random() < DROP.rare.s * dropMul) push(rollDrop(e, 'orange'));
    } else if (e.elite) {
      push(rollDrop(e, 'blue'));
      if (!lowTier && Math.random() < DROP.elite.a * dropMul) push(rollDrop(e, 'yellow'));
      if (Math.random() < DROP.elite.s * dropMul) push(rollDrop(e, 'orange'));
    } else {
      const N = DROP.normal;
      const r = Math.random();
      const s = lowTier ? 0 : N.s * dropMul;
      const a = s + (lowTier ? 0 : N.a * dropMul);
      const b = a + N.b * dropMul;
      const c = b + N.c * dropMul;
      if (r < s) push(rollDrop(e, 'orange'));
      else if (r < a) push(rollDrop(e, 'yellow'));
      else if (r < b) push(rollDrop(e, 'blue'));
      else if (r < c) push(rollDrop(e, 'white'));
    }
    return drops;
  }

  // 调试/兼容：直接掉进背包（正常击杀走地面袋）
  function dropEquip(e, forceRarity) {
    const eq = rollDrop(e, forceRarity);
    giveEquip(eq);
    return eq;
  }

  /* ---------------- 地面掉落袋 ---------------- */

  // 把掉落物放在地上；同格已有袋子就合并；R15.6 按最好品级播掉落音
  function dropBag(x, y, items, opts = {}) {
    if (!items || !items.length) return null;
    const exist = bagAt(x, y);
    let bag;
    if (exist) {
      exist.items.push(...items);
      if (opts.relic) exist.relic = true;
      bag = exist;
    } else {
      bag = { x, y, items: items.slice(), relic: !!opts.relic };
      activeBags.push(bag);
      while (activeBags.length > 40) {
        activeBags.shift();
        log('地上旧的袋子散落了。');
      }
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
    el.pickList.innerHTML = pickBag.items.map((it, i) =>
      isSkillBook(it) ? skillBookCellHtml(it, { pickIndex: i }) : eqCellHtml(it, { pickIndex: i })
    ).join('');
  }

  function takeFromBag(i) {
    if (!pickBag) return;
    const it = pickBag.items[i];
    if (!it) return;
    pickBag.items.splice(i, 1);
    if (isSkillBook(it)) learnSkillBook(it);
    else addToBag(it);
    removeBagIfEmpty(pickBag);
    if (!pickBag.items.length) closePick();
    else renderPick();
    syncHud();
  }

  function takeAllFromBag() {
    if (!pickBag) return;
    const items = pickBag.items.splice(0);
    for (const it of items) {
      if (isSkillBook(it)) learnSkillBook(it);
      else addToBag(it);
    }
    removeBagIfEmpty(pickBag);
    closePick();
  }

  /* ---------------- 挂机 ---------------- */
  function syncFarmBtn() {
    if (!el.btnFarm) return;
    el.btnFarm.classList.toggle('on', !!autoFarm);
    el.btnFarm.setAttribute('aria-pressed', autoFarm ? 'true' : 'false');
    el.btnFarm.innerHTML = `${autoFarm ? '挂·开' : '挂机'}<kbd>E</kbd>`;
    el.btnFarm.disabled = !canFarmHere() || over;
    el.btnFarm.title = !canFarmHere()
      ? '进房间后才能挂机'
      : (autoFarm ? '挂机中：再点关闭（点地也会关）' : '挂机：自动打普通/精英');
  }

  function setAutoFarm(on, note) {
    const next = !!on && canFarmHere() && !over;
    if (autoFarm === next) { syncFarmBtn(); return autoFarm; }
    autoFarm = next;
    killFromFarm = false;
    if (autoFarm) {
      stopWalk();
      log('挂机开启：只打普通/精英（稀有/首领要自己关挂再打）；收益与手打相同。', 'good');
      scheduleIdle();
    } else {
      log(note || '挂机已关闭。');
    }
    syncFarmBtn();
    return autoFarm;
  }

  function toggleFarm() {
    if (!canFarmHere()) { log('主城不能挂机，先进传送门。', 'bad'); return; }
    if (over) return;
    setAutoFarm(!autoFarm);
  }

  // 3D 模式下主城就是那张 128×128 野外图（currentRoom 一直是 null），
  // 但城里周围有野怪，挂机必须能用；2D 的老主城（无野怪）仍然禁掉。
  function canFarmHere() {
    return !!currentRoom || useOverworld();
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
    const maxKey = AUTO_FARM.autoLootMax || 'yellow';
    return (RAR_RANK[bagBestRarityKey(bag)] || 0) <= (RAR_RANK[maxKey] || 1);
  }

  // 挂机静默全捡（不弹清单）；满包返回 false；技能书直接学会
  function autoTakeBag(bag) {
    if (!bag || !bag.items.length) return true;
    while (bag.items.length) {
      const it = bag.items[0];
      if (isSkillBook(it)) {
        bag.items.shift();
        learnSkillBook(it);
        continue;
      }
      if (P.bag.length >= BAG_MAX) {
        log('背包满了，挂机已停。清一清再开。', 'bad');
        setAutoFarm(false);
        return false;
      }
      addToBag(bag.items.shift());
    }
    removeBagIfEmpty(bag);
    log('挂机捡起地上的袋子（≤A）。', 'good');
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

  function respawnField() {
    if (!useOverworld() || currentRoom || over) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    for (let i = 0; i < fieldSpawns.length; i++) {
      const spot = fieldSpawns[i];
      if (spot.alive && spot.alive.hp > 0) continue;
      if (!spot.deadAt || now - spot.deadAt < 8000) continue;
      if (Math.max(Math.abs(spot.x - P.x), Math.abs(spot.y - P.y)) < 6) continue;
      const mon = MON.find((m) => m.id === spot.id);
      if (!mon || map[spot.y][spot.x] === 1) continue;
      const e = makeEnemy(mon, 'normal');
      e.x = spot.x;
      e.y = spot.y;
      e.fieldHome = spot;
      spot.alive = e;
      spot.deadAt = 0;
      enemies.push(e);
    }
  }

  // allowAttack=false：玩家走路回合只追不砍（避免 0.18s 贴身狂飘伤害字）
  function enemiesTurn(opts) {
    respawnField();
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
      if (now + ACT_GRACE_MS < (e.nextActAt || 0)) continue;
      e.nextActAt = now + ENEMY_ACT_MS;

      if (action === 'attack') {
        if (isCrush(P.lv, e.lv, e.boss || e.elite || e.rare)) continue;   // 碾压：只有普通怪打不动你
        let dmg;
        if (e.atkMin != null && e.atkMax != null) {
          // 固定攻击区间（鸡 1–3）：直接取区间，不吃防，新手有疼
          dmg = randi(e.atkMin, e.atkMax);
        } else {
          const dr = defRange(P);
          dmg = DL.Combat.enemyDamage(e.atk, dr.min, dr.max, maxHp(), e.boss);
        }
        P.hp -= dmg;
        S.onHit(P);                                                   // R5.8：眩晕受击解除
        addFloater(P.x, P.y - 0.4, `-${dmg}`, '#ff6b6b');
        hurtFlash();
        log(`${e.name}攻击你，<span class="bad">-${dmg} HP</span>。`, 'bad');
        if (e.boss) bossTrick(e);                                     // R5.2 / R5.8
        if (tryAutoTown()) return;
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
    if (tryAutoTown()) return;
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
    snapWalkVis();
    P.hp = Math.ceil(maxHp() * 0.6);
    P.mp = Math.ceil(maxMp() * 0.5);
    lastZoneLv = zoneLevel(P.x);
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
    snapWalkVis();
    lastZoneLv = zoneLevel(P.x);
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
    if (DL.SingleTab && DL.SingleTab.isLost()) return;   // 锁没了：回合也别再往下走
    const pace = (opts && opts.pace) || 'combat';
    nextIdleMs = pace === 'move' ? MOVE_MS : playerCombatMs();
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
    // 药水 CD 走真实时间（3 秒），不随攻速变
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
    if (now + ACT_GRACE_MS < playerNextStrikeAt) return;
    playerNextStrikeAt = now + playerCombatMs();
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
        P.cd.fire = Math.ceil((D.SKILL_CD_MS && D.SKILL_CD_MS.fire ? D.SKILL_CD_MS.fire : 3000) / playerCombatMs());
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
      playerNextStrikeAt = now + playerCombatMs();
      killFromFarm = true;
      strike(block, 1.2, '攻击');
      after();
      return true;
    }
    beginWalkStep(P.x, P.y, nx, ny);
    P.x = nx;
    P.y = ny;
    const bag = bagAt(nx, ny);
    if (bag && bag.items.length && bagAutoLootable(bag)) autoTakeBag(bag);
    after({ pace: 'move' });
    return true;
  }

  // 时间驱动：挂机关也要贴身普攻 + 有怪时警戒（怪才能追/打）；挂机另加寻路捡袋
  function autoStep() {
    if (!canFarmHere() || over || uiOpen() || walkTimer) return false;
    // 摇杆/方向键正在走：位移已由 stick 的 after(move) 推进（含怪追击）；
    // 这里若再插警戒 after(combat)，会被走路的 180ms 时钟带着狂结算 DoT/CD
    if ((stickDx || stickDy) || heldMove.size) return false;
    const t = turn;

    if (!S.canAct(P)) { blockAction(); return turn !== t; }

    // 自动喝药（挂机/手控都开；红优先于蓝）
    // 挂机手感：喝药**不占整拍**。以前这里 `after(); return true;` 会吞掉一整拍
    // （COMBAT_MS = 1 秒），那 1 秒里玩家不出手，怪的行动又常卡在拍边，看着就是
    // 「回血顿 1 秒、怪也不攻击」。喝完接着走本拍（打 / 走 / 结算），节奏不断。
    if (P.autoPot > 0 && P.potionCd.red <= Date.now() &&
      P.hp <= maxHp() * P.autoPot / 100) drink('red');
    if (P.autoMp > 0 && P.potionCd.blue <= Date.now() &&
      P.mp <= maxMp() * P.autoMp / 100) drink('blue');
    // 自动回城：阈值以下且有回城卷
    if (tryAutoTown()) return true;

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

  function attack(mult, tag, viaUi) {
    const t = adjacentTarget();
    if (!t) { log('身边没有敌人。'); return false; }
    if (viaUi) { const now = nowMs(); if (now < playerNextStrikeAt) return false; playerNextStrikeAt = now + playerCombatMs(); }  // 连点不抢攻：手动也占同一个出手间隔
    strike(t, mult, tag); return true;
  }

  // 半月：朝向前方的九宫格半边 5 格（规则见 combat.js）
  function halfMoonCells() {
    return DL.Combat.halfMoonCells(P.x, P.y, P.dir);
  }

  function halfMoonTargets() {
    // 半月只打普通/精英：避免误伤稀有/首领，把它们非主动拉进战斗
    return DL.Combat.targetsAt(enemies, halfMoonCells()).filter((e) => !e.boss && !e.rare);
  }

  function halfMoon() {
    if (!P.skills.half) { log('还没学会半月弯刀——击败 20 级首领山大王可获得。', 'bad'); return false; }
    if (P.cd.half > 0) { log(`半月还在冷却（${P.cd.half} 回合）。`); return false; }
    if (P.mp < 6) { log('MP 不足（需要 6）。', 'bad'); return false; }
    P.mp -= 6;
    P.cd.half = Math.ceil((D.SKILL_CD_MS && D.SKILL_CD_MS.half ? D.SKILL_CD_MS.half : 2000) / playerCombatMs());
    halfFlash = 1;
    halfFlashCells = halfMoonCells();
    const targets = halfMoonTargets();
    for (const e of targets) strike(e, 1.1, '半月');
    if (!targets.length) log('半月劈在空气里。');
    return true;
  }

  function fireSword() {
    if (!P.skills.fire) { log('还没学会烈火剑法——击败 30 级首领血月怨主可获得。', 'bad'); return false; }
    if (P.cd.fire > 0) { log(`烈火还在冷却（${P.cd.fire} 回合）。`); return false; }
    if (P.mp < 12) { log('MP 不足（需要 12）。', 'bad'); return false; }
    const t = adjacentTarget();
    if (!t) { log('身边没有敌人。'); return false; }
    P.mp -= 12;
    P.cd.fire = Math.ceil((D.SKILL_CD_MS && D.SKILL_CD_MS.fire ? D.SKILL_CD_MS.fire : 3000) / playerCombatMs());
    strike(t, 2.2, '烈火');
    // R4.1：烈火剑法 = 单体 ×2.2 + 灼烧 3 回合（R3.12 灼烧 = 攻击 ×15% × 层数）
    if (t.hp > 0) {
      const st = S.apply(t, 'burn', { turn, dmg: S.damageFrom('burn', atkMean()) });
      if (st) log(`${t.name}被点燃了（🔥${st.stacks}，剩 ${st.left} 回合）。`, 'good');
    }
    return true;
  }

  // kind: 'red' | 'blue'；罐子：喝多少扣多少，直接回满
  function drink(kind) {
    kind = kind === 'blue' ? 'blue' : 'red';
    const label = kind === 'blue' ? '蓝罐' : '红罐';
    if (P.potionCd[kind] > Date.now()) {
      const left = Math.ceil((P.potionCd[kind] - Date.now()) / 1000);
      log(`${label}还在冷却（${left} 秒）。`);
      return false;
    }
    const max = kind === 'blue' ? maxMp() : maxHp();
    const cur = kind === 'blue' ? P.mp : P.hp;
    const need = Math.max(0, Math.round(max - cur));
    if (need <= 0) { log(`${label}：已经满了。`); return false; }
    const pool = P.potPool[kind] || 0;
    if (pool <= 0) { log(`${label}空了。`, 'bad'); return false; }
    const got = Math.min(need, pool);
    P.potPool[kind] = pool - got;
    if (kind === 'blue') P.mp = Math.min(max, P.mp + got);
    else P.hp = Math.min(max, P.hp + got);
    P.potionCd[kind] = Date.now() + (POTIONS.cdMs || 3000);
    addFloater(P.x, P.y - 0.4, `+${got}${kind === 'blue' ? 'MP' : ''}`, kind === 'blue' ? '#6ab0ff' : '#7ee0a0');
    log(`喝下${label} ${got} 点，罐子剩 ${formatAmount(P.potPool[kind])}。`, 'good');
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
    if (kind === 'attack') { if (attack(1.2, '攻击', true)) after(); }
    else if (kind === 'half') { if (halfMoon()) after(); }
    else if (kind === 'fire') { if (fireSword()) after(); }
    else if (kind === 'potion' || kind === 'red') { if (drink('red')) after(); }
    else if (kind === 'blue') { if (drink('blue')) after(); }
    else if (kind === 'wait') { log('你按兵不动。'); after(); }
  }

  /* ---------------- 传送门 ---------------- */
  let pendingDoor = null;
  let doorReturnPos = null;

  // 按房间 lvMin 归到门上。段尾房的 lvMax 会比门牌高 1（稀有 +2），
  // 用 lvMax 去卡会把山贼寨、血月荒原挤出所有门。
  function roomsForDoor(d) {
    const min = d && d.tierMin != null ? d.tierMin : 0;
    const next = doors.map((x) => x.tierMin).filter((t) => t > min).sort((a, b) => a - b)[0];
    return ROOMS.filter((spec) => {
      const lv = spec.lvMin || 1;
      if (lv < min) return false;
      return next == null || lv < next;
    });
  }

  function renderDoorList(d) {
    const list = roomsForDoor(d);
    el.doorList.innerHTML = list.length ? list.map((spec) => {
      const names = (spec.pool || [])
        .map((id) => (MON.find((m) => m.id === id) || {}).name)
        .filter(Boolean).join('、');
      const cd = bossCdOf(spec);
      const cleared = roomClearedAt[spec.id];
      const cdLeft = spec.boss && cleared != null && clock - cleared < cd
        ? Math.ceil(cd - (clock - cleared)) : 0;
      const ok = canEnterRoom(spec);
      const need = roomEnterNeedLv(spec);
      const lockTip = ok ? '' : ` · 需 Lv.${need}`;
      return `<button type="button" class="door-room${ok ? '' : ' locked'}" data-room="${spec.id}"${ok ? '' : ' disabled'}>
        <b>${spec.name}</b><span class="door-lv">Lv.${spec.lvMin}–${spec.lvMax}</span>
        <small>${names || '杂兵'}${spec.boss ? ' + 首领' : ''}${cdLeft ? ` · 首领 ${cdLeft} 分钟后` : ''}${lockTip}</small>
      </button>`;
    }).join('') : '<p class="menu-help">这个等级段还没有房间。</p>';
  }

  function promptDoor(d, ox, oy) {
    pendingDoor = d;
    doorReturnPos = { x: ox, y: oy };
    el.doorTitle.textContent = `传送门 · ${d.name || ''}`;
    el.doorDesc.textContent = `选择房间（可进自身等级 +${ROOM_ENTER_SLACK} 以内）：`;
    renderDoorList(d);
    el.doorConfirm.hidden = false;
    pauseAuto();
  }

  function closeDoor() {
    pendingDoor = null;
    doorReturnPos = null;
    el.doorConfirm.hidden = true;
  }

  function enterRoomFromDoor(roomId) {
    if (!roomId) return;
    const spec = roomSpec(roomId);
    if (!canEnterRoom(spec)) {
      log(`${spec ? spec.name : '这里'}太危险了（需 Lv.${roomEnterNeedLv(spec)}，你 Lv.${P.lv}）。`, 'bad');
      return;
    }
    if (pendingDoor) hubReturnDoor = { tierMin: pendingDoor.tierMin, name: pendingDoor.name };
    closeDoor();
    if (!enterRoom(roomId)) {
      resumeAuto();
      return;
    }
    syncHud();
    save();
    resumeAuto();
  }

  function cancelDoor() {
    if (doorReturnPos) { P.x = doorReturnPos.x; P.y = doorReturnPos.y; snapWalkVis(); }
    closeDoor();
    resumeAuto();
  }

  function move(dx, dy, fromWalk = false) {
    if (over) return false;
    dx = Math.sign(dx); dy = Math.sign(dy);
    if (!dx && !dy) return false;
    // 手动走（按键/摇杆）接管：取消点地寻路，别让画面折线跟逻辑打架
    if (!fromWalk) stopWalk();
    if (!S.canAct(P)) {                 // 麻痹/眩晕：走不动
      if (!fromWalk) blockAction();
      return false;
    }
    // 转面立刻；本格没走完只记方向，不改目的地（改目的地会冲锋/瞬移）
    // 返回 true 让按键/摇杆定时器别停——否则会「失灵」
    if (walkStepBusy()) {
      faceWalkDir(dx, dy);
      return true;
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
    faceWalkDir(dx, dy);
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
      playerNextStrikeAt = now + playerCombatMs();
      strike(e, 1.2, '攻击');
      if (fromWalk) stopWalk();
      after();
      return true;
    }
    const ox = P.x, oy = P.y;
    beginWalkStep(ox, oy, nx, ny);
    P.x = nx;
    P.y = ny;
    if (map[ny][nx] === 2) {
      if (currentRoom) {
        leaveRoom();
      } else {
        const d = doors.find((x) => x.x === nx && x.y === ny);
        if (d && d.direct) {
          enterRoom(d.direct);
          if (fromWalk) stopWalk();
          return true;
        }
        if (d) {
          promptDoor(d, ox, oy);
          if (fromWalk) stopWalk();
          return true;
        }
        log('这扇门还没接上。', 'bad');
      }
      syncHud();
      save();
      scheduleIdle();
      if (fromWalk) stopWalk();
      return true;
    }
    // 走到袋子上：挂机自动捡 ≤A；否则弹清单
    const bag = bagAt(nx, ny);
    if (bag && bag.items.length) {
      if (autoFarm && bagAutoLootable(bag)) autoTakeBag(bag);
      else if (autoFarm) {
        const rar = RARITY[bagBestRarityKey(bag)] || RARITY.orange;
        log(`地上有 ${rar.letter} 级袋子，挂机不捡——请手控。`);
      }
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
    if (tryAutoTown()) return;
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
    beginWalkStep(P.x, P.y, P.x + dx, P.y + dy);
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
    // 折线还在跑：先把「现在画到哪儿」接进 walkVis，再丢掉折线。
    // 这样撞怪停下、按方向键接管、换图回位都从当前位置接着滑，不会弹回格心。
    if (walkLine && walkLine.pts && walkLine.pts.length > 1) {
      const cur = walkStepVis();
      const remain = walkStepBusy() ? Math.max(16, walkStepRemaining()) : WALK_STEP_MS;
      walkVis = {
        fx: cur.x - 0.5, fy: cur.y - 0.5,
        tx: P.x, ty: P.y,
        start: nowMs(), dur: remain,
      };
      walkVisPrev = null;
    }
    walkLine = null;
    pendingTarget = null;
  }

  function walk(path) {
    const target = pendingTarget;   // 保留"走到后打谁"
    // 先记下当前这一格的画面进度/位置：换目标后画面要从这里接着画，
    // 而且 s（格数）要和逻辑同一拍——所以下面要把这张「步表」按原相位重新装上去。
    const p0 = walkVis ? stepProgress() : 1;
    const vNow = walkStepVis();
    const from = { x: vNow.x - 0.5, y: vNow.y - 0.5 };
    stopWalk();
    pendingTarget = target;
    // 画面折线：用 bfs 拉直后的关键点（起点/拐点/终点），逐格路径只管逻辑。
    // 折线的第一个点换成「停步那一瞬间画面在哪儿」，它对应的格数是 s0（还在这一格里的负数）：
    // 连点换目标时就从当前位置接着滑，不会从格心起算横跳一下。
    // ks[i] 是 pts[i] 对应的格数（累计 Chebyshev 步数），画面按格数在段内插值。
    const steps = Math.max(1, path ? path.length : 1);
    const s0 = Math.min(0, p0 - 1);
    let pts = null, ks = null;
    if (path && path.pts && path.pts.length > 1) {
      pts = [];
      ks = [];
      if (s0 < -1e-4) {
        pts.push({ x: from.x, y: from.y });
        ks.push(s0);
      }
      let k = 0;
      for (let i = 0; i < path.pts.length; i++) {
        const q = path.pts[i];
        if (i > 0) {
          const prev = path.pts[i - 1];
          k += Math.max(Math.abs(q.x - prev.x), Math.abs(q.y - prev.y));
        }
        // 起步锚点已经占住 pts[0]：跳过格心 P，直接从当前位置连到下一个拐点，
        // 免得先退到 P 再走——那 0.2~0.7 格的回头就是连点时看到的「抖」。
        if (i === 0 && pts.length) continue;
        const last = pts.length ? pts[pts.length - 1] : null;
        if (last && Math.abs(q.x - last.x) + Math.abs(q.y - last.y) <= 1e-6) continue;
        pts.push({ x: q.x, y: q.y });
        ks.push(k);
      }
      if (pts.length < 2) { pts = null; ks = null; }
      else ks[ks.length - 1] = Math.max(steps, ks[ks.length - 2] + 1e-6);
    }
    walkLine = pts ? { pts: pts, ks: ks, total: steps, done: 0 } : null;
    if (pts) {
      // 步表按原相位重装：画面从 from 继续滑到格心 P，正好是这一格剩下的时间；
      // 逻辑也用同一个闸门，两边同拍（抢跑会让人物先到、镜头再追，看着就是抖）。
      const now = nowMs();
      walkVis = { fx: from.x, fy: from.y, tx: P.x, ty: P.y, start: now - p0 * WALK_STEP_MS, dur: WALK_STEP_MS };
      walkVisPrev = null;
      walkReadyAt = now + (1 - p0) * WALK_STEP_MS;
    }
    const token = walkToken;
    let i = 0;
    const step = () => {
      if (token !== walkToken) return;
      // 本格还在滑：先等闸门（不查 uiOpen，避免挂起时被误杀）
      if (walkStepBusy()) {
        walkTimer = setTimeout(step, walkStepRemaining());
        return;
      }
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
      const sdx = n.x - P.x, sdy = n.y - P.y;
      const moved = move(sdx, sdy, true);
      if (!moved) { stopWalk(); return; }
      if (token !== walkToken) return;   // 撞怪/换图会取消剩余路径
      if (over || uiOpen()) { stopWalk(); return; }
      walkTimer = setTimeout(step, walkVisDur());
    };
    step();
  }

  /* ---------------- 输入 ---------------- */
  // 点地/点怪唯一入口：ThreeView 把屏幕坐标换成格子后回调 handleCellClick（BFS / 撞怪 / NPC / 换图）
  function handleCellClick(wx, wy) {
    if (over || uiOpen()) return;
    if (DL.SingleTab && DL.SingleTab.isLost()) return;
    if (autoFarm) setAutoFarm(false, '挂机已关闭（点地手动接管）。'); // 鼠标点地/手机点屏都算接管
    if (!S.canAct(P)) { blockAction(); return; }
    if (wx < 0 || wy < 0 || wx >= map[0].length || wy >= map.length) return;
    if (isWall(wx, wy)) return;
    // 脚下有袋子：点一下就重新打开清单（不先 stopWalk，避免无意义掐步）
    if (P.x === wx && P.y === wy) {
      const here = bagAt(wx, wy);
      if (here) { pickupBag(here); return; }
      return; // 同格重点：不停步
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
    if (bookNpc && wx === bookNpc.x && wy === bookNpc.y) {
      if (nearBookShop()) { tryInteract(); return; }
      const goal = bestAdjacent(wx, wy);
      if (!goal) return;
      const path = bfs(P.x, P.y, goal.x, goal.y);
      if (!path) { log('过不去。'); return; }
      pendingTarget = null;
      walk(path);
      return;
    }
    if (trialNpc && wx === trialNpc.x && wy === trialNpc.y) {
      if (nearTrial()) { tryInteract(); return; }
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
  // heldMove / stickDx|Dy / stickTimer / keyMoveTimer 已在文件前部声明
  const MOVE_KEYS = {
    w: 1, a: 1, s: 1, d: 1,
    arrowup: 1, arrowleft: 1, arrowdown: 1, arrowright: 1,
  };
  let stickPtr = null;           // 轮盘只认第一根手指

  // 同轴对冲：保留先按下的键，忽略后按的（左右/上下同时按时不定住）
  function axisFromKeys(negKeys, posKeys) {
    let best = 0;
    let bestAt = Infinity;
    for (let i = 0; i < negKeys.length; i++) {
      const k = negKeys[i];
      if (!heldMove.has(k)) continue;
      const at = moveKeyAt.has(k) ? moveKeyAt.get(k) : 0;
      if (at < bestAt) { bestAt = at; best = -1; }
    }
    for (let i = 0; i < posKeys.length; i++) {
      const k = posKeys[i];
      if (!heldMove.has(k)) continue;
      const at = moveKeyAt.has(k) ? moveKeyAt.get(k) : 0;
      if (at < bestAt) { bestAt = at; best = 1; }
    }
    return best;
  }
  function heldMoveDelta() {
    const dx = axisFromKeys(['a', 'arrowleft'], ['d', 'arrowright']);
    const dy = axisFromKeys(['w', 'arrowup'], ['s', 'arrowdown']);
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

  function stopKeyMove() {
    if (keyMoveTimer) { clearTimeout(keyMoveTimer); keyMoveTimer = null; }
  }

  function pressMoveKey(k) {
    if (!heldMove.has(k)) moveKeyAt.set(k, ++moveKeySeq);
    heldMove.add(k);
    stopWalk();
    const [dx, dy] = heldMoveDelta();
    if (dx || dy) move(dx, dy); // 忙则只转面；不忙开新步
    if (!keyMoveTimer) {
      const tick = () => {
        keyMoveTimer = null;
        if (over || uiOpen()) { stopKeyMove(); return; }
        const [mx, my] = heldMoveDelta();
        if (!mx && !my) { stopKeyMove(); return; }
        if (walkStepBusy()) {
          keyMoveTimer = setTimeout(tick, walkStepRemaining());
          return;
        }
        // 撞墙才停；busy 时 move 返回 true，不会误停
        if (!move(mx, my) && !walkStepBusy()) { stopKeyMove(); return; }
        keyMoveTimer = setTimeout(tick, walkVisDur());
      };
      keyMoveTimer = setTimeout(tick, walkStepBusy() ? walkStepRemaining() : walkVisDur());
    }
    syncDpadActive();
  }
  function releaseMoveKey(k) {
    heldMove.delete(k);
    moveKeyAt.delete(k);
    if (!heldMove.size) stopKeyMove();
    syncDpadActive();
  }

  function stopStickRepeat() {
    if (stickTimer) { clearTimeout(stickTimer); stickTimer = null; }
  }

  function setStickDir(dx, dy) {
    const wasOn = !!(stickDx || stickDy);
    stickDx = dx;
    stickDy = dy;
    if (!(dx || dy)) {
      stopStickRepeat();
      return;
    }
    // 已经有一拍在跑：换扇区只更新方向，等下一拍生效。
    // 以前每次换向都补走一步 + 重置定时器，鼠标贴着扇区边界抖一下就能白走好几格。
    if (wasOn && stickTimer) {
      // 换扇区只转面/记方向，等本格走完；不重置定时器
      if (!uiOpen() && !over && (dx || dy)) move(dx, dy);
      return;
    }
    stopStickRepeat();
    if (!uiOpen() && !over) {
      stopWalk();
      move(dx, dy);
    }
    const tick = () => {
      if (!(stickDx || stickDy)) { stickTimer = null; return; }
      if (!uiOpen() && !over) {
        stopWalk();
        if (walkStepBusy()) {
          stickTimer = setTimeout(tick, walkStepRemaining());
          return;
        }
        move(stickDx, stickDy);
      }
      stickTimer = setTimeout(tick, walkVisDur());
    };
    stickTimer = setTimeout(tick, walkStepBusy() ? walkStepRemaining() : walkVisDur());
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
    if (DL.SingleTab && DL.SingleTab.isLost()) return;
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
          name: `${t.name}${tag}罐 +${t.amount}`, amount: t.amount,
          price: potPrice(kind, t.id),
        });
      }
    }
    list.push({
      kind: 'scroll', buyId: 'townScroll',
      name: (SHOP.townScroll && SHOP.townScroll.label) || '回城卷',
      price: (SHOP.townScroll && SHOP.townScroll.price) || 100,
    });
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

  function openBookShop() {
    if (over) return;
    if (!nearBookShop()) { log('技能书商人不在附近。', 'bad'); return; }
    hideEqTip();
    el.bookShop.hidden = false;
    renderBookShop();
  }

  function renderBookShop() {
    if (!el.bookShopGold) return;
    el.bookShopGold.textContent = P.gold;
    el.bookShopList.innerHTML = Object.entries(BOOK_SHOP).map(([id, b]) => {
      const learned = !!P.skills[id];
      const afford = P.gold >= b.price;
      return `<div class="book-row">
        <div><b>${b.name}</b><small>${learned ? '已学会' : `售价 ${b.price} 金`}</small></div>
        <button type="button" data-book="${id}" ${learned || !afford ? 'disabled' : ''}>${learned ? '已学会' : afford ? '购买' : '金币不足'}</button>
      </div>`;
    }).join('');
  }

  function buyBook(id) {
    const b = BOOK_SHOP[id];
    if (!b) return false;
    if (P.skills[id]) { log('已经学会了。'); return false; }
    if (P.gold < b.price) { log(`金币不够，还差 ${b.price - P.gold}。`, 'bad'); return false; }
    P.gold -= b.price;
    P.skills[id] = true;
    log(`买下《${b.name}》，已学会！`, 'good');
    syncHud();
    save();
    renderBookShop();
    return true;
  }

  function refreshShop() {
    if (!el.shopGold) return;
    el.shopGold.textContent = P.gold;
    const stock = ensureShopCatalog();
    if (el.shopStock) {
      el.shopStock.innerHTML = stock.map((it, i) => {
        if (it.kind === 'pot') return potCellHtml(it, i);
        if (it.kind === 'scroll') return scrollCellHtml(it, i);
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

  function refreshStash() {
    if (!el.stashCount) return;
    el.stashCount.textContent = `${P.stash.length}/${STASH_MAX}`;
    if (el.stashGrid) {
      const cells = [];
      for (let i = 0; i < STASH_MAX; i++) {
        const eq = P.stash[i];
        cells.push(eq ? eqCellHtml(eq, { stashIndex: i }) : eqCellHtml(null, { label: '' }));
      }
      el.stashGrid.innerHTML = cells.join('');
    }
    if (el.stashBag) {
      const cells = [];
      for (let i = 0; i < BAG_MAX; i++) {
        const eq = P.bag[i];
        cells.push(eq ? eqCellHtml(eq, { stashBag: i }) : eqCellHtml(null, { label: '' }));
      }
      el.stashBag.innerHTML = cells.join('');
    }
  }

  function openStash() {
    if (over) return false;
    if (!nearStash()) {
      log('仓库不在附近。回主城，出生点南边。', 'bad');
      return false;
    }
    hideEqTip();
    el.stash.hidden = false;
    refreshStash();
    return true;
  }

  function buyShopStock(i, qty) {
    const it = ensureShopCatalog()[i];
    if (!it) return false;
    const n = Math.max(1, Math.min(99, qty | 0 || 1));
    if (it.kind === 'pot') return buyPotion(it.potKind, it.tierId, n);
    if (it.kind === 'scroll') return buyTownScroll(n);
    return buy(it.buyId, n);
  }

  function buyPotion(kind, tierId, qty) {
    kind = kind === 'blue' ? 'blue' : 'red';
    const tier = potTier(tierId);
    if (!tier) return false;
    const n = Math.max(1, Math.min(99, qty | 0 || 1));
    const unit = potPrice(kind, tier.id);
    const price = unit * n;
    if (P.gold < price) {
      log(`金币不够，还差 ${price - P.gold}（${n} 份共 ${price}）。`, 'bad');
      return false;
    }
    P.gold -= price;
    const add = tier.amount * n;
    P.potPool[kind] = (P.potPool[kind] || 0) + add;
    log(n > 1
      ? `给${kind === 'blue' ? '蓝' : '红'}罐补了 ${add} 点（×${n}）。`
      : `给${kind === 'blue' ? '蓝' : '红'}罐补了 ${add} 点。`, 'good');
    syncHud();
    if (!el.shop.hidden) refreshShop();
    if (!el.char.hidden) renderChar();
    save();
    return true;
  }

  function buyTownScroll(qty) {
    const it = SHOP.townScroll || { price: 100 };
    const n = Math.max(1, Math.min(99, qty | 0 || 1));
    const price = it.price * n;
    if (P.gold < price) {
      log(`金币不够，还差 ${price - P.gold}（回城卷 ${n} 张）。`, 'bad');
      return false;
    }
    P.gold -= price;
    P.townScrolls = (P.townScrolls | 0) + n;
    log(`买了回城卷 ×${n}（共有 ${P.townScrolls}）。`, 'good');
    syncHud();
    if (!el.shop.hidden) refreshShop();
    if (!el.char.hidden) renderChar();
    save();
    return true;
  }

  function buy(kind, qty) {
    if (kind === 'potion' || kind === 'potRedLow') return buyPotion('red', 'low', qty);
    if (kind === 'townScroll') return buyTownScroll(qty);
    const it = SHOP[kind];
    if (!it) return false;
    const n = Math.max(1, Math.min(99, qty | 0 || 1));
    const price = it.price * n;
    if (P.gold < price) {
      log(`金币不够，还差 ${price - P.gold}（×${n}）。`, 'bad');
      return false;
    }
    if (P.bag.length + n > BAG_MAX) {
      log(`背包空位不够（要 ${n} 格，剩 ${BAG_MAX - P.bag.length}）。`, 'bad');
      return false;
    }
    P.gold -= price;
    let got = 0;
    for (let i = 0; i < n; i++) {
      let eq = null;
      if (kind === 'sword') {
        eq = makeEquip('weapon', 3, 'white', { atkMin: 3, atkMax: 3, defMin: 0, defMax: 0, hp: 0 });
      } else if (kind === 'armor') {
        eq = makeEquip('armor', 3, 'white', { atkMin: 0, atkMax: 0, defMin: 2, defMax: 2, hp: 15 });
      }
      if (!eq || P.bag.length >= BAG_MAX) break;
      P.bag.push(eq);
      got += 1;
    }
    log(got > 1 ? `买了 ${it.label || kind} ×${got}。` : `买了 ${it.label || kind}。`, 'good');
    syncHud();
    if (!el.shop.hidden) refreshShop();
    if (!el.char.hidden) renderChar();
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
    if (el.stash) el.stash.hidden = true;
    if (el.bookShop) el.bookShop.hidden = true;
    if (el.trial) el.trial.hidden = true;
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
    window.addEventListener('blur', () => {
      heldMove.clear();
      moveKeyAt.clear();
      stopKeyMove();
      syncDpadActive();
    });
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
    function syncMuteUi() {
      const off = Sfx.isMuted();
      if (el.btnMute) {
        el.btnMute.textContent = off ? '🔇' : '🔊';
        el.btnMute.setAttribute('aria-pressed', off ? 'true' : 'false');
        el.btnMute.title = off ? '音效已关（点开）' : '音效已开（点关）';
      }
      if (el.menuMute) el.menuMute.textContent = off ? '🔇 已关' : '🔊 开启';
    }
    function syncSfxGate() {
      if (!el.sfxGate) return;
      el.sfxGate.hidden = !!Sfx.isUnlocked();
    }
    syncMuteUi();
    syncSfxGate();
    if (typeof Sfx.onChange === 'function') {
      Sfx.onChange(() => { syncMuteUi(); syncSfxGate(); });
    }
    const onMuteToggle = () => {
      if (!Sfx.isUnlocked()) {
        Sfx.enable();
        syncMuteUi();
        syncSfxGate();
        return;
      }
      Sfx.toggleMute();
      syncMuteUi();
    };
    if (el.btnMute) el.btnMute.addEventListener('click', onMuteToggle);
    if (el.menuMute) el.menuMute.addEventListener('click', onMuteToggle);
    // 手机必须点显式按钮：在手势里同步建 AudioContext 并出声
    // 注意：不要在 pointerdown 里 preventDefault，部分手机点了会没反应
    const onSfxEnable = () => {
      try { Sfx.enable(); } catch (err) { console.warn('sfx enable', err); }
      // 无论如何关掉遮罩，避免卡死
      if (el.sfxGate) el.sfxGate.hidden = true;
      syncMuteUi();
      syncSfxGate();
    };
    if (el.sfxEnable) {
      el.sfxEnable.addEventListener('click', onSfxEnable);
      el.sfxEnable.addEventListener('touchend', (e) => {
        e.preventDefault();
        onSfxEnable();
      }, { passive: false });
    }
    if (el.sfxGate) {
      el.sfxGate.addEventListener('click', (e) => {
        if (e.target === el.sfxGate) onSfxEnable();
      });
    }
    if (el.introBtn) {
      el.introBtn.addEventListener('click', () => {
        if (!Sfx.isUnlocked()) Sfx.enable();
      });
    }

    el.btnMenu.addEventListener('click', () => {
      el.seedText.textContent = String(worldSeed);
      syncMuteUi();
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
    if (el.stashClose) el.stashClose.addEventListener('click', () => { hideEqTip(); el.stash.hidden = true; });
    bindBackdropClose(el.stash, () => { hideEqTip(); el.stash.hidden = true; });
    if (el.bookShopClose) el.bookShopClose.addEventListener('click', () => { el.bookShop.hidden = true; });
    if (el.bookShopList) el.bookShopList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-book]');
      if (b) buyBook(b.dataset.book);
    });
    bindBackdropClose(el.bookShop, () => { el.bookShop.hidden = true; });
    if (el.trialClose) el.trialClose.addEventListener('click', () => { el.trial.hidden = true; });
    if (el.trialTurnIn) el.trialTurnIn.addEventListener('click', turnInTrial);
    if (el.trialAbandon) el.trialAbandon.addEventListener('click', abandonTrial);
    if (el.trialUseOrb) el.trialUseOrb.addEventListener('click', useExpOrb);
    if (el.trialSellMats) el.trialSellMats.addEventListener('click', sellAllMats);
    if (el.trialModePick) el.trialModePick.addEventListener('click', (e) => {
      const b = e.target.closest('[data-trial-mode]');
      if (b) chooseTrialMode(b.dataset.trialMode);
    });
    if (el.trialSwitch) el.trialSwitch.addEventListener('click', resetTrialMode);
    bindBackdropClose(el.trial, () => { el.trial.hidden = true; });
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
          else if (info.it.kind === 'scroll') showScrollTip(info.it, src, sticky, cell);
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
    const bindStashGrid = (root, mode) => {
      if (!root) return;
      const read = (cell) => {
        if (mode === 'stash' && cell.dataset.stash != null) {
          const i = Number(cell.dataset.stash);
          return { i, eq: P.stash[i] };
        }
        if (mode === 'bag' && cell.dataset.stashBag != null) {
          const i = Number(cell.dataset.stashBag);
          return { i, eq: P.bag[i] };
        }
        return null;
      };
      const preview = (cell, sticky) => {
        const info = read(cell);
        if (!info || !info.eq) return;
        showEqTip(info.eq, { kind: mode === 'stash' ? 'stash' : 'stashBag', i: info.i }, sticky, cell);
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
        if (!info || !info.eq) return;
        const moved = mode === 'stash' ? withdrawFromStash(info.i) : depositFromBag(info.i);
        if (moved) hideEqTip();
      });
      root.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest('.eq-cell:not(.empty)');
        if (!cell || !root.contains(cell)) return;
        e.preventDefault();
        const info = read(cell);
        if (!info || !info.eq) return;
        const moved = mode === 'stash' ? withdrawFromStash(info.i) : depositFromBag(info.i);
        if (moved) hideEqTip();
      });
    };
    bindStashGrid(el.stashGrid, 'stash');
    bindStashGrid(el.stashBag, 'bag');
    document.querySelectorAll('[data-recycle-run]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const bar = btn.closest('.bag-recycle');
        sellBagByRarity(selectedRecycleRarities(bar));
        hideEqTip();
      });
    });
    if (el.eqTipClose) el.eqTipClose.addEventListener('click', hideEqTip);
    // 装备格子：悬停预览，点击钉住详情（手机靠点击）
    const bindEqGrid = (root, kind) => {
      if (!root) return;
      const previewCell = (cell, sticky) => {
        let src = null;
        if (cell.dataset.bag != null) {
          src = { kind: 'bag', i: Number(cell.dataset.bag) };
          const eq = P.bag[src.i];
          if (eq) showEqTip(eq, src, sticky, cell);
          return;
        }
        if (cell.dataset.worn) {
          src = { kind: 'worn', i: cell.dataset.worn };
          const eq = resolveEqFromSrc(src);
          if (eq) showEqTip(eq, src, sticky, cell);
          return;
        }
        if (cell.dataset.pick != null) {
          src = { kind: 'pick', i: Number(cell.dataset.pick) };
          const it = pickBag && pickBag.items[src.i];
          if (isSkillBook(it)) showSkillBookTip(it, src, sticky, cell);
          else if (it) showEqTip(it, src, sticky, cell);
        }
      };
      root.addEventListener('pointerover', (e) => {
        const cell = e.target.closest('.eq-cell:not(.empty)');
        if (!cell || tipSticky) return;
        previewCell(cell, false);
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
        previewCell(cell, true);
      });
      // 背包双击直接穿戴；拾取清单双击捡起/学技能书
      if (kind === 'bag') {
        root.addEventListener('dblclick', (e) => {
          const cell = e.target.closest('.eq-cell:not(.empty)');
          if (!cell || cell.dataset.bag == null || !root.contains(cell)) return;
          e.preventDefault();
          e.stopPropagation();
          if (equipFromBag(Number(cell.dataset.bag))) hideEqTip();
        });
      }
      if (kind === 'pick') {
        root.addEventListener('dblclick', (e) => {
          const cell = e.target.closest('.eq-cell:not(.empty)');
          if (!cell || cell.dataset.pick == null || !root.contains(cell)) return;
          e.preventDefault();
          e.stopPropagation();
          takeFromBag(Number(cell.dataset.pick));
          hideEqTip();
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
          return;
        }
        if (e.target.closest('[data-tip-lock]')) {
          const eq = resolveEqFromSrc(tipSrc);
          if (eq) toggleLockEq(eq);
          return;
        }
        const stashBtn = e.target.closest('[data-tip-stash]');
        if (stashBtn && tipSrc) {
          const dir = stashBtn.getAttribute('data-tip-stash');
          const moved = dir === 'in' ? depositFromBag(tipSrc.i) : withdrawFromStash(tipSrc.i);
          if (moved) hideEqTip();
          return;
        }
        const buyBtn = e.target.closest('[data-tip-buy]');
        if (buyBtn && tipSrc && tipSrc.kind === 'shopStock') {
          const qty = Number(buyBtn.getAttribute('data-tip-buy')) || 1;
          if (buyShopStock(tipSrc.i, qty)) {
            const it = ensureShopCatalog()[tipSrc.i];
            const cell = findTipAnchor(tipSrc);
            if (it && it.kind === 'pot') showPotTip(it, tipSrc, true, cell);
            else if (it && it.kind === 'scroll') showScrollTip(it, tipSrc, true, cell);
            else if (it && it.eq) showEqTip(it.eq, tipSrc, true, cell);
          }
        }
      });
    }
    if (el.char) {
      el.char.addEventListener('click', (e) => {
        if (e.target.closest('[data-use-scroll]')) {
          e.preventDefault();
          useTownScroll();
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
    if (el.autoTown) el.autoTown.addEventListener('change', () => {
      P.autoTown = Number(el.autoTown.value) || 0;
      save();
      log(P.autoTown
        ? `自动回城：血量低于 ${P.autoTown}% 且有回城卷时回城。`
        : '自动回城已关闭。');
    });
    el.menuRestart.addEventListener('click', restart);
    el.doorList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-room]');
      if (b) enterRoomFromDoor(b.dataset.room);
    });
    el.doorNo.addEventListener('click', cancelDoor);
    el.pickAll.addEventListener('click', () => { hideEqTip(); takeAllFromBag(); });
    el.pickClose.addEventListener('click', () => { hideEqTip(); closePick(); });
    el.introBtn.addEventListener('click', () => {
      el.intro.hidden = true;
      save();
      log('主城：往东走进传送门，先去鸡鸣村外打鸡。鸡啄 1–3 点，5 级起没经验。', 'good');
    });
    el.overAlt.onclick = restart;
  }

  /* ---------------- 渲染 ---------------- */
  /* ---------------- 渲染相关：3D 立牌要用的场景数据 ----------------
     画面本体在 render-three.js（WebGL）。这里只剩：道具/地形生成、主题名。
     2D Canvas 渲染已整体移除（2026-10-29）。
  */
  function themeNow() {
    if (!currentRoom) return 'field';
    const table = D.THEME_OF_ROOM || {};
    return table[currentRoom] || 'field';
  }

  let props = [];

  function isBorder(x, y) {
    return x === 0 || y === 0 || x === map[0].length - 1 || y === map.length - 1;
  }

  function walkableNear(x, y) {
    if (map[y] && map[y][x] !== 1) return { x: x, y: y };
    for (let r = 1; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (map[ny] && map[ny][nx] !== 1) return { x: nx, y: ny };
        }
      }
    }
    return { x: 1, y: 1 };
  }

  function refreshTerrain() {
    const W = map[0].length, H = map.length;
    const hub = !currentRoom;
    const center = walkableNear(
      hub ? (npc ? npc.x : Math.floor(W / 2)) : Math.floor(W / 2),
      hub ? (npc ? npc.y : Math.floor(H / 2)) : Math.floor(H / 2)
    );
    const pts = [center];
    if (hub) {
      if (npc) pts.push(npc);
      if (bookNpc) pts.push(bookNpc);
      if (trialNpc) pts.push(trialNpc);
      if (stashNpc) pts.push(stashNpc);
      for (let i = 0; i < doors.length; i++) pts.push(doors[i]);
    } else if (back) {
      pts.push(back);
    }
    const seed = (worldSeed >>> 0) ^ hashId(currentRoom || 'hub');
    terrain = DL.World.genTerrain(map, pts, seed);
    // 海岛化（2026-10-29）：野外房间（open）整图 96，陆地只占中间 48——
    // genRoom 已经把陆地画好（map=0），这里只上色：map=1 → 海；靠海两圈 → 沙滩。
    // 洞窟（cave）不碰：它的墙就是岩壁（terrain=2）。
    const roomKind = currentRoom ? roomSpec(currentRoom) : null;
    if (roomKind && roomKind.layout === 'open') {
      const W2 = map[0].length, H2 = map.length;
      let lx0 = W2, lx1 = -1, ly0 = H2, ly1 = -1;
      for (let y = 0; y < H2; y++) {
        for (let x = 0; x < W2; x++) {
          if (map[y][x] !== 0) continue;
          if (x < lx0) lx0 = x;
          if (x > lx1) lx1 = x;
          if (y < ly0) ly0 = y;
          if (y > ly1) ly1 = y;
        }
      }
      for (let y = 0; y < H2; y++) {
        for (let x = 0; x < W2; x++) {
          if (map[y][x] === 2) continue;                         // 出口格不动
          if (map[y][x] === 1) {
            // 陆地内的是障碍（树/石头），陆地外才是海
            const inLand = x >= lx0 && x <= lx1 && y >= ly0 && y <= ly1;
            terrain[y][x] = inLand ? 2 : 3;
            continue;
          }
          const dd = Math.min(x - lx0, lx1 - x, y - ly0, ly1 - y);
          terrain[y][x] = dd < 2 ? 4 : 0;                        // 靠海两圈沙滩，里面草地
        }
      }
    }
    props = buildProps(seed);
  }

  // 场景道具：主城手工摆，房间按种子撒。全部是纯装饰，不参与碰撞（A 阶段）。
  function buildProps(seed) {
    // 2026-10-29：所有地图都改成海岛形式，立牌（树 / 房子 / 石头 / 摊位）全部不要，
    // 边界交给海和沙滩。这里直接返回空表，房间里只剩怪和 NPC。
    if (true) return [];
    // 3D 立牌全程序化，不再依赖 DL.Assets（2D 那条已删）
    const W = map[0].length, H = map.length;
    const theme = themeNow();
    const rnd = DL.Core && DL.Core.mulberry32 ? DL.Core.mulberry32((seed ^ 0x9e3779b9) >>> 0) : Math.random;
    const list = [];
    const add = (sheet, index, x, y, opt) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      list.push(Object.assign({ sheet: sheet, index: index, x: x, y: y }, opt || {}));
    };
    const occupied = (x, y) => list.some((p) => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1);
    const open = (x, y) => map[y] && map[y][x] !== 1 && !(terrain && terrain[y][x] === 1);

    // 边界：field 森林、cave 岩壁、waste 枯树。树站在最外圈墙上，树冠伸进画面。
    const borderTree = theme === 'field' ? [0, 1, 2, 8, 9] : theme === 'cave' ? [6, 7, 6, 7] : [3, 8, 3, 8];
    const borderAdd = (x, y) => {
      if (rnd() < 0.22) return;
      // 门口两格内不种树：3D 边界树很高，树冠会把刚进门的角色整个盖住
      if ((doors || []).some((d) => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) <= 2)) return;
      const idx = borderTree[Math.floor(rnd() * borderTree.length)];
      const s = 0.85 + rnd() * 0.45;
      add('flora', idx, x, y, {
        ox: Math.round((rnd() - 0.5) * 18),
        oy: Math.round((rnd() - 0.5) * 10),
        w: Math.round(128 * s),
        h: Math.round(128 * s),
      });
    };
    for (let x = 1; x < W - 1; x++) {
      if (map[0][x] === 1) borderAdd(x, 0);
      if (map[H - 1][x] === 1) borderAdd(x, H - 1);
    }
    for (let y = 1; y < H - 1; y++) {
      if (map[y][0] === 1) borderAdd(0, y);
      if (map[y][W - 1] === 1) {
        // 右边三扇门旁边别种树，树冠会盖住门名
        if (currentRoom || !doors.some((d) => Math.abs(d.y - y) <= 2)) borderAdd(W - 1, y);
      }
    }

    if (!currentRoom) {
      // 主城：摊位/帐篷/篝火/水井/栅栏/路灯，围着 NPC 摆
      add('town', 0, 12, 10);      // 杂货铺摊位
      add('town', 1, 8, 7);        // 书摊
      add('town', 4, 16, 7);       // 村长帐篷
      add('town', 2, 14, 14);      // 篝火
      add('town', 3, 9, 15);       // 水井
      add('town', 5, 7, 12, { w: 96 });   // 栅栏
      add('town', 5, 17, 12, { w: 96 });  // 栅栏
      add('town', 6, 4, 14);       // 木箱
      add('town', 7, 5, 17);       // 木桶
      add('town', 8, 10, 9);       // 路灯
      add('town', 8, 15, 16);      // 路灯
      add('town', 9, 18, 12);      // 路牌
      add('town', 10, 3, 8);       // 干草堆
      add('town', 11, 19, 15);     // 枯树（右下空地）
      add('town', 12, 6, 20);      // 池塘
      add('town', 13, 9, 18);      // 板车
      add('town', 14, 16, 18);     // 长凳
      add('flora', 0, 3, 5);       // 村口大树
      add('flora', 4, 6, 5);       // 灌木
      add('flora', 5, 18, 20);     // 小灌木
      add('flora', 7, 3, 20);      // 小石头
      add('flora', 6, 21, 3);      // 大石头

      // 草地上再撒一层：花、草簇、蘑菇、石头，别让村子像草坪
      const scatter = [[11, 0.24], [12, 0.24], [10, 0.18], [5, 0.14], [13, 0.1], [7, 0.1]];
      for (let i = 0; i < 70; i++) {
        const x = 2 + Math.floor(rnd() * (W - 4));
        const y = 2 + Math.floor(rnd() * (H - 4));
        if (!open(x, y) || occupied(x, y)) continue;
        if (Math.abs(x - (npc ? npc.x : 12)) <= 2 && Math.abs(y - (npc ? npc.y : 12)) <= 2) continue;
        let r = rnd(), pick = scatter[0][0];
        for (let k = 0; k < scatter.length; k++) {
          if (r < scatter[k][1]) { pick = scatter[k][0]; break; }
          r -= scatter[k][1];
        }
        add('flora', pick, x, y, { alpha: 0.12 });
        if (list.length > 46) break;
      }
      return list;
    }

    // 房间：在草地上撒灌木/石头/小树，避开路、墙、门口
    const kinds = theme === 'cave'
      ? [[7, 0.4], [6, 0.2], [13, 0.2], [5, 0.2]]
      : theme === 'waste'
        ? [[3, 0.3], [7, 0.3], [8, 0.2], [14, 0.2]]
        : [[4, 0.26], [5, 0.26], [7, 0.2], [8, 0.14], [10, 0.14]];
    const tries = 90;
    for (let i = 0; i < tries; i++) {
      const x = 2 + Math.floor(rnd() * (W - 4));
      const y = 2 + Math.floor(rnd() * (H - 4));
      if (!open(x, y)) continue;
      if (Math.abs(x - P.x) <= 2 && Math.abs(y - P.y) <= 2) continue;
      if (back && Math.abs(x - back.x) <= 2 && Math.abs(y - back.y) <= 2) continue;
      if (occupied(x, y)) continue;
      let pick = kinds[0][0], r = rnd();
      for (let k = 0; k < kinds.length; k++) {
        if (r < kinds[k][1]) { pick = kinds[k][0]; break; }
        r -= kinds[k][1];
      }
      add('flora', pick, x, y);
      if (list.length > 22) break;
    }
    return list;
  }

  /* ---------------- 启动 ----------------
     拆成 startGame() 是为了单实例守卫（src/single-tab.js）：抢不到锁的页面不读档、
     不建 3D、不开时钟、不存盘，只盖一层遮罩，等另一个页面让出后再接管。 */
  function hubRegen() {
    if (currentRoom || over || P.hp <= 0) return false;
    if (P.hp >= maxHp()) return false;
    P.hp = Math.min(maxHp(), P.hp + maxHp() * 0.01);
    return true;
  }

  function startGame() {
  const loaded = load();
  if (!worldSeed) worldSeed = randomSeed();
  genHub();
  // 只跑 3D（WebGL）。截图 / 自动化同样跳音效门和开场说明
  const quietStart = location.search.includes('shot')
    || location.search.includes('debug');
  if (!loaded) {
    P.hp = maxHp();
    P.mp = maxMp();
    // 音效门（z90）和开场说明（z10）都带 82% 黑遮罩；同时显示时透光只剩 ~3%，新档首开看着就是黑屏。
    // 开场说明压到音效门关掉之后再出现（quietStart 下直接按原逻辑走，不挂观察者）。
    const gate = el.sfxGate;
    if (gate && !gate.hidden && !quietStart && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(() => {
        if (gate.hidden) {
          obs.disconnect();
          el.intro.hidden = false;
        }
      });
      obs.observe(gate, { attributes: true, attributeFilter: ['hidden'] });
    } else {
      el.intro.hidden = false;
    }
  } else {
    P.hp = Math.max(1, Math.min(P.hp, maxHp()));
    P.mp = Math.min(P.mp, maxMp());
  }
  if (quietStart) {
    el.intro.hidden = true;
    if (el.sfxGate) el.sfxGate.hidden = true;
  }
  bind();
  // 单实例守卫：极端情况下锁被另一个页面拿走（这里本来不该发生），立刻停表、停挂机、停存档
  if (DL.SingleTab) DL.SingleTab.onLost(() => { pauseAuto(); });
  syncHud();
  const shotQuery = /[?&]room=([^&]+)/.exec(location.search || '');
  const shotRoom = shotQuery ? decodeURIComponent(shotQuery[1]) : '';
  if (shotRoom && location.search.includes('shot')) enterRoom(shotRoom);
  // 3D 视图桥：只读游戏状态 + 复用 handleCellClick，不复制寻路/战斗
  if (window.DL && DL.ThreeView) {
    DL.ThreeBridge = {
      P: () => P,
      map: () => map,
      terrain: () => terrain,
      props: () => props,
      enemies: () => enemies,
      npc: () => npc,
      trialNpc: () => trialNpc,
      bookNpc: () => bookNpc,
      stashNpc: () => stashNpc,
      doors: () => doors,
      back: () => back,
      bags: () => activeBags,
      room: () => currentRoom || 'hub',
      walking: () => walkStepVis().moving,
      step: () => walkStepVis(),
      strikeAt: () => lastStrikeAt,
      floaters: () => floaters,
      over: () => over,
      clickCell: (x, y) => handleCellClick(x, y),
    };
    if (DL.ThreeView.bind) DL.ThreeView.bind(DL.ThreeBridge);
  }
  scheduleIdle();
  refreshTimer = setInterval(() => {
    respawnField();
    if (autoDisabled || over || inCave || uiOpen()) return;
    if (document.hidden) return;
    spawnWild();
    syncHud();
  }, 7000);

  startClockTimer();
  save();

  if (location.search.includes('debug')) {
    window.__dl = {
      P, act, move, attack, halfMoon, fireSword, drink, buy, buyPotion, buyShopStock,
      Sfx, openShop, refreshShop, ensureShopCatalog, tryInteract,
      openBookShop, renderBookShop, buyBook, BOOK_SHOP,
      rollTrialTask, turnInTrial, abandonTrial, useExpOrb, trialDone, trialProgress, openTrial, MATS, TRIAL, sellAllMats, chooseTrialMode, resetTrialMode, trialMode, checkPassives,
      buyTownScroll, useTownScroll, tryAutoTown,
      potTotal, potPrice, pickPotTier, normalizePots, formatAmount,
      revive, continueAfterWin, die, win, dropEquip, makeEquip, giveEquip,
      BAG_MAX, STASH_MAX,
      openStash, refreshStash, depositFromBag, withdrawFromStash,
      stashNpc: () => stashNpc,
      makeEnemy, rollGrade, isCrush,
      hubRegen,
      addToBag, equipFromBag, sellFromBag, sellBagByRarity, toggleLockEq, sellPrice, openChar, eqCompareHtml, eqStatText, eqDetailHtml,
      eqReqLv, canWearEq,
      rollSkillBookDrop, makeSkillBook, learnSkillBook, isSkillBook,
      rollDropSlot, slotUnlocked, slotMeta, EQUIP_SLOTS, wornOf,
      enemies: () => enemies, map: () => map, npc: () => npc, door: () => door,
      genHub, enterRoom, leaveRoom, canEnterRoom, roomEnterNeedLv, bfs, save, load, spawnWild,
      currentRoom: () => currentRoom,
      doors: () => doors,
      roomsForDoor,
      hubReturnDoor: () => hubReturnDoor,
      setHubReturnDoor: (v) => { hubReturnDoor = v; },
      roomSpec,
      bookNpc: () => bookNpc,
      trialNpc: () => trialNpc,
      nearStash,
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
      bagAt, dropBag, pickupBag, takeFromBag, takeAllFromBag, closePick, rollDrop, rollKillEquipDrops,
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
      atkRange: () => atkRange(P), defRange: () => defRange(P),
      renderChar,
      idleMs: () => IDLE_MS,
      combatMs: () => playerCombatMs(),
      moveMs: () => MOVE_MS,
      walkStepMs: () => WALK_STEP_MS,
      walkStepDur: (dx, dy) => walkStepDur(dx, dy),
      stepDur: () => walkVis ? walkVis.dur : null,
      step: () => walkStepVis(),
      pressMoveKey, releaseMoveKey, heldMoveDelta,
      clickCell: (x, y) => handleCellClick(x, y),
      walkPath: (path) => walk(path),
      stopWalk,
      walkBusy: () => walkStepBusy(),
      walking: () => !!walkTimer,
      clock: () => clock,
      clockText,
      tick: autoStep, pauseAuto, resumeAuto, startClockTimer,
      clockTimerOn: () => !!clockTimer,
      autoEnabled: () => !autoDisabled,
      hideIntro: () => { el.intro.hidden = true; },
      setPos: (x, y) => { P.x = x; P.y = y; snapWalkVis(); },
      setHp: (v) => { P.hp = v; },
      setMp: (v) => { P.mp = v; },
      setGold: (v) => { P.gold = v; },
      rest: () => { P.hp = maxHp(); P.mp = maxMp(); },
      state: () => ({
        lv: P.lv, exp: P.exp, hp: P.hp, mp: P.mp, gold: P.gold,
        potions: potTotal('red'), potsRed: potTotal('red'), potsBlue: potTotal('blue'),
        pots: { red: { ...P.pots.red }, blue: { ...P.pots.blue } },
        potPool: { ...P.potPool },
        turn, over, inCave, room: currentRoom, weapon: P.weapon, armor: P.armor,
        cd: { ...P.cd }, skills: { ...P.skills },
        enemyCount: enemies.filter((e) => e.hp > 0).length,
      }),
    };
    window.__dl.DL = DL;
  }
  }   // startGame

  /* ---------------- 启动入口 ---------------- */
  // 单实例守卫：拿到锁才真正开局；抢不到只显示遮罩，等另一个页面关掉后自动接管。
  // 没有 DL.SingleTab（Node 测试 / 直接 import game.js）时照旧同步启动。
  if (DL.SingleTab) DL.SingleTab.ready.then((ok) => { if (ok) startGame(); });
  else startGame();
