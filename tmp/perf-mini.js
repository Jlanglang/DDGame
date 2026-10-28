// 临时探针：统计每帧 fillRect 次数与耗时（定位小地图开销）
const { spawn } = require('node:child_process');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const url = 'file:///D:/DDGame/games/darklegend/index.html?engine=three';
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
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__fr = { n: 0, ms: 0 };
      const orig = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (...a) {
        const t = performance.now();
        const r = orig.apply(this, a);
        window.__fr.ms += performance.now() - t;
        window.__fr.n++;
        return r;
      };
      window.__frame = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) {
        return raf.call(window, function (ts) { window.__frame++; return cb(ts); });
      };
    })();`,
  }, sid);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Page.navigate', { url }, sid);
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__dl')) break; await wait(100); }
  await wait(2000);
  await ev('__fr = { n: 0, ms: 0 }; window.__f0 = window.__frame; 1');
  await wait(3000);
  const out = await ev(`({ fillRects: __fr.n, fillMs: +__fr.ms.toFixed(1), frames: window.__frame - window.__f0 })`);
  console.log(JSON.stringify(out));
  if (out.frames) console.log('每帧 fillRect:', Math.round(out.fillRects / out.frames), '次；每帧 fillRect 耗时:', (out.fillMs / out.frames).toFixed(2), 'ms');
  proc.kill();
})().catch((e) => { console.error(e); process.exit(1); });
