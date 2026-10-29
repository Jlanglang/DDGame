/* 豆豆海岛幻想 · 主城（岛屿版，2026-10-29 按主人手绘分布图重做；2026-10-29 晚陆地收到 96×96）
   整图 128×128：外面一圈海 → 陆地约 96×96（草地，北面是森林）→ 中间方城主城 31×31（一格一块铺装地面，沙色砖，安全区）。
   城内：左边三个铺子（武器 / 药水 / 技能），右边按等级段排的传送门。
   立牌全去掉（房子、摊位、树、石头），只留 NPC —— NPC 和玩家一样高（2.15）。
   所有坐标都按 CITY / CX,CY 的比例算，别再写死绝对格数：改 N 或陆地半径时只有几何比例要跟着调。 */
import { DL } from './namespace.js';
const global = globalThis;
  const N = 128;                             // 整图边长
  const CX = N / 2, CY = N / 2;
  /* 主城安全区：2026-10-29 主人要求「安全区缩小，缩掉的那圈用草地补」→ 41×41 → 31×31。
     2026-10-30 主人：「地砖改回去，颜色换成沙地色」→ 城内仍是整片铺装（一格一块石板，
     砖色见 iso-art 的 paintSlabFace / slabSheet）。
     野怪仍进不了城（placeFieldMobs 的 free() 挡的是 CITY±3）。
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
        if (d > R) { m = 1; t = 3; }                // 海：不可走
        else if (d > R - beachW) { m = 0; t = 4; }  // 沙滩：贴着海的一圈
        else if (inCity) { m = 0; t = 1; }          // 城内：铺装地面（砖色走沙色，见 iso-art）
        else { m = 0; t = 0; }                      // 城外：草地（北面留给森林）
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

    /* 城内地面（2026-10-30 主人：地砖保留，颜色换成沙地色）：
       31×31 整片 terrain=1，材质仍是石板砖（一格一块），砖色走沙色（iso-art paintSlabFace）；
       城界是方城边界，想改成参差边再动 build 开头 inCity 那行。
       terrain 只是画面（地形编码），不动 map（碰撞）；门格本来就是 1。 */

    // 立牌仍然全去掉（房子 / 摊位 / 树 / 石头），只留一件地标：南岸沙滩上的渔屋。
    // 纯装饰、不参与碰撞（game.js buildProps 那条注释说的 A 阶段规则没变）。
    const props = [];
    const hut = findBeachHut(map, terrain);
    if (hut) props.push({ sheet: 'beachHut', index: 0, x: hut.x, y: hut.y });
    // 椰子树：海岛只认这一种树，围着渔屋撒几棵（不是森林，别铺满）
    for (const p of placeBeachPalms(map, terrain, hut)) props.push(p);
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
  // 只站草地（terrain 0），离城墙 ≥3 格、离出生点 ≥6 格，彼此至少隔 FIELD_GAP 格。
  // 分布范围（主人要求）：野狗只在上方（北墙外）、鸡在下方（南墙外）、稻草人四条边随机。
  // 2026-10-29 晚主人反馈「鸡全挤在墙根、沙滩和海边一只都没有」→ 现在每条边都从 d0
  // 一直铺到「草地边缘」：深度上限不再写死 12 格，按列量出草地铺到哪儿为止（碰到沙/水就停），
  // 再在贴边那两三格先放几只 shore，保证沙滩/海跟前也有怪。改岛形或海滩宽度不用重调数字。
  // y 轴向下：上方 = y 小 = 北墙 y0；下方 = y 大 = 南墙 y1，别弄反。
  // 全用 hash 决定，同一个 seed 每次进来站位一致（不会读档后怪物乱跳）。
  const FIELD_GAP = 5;      // 怪彼此至少隔几格（切比雪夫距离）
  const SHORE_BAND = 2;     // 离草地边缘（沙滩/海）这么近就算「海边」
  function placeFieldMobs(map, terrain, spawn) {
    // d0/d1 = 离城墙的距离（格），d1 给小了就是只在内圈；side = 哪条边外：north 北 / south 南 / any 四条边随机
    // shore = 先在贴海那圈放几只（0 表示不专门留）
    // 顺序：先把只站一条边的（狗 / 鸡）放好，最后放四条边随机的稻草人去填空。
    // 反过来的话，稻草人的「彼此 ≥5 格」会把南/北两条带全盖住（实测只剩 27 只）。
    const plans = [
      { id: 'dog', n: 11, d0: 8, d1: 99, side: 'north', shore: 4 },      // 只在上方：北墙外一直到北岸
      { id: 'chicken', n: 22, d0: 3, d1: 99, side: 'south', shore: 6 },  // 南野整片：墙根铺到沙滩边
      { id: 'scarecrow', n: 14, d0: 6, d1: 99, side: 'any', shore: 3 },  // 四条边随机
    ];
    const out = [];
    const free = function (x, y) {
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return false;
      if (map[y][x] !== 0) return false;
      if (terrain[y] && terrain[y][x] !== 0) return false;          // 只站草地：沙滩 / 石板 / 水都不要
      if (x >= CITY.x0 - 3 && x <= CITY.x1 + 3 && y >= CITY.y0 - 3 && y <= CITY.y1 + 3) return false;
      if (Math.max(Math.abs(x - spawn.x), Math.abs(y - spawn.y)) <= 5) return false;
      for (let i = 0; i < out.length; i++) {
        if (Math.max(Math.abs(out[i].x - x), Math.abs(out[i].y - y)) < FIELD_GAP) return false;
      }
      return true;
    };
    // 一条边外的全部草地格：从城墙往外一格格走，碰到沙滩/海/图边就停（max = 这条边草地的深度）。
    // edge=1 表示「已经在贴海那圈草地上」，用来保证沙滩跟前有怪。
    const edgeCells = function (side, d0, d1) {
      const cells = [];
      const push = function (x, y, d, max) {
        if (d < d0) return;
        cells.push({ x: x, y: y, d: d, edge: d >= max - SHORE_BAND });
      };
      if (side === 'south' || side === 'north') {
        const down = side === 'south';
        const wall = down ? CITY.y1 : CITY.y0;
        for (let x = 1; x < N - 1; x++) {
          let max = 0;
          for (let d = 1; d <= d1; d++) {
            const y = wall + (down ? d : -d);
            if (y < 1 || y >= N - 1) break;
            if (map[y][x] !== 0 || (terrain[y] && terrain[y][x] !== 0)) break;
            max = d;
          }
          for (let d = 1; d <= max; d++) push(x, wall + (down ? d : -d), d, max);
        }
      } else {
        const east = side === 'east';
        const wall = east ? CITY.x1 : CITY.x0;
        for (let y = 1; y < N - 1; y++) {
          let max = 0;
          for (let d = 1; d <= d1; d++) {
            const x = wall + (east ? d : -d);
            if (x < 1 || x >= N - 1) break;
            if (map[y][x] !== 0 || (terrain[y] && terrain[y][x] !== 0)) break;
            max = d;
          }
          for (let d = 1; d <= max; d++) push(wall + (east ? d : -d), y, d, max);
        }
      }
      return cells;
    };
    // hash 排序 = 稳定的「随机」顺序：同一份地图每次都是同一批站位
    const shuffled = function (list, salt) {
      return list.slice().sort(function (a, b) {
        return hash(a.x * 31 + salt, a.y * 17 + salt) - hash(b.x * 31 + salt, b.y * 17 + salt);
      });
    };
    for (let p = 0; p < plans.length; p++) {
      const plan = plans[p];
      const cells = [];
      const sides = plan.side === 'any' ? ['north', 'east', 'south', 'west'] : [plan.side];
      for (let s = 0; s < sides.length; s++) {
        const got = edgeCells(sides[s], plan.d0, plan.d1);
        for (let i = 0; i < got.length; i++) cells.push(got[i]);
      }
      let placed = 0;
      const take = function (pt) {
        if (placed >= plan.n) return;
        if (!free(pt.x, pt.y)) return;
        out.push({ id: plan.id, x: pt.x, y: pt.y });
        placed += 1;
      };
      // ① 先在海边留几只：只从贴沙那两三格挑，互相隔 FIELD_GAP
      if (plan.shore) {
        const shore = shuffled(cells.filter(function (c) { return c.edge; }), p * 31 + 3);
        for (let i = 0; i < shore.length && placed < Math.min(plan.n, plan.shore); i++) take(shore[i]);
      }
      // ② 剩下的铺满整条边（含海边）：按 hash 顺序贪心
      const rest = shuffled(cells, p * 31 + 7);
      for (let i = 0; i < rest.length && placed < plan.n; i++) take(rest[i]);
    }
    return out;
  }

  // 南岸渔屋（2026-10-30）：主城正南那片沙滩上的一栋小屋，出门往下走就能看见。
  // 只收「脚下一格是沙滩、身后一格是草地」的格子——站在沙滩上沿，屋子不会陷进浅水，
  // 也不会孤零零杵在草地中间。落点尽量贴中轴、尽量靠城，改岛形不用手调坐标。
  const HUT_MIN_D = 30;     // 离城中心至少几格（别把屋盖到城墙根）
  const HUT_AXIS = 16;      // 离中轴最远几格（太偏就看不见了）
  function findBeachHut(map, terrain) {
    let best = null;
    for (let y = CY + HUT_MIN_D; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        if (map[y][x] !== 0 || terrain[y][x] !== 4) continue;        // 只站沙滩
        if (!terrain[y - 1] || terrain[y - 1][x] !== 0) continue;    // 身后（更靠内陆）必须还是草地
        const dx = Math.abs(x - CX);
        if (dx > HUT_AXIS) continue;
        const score = dx * 8 + (y - CY);
        if (!best || score < best.score) best = { x: x, y: y, score: score };
      }
    }
    return best;
  }

  // 椰子树（2026-10-30）：主人定「不要那种阔叶树，要就椰子树」——岛上唯一的树就是它。
  // 只在渔屋周围那片沙滩上撒几棵，彼此隔 PALM_GAP 格，离渔屋至少 3 格（别把屋门挡住）。
  // 用 hash 排序取点，同一份地图每次都是同一批位置，读档不会乱跳。
  const PALM_N = 5;         // 撒几棵
  const PALM_GAP = 4;       // 彼此至少隔几格
  const PALM_R = 14;        // 离渔屋多远以内找位置（太远就散成一条线，不成"屋边几棵椰树"）
  function placeBeachPalms(map, terrain, hut) {
    if (!hut) return [];
    const cells = [];
    for (let y = hut.y - PALM_R; y <= hut.y + PALM_R; y++) {
      for (let x = hut.x - PALM_R; x <= hut.x + PALM_R; x++) {
        if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
        if (map[y][x] !== 0 || terrain[y][x] !== 4) continue;                 // 只站沙滩
        const d = Math.max(Math.abs(x - hut.x), Math.abs(y - hut.y));
        if (d < 3) continue;                                                   // 别贴到渔屋脸上
        cells.push({ x: x, y: y, d: d });
      }
    }
    // 由近到远取：先围着渔屋铺一圈，剩下的才往远处走；同距离用 hash 定，读档不会乱跳
    cells.sort(function (a, b) {
      if (a.d !== b.d) return a.d - b.d;
      return hash(a.x * 13 + 5, a.y * 7 + 11) - hash(b.x * 13 + 5, b.y * 7 + 11);
    });
    const out = [];
    for (let i = 0; i < cells.length && out.length < PALM_N; i++) {
      const c = cells[i];
      let ok = true;
      for (let j = 0; j < out.length; j++) {
        const d = Math.max(Math.abs(out[j].x - c.x), Math.abs(out[j].y - c.y));
        if (d < PALM_GAP) { ok = false; break; }
      }
      if (ok) out.push({ sheet: 'palm', index: out.length % 3, x: c.x, y: c.y });
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
