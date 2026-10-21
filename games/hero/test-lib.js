/* 豆豆勇者 · 测试底座（只服务本目录的 test-*.js）
   无头 Chrome + CDP over pipe：零依赖，不装 ws、不起端口、不写临时文件。

   const t = await launch('file:///.../index.html?debug=1&skipmenu=1');
   t.ev(expr)   -> 在页面里求值并返回结果
   t.send(m,p)  -> 裸 CDP 调用（Input.dispatchTouchEvent 等）
   t.errors     -> 页面异常 / console.error 收集
   t.close()    -> 收摊
*/
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((f) => fs.existsSync(f));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(url, opts = {}) {
  if (!CHROME) throw new Error('没找到 Chrome / Edge');
  if (!url) throw new Error('launch(url) 需要页面地址');
  const width = opts.width || 844;
  const height = opts.height || 390;
  const dsf = opts.dsf || 2;
  const mobile = opts.mobile !== false;

  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-pipe', '--allow-file-access-from-files',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

  const input = proc.stdio[3];
  const output = proc.stdio[4];
  const pending = new Map();
  const errors = [];
  let seq = 0, buf = '', sid = null;

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

  await wait(500);
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sid = attached.sessionId;

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面异常：' + (r.exceptionDetails.text || ''));
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url });
  for (let i = 0; i < 80; i++) {
    if (await ev('!!window.__g')) break;
    await wait(100);
  }

  const close = () => { try { proc.kill(); } catch { /* 已退出 */ } };
  return { send, ev, errors, close, proc };
}

module.exports = { launch, wait, CHROME };
