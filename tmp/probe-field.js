// 临时探针：看 3D 画布是否真的可见/渲染（不属于仓库）
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const url = 'file:///D:/DDGame/games/darklegend/index.html?engine=three&shot=1&room=field1';
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
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const m = { id: ++seq, method, params }; if (sessionId) m.sessionId = sessionId;
    pending.set(m.id, { resolve, reject }); input.write(JSON.stringify(m) + '\0');
  });
  await wait(500);
  const t = await send('Target.createTarget', { url: 'about:blank' });
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sid = a.sessionId;
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) return { error: r.exceptionDetails.exception && r.exceptionDetails.exception.description };
    return r.result.value;
  };
  await send('Page.enable', {}, sid);
  await send('Runtime.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Page.navigate', { url }, sid);
  await wait(6000);
  console.log(JSON.stringify(await ev(`(() => {
    const c = document.getElementById('view3d');
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    return {
      rect: [r.left, r.top, r.width, r.height],
      styleW: c.style.width, styleH: c.style.height,
      attr: [c.width, c.height],
      disp: cs.display, vis: cs.visibility, op: cs.opacity, zi: cs.zIndex,
      hidden: c.hidden,
      gl: !!(c.getContext('webgl2') || c.getContext('webgl')),
      bodyEngine: document.body.className,
      stats: (document.body.innerText.match(/frame [0-9.]+ ms[^\\n]*/) || [null])[0],
      view: [innerWidth, innerHeight, devicePixelRatio],
    };
  })()`), null, 1));
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sid);
  fs.writeFileSync(path.join(__dirname, 'dl', 'field1.png'), Buffer.from(shot.data, 'base64'));
  proc.kill();
})().catch((e) => { console.error(e); process.exit(1); });

