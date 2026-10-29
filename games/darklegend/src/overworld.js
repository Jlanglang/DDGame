/* 豆豆海岛幻想 · 主城（岛屿版，2026-10-29 按主人手绘分布图重做；2026-10-29 晚陆地收到 96×96）
   整图 128×128：外面一圈海 → 陆地约 96×96（草地，北面是森林）→ 中间方城主城 31×31（石墙 + 石板地，安全区）。
   城内：左边三个铺子（武器 / 药水 / 技能），右边按等级段排的传送门。
   立牌全去掉（房子、摊位、树、石头），只留 NPC —— NPC 和玩家一样高（2.15）。
   所有坐标都按 CITY / CX,CY 的比例算，别再写死绝对格数：改 N 或陆地半径时只有几何比例要跟着调。 */
import { DL } from './namespace.js';
const global = globalThis;
  const N = 128;                             // 整图边长
  const CX = N / 2, CY = N / 2;
  /* 主城安全区（石板地）：2026-10-29 主人要求「安全区缩小，缩掉的那圈用草地补」→ 41×41 → 31×31。
     石板只到城里为止：城外本来就是草地，城一缩，缩掉的一圈自动变回草地，
     野怪也因此能走到离墙 3 格的地方（placeFieldMobs 的 free() 挡的是 CITY±3）。
     城内 NPC / 传送门按 fy(比例) 排，别再写死 +8 / +18 这种绝对格数。 */
  const CITY_HALF = Math.round(20 * 3 / 4);   // 15 → 31×31（原 20 → 41×41）
  const CITY = { x0: CX - CITY_HALF, y0: CY - CITY_HALF, x1: CX + CITY_HALF, y1: CY + CITY_HALF };
  // 陆地半径：陆地约 96×96（再往外到地图边都是海）——城缩小后不动
  const ISLAND_R = 48;

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

    // 城里一切位置都按边长比例算（fy = 边长 × 比例），换 CITY_HALF 不用重排
    const S = CITY_HALF * 2;
    const fy = function (f) { return Math.round(f * S); };

    // 城内右边：三个等级段的传送门（和 ROOMS 的 lvMin 分段对齐）
    const doors = [
      { x: CITY.x1 - fy(0.12), y: CITY.y0 + fy(0.20), name: '野区 · 1–10', tierMin: 1, tierMax: 10, lv: 1, direct: null },
      { x: CITY.x1 - fy(0.12), y: CITY.y0 + fy(0.44), name: '野区 · 11–20', tierMin: 11, tierMax: 20, lv: 11, direct: null },
      { x: CITY.x1 - fy(0.12), y: CITY.y0 + fy(0.68), name: '野区 · 21–30', tierMin: 21, tierMax: 30, lv: 21, direct: null },
    ];
    // 门格本身标记成 2（进图点），render-three 会画一个门
    doors.forEach(function (d) {
      if (map[d.y] && map[d.y][d.x] !== 1) map[d.y][d.x] = 2;
    });

    const props = [];        // 立牌全去掉：房子 / 摊位 / 树 / 石头都不生成
    // 出生点：城内南门内侧
    const spawn = { x: CX, y: CITY.y1 - 3 };
    // 城外野怪：只放 1~5 级（鸡 / 稻草人 / 野狗），站在城墙外的草地上。
    // 原来 mobs 是空的，城外一片空，密度确实太低。
    const mobs = placeFieldMobs(map, terrain, spawn);

    return {
      map: map,
      terrain: terrain,
      props: props,
      mobs: mobs,
      spawn: spawn,
      // 左边三个铺子（图上 武器 / 药水 / 技能）
      npc: { x: CITY.x0 + fy(0.12), y: CITY.y0 + fy(0.24) },        // 杂货铺：白装 + 药水
      bookNpc: { x: CITY.x0 + fy(0.12), y: CITY.y0 + fy(0.49) },    // 技能书商人
      trialNpc: { x: CITY.x0 + fy(0.12), y: CITY.y0 + fy(0.73) },   // 村长（任务 / 材料）
      stashNpc: { x: CITY.x1 - fy(0.12), y: CITY.y0 + fy(0.83) },   // 仓库
      doors: doors,
      cave: doors[0],
      city: CITY,
    };
  }

  // 城外野怪布点：1~5 级（鸡 1 / 稻草人 3 / 野狗 5）按离城墙远近分层，
  // 只站草地（terrain 0），离城墙 ≥3 格、离出生点 ≥6 格，彼此至少隔 5 格。
  // 分布范围（主人要求）：野狗只在上方（北墙外）、鸡主要在下方（南墙外）、稻草人四条边随机。
  // y 轴向下：上方 = y 小 = 北墙 y0；下方 = y 大 = 南墙 y1，别弄反。
  // 全用 hash 决定，同一个 seed 每次进来站位一致（不会读档后怪物乱跳）。
  function placeFieldMobs(map, terrain, spawn) {
    // d0/d1 = 离城墙的距离（格）；side = 在哪条边外：north 北 / south 南 / any 四条边随机
    // 顺序：先把只站一条边的（狗 / 鸡）放好，最后放四条边随机的稻草人去填空。
    // 反过来的话，稻草人的「彼此 ≥5 格」会把南/北两条带全盖住（实测只剩 27 只）。
    const plans = [
      { id: 'dog', n: 11, d0: 8, d1: 18, side: 'north' },      // 只在上方：北墙外靠海边
      { id: 'chicken', n: 15, d0: 3, d1: 12, side: 'south' },  // 贴着南墙外：出生点一出来就在脚边
      { id: 'scarecrow', n: 14, d0: 6, d1: 11, side: 'any' },  // 四条边随机
    ];
    const out = [];
    const free = function (x, y) {
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return false;
      if (map[y][x] !== 0) return false;
      if (terrain[y] && terrain[y][x] !== 0) return false;          // 只站草地：沙滩 / 石板 / 水都不要
      if (x >= CITY.x0 - 3 && x <= CITY.x1 + 3 && y >= CITY.y0 - 3 && y <= CITY.y1 + 3) return false;
      if (Math.max(Math.abs(x - spawn.x), Math.abs(y - spawn.y)) <= 5) return false;
      for (let i = 0; i < out.length; i++) {
        if (Math.max(Math.abs(out[i].x - x), Math.abs(out[i].y - y)) < 5) return false;
      }
      return true;
    };
    // 沿墙方向：t 取 -1~1。比城墙再宽 8 格——城外草地本来就宽，
    // 只贴着墙宽排的话（31 格的城只剩 27 格），40 只怪按「彼此 ≥5 格」根本塞不下。
    const alongWall = function (t, half) { return Math.round(t * (half + 8)); };
    const pick = function (plan, h) {
      const uSide = (h % 1000) / 1000;
      const uD = ((h >>> 10) % 1000) / 1000;
      const uT = ((h >>> 20) % 1000) / 1000;
      const d = Math.round(plan.d0 + uD * (plan.d1 - plan.d0));
      let side = plan.side;
      if (side === 'any') side = ['north', 'east', 'south', 'west'][Math.floor(uSide * 4) % 4];
      const o = alongWall(uT * 2 - 1, CITY_HALF);
      if (side === 'north') return { x: CX + o, y: CITY.y0 - d };
      if (side === 'south') return { x: CX + o, y: CITY.y1 + d };
      if (side === 'east') return { x: CITY.x1 + d, y: CY + o };
      return { x: CITY.x0 - d, y: CY + o };
    };
    for (let p = 0; p < plans.length; p++) {
      const plan = plans[p];
      let placed = 0;
      for (let i = 0; i < 2500 && placed < plan.n; i++) {
        const h = hash(p * 977 + i * 31 + 7, placed * 131 + 19);
        const pt = pick(plan, h);
        if (!free(pt.x, pt.y)) continue;
        out.push({ id: plan.id, x: pt.x, y: pt.y });
        placed += 1;
      }
    }
    return out;
  }

  // 洞窟地图保留（房间里的 cave1 还在用）——它用自己的 64×64，跟野外岛无关
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
