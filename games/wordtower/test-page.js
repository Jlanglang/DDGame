/* 豆豆单词塔 · 两页流程测试（真浏览器）
   用法：node games/wordtower/test-page.js

   覆盖：主页/战斗页切换、难度选择、开始战斗、战斗中不能改难度、退出回主页、再开一局。
   零依赖：Chrome 的 --remote-debugging-pipe 直接对话，不装 ws、不起端口。 */
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
let pass = 0;
let fail = 0;

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

  const input = proc.stdio[3];
  const output = proc.stdio[4];
  const pending = new Map();
  const errors = [];
  let seq = 0;
  let buf = '';
  let sid = null;

  output.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push(d.text + ' ' + ((d.exception && d.exception.description) || ''));
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
      }
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      }
    }
  });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    const msg = { id, method, params };
    const use = sessionId || sid;
    if (use) msg.sessionId = use;
    pending.set(id, { resolve, reject });
    input.write(JSON.stringify(msg) + '\0');
  });

  await wait(500);
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sid = attached.sessionId;

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面异常：' + JSON.stringify(r.exceptionDetails.text));
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 450, height: 1000, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url });
  for (let i = 0; i < 80; i++) {
    if (await ev('!!window.__g')) break;
    await wait(100);
  }

  const st = () => ev(`JSON.stringify({
    state: __g.state,
    grade: __g.gradeMax,
    wave: __g.wave,
    homeHidden: document.getElementById('home').hidden,
    battleHidden: document.getElementById('battle').hidden,
    ls: localStorage.getItem('wordtower-grade'),
    onBtns: Array.prototype.map.call(document.querySelectorAll('.grade-btn.on'), function (b) { return b.dataset.grade; })
  })`).then(JSON.parse);
  const click = async (sel) => {
    const p = await ev(`(function(){var b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', clickCount: 1 });
    await wait(140);
  };

  await ev('try { localStorage.clear(); } catch (e) {}');
  await ev('location.reload()');
  for (let i = 0; i < 80; i++) {
    if (await ev('!!window.__g')) break;
    await wait(100);
  }
  await wait(200);

  /* 1. 初始在主页 */
  const s0 = await st();
  ok('初始显示主页', s0.homeHidden === false, s0);
  ok('战斗页隐藏', s0.battleHidden === true, s0);
  ok('初始不是战斗状态', s0.state === 'home', s0.state);
  ok('默认难度 1-6', s0.grade === 6, s0.grade);

  /* 2. 选难度 */
  await click('.grade-btn[data-grade="4"]');
  const s1 = await st();
  ok('点 1-4 年级后难度变 4', s1.grade === 4, s1.grade);
  ok('难度写进 localStorage', String(s1.ls) === '4', s1.ls);
  ok('只有 1-4 按钮高亮', s1.onBtns.length === 1 && s1.onBtns[0] === '4', s1.onBtns);

  /* 3. 开始战斗 */
  await click('#startBtn');
  await wait(400);
  const s2 = await st();
  ok('点开始切到战斗页', s2.homeHidden === true && s2.battleHidden === false, s2);
  ok('战斗状态是 playing', s2.state === 'playing', s2.state);
  ok('第 1 波已开始', s2.wave >= 1, s2.wave);

  /* 4. 战斗中改不了难度 */
  await ev('__api.setGrade(2)');
  const s3 = await st();
  ok('战斗中 setGrade 被拒绝', s3.grade === 4, s3.grade);
  ok('战斗中难度按钮不可见', s3.homeHidden === true, s3.homeHidden);

  /* 5. 退出回主页 */
  await click('#exitBtn');
  const s4 = await st();
  ok('点回主页切回主页', s4.homeHidden === false && s4.battleHidden === true, s4);
  ok('退出后状态是 home', s4.state === 'home', s4.state);
  ok('难度保持不变', s4.grade === 4, s4.grade);

  /* 6. 再开一局 */
  await click('#startBtn');
  await wait(400);
  const s5 = await st();
  ok('能再开一局', s5.state === 'playing' && s5.wave >= 1, s5);
  ok('再开一局仍是第 4 档', s5.grade === 4, s5.grade);

  ok('没有页面异常', errors.length === 0, errors.slice(0, 3));

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
