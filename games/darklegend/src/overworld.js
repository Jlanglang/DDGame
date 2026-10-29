/* 豆豆暗黑传奇 · 主城（岛屿版，2026-10-29 按主人手绘分布图重做）
   一张 128×128 的岛：外面一圈海 → 草地（北面是森林）→ 中间方城主城（石墙 + 石板地）。
   城内：左边三个铺子（武器 / 药水 / 技能），右边按等级段排的传送门。
   立牌全去掉（房子、摊位、树、石头），只留 NPC —— NPC 和玩家一样高（2.15）。
*/
import { DL } from './namespace.js';
const global = globalThis;
  const N = 128;
  const CX = 64, CY = 64;

  const ISLAND_R = 58;                       // 岛半径，海在外面
  const CITY = { x0: 44, y0: 44, x1: 84, y1: 84 };   // 主城矩形（含墙）

  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function build() {
    const map = [];
    const terrain = [];
    for (let y = 0; y < N; y++) {
      const mr = [];
      const tr = [];
      for (let x = 0; x < N; x++) {
        const dx = x - CX, dy = y - CY;
        const d = Math.hypot(dx, dy);
        // 岛边不是正圆：三个正弦叠起来做出海湾和小岬角
        const th = Math.atan2(dy, dx);
        const wave = 3.6 * Math.sin(3 * th + 0.7) + 2.2 * Math.sin(5 * th + 2.1) +
          1.4 * Math.sin(9 * th + 4.2) + 0.8 * Math.sin(17 * th + 1.1);
        const R = ISLAND_R + wave;
        // 沙滩宽度按角度起伏：岬角窄、海湾宽
        const beachW = 2.2 + 2.6 * (0.5 + 0.5 * Math.sin(2 * th + 1.1)) + 1.4 * (0.5 + 0.5 * Math.sin(7 * th + 0.3));
        const inCity = x >= CITY.x0 && x <= CITY.x1 && y >= CITY.y0 && y <= CITY.y1;
        const onWall = inCity && (x === CITY.x0 || x === CITY.x1 || y === CITY.y0 || y === CITY.y1);
        let m = 0, t = 0;
        if (d > R) { m = 1; t = 3; }               // 海：不可走
        else if (d > R - beachW) { m = 0; t = 4; }    // 沙滩：贴着海的一圈
                else if (inCity) { m = 0; t = 1; }         // 城内：石板地
        else { m = 0; t = 0; }                     // 城外：草地（北面留给森林）
        mr.push(m); tr.push(t);
      }
      map.push(mr);
      terrain.push(tr);
    }

    // 城门：南门（正对出生点）+ 北门。门洞两格宽，免得 3D 里贴墙卡住
    const gates = [[CX, CITY.y1], [CX - 1, CITY.y1], [CX, CITY.y0], [CX - 1, CITY.y0]];
    gates.forEach(function (g) {
      map[g[1]][g[0]] = 0;
      terrain[g[1]][g[0]] = 1;
    });

    // 城内右边：三个等级段的传送门（和 ROOMS 的 lvMin 分段对齐）
    const doors = [
      { x: CITY.x1 - 5, y: 52, name: '野区 · 1–10', tierMin: 1, tierMax: 10, lv: 1, direct: null },
      { x: CITY.x1 - 5, y: 62, name: '野区 · 11–20', tierMin: 11, tierMax: 20, lv: 11, direct: null },
      { x: CITY.x1 - 5, y: 72, name: '野区 · 21–30', tierMin: 21, tierMax: 30, lv: 21, direct: null },
    ];
    // 门格本身标记成 2（进图点），render-three 会画一个门
    doors.forEach(function (d) {
      if (map[d.y] && map[d.y][d.x] !== 1) map[d.y][d.x] = 2;
    });

    const props = [];        // 立牌全去掉：房子 / 摊位 / 树 / 石头都不生成
    const mobs = [];         // 主城不刷怪，怪都在房间里

    return {
      map: map,
      terrain: terrain,
      props: props,
      mobs: mobs,
      // 出生点：城内南门内侧
      spawn: { x: CX, y: CITY.y1 - 3 },
      // 左边三个铺子（图上 武器 / 药水 / 技能）
      npc: { x: CITY.x0 + 5, y: 54 },        // 杂货铺：白装 + 药水
      bookNpc: { x: CITY.x0 + 5, y: 64 },    // 技能书商人
      trialNpc: { x: CITY.x0 + 5, y: 74 },   // 村长（任务 / 材料）
      stashNpc: { x: CITY.x1 - 5, y: 78 },   // 仓库
      doors: doors,
      cave: doors[0],
      city: CITY,
    };
  }

  // 洞窟地图保留（房间里的 cave1 还在用）
  function caveMap() {
    const N2 = 64;
    const map = [];
    for (let y = 0; y < N2; y++) {
      const row = [];
      for (let x = 0; x < N2; x++) row.push(1);
      map.push(row);
    }
    const carve = (x, y, w, h) => {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          if (i > 0 && j > 0 && i < N2 - 1 && j < N2 - 1) map[j][i] = 0;
        }
      }
    };
    carve(2, 24, 16, 16);
    carve(18, 30, 12, 4);
    carve(28, 16, 16, 28);
    carve(44, 28, 8, 6);
    carve(50, 14, 12, 32);
    const exit = { x: 2, y: 32 };
    map[exit.y][exit.x] = 2;
    return { map: map, spawn: { x: 5, y: 32 }, exit: exit };
  }

  DL.Overworld = { N: N, build: build, caveMap: caveMap, CITY: CITY };
