/* 输入测试（本游戏专用）：真浏览器里发真实触摸 / 鼠标拖动，读 window.__g.player.x 验证。
   用法：node games/doudou/test-input.js

   零依赖：Chrome 的 --remote-debugging-pipe 直接对话（fd 3 写、fd 4 读），
   不装 ws、不起端口。（这份测试原来放在 D:\DP\.tools\input-test.js，是全局脚本，
   容易被当成"所有游戏的输入测试"跑错对象，M1.21 起搬回本游戏目录。）

   450 CSS 宽 → 720 逻辑宽：手指拖到 120 CSS ≈ 逻辑 192；鼠标拖到 150 CSS ≈ 逻辑 240。
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
    width: 450, height: 1000, deviceScaleFactor: 2, mobile: true,
  }, sid);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sid);
  await send('Page.navigate', { url }, sid);

  for (let i = 0; i < 80; i++) {
    if (await ev('!!window.__g')) break;
    await wait(100);
  }
  ok('页面加载出 __g', await ev('!!window.__g'));

  const getX = () => ev('window.__g ? Math.round(window.__g.player.x) : null');

  /* 1. 触摸拖动 */
  const x0 = await getX();
  ok('初始位置读得到', typeof x0 === 'number', x0);

  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 800 }] }, sid);
  await wait(120);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 800 }] }, sid);
  await wait(120);
  const xTouch = await getX();
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sid);
  await wait(120);
  ok('触摸拖到 120 CSS ≈ 逻辑 192', Math.abs(xTouch - 192) <= 8, xTouch);

  /* 2. 鼠标拖动 */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 350, y: 800, button: 'left', clickCount: 1 }, sid);
  await wait(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 150, y: 800, button: 'left' }, sid);
  await wait(120);
  const xMouse = await getX();
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 150, y: 800, button: 'left', clickCount: 1 }, sid);
  await wait(80);
  ok('鼠标拖到 150 CSS ≈ 逻辑 240', Math.abs(xMouse - 240) <= 8, xMouse);

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
