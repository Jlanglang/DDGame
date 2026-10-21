/* 输入测试（本游戏专用）：真浏览器里发真实触摸 / 鼠标事件，读 window.__dl 验证。
   用法：node games/darklegend/test-input.js

   零依赖：用 Chrome 的 --remote-debugging-pipe 直接对话（fd 3 写、fd 4 读），
   不装 ws、不起端口、不写临时文件。和 test-game.mjs 的分工：
   - test-game.mjs      纯逻辑（Node + DOM 桩），改规则先跑它
   - test-input.js      真浏览器（布局换算 + 事件 + 寻路），改输入/UI 跑它

   不覆盖：真机上的手势冲突（touch-action / 系统手势）——那条仍要主人真机确认。
*/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((f) => fs.existsSync(f));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; lines.push('  PASS ' + name); }
  else { fail++; lines.push('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

async function main() {
  if (!CHROME) throw new Error('没找到 Chrome / Edge');
  const url = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?debug';

  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--remote-debugging-pipe', '--allow-file-access-from-files',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

  const input = proc.stdio[3], output = proc.stdio[4];
  const pending = new Map();
  let seq = 0, buf = '';
  output.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const m = { id: ++seq, method, params };
    if (sessionId) m.sessionId = sessionId;
    pending.set(m.id, { resolve, reject });
    input.write(JSON.stringify(m) + '\0');
  });

  await wait(500);
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sid = attached.sessionId;

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) throw new Error('页面异常：' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };

  await send('Page.enable', {}, sid);
  await send('Runtime.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 480, height: 900, deviceScaleFactor: 1, mobile: true,
  }, sid);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sid);
  await send('Page.navigate', { url }, sid);

  for (let i = 0; i < 80; i++) {
    if (await ev('!!window.__dl')) break;
    await wait(100);
  }
  ok('页面加载出 __dl', await ev('!!window.__dl'));

  // 关掉开场遮罩、停掉自动回合，测试才有确定性
  await ev('__dl.hideIntro(); __dl.pauseAuto(); 1');

  // 页面里的坐标换算：格子 → 客户端像素（跟 game.js 用同一套 cam / TILE）
  await ev(`
    window.__tileToClient = function (tx, ty) {
      const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      const cam = __dl.cam();
      const sx = tx * 32 + 16 - cam.x, sy = ty * 32 + 16 - cam.y;
      return [r.left + sx * r.width / 720, r.top + sy * r.height / 1120];
    }; 1`);

  const tap = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }, sid);
    await wait(50);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sid);
  };

  /* 1. 点小地图不该让人物动 */
  const p0 = await ev('[__dl.P.x, __dl.P.y]');
  const mini = await ev(`(() => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return [r.left + (720 - 60) * r.width / 720, r.top + 60 * r.height / 1120];
  })()`);
  await tap(mini[0], mini[1]);
  await wait(400);
  const p1 = await ev('[__dl.P.x, __dl.P.y]');
  ok('点小地图不移动', p0[0] === p1[0] && p0[1] === p1[1], [p0, p1]);

  /* 2. 触摸点地 → 寻路走过去 */
  const goal = await ev(`(() => {
    const P = __dl.P, m = __dl.map();
    for (const [dx, dy] of [[4,0],[-4,0],[0,4],[0,-4],[3,0],[0,-3]]) {
      const x = P.x + dx, y = P.y + dy;
      if (m[y] && m[y][x] === 0) return [x, y];
    }
    return null;
  })()`);
  ok('找到一个可走的目标格', !!goal, goal);
  const p2 = await ev('[__dl.P.x, __dl.P.y]');
  const pt = await ev(`__tileToClient(${goal[0]}, ${goal[1]})`);
  await tap(pt[0], pt[1]);
  await wait(1600);
  const p3 = await ev('[__dl.P.x, __dl.P.y]');
  ok('触摸点地会走过去', p3[0] !== p2[0] || p3[1] !== p2[1], [p2, p3]);

  /* 3. 进房间，贴脸点怪 → 打得掉血 */
  const foe = await ev(`(() => {
    __dl.enterRoom('field1');
    __dl.pauseAuto();
    const es = __dl.enemies().filter((e) => e.hp > 0);
    const m = __dl.map();
    for (const e of es) {
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const x = e.x + dx, y = e.y + dy;
        if (m[y] && m[y][x] === 0) {
          __dl.setPos(x, y);
          return { gx: e.x, gy: e.y, hp: e.hp };
        }
      }
    }
    return null;
  })()`);
  ok('房间里能找到贴脸的怪', !!foe, foe);
  await wait(500);                       // 等相机追上，坐标才算得准
  const foePt = await ev(`__tileToClient(${foe.gx}, ${foe.gy})`);
  await tap(foePt[0], foePt[1]);
  await wait(300);
  const hpNow = await ev(`(() => {
    const e = __dl.enemies().find((x) => x.x === ${foe.gx} && x.y === ${foe.gy});
    return e ? e.hp : 0;
  })()`);
  ok('点怪能打掉血', hpNow < foe.hp, [foe.hp, hpNow]);

  proc.kill();
}

main().then(() => {
  console.log(lines.join('\n'));
  console.log('');
  console.log(`RESULT pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((err) => {
  console.log(lines.join('\n'));
  console.error('测试跑挂了：', err && err.message ? err.message : err);
  process.exit(1);
});
