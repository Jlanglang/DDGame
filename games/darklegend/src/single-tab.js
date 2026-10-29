/* 单实例守卫 · 同一份存档只允许一个页面在跑
 *
 * 背景：存档是 localStorage 整存整取（game.js `save()`），两个标签同时玩，
 *       后写的那个把先写的整个盖掉，进度就丢了。所以启动前先抢一把锁，
 *       抢不到就不加载游戏，只盖一层提示遮罩。
 *
 * 两个通道，缺一不可：
 *   ① BroadcastChannel：ping/pong 判对方死活。后台标签的消息回调不受计时器
 *      节流影响，比「看心跳时间戳」可靠得多。
 *   ② localStorage 心跳锁：BroadcastChannel 不可用时兜底；锁超过 FRESH_MS
 *      没刷新，就当上一个页面已经不在了。
 *
 * localStorage 本身不可用（隐私模式等）时直接放行——宁可多开，
 * 也不能让游戏打不开。此时若 BroadcastChannel 还在，仍只靠它判重。
 *
 * 对外：createSingleTab() → { ready, role, id, isLost, onLost, release }
 *   ready : Promise<boolean>，只有抢到锁才 resolve(true)（被接管 resolve(false)）
 *   本页一旦把锁交出去（被别的页面 claim），role 变 'lost'，game.js 会停表不再存档。
 */

const KEY = 'darklegend-tab-lock';
const CHANNEL = 'darklegend-single-tab';
const HEARTBEAT_MS = 1000;   // owner 写心跳的间隔
const FRESH_MS = 8000;       // 心跳超过这么久没更新 = 上一个页面已经不在了
const PING_WAIT_MS = 350;    // 探测时等 pong 的时间（BroadcastChannel 是即时投递，350ms 足够）
const RETRY_MS = 600;        // 等待中重试的间隔（刷新后撞上一次探测也能很快恢复）
const SETTLE_MS = 260;       // claim 后等一拍，看锁最后落在谁手上

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSingleTab() {
  const id = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
  let role = 'probing';            // probing → owner | waiting → lost
  let ch = null;
  let pongSeen = false;
  let beatTimer = null;
  let waitTimer = null;
  // 页面正在卸载：卸货期间浏览器可能先 pagehide 再补一个 visibilitychange(hidden)，
  // 后者以前会把手动删掉的锁又写回去 —— 刷新后新页面就白等 8 秒。这个标志一置上就再也不写锁。
  let released = false;
  const lostCbs = [];
  let readyResolve = null;

  const ready = new Promise((resolve) => { readyResolve = resolve; });

  // ---- localStorage 通道 ----
  let lsOk = true;
  try {
    const probeKey = `${KEY}:probe`;
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
  } catch { lsOk = false; }

  const now = () => Date.now();

  // 本标签是不是刚刷新过：sessionStorage 按标签隔离、刷新会保留，里面存着上一轮的 id。
  // 刷新时锁通常是「上一轮自己」留下的死锁，直接接管；只有锁属于别的页面才排队等。
  let prevSelfId = '';
  let isReload = false;
  let fastTried = false;        // 「直接接管」只许走一次，省得跟另一个活页面反复抢
  try {
    prevSelfId = sessionStorage.getItem('darklegend-tab-self') || '';
    isReload = !!prevSelfId;
    sessionStorage.setItem('darklegend-tab-self', id);
  } catch { /* 隐私模式等：当新标签处理 */ }

  function readLock() {
    if (!lsOk) return null;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return v && v.id ? v : null;
    } catch { return null; }
  }

  function writeLock() {
    if (released) return;
    if (!lsOk) return;
    try { localStorage.setItem(KEY, JSON.stringify({ id, ts: now() })); } catch { /* 忽略 */ }
  }

  function dropLock() {
    if (!lsOk) return;
    try {
      const v = readLock();
      if (!v || v.id === id) localStorage.removeItem(KEY);
    } catch { /* 忽略 */ }
  }

  // ---- BroadcastChannel 通道 ----
  try {
    if (typeof BroadcastChannel === 'function') {
      ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = (ev) => {
        const m = ev.data;
        if (!m || !m.id || m.id === id) return;
        if (m.t === 'ping') {
          // 只有 owner 应答；等待中的页面不答，免得两个都没锁就互相让对方以为「有人」
          if (role === 'owner') { send('pong'); writeLock(); }
        } else if (m.t === 'pong') {
          pongSeen = true;
        } else if (m.t === 'claim') {
          // 正常不会发生；真收到就说明本页的锁被别人拿走了，让位
          if (role === 'owner') demote();
        }
      };
    }
  } catch { ch = null; }

  function send(t) {
    try { ch && ch.postMessage({ t, id, ts: now() }); } catch { /* 忽略 */ }
  }

  // ---- 遮罩 ----
  let overlayReady = false;

  function ensureOverlay() {
    if (typeof document === 'undefined') return null;
    let box = document.getElementById('tabGuard');
    if (box) return box;
    if (!overlayReady) {
      overlayReady = true;
      const style = document.createElement('style');
      style.textContent = [
        '#tabGuard{position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;',
        'padding:24px;background:radial-gradient(circle at 50% 30%,rgba(30,36,62,.97),rgba(6,8,14,.99));',
        'color:#e9e3d2;font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;',
        'text-align:center;-webkit-user-select:none;user-select:none}',
        '#tabGuard .tg-card{max-width:min(460px,92vw);display:flex;flex-direction:column;align-items:center;gap:12px}',
        '#tabGuard .tg-tag{font-size:12px;letter-spacing:.32em;color:#8b93ad}',
        '#tabGuard .tg-title{font-size:20px;font-weight:700;color:#ffd98a;line-height:1.5}',
        '#tabGuard .tg-note{font-size:13px;line-height:1.9;color:#aab3c9}',
        '#tabGuard .tg-btn{margin-top:10px;padding:10px 22px;border-radius:999px;min-height:44px;',
        'border:1px solid rgba(255,217,138,.5);background:rgba(255,217,138,.12);color:#ffd98a;',
        'font-size:14px;cursor:pointer}#tabGuard .tg-btn:active{transform:scale(.97)}',
      ].join('');
      document.head.appendChild(style);
    }
    box = document.createElement('div');
    box.id = 'tabGuard';
    box.innerHTML = '<div class="tg-card">'
      + '<div class="tg-tag">豆豆海岛幻想</div>'
      + '<div class="tg-title" id="tgTitle"></div>'
      + '<div class="tg-note" id="tgNote"></div>'
      + '<button type="button" class="tg-btn" id="tgBtn">立刻重试</button>'
      + '</div>';
    document.body.appendChild(box);
    box.querySelector('#tgBtn').addEventListener('click', () => {
      if (role !== 'waiting') return;
      clearTimeout(waitTimer);
      waitTimer = null;
      checkWhileWaiting();
    });
    return box;
  }

  function showOverlay(kind) {
    const box = ensureOverlay();
    if (!box) return;
    box.hidden = false;
    const title = box.querySelector('#tgTitle');
    const note = box.querySelector('#tgNote');
    const btn = box.querySelector('#tgBtn');
    if (kind === 'lost') {
      title.textContent = '本页已经把存档交出去了';
      note.textContent = '另一个页面正在接管这个存档，本页已停止运行，免得两边同时写存档、把进度盖掉。这一页可以关掉了。';
      btn.hidden = true;
    } else {
      title.textContent = '这个存档已经在另一个页面里运行了';
      note.textContent = '为了避免两边互相覆盖进度，本页先不启动。关掉那个页面后会自动继续；也可以点下面的按钮立刻重试。';
      btn.hidden = false;
    }
  }

  function hideOverlay() {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('tabGuard');
    if (box) box.hidden = true;
  }

  // ---- 抢锁 ----
  async function probe() {
    if (released) return false;
    if (!ch && !lsOk) return true;              // 两个通道都没有：放行
    // 本标签刷新（F5 / Ctrl+R）：锁没人持着，或者锁就是「上一轮自己」留下的，
    // 直接接管——先给 150ms 让可能还活着的旧实例应答（复制标签页会被逮到）。
    if (isReload && !fastTried) {
      const own = readLock();
      if (!own || own.id === prevSelfId) {
        fastTried = true;
        pongSeen = false;
        send('ping');
        await sleep(150);
        if (pongSeen) return false;
        send('claim');
        writeLock();
        await sleep(SETTLE_MS);
        const after = readLock();
        return !(after && after.id !== id);
      }
    }
    pongSeen = false;
    send('ping');
    await sleep(PING_WAIT_MS);
    if (pongSeen) return false;
    const lock = readLock();
    const fresh = lock && lock.id !== id && now() - lock.ts < FRESH_MS;
    // 锁新鲜就等，但「本标签刚刷新」且没有活着的页面回应时例外：
    // 那是自己上一轮留下的死锁，直接接管，否则刷新要白等（真踩过）。
    if (fresh && !isReload) return false;
    // 试着占：先写锁 + 广播，再等一拍看锁有没有被另一个同时在抢的页面盖掉
    send('claim');
    writeLock();
    await sleep(SETTLE_MS);
    const after = readLock();
    return !(after && after.id !== id);
  }

  function becomeOwner() {
    if (role === 'lost') return;
    const first = role !== 'owner';
    role = 'owner';
    writeLock();
    if (!beatTimer) beatTimer = setInterval(writeLock, HEARTBEAT_MS);
    hideOverlay();
    if (first) readyResolve(true);
  }

  function becomeWaiting() {
    if (role === 'lost' || role === 'owner') return;
    role = 'waiting';
    showOverlay('waiting');
    scheduleWait();
  }

  function scheduleWait() {
    clearTimeout(waitTimer);
    waitTimer = setTimeout(checkWhileWaiting, RETRY_MS);
  }

  async function checkWhileWaiting() {
    if (role !== 'waiting') return;
    const ok = await probe();
    if (role !== 'waiting') return;
    if (ok) becomeOwner();
    else scheduleWait();
  }

  function demote() {
    if (role === 'lost') return;
    role = 'lost';
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    clearTimeout(waitTimer);
    waitTimer = null;
    showOverlay('lost');
    readyResolve(false);
    for (const fn of lostCbs) { try { fn(); } catch { /* 忽略 */ } }
  }

  function release() {
    if (released) return;
    released = true;
    if (role === 'owner') {
      send('bye');
      dropLock();
    }
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    clearTimeout(waitTimer);
    waitTimer = null;
    try { ch && ch.close(); } catch { /* 忽略 */ }
    ch = null;
  }

  if (typeof window !== 'undefined') {
    // 关页 / 刷新：把锁放掉，别让下一个页面白等
    window.addEventListener('pagehide', (e) => {
      if (e && e.persisted) return;   // 进 BFCache：先别放锁，pageshow 再核对
      release();
    });
    window.addEventListener('pageshow', (e) => {
      if (!e || !e.persisted || role === 'lost') return;
      const lock = readLock();
      if (lock && lock.id !== id) { demote(); return; }
      if (role === 'owner') {
        writeLock();
        if (!beatTimer) beatTimer = setInterval(writeLock, HEARTBEAT_MS);
      }
    });
    // 切后台时计时器会被节流，回到前台立刻补一次，别让锁看着像过期；
    // 手机上一个标签冻在后台时心跳是停的，可能被别的页面接管——回来先核对锁还是不是自己的。
    window.addEventListener('visibilitychange', () => {
      if (role !== 'owner') return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { writeLock(); return; }
      const lock = readLock();
      if (lock && lock.id !== id && now() - lock.ts < FRESH_MS) demote();
      else writeLock();
    });
  }

  (async () => {
    const ok = await probe();
    if (ok) becomeOwner();
    else becomeWaiting();
  })();

  return {
    id,
    ready,
    get role() { return role; },
    isLost: () => role === 'lost',
    onLost: (fn) => { if (typeof fn === 'function') lostCbs.push(fn); },
    release,
  };
}
