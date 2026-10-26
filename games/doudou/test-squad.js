/* 小队模式测试：真浏览器里发真实触摸 / 鼠标，验证拖放、合成、开战。
   用法：node games/doudou/test-squad.js

   零依赖，和 test-input.js 一样用 Chrome 的 --remote-debugging-pipe（fd 3 写、fd 4 读）。

   450 CSS 宽 → 720 逻辑宽，比例 0.625。坐标一律从页面里的真实 rect 换算，不写死。
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
  const url = 'file:///' + path.join(__dirname, 'squad.html').replace(/\\/g, '/') + '?fast=8';

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
    width: 450, height: 1000, deviceScaleFactor: 2, mobile: true,
  }, sid);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sid);
  await send('Page.navigate', { url }, sid);

  for (let i = 0; i < 80; i++) {
    if (await ev('!!window.__squad')) break;
    await wait(100);
  }
  ok('页面加载出 __squad', await ev('!!window.__squad'));
  ok('开局待命区 3 人', await ev('window.__squad.bench.filter(Boolean).length') === 3);

  /* 坐标：从真实 canvas rect 换算，别写死 */
  const geo = await ev(`(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    const a = window.__squadApi;
    const kx = r.width / 720, ky = r.height / 1600;
    const P = (x, y) => ({ x: r.left + x * kx, y: r.top + y * ky });
    const slot = (i) => P(a.GRID.x + (i % a.GRID.cols) * a.CELL + a.CELL / 2,
                          a.GRID.y + Math.floor(i / a.GRID.cols) * a.CELL + a.CELL / 2);
    const btn = (b) => P(b.x + b.w / 2, b.y + b.h / 2);
    return {
      slot0: slot(9), slot1: slot(10),
      fight: btn(a.BTN.fight),
    };
  })()`);

  // 待命区是动态布局（框宽跟着占格数变），每次拖之前都得重算
  const benchPos = (i) => ev(`(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    const p = window.__squadApi.benchCenter(${i});
    return { x: r.left + p.x * r.width / 720, y: r.top + p.y * r.height / 1600 };
  })()`);

  const touchDrag = async (from, to) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] }, sid);
    await wait(70);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }] }, sid);
    await wait(60);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x, y: to.y }] }, sid);
    await wait(80);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sid);
    await wait(140);
  };

  const mouseDrag = async (from, to) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 }, sid);
    await wait(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, button: 'left' }, sid);
    await wait(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to.x, y: to.y, button: 'left' }, sid);
    await wait(80);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 }, sid);
    await wait(140);
  };

  /* 1. 空场不能开战 */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geo.fight.x, y: geo.fight.y, button: 'left', clickCount: 1 }, sid);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geo.fight.x, y: geo.fight.y, button: 'left', clickCount: 1 }, sid);
  await wait(200);
  ok('空场点开战不进入战斗', await ev('window.__squad.phase') === 'prep');

  /* 2. 触摸：把待命区的 1 号拖进 0 号格 */
  await touchDrag(await benchPos(0), geo.slot0);
  ok('触摸拖放：格子 9 有人', await ev('!!window.__squad.slots[9]'));
  ok('触摸拖放：待命区 0 空了', await ev('window.__squad.bench[0] === null'));

  /* 3. 鼠标：把 2 号拖进 10 号格（1×2 的霰弹兵，应该同时占 10 和 17） */
  await mouseDrag(await benchPos(1), geo.slot1);
  ok('鼠标拖放：格子 10 有人', await ev('!!window.__squad.slots[10]'));
  ok('大单位占两格（格子 10 和 17 是同一个单位）', await ev('!!window.__squad.slots[10] && window.__squad.slots[10] === window.__squad.slots[17]'));

  /* 4. 合成：把 3 号改成和格子 0 同兵种同星，再拖上去 */
  await ev(`(() => {
    const s = window.__squad;
    const a = window.__squadApi;
    const k = s.slots[9].kind;
    s.bench[2] = { kind: k, star: 1, cd: 0, w: a.KINDS[k].w, h: a.KINDS[k].h, cell: -1 };
    return true;
  })()`);
  const beforeStar = await ev('window.__squad.slots[9].star');
  await touchDrag(await benchPos(2), geo.slot0);
  const afterStar = await ev('window.__squad.slots[9].star');
  ok('合成：星级 +1', afterStar === beforeStar + 1, { beforeStar, afterStar });
  ok('合成：待命区 2 清空', await ev('window.__squad.bench[2] === null'));
  ok('合成：记了次数', await ev('window.__squad.stats.merges') === 1);

  /* 5. 开战 */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geo.fight.x, y: geo.fight.y, button: 'left', clickCount: 1 }, sid);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geo.fight.x, y: geo.fight.y, button: 'left', clickCount: 1 }, sid);
  await wait(250);
  ok('点开战进入战斗', await ev('window.__squad.phase') === 'battle');

  /* 6. 战斗推进（fast=8，最多等 12 秒） */
  const startWave = await ev('window.__squad.wave');
  let advanced = false;
  let sawEnemy = false;
  for (let i = 0; i < 40; i++) {
    const st = await ev(`({ wave: window.__squad.wave, phase: window.__squad.phase, n: window.__squad.enemies.length + window.__squad.spawnLeft })`);
    if (st.n > 0) sawEnemy = true;
    if (st.wave > startWave || st.phase === 'win' || st.phase === 'over') { advanced = true; break; }
    if (st.n === 0 && st.phase === 'prep') { advanced = true; break; }
    await wait(300);
  }
  ok('战斗里出现过敌人', sawEnemy);
  ok('波次推进或整局结束', advanced, await ev(`({ wave: window.__squad.wave, phase: window.__squad.phase })`));

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
