// 临时探针：3D 下真实鼠标点击 → 是否走到目标格（不属于仓库）
const { spawn } = require('node:child_process');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const url = 'file:///D:/DDGame/games/darklegend/index.html?engine=three&debug';
  const proc = spawn(CHROME, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-debugging-pipe', '--allow-file-access-from-files', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const input = proc.stdio[3], output = proc.stdio[4];
  const pending = new Map(); let seq = 0, buf = '';
  output.on('data', (chunk) => {
    buf += chunk.toString('utf8'); let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    }
  });
  const send = (method, params = {}, sid) => new Promise((resolve, reject) => {
    const m = { id: ++seq, method, params }; if (sid) m.sessionId = sid;
    pending.set(m.id, { resolve, reject }); input.write(JSON.stringify(m) + '\0');
  });
  await wait(400);
  const t = await send('Target.createTarget', { url: 'about:blank' });
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sid = a.sessionId;
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  await send('Page.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Page.navigate', { url }, sid);
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__dl')) break; await wait(100); }
  await wait(2500);
  await ev('__dl.pauseAuto(); 1');

  const info = await ev(`(() => {
    const P = __dl.P, m = __dl.map();
    let goal = null;
    for (const d of [[4,0],[-4,0],[0,4],[0,-4],[3,0],[0,-3]]) {
      const x = P.x + d[0], y = P.y + d[1];
      if (m[y] && m[y][x] === 0) { goal = [x, y]; break; }
    }
    const cam = __dl.cam ? null : null;
    return { p: [P.x, P.y], goal, hasPick: !!window.DL.ThreePick, active: DL.ThreeView.active() };
  })()`);
  console.log('before', JSON.stringify(info));

  // 用 three-pick 的 ndcForGround + 画布矩形，把目标格换算成屏幕坐标
  const pt = await ev(`(() => {
    const [gx, gy] = ${JSON.stringify(info.goal)};
    const P = __dl.P, c = document.getElementById('view3d'), r = c.getBoundingClientRect();
    const n = DL.ThreePick.ndcForGround(P.x + 0.5, P.y + 0.5, gx + 0.5, gy + 0.5, 1);
    return [r.left + (n.nx * 0.5 + 0.5) * r.width, r.top + (1 - (n.ny * 0.5 + 0.5)) * r.height];
  })()`);
  console.log('click at', pt);

  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: pt[0], y: pt[1], button: 'left', clickCount: 1 }, sid);
    await wait(60);
  }
  await wait(1800);
  const after = await ev('[__dl.P.x, __dl.P.y]');
  console.log('after', JSON.stringify(after), 'goal', JSON.stringify(info.goal));

  // 目标格是否真的走到（或至少朝它动了）
  const hit = after[0] === info.goal[0] && after[1] === info.goal[1];
  const moved = after[0] !== info.p[0] || after[1] !== info.p[1];
  console.log(hit ? 'CLICK-OK 走到目标格' : moved ? 'CLICK-PARTIAL 动了但没到目标格' : 'CLICK-FAIL 没动');
  proc.kill();
})().catch((e) => { console.error(e); process.exit(1); });
