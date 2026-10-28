// 临时探针：3D 野外实拍（不属于仓库）
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function shot(name, expr) {
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
  await wait(300);
  const t = await send('Target.createTarget', { url: 'about:blank' });
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sid = a.sessionId;
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  await send('Page.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Page.navigate', { url }, sid);
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__dl')) break; await wait(100); }
  await wait(2500);
  await ev('__dl.pauseAuto(); 1');
  await ev(expr);
  await wait(2500);
  const r = await send('Page.captureScreenshot', { format: 'png' }, sid);
  fs.writeFileSync(path.join(__dirname, 'dl', name + '.png'), Buffer.from(r.data, 'base64'));
  proc.kill();
  console.log('shot', name);
}

(async () => {
  await shot('field3d', '__dl.setPos(66, 92); 1');
  await shot('edge3d', '__dl.setPos(6, 64); 1');
})().catch((e) => { console.error(e); process.exit(1); });
