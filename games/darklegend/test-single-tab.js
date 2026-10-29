/* 单实例守卫测试（本游戏专用）：真 Chrome 里开两个标签，验「多开被拦 + 关掉旧页自动接管 + 刷新不把自己锁住」。
   用法：node games/darklegend/test-single-tab.js
   前置：先 npm run dev（和 test-input.js 一样走 http://localhost:8183）。

   零依赖：Chrome --remote-debugging-pipe（fd 3 写、fd 4 读），不开端口。
   不覆盖：真手机上的后台冻结（iOS 会冻标签）——那条仍要主人真机确认。
*/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((f) => fs.existsSync(f));

const URL = process.argv[2] || 'http://localhost:8183/?debug';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

async function main() {
  if (!CHROME) throw new Error('没找到 Chrome / Edge');
  // Chrome 新版本的 headless 不给用户目录就直接退出
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-tab-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--remote-debugging-pipe',
    '--user-data-dir=' + userData,
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

  const openTab = async () => {
    const t = await send('Target.createTarget', { url: 'about:blank' });
    const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    await send('Page.enable', {}, a.sessionId);
    await send('Runtime.enable', {}, a.sessionId);
    await send('Page.navigate', { url: URL }, a.sessionId);
    return { targetId: t.targetId, sid: a.sessionId };
  };
  const ev = async (sid, expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) throw new Error('页面异常：' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  const waitFor = async (sid, expr, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(sid, expr)) return true;
      await wait(120);
    }
    return false;
  };

  await wait(600);
  try {
    // ---- 第一个标签：正常开局 ----
    const a = await openTab();
    ok('标签1 加载出 __dl', await waitFor(a.sid, '!!(window.DL && window.DL.SingleTab && window.__dl)', 15000));
    ok('标签1 拿到锁（owner）', (await ev(a.sid, 'window.DL && DL.SingleTab && DL.SingleTab.role')) === 'owner');
    ok('标签1 没有遮罩', await ev(a.sid, '!(document.getElementById("tabGuard") && !document.getElementById("tabGuard").hidden)'));

    // ---- 第二个标签：必须被拦下 ----
    const b = await openTab();
    ok('标签2 等到了守卫', await waitFor(b.sid, 'window.DL && DL.SingleTab', 15000));
    await wait(2500);
    ok('标签2 没加载游戏（__dl 不存在）', (await ev(b.sid, '!!window.__dl')) === false);
    ok('标签2 是 waiting', (await ev(b.sid, 'DL.SingleTab.role')) === 'waiting');
    ok('标签2 显示遮罩', await ev(b.sid, '!!(document.getElementById("tabGuard") && !document.getElementById("tabGuard").hidden)'));

    // ---- 关掉第一个：第二个应自动接管 ----
    await send('Target.closeTarget', { targetId: a.targetId });
    ok('标签2 接管后加载了 __dl', await waitFor(b.sid, '!!window.__dl', 12000));
    ok('标签2 变成 owner', (await ev(b.sid, 'DL.SingleTab.role')) === 'owner');
    ok('标签2 遮罩已收', await ev(b.sid, '!!(document.getElementById("tabGuard") && document.getElementById("tabGuard").hidden)'));
    ok('存档锁归标签2', await ev(b.sid, 'JSON.parse(localStorage.getItem("darklegend-tab-lock")).id === DL.SingleTab.id'));

    // ---- 刷新：不能把自己锁在遮罩里 ----
    await send('Page.reload', {}, b.sid);
    await wait(800);   // 等导航提交，别读到刷新前的旧 window
    ok('刷新后重新加载出 __dl', await waitFor(b.sid, '!!(window.DL && window.DL.SingleTab && window.__dl)', 15000));
    ok('刷新后仍是 owner', (await ev(b.sid, 'DL.SingleTab.role')) === 'owner');
    ok('刷新后没有遮罩', await ev(b.sid, '!(document.getElementById("tabGuard") && !document.getElementById("tabGuard").hidden)'));
  } finally {
    try { proc.kill(); } catch { /* 忽略 */ }
    await wait(300);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
  console.log(`RESULT pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
