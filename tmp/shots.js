// 临时探针：批量截图（默认 2D / 3D 洞穴 / 3D 挥砍帧），不属于仓库
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function shot(name, url, opts = {}) {
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: opts.w || 1280, height: opts.h || 720, deviceScaleFactor: 1, mobile: !!opts.mobile,
  }, sid);
  await send('Page.navigate', { url }, sid);
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__dl')) break; await wait(100); }
  await wait(opts.wait || 3000);
  if (opts.before) await ev(opts.before);
  if (opts.key) {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', { type, key: opts.key, text: opts.key, windowsVirtualKeyCode: opts.key.toUpperCase().charCodeAt(0) }, sid);
    }
  }
  if (opts.after) await ev(opts.after);
  await wait(opts.settle == null ? 300 : opts.settle);
  const r = await send('Page.captureScreenshot', { format: 'png' }, sid);
  fs.writeFileSync(path.join(__dirname, 'dl', name + '.png'), Buffer.from(r.data, 'base64'));
  proc.kill();
  console.log('shot', name);
}

(async () => {
  await shot('old2d', 'file:///D:/DDGame/games/darklegend/index.html?debug', {
    w: 480, h: 900, mobile: true, wait: 2500, before: '__dl.hideIntro(); __dl.pauseAuto(); 1',
  });
  await shot('cave3d', 'file:///D:/DDGame/games/darklegend/index.html?engine=three&shot=1&room=cave1', {
    wait: 4000,
  });
  await shot('attack3d', 'file:///D:/DDGame/games/darklegend/index.html?engine=three&debug&shot=1&room=field1', {
    wait: 4000, before: '__dl.pauseAuto(); 1', key: 'j', settle: 120,
  });
})().catch((e) => { console.error(e); process.exit(1); });
