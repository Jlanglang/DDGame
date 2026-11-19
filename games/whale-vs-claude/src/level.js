/* =============================================================
 * 鲸鱼娘大战 Claude v2 — src/level.js
 * 关卡数据 + 网格构建。契约见 SPEC-v2.md 5.1。
 * 浏览器全局脚本（IIFE），不 import/export，不依赖 DOM，
 * 可在 Node 里直接加载：globalThis.WV.Levels / globalThis.WV.buildGrid。
 * ============================================================= */
(function (root) {
  'use strict';

  const WV = root.WV = root.WV || {};

  /* ---- core.js 常量的本地镜像（保证本文件可单独加载） ---- */
  const TILE = 40;
  const COLS = 15;
  const ROWS = 15;
  const EMPTY = 0;   // '.'
  const BRICK = 1;   // 'b'
  const STEEL = 2;   // 's'
  const DINNER = 3;  // 'H' 老巢（大白饭）
  const WATER = 4;   // 'w'

  const CHAR_TILE = { '.': EMPTY, b: BRICK, s: STEEL, H: DINNER, w: WATER };

  /* ---- 固定布局：老巢 2x2（col 7-8 / row 13-14），四周砖 ---- */
  const DINNER_COL = 7;
  const DINNER_ROW = 13;

  const DINNER_PIXEL = {
    x: DINNER_COL * TILE,          // 280
    y: DINNER_ROW * TILE,          // 520
    w: TILE * 2,                   // 80
    h: TILE * 2                    // 80
  };

  // 玩家出生点：老巢左侧 col 5 / row 13，34x34 坦克居中留 3px 余量
  const PLAYER_SPAWN = { x: 5 * TILE + 3, y: 13 * TILE + 3 };  // {203, 523}

  // 三个敌人出生点：顶部 左(col 0) / 中(col 7) / 右(col 13)
  const SPAWNERS = [
    { x: 0 * TILE + 3, y: 3 },     // {3, 3}
    { x: 7 * TILE + 3, y: 3 },     // {283, 3}
    { x: 13 * TILE + 3, y: 3 }     // {523, 3}
  ];

  function px(col, row, inset) {
    const k = inset == null ? 3 : inset;
    return { x: col * TILE + k, y: row * TILE + k };
  }
  // 保持 spawn 数据与地图一致，避免手抄坐标漂移（结果与上面常量一致）
  if (PLAYER_SPAWN.x !== px(5, 13).x || PLAYER_SPAWN.y !== px(5, 13).y) {
    PLAYER_SPAWN.x = px(5, 13).x;
    PLAYER_SPAWN.y = px(5, 13).y;
  }

  /* ============================ 第 1 关 ============================
   * 「浅滩」：开阔、砖块稀疏，一屏看懂。12 敌 / 3 波。
   * ============================================================== */
  const LEVEL_1 = {
    id: 1,
    name: '浅滩',
    desc: '开阔浅滩，砖墙稀疏，先热热身。',
    theme: {
      bg: '#0d2b2b',
      brick: '#c97b4a',
      steel: '#9fb0ba',
      water: '#2a7fa8',
      accent: '#5fe3b6',
      accent2: '#ffd166'
    },
    map: [
      '...............',
      '..bb.......bb..',
      '..bb.......bb..',
      '...............',
      '....bb...bb....',
      '....bb...bb....',
      '...............',
      '..bb..bbb..bb..',
      '...............',
      '....bb...bb....',
      '....bb...bb....',
      '...............',
      '......ssss.....',
      '......sHHs.....',
      '......sHHs.....'
    ],
    enemyQuota: 24,
    waveSizes: [4, 4, 4, 4, 4, 4],
    hasBoss: false,
    playerSpawn: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y },
    dinner: { x: DINNER_PIXEL.x, y: DINNER_PIXEL.y, w: DINNER_PIXEL.w, h: DINNER_PIXEL.h },
    spawners: [
      { x: SPAWNERS[0].x, y: SPAWNERS[0].y },
      { x: SPAWNERS[1].x, y: SPAWNERS[1].y },
      { x: SPAWNERS[2].x, y: SPAWNERS[2].y }
    ]
  };

  /* ============================ 第 2 关 ============================
   * 「暗流」：竖向水带 + 砖墙夹出窄道，绕水而行。15 敌 / 3 波。
   * 水列：col 1-2 / 4-5 / 7-8 / 10-11（row 2-3），
   *       以及 row 7 的横向水带（缺口 col 7 与两侧河岸）。
   * ============================================================== */
  const LEVEL_2 = {
    id: 2,
    name: '暗流',
    desc: '水带交错，只能贴着窄道摸过去。',
    theme: {
      bg: '#0a1b33',
      brick: '#b06a3c',
      steel: '#8fa2c4',
      water: '#1f5f9e',
      accent: '#59c8ff',
      accent2: '#c084fc'
    },
    map: [
      '...............',
      '...............',
      '.ww.ww.ww.ww...',
      '.ww.ww.ww.ww...',
      '...............',
      '...bb.....bb...',
      '...bb.....bb...',
      '...wwww.wwww...',
      '...............',
      '...bb.www.bb...',
      '...bb.www.bb...',
      '...............',
      '......ssss.....',
      '......sHHs.....',
      '......sHHs.....'
    ],
    enemyQuota: 24,
    waveSizes: [4, 4, 4, 4, 4, 4],
    hasBoss: false,
    playerSpawn: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y },
    dinner: { x: DINNER_PIXEL.x, y: DINNER_PIXEL.y, w: DINNER_PIXEL.w, h: DINNER_PIXEL.h },
    spawners: [
      { x: SPAWNERS[0].x, y: SPAWNERS[0].y },
      { x: SPAWNERS[1].x, y: SPAWNERS[1].y },
      { x: SPAWNERS[2].x, y: SPAWNERS[2].y }
    ]
  };

  /* ============================ 第 3 关 ============================
   * 「要塞」：钢墙堡坞 + 单格窄通道，中路只留 col 7 一条缝。12 敌 + BOSS。
   * ============================================================== */
  const LEVEL_3 = {
    id: 3,
    name: '要塞',
    desc: '钢墙合围的堡坞，中路只剩一条缝。',
    theme: {
      bg: '#1a1410',
      brick: '#a34d2c',
      steel: '#c8ccd2',
      water: '#3b6a55',
      accent: '#ff7a4d',
      accent2: '#ffe08a'
    },
    map: [
      '...............',
      '...............',
      '..sss.....sss..',
      '..s.........s..',
      '..s.ss...ss.s..',
      '..s.ss...ss.s..',
      '..s.........s..',
      '..s.........s..',
      '..sss.....sss..',
      '...............',
      '..bb...s...bb..',
      '...............',
      '......ssss.....',
      '......sHHs.....',
      '......sHHs.....'
    ],
    enemyQuota: 16,
    waveSizes: [4, 4, 4, 4],
    hasBoss: true,
    playerSpawn: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y },
    dinner: { x: DINNER_PIXEL.x, y: DINNER_PIXEL.y, w: DINNER_PIXEL.w, h: DINNER_PIXEL.h },
    spawners: [
      { x: SPAWNERS[0].x, y: SPAWNERS[0].y },
      { x: SPAWNERS[1].x, y: SPAWNERS[1].y },
      { x: SPAWNERS[2].x, y: SPAWNERS[2].y }
    ]
  };

  const Levels = [LEVEL_1, LEVEL_2, LEVEL_3];

  /**
   * 构建关卡网格（深拷贝，返回全新的 number[15][15]，行优先 grid[row][col]）。
   * 不修改 Levels 里的 map 字符串；返回的网格随便被子弹/坦克改都不影响原始数据。
   * @param {number} levelIndex 0-based 关卡索引，越界自动回绕。
   * @returns {number[][]}
   */
  function buildGrid(levelIndex) {
    const n = Levels.length;
    let idx = Math.floor(Number(levelIndex));
    if (!isFinite(idx)) idx = 0;
    idx = ((idx % n) + n) % n;

    const rows = Levels[idx].map;
    const grid = new Array(ROWS);
    for (let r = 0; r < ROWS; r++) {
      const line = rows[r] || '';
      const out = new Array(COLS);
      for (let c = 0; c < COLS; c++) {
        const t = CHAR_TILE[line.charAt(c)];
        out[c] = t === undefined ? EMPTY : t;
      }
      grid[r] = out;
    }
    return grid;
  }

  WV.Levels = Levels;
  WV.buildGrid = buildGrid;
  WV.LEVEL_COUNT = Levels.length;

})(typeof window !== 'undefined' ? window : globalThis);
