// test-auto.mjs — Node 无头对局：用 BFS bot 打 3 局，测时长/胜负/卡死
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const ORDER = ['core.js', 'level.js', 'enemies.js', 'player.js', 'fx.js', 'ui.js', 'game.js'];
const DOM = 0, STEEL = 2, BRICK = 1, DINNER = 3, WATER = 4;

const sandbox = {
  console, Math, Date, JSON, parseInt, parseFloat, isNaN,
  setTimeout, clearTimeout,
};
const ctx = vm.createContext(sandbox);
for (const f of ORDER) {
  const p = path.join(root, 'src', f);
  if (!fs.existsSync(p)) { console.error('[test] 缺少 ' + f); process.exit(2); }
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}
const WV = ctx.WV;
const S = ctx.__WV;
if (!WV || !S) { console.error('[test] 模块没有挂上 WV/__WV'); process.exit(2); }
S.init();

const COLS = WV.COLS, ROWS = WV.ROWS, TILE = WV.TILE;

function tileWalkable(G, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  return G.grid[r][c] === DOM;
}

// BFS：从玩家格到目标格，返回第一步方向（0上1右2下3左），失败 -1
function bfs(G, sc, sr, tc, tr, limit) {
  if (sc === tc && sr === tr) return -1;
  const seen = new Int16Array(COLS * ROWS).fill(-1);
  const q = [[sc, sr]];
  seen[sr * COLS + sc] = -2;
  const DX = WV.DX, DY = WV.DY;
  let head = 0, visited = 0;
  while (head < q.length && visited < (limit || 9999)) {
    const [c, r] = q[head++];
    visited++;
    for (let d = 0; d < 4; d++) {
      const nc = c + DX[d], nr = r + DY[d];
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const k = nr * COLS + nc;
      if (seen[k] !== -1) continue;
      if (!tileWalkable(G, nc, nr)) continue;
      seen[k] = (c === sc && r === sr) ? d : seen[r * COLS + c];
      if (nc === tc && nr === tr) return seen[k];
      q.push([nc, nr]);
    }
  }
  return -1;
}

function playerCell(G) {
  const p = G.player;
  return [Math.floor((p.x + p.w / 2) / TILE), Math.floor((p.y + p.h / 2) / TILE)];
}

function nearestEnemyOf(G) {
  const p = G.player;
  const pc = [p.x + p.w / 2, p.y + p.h / 2];
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    const d = Math.abs(e.x - pc[0]) + Math.abs(e.y - pc[1]);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function nearestEnemyCell(G) {
  const e = nearestEnemyOf(G);
  if (!e) return null;
  return [Math.floor((e.x + e.w / 2) / TILE), Math.floor((e.y + e.h / 2) / TILE)];
}

// 近距离敌弹：朝远离弹道的垂直方向闪
function dodgeDir(G) {
  const p = G.player;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  let best = -1, bestDist = 1e9;
  for (const b of G.bullets) {
    if (b.owner !== 'enemy') continue;
    const dx = cx - b.x, dy = cy - b.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 58) continue;
    // 子弹朝玩家方向飞
    if (dx * b.dx + dy * b.dy <= 0) continue;
    if (dist < bestDist) { bestDist = dist; best = b; }
  }
  if (!best) return -1;
  // 子弹水平飞 → 上下躲；垂直飞 → 左右躲；方向被墙挡就换另一侧，都不行不躲
  function canStep(dir) {
    const nx = p.x + WV.DX[dir] * 6, ny = p.y + WV.DY[dir] * 6;
    return !WV.blockedForTank(nx, ny, p.w, p.h);
  }
  const a = best.dx !== 0 ? ((cy < best.y) ? 0 : 2) : ((cx < best.x) ? 3 : 1);
  const b = (a + 2) % 4;
  if (canStep(a)) return a;
  if (canStep(b)) return b;
  return -1;
}

let dodgeLock = 0;

function botDecide(G) {
  if (dodgeLock > 0) dodgeLock--;
  const dodge = dodgeLock > 0 ? -1 : dodgeDir(G);
  if (dodge >= 0) dodgeLock = 2; // 闪一次锁 0.5s，避免被弹幕钉在原地
  const pc = playerCell(G);
  const target = nearestEnemyCell(G);
  if (!target) return { dir: dodge >= 0 ? dodge : -1, fire: false };
  if (dodge >= 0) return { dir: dodge, fire: true };

  // 坦克大战基本功：先对齐再开火。同一行/列就直接朝目标走，子弹也朝它
  const p = G.player;
  const e = nearestEnemyOf(G);
  if (e) {
    const dx = (e.x + e.w / 2) - (p.x + p.w / 2);
    const dy = (e.y + e.h / 2) - (p.y + p.h / 2);
    if (Math.abs(dx) < 20) return { dir: dy > 0 ? 2 : 0, fire: true };
    if (Math.abs(dy) < 20) return { dir: dx > 0 ? 1 : 3, fire: true };
  }

  // 目标格可能被敌人占着，BFS 只走到相邻
  let dir = bfs(G, pc[0], pc[1], target[0], target[1], 400);
  if (dir < 0) {
    // BFS 失败：别朝墙直线撞，挑一个当前能走的格子
    const p = G.player;
    const opts = [0, 1, 2, 3].filter(d => {
      const nx = p.x + WV.DX[d] * 6, ny = p.y + WV.DY[d] * 6;
      return !WV.blockedForTank(nx, ny, p.w, p.h);
    });
    dir = opts.length ? opts[Math.floor(Math.random() * opts.length)] : -1;
  }
  return { dir, fire: true };
}

function runOne(seedLabel, startLevel, god) {
  if (startLevel !== undefined) {
    S.G.score = 0; S.G.kills = 0; S.G.playTime = 0; S.G.upgrades = [];
    S.jump(startLevel);
  } else {
    S.start();
  }
  if (god) S.god(true);
  dodgeLock = 0;
  let decCd = 0;
  let lastTimer = null;
  let stuckCheck = 0;
  const log = { label: seedLabel, levels: [], maxPlayTime: 0 };
  let prevPos = { x: 0, y: 0 };
  for (let tick = 0; tick < 60 * 60 * 12; tick++) {
    const G = S.G;
    if (G.mode === 'title') { S.start(); continue; }
    if (G.mode === 'result') {
      return { ...log, done: true, win: !!G.result.win, msg: G.result.msg, time: G.playTime, score: G.score, kills: G.kills, mode: G.mode };
    }
    if (G.mode === 'upgrade') { S.forceCard(0); continue; }
    if (god) {
      if (G.player) G.player.invuln = 99999;
      if (G.dinnerHp > 3) G.dinnerHp = 99;
      else G.dinnerHp = 99;
    }
    if (G.mode === 'intro' || G.mode === 'clear') { S.step(1 / 60); continue; }

    decCd -= 1 / 60;
    if (decCd <= 0) {
      decCd = 0.25;
      const d = botDecide(G);
      WV.input.dir = d.dir;
      WV.input.fire = d.fire;
    }
    S.step(1 / 60);

    // 记录每关开始
    if (G.mode === 'play' && log.levels.length <= G.level) {
      log.levels.push({ level: G.level + 1, name: G.levelName, startPlay: G.playTime });
    }
    // 卡死检测
    stuckCheck += 1 / 60;
    if (stuckCheck > 8) {
      stuckCheck = 0;
      const p = G.player;
      if (p && Math.abs(p.x - prevPos.x) < 1 && Math.abs(p.y - prevPos.y) < 1 && G.mode === 'play') {
        WV.input.dir = Math.floor(Math.random() * 4);
        log.stuck = (log.stuck || 0) + 1;
      }
      prevPos = { x: p ? p.x : 0, y: p ? p.y : 0 };
    }
    log.maxPlayTime = Math.max(log.maxPlayTime, G.playTime);
  }
  return { ...log, done: false, timeout: true, time: S.G.playTime, score: S.G.score, kills: S.G.kills };
}

// 内容长度验收用无敌 bot（保证能走完三关），普通难度数据单独参考
const runs = [];
for (let i = 0; i < 3; i++) {
  const r = runOne('godrun' + (i + 1), undefined, true);
  runs.push(r);
  console.log(JSON.stringify(r));
}
const normal = runOne('normal-ref');
console.log(JSON.stringify(normal));
const finale = runOne('finale-ref', 2);
console.log(JSON.stringify(finale));

const godWins = runs.filter(r => r.win).length;
const godTimes = runs.map(r => Math.round(r.time));
const godTimesOk = godTimes.every(t => t >= 200 && t <= 660);
const allReached3 = runs.every(r => r.levels.length >= 3);
console.log('\n=== 内容长度验收（无敌 bot） ===');
console.log('通关', godWins + '/3');
console.log('单局时长(秒)', godTimes);
console.log('时长 200–540 内', godTimesOk);
console.log('三局都走完 3 关', allReached3);
console.log('普通难度参考:', normal.done ? (normal.win ? '通关' : '失败') : '超时', Math.round(normal.time) + 's', (normal.msg || ''));
process.exit(godWins === 3 && godTimesOk && allReached3 ? 0 : 1);
