// 临时探针：量 3D 每帧 JS 时间 / 小地图开销（不属于仓库）
const { spawn } = require('node:child_process');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const url = 'file:///D:/DDGame/games/darklegend/index.html?engine=three&stats=1';
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
  await wait(300);
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
  await wait(3000);
  const stats = await ev(`document.body.innerText.split('\\n').filter(s => s.includes('frame ')).pop()`);
  console.log('stats:', stats);
  const bench = await ev(`new Promise((res) => {
    const t = [];
    let last = performance.now();
    let n = 0;
    const f = () => {
      const now = performance.now();
      t.push(now - last); last = now; n++;
      if (n < 120) requestAnimationFrame(f);
      else {
        t.sort((a, b) => a - b);
        res({ median: t[60].toFixed(2), p95: t[114].toFixed(2), min: t[0].toFixed(2), max: t[119].toFixed(2), fps: (1000 / t[60]).toFixed(1) });
      }
    };
    requestAnimationFrame(f);
  })`);
  console.log('rAF 间隔:', JSON.stringify(bench));
  proc.kill();
})().catch((e) => { console.error(e); process.exit(1); });
