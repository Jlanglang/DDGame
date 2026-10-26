/* 节奏豆豆 · 真浏览器输入测试（零依赖：headless Chrome + CDP over pipe）
   用法：node games/rhythm/test-input.js
   覆盖：真实触摸选关、单指/多指、键盘、判定注入、真按拍点、结算、下一关。
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
const PAGE = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?test=1';

(async () => {
  if (!CHROME) throw new Error('没找到 Chrome / Edge');
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-pipe', '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required',
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
        errors.push(m.params.exceptionDetails.text + ' ' +
          ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || ''));
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

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面异常：' + (r.exceptionDetails.text || ''));
    return r.result.value;
  };

  await wait(500);
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sid = attached.sessionId;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1600, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: PAGE });

  for (let i = 0; i < 80; i++) {
    if (await ev('!!window.__rhythm')) break;
    await wait(100);
  }

  const lines = [];
  let pass = 0;
  let fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; lines.push('  PASS ' + name); }
    else { fail++; lines.push('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
  };

  const touch = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  const centerOf = (sel) => ev(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);

  /* 1. 启动 */
  ok('页面加载出 __rhythm', await ev('!!window.__rhythm'));
  ok('初始在首页', (await ev('window.__rhythm.state()')) === 'home');
  ok('首页列出 50 关', (await ev('document.querySelectorAll(".level").length')) === 50);
  ok('默认显示音符（先保证能玩）', (await ev('window.__rhythm.G.showNotes')) === true);

  /* 2. 选关后再点开始 */
  {
    const c = await centerOf('.level[data-lv="0"]');
    await touch(c.x, c.y);
    await wait(200);
    ok('点第 1 关还停在选关', (await ev('window.__rhythm.state()')) === 'home');
    ok('选中第 1 关', (await ev('window.__rhythm.G.level')) === 0);
    const start = await centerOf('#startBtn');
    await touch(start.x, start.y);
    await wait(300);
    ok('点开始进入游戏', (await ev('window.__rhythm.state()')) === 'play');
    ok('当前是第 1 关', (await ev('window.__rhythm.G.level')) === 0);
  }

  /* 3. 单指点击算一次 */
  {
    const before = await ev('window.__rhythm.G.tapCount');
    await touch(360, 800);
    await wait(80);
    const after = await ev('window.__rhythm.G.tapCount');
    ok('单指点击 +1', after === before + 1, { before, after });
  }

  /* 4. 点节奏按钮有按下反馈。按下时刻立刻写上，不跟画面那一帧走。 */
  {
    const before = await ev('window.__rhythm.G.pressAt || 0');
    await touch(360, 1430);
    await wait(40);
    const s = await ev('({ at: window.__rhythm.G.pressAt || 0, n: window.__rhythm.G.tapCount })');
    ok('点节奏按钮有按下反馈', s.at > before && s.n >= 2, s);
  }

  /* 5. 双指只认第一根 */
  {
    const before = await ev('window.__rhythm.G.tapCount');
    await send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 300, y: 760, id: 1 }, { x: 430, y: 840, id: 2 }],
    });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(80);
    const after = await ev('window.__rhythm.G.tapCount');
    ok('双指同时按只算一次', after === before + 1, { before, after });
  }

  /* 5. 键盘 */
  {
    const before = await ev('window.__rhythm.G.tapCount');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'j', code: 'KeyJ', windowsVirtualKeyCode: 74, nativeVirtualKeyCode: 74 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'j', code: 'KeyJ', windowsVirtualKeyCode: 74, nativeVirtualKeyCode: 74 });
    await wait(80);
    const after = await ev('window.__rhythm.G.tapCount');
    ok('键盘 J 也算一次', after === before + 1, { before, after });
  }

  /* 6. 判定注入 */
  ok('0ms 判完美', (await ev('window.__rhythm.testJudge(0)')) === 'perfect');
  ok('完美后连击 1', (await ev('window.__rhythm.G.combo')) === 1);
  ok('90ms 判不错', (await ev('window.__rhythm.testJudge(90)')) === 'good');
  ok('不错也续连击', (await ev('window.__rhythm.G.combo')) === 2);
  ok('150ms 还是不错', (await ev('window.__rhythm.testJudge(150)')) === 'good');
  ok('151ms 判失误', (await ev('window.__rhythm.testJudge(151)')) === 'miss');
  ok('失误断连击', (await ev('window.__rhythm.G.combo')) === 0);
  {
    const n = await ev('window.__rhythm.G.results.length');
    ok('500ms 算空按', (await ev('window.__rhythm.testJudge(500)')) === 'far');
    ok('空按不产生判定记录', (await ev('window.__rhythm.G.results.length')) === n);
  }

  /* 7. 真按在拍点上（跳到这一关的第一下） */
  const firstBeat = await ev(`(() => {
    const G = window.__rhythm.G;
    G.notes.forEach((n) => { n.judged = null; });
    G.results = [];
    G.lastHit = null;
    G.combo = 0;
    const n = G.notes.find((x) => !x.demo);
    return n ? n.beat : 0;
  })()`);
  await ev('window.__rhythm.skipTo(' + firstBeat + ')');
  await touch(360, 800);
  await wait(120);
  {
    const h = await ev('window.__rhythm.G.lastHit');
    ok('真按在拍点上判完美或不错', !!h && (h.kind === 'perfect' || h.kind === 'good'), h);
    ok('判定偏差在 100ms 内', !!h && Math.abs(h.dt) <= 100, h && h.dt);
  }

  /* 8. 结算 → 下一关 */
  await ev('window.__rhythm.skipTo(999)');
  await wait(900);
  ok('曲子走完进入结算', (await ev('window.__rhythm.state()')) === 'result');
  ok('结算显示评级', (await ev("document.getElementById('grade').textContent")).length === 1);
  ok('结算统计非空', (await ev("document.getElementById('resultSub').textContent")).includes('完美'));
  {
    const c = await centerOf('#nextBtn');
    await touch(c.x, c.y);
    await wait(400);
    ok('点下一关进入第 2 关', (await ev('window.__rhythm.G.level')) === 1);
    ok('并且已经开打', (await ev('window.__rhythm.state()')) === 'play');
  }

  /* 9. 回首页 */
  await ev('window.__rhythm.skipTo(999)');
  await wait(900);
  {
    const c = await centerOf('#homeBtn');
    await touch(c.x, c.y);
    await wait(250);
    ok('点回选关', (await ev('window.__rhythm.state()')) === 'home');
  }

  ok('页面没有异常', errors.length === 0, errors.slice(0, 3));

  console.log(lines.join('\n'));
  console.log('');
  console.log(`RESULT pass=${pass} fail=${fail}`);
  proc.kill();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
