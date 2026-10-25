/* 节奏豆豆 · 游戏编排：关卡 / 时钟 / 卡点动作 / 判定 / 输入
   核心原则：判定只认 AudioContext 的时间轴，掉帧不掉判定；
   动作在拍点前「预备」，玩家按准才「完成」，按歪就「落空」。
*/
(function () {
  'use strict';

  const Core = window.RhythmCore;
  const Music = window.Music;
  if (!Core || !Music) { console.error('rhythm: 模块没加载'); return; }

  const W = 720;
  const H = 1600;
  const LANE_Y = 1252;
  const HIT_X = 132;
  const SPEED = 360;              // 音符横向速度：放慢，让稀疏段也提前 1.6 秒看到
  const BTN_Y = 1430;             // 节奏按钮圆心
  const BTN_R = 98;
  const BTN_LABEL = { clap: '拍', nod: '点', jump: '跳', hit: '敲' };
  const OFFSET_KEY = 'rhythm-offset';
  const LEGACY_OFFSET_KEY = 'doudou-rhythm-offset';
  const BEST_PREFIX = 'rhythm-best-';
  const NOTES_KEY = 'rhythm-show-notes';
  const CALIB_BEATS = 12;
  const CALIB_SPB = 60 / 120;
  const GRADE_RANK = { D: 0, C: 1, B: 2, A: 3, S: 4 };

  const canvas = document.getElementById('cv');
  const ctx = canvas.getContext('2d');
  const dom = {
    home: document.getElementById('home'),
    calib: document.getElementById('calib'),
    result: document.getElementById('result'),
    levelList: document.getElementById('levelList'),
    calibBtn: document.getElementById('calibBtn'),
    notesToggle: document.getElementById('notesToggle'),
    calibCancel: document.getElementById('calibCancel'),
    calibNum: document.getElementById('calibNum'),
    offsetInfo: document.getElementById('offsetInfo'),
    audioWarn: document.getElementById('audioWarn'),
    againBtn: document.getElementById('againBtn'),
    nextBtn: document.getElementById('nextBtn'),
    homeBtn: document.getElementById('homeBtn'),
    gradeKicker: document.getElementById('gradeKicker'),
    grade: document.getElementById('grade'),
    resultSub: document.getElementById('resultSub'),
  };

  const audio = Music.create();
  const testMode = /[?&]test=1/.test(location.search);

  const G = {
    state: 'home',
    level: 0,
    lv: Core.levelAt(0),
    spb: 0.5,
    beats: 60,
    total: 30,
    chart: [],
    notes: [],
    results: [],
    startT: 0,
    latency: 0,
    offset: 0,
    combo: 0,
    maxCombo: 0,
    lastHit: null,
    hitFlash: 0,
    press: 0,
    pressAt: 0,
    showNotes: false,
    lastBar: -1,
    sectionHint: null,
    pose: { raise: 0, strike: 0, whiff: 0, scale: 1, judge: null },
    tapCount: 0,
    result: null,
    calib: null,
  };

  /* ---------------- 时钟 ---------------- */

  function ctxNow() {
    return audio.ctx ? audio.ctx.currentTime : performance.now() / 1000;
  }

  function heard() {
    return ctxNow() - G.latency;
  }

  function songT() {
    return heard() - G.startT;
  }

  function eventAudioTime(ev) {
    if (!audio.ctx) return performance.now() / 1000;
    const now = performance.now();
    let ts = ev && Number.isFinite(ev.timeStamp) ? ev.timeStamp : now;
    if (Math.abs(ts - now) > 1000) ts = now;
    return audio.ctx.currentTime + (ts - now) / 1000;
  }

  /* ---------------- 存档 ---------------- */

  function loadOffset() {
    try {
      let raw = localStorage.getItem(OFFSET_KEY);
      if (raw === null) {
        raw = localStorage.getItem(LEGACY_OFFSET_KEY);
        if (raw !== null) localStorage.setItem(OFFSET_KEY, raw);
      }
      const v = parseFloat(raw);
      return Number.isFinite(v) ? Math.max(-200, Math.min(200, v)) : 0;
    } catch (e) { return 0; }
  }

  function saveOffset(v) {
    try { localStorage.setItem(OFFSET_KEY, String(v)); } catch (e) { /* 忽略 */ }
  }

  function refreshOffsetInfo() {
    dom.offsetInfo.textContent = `延迟补偿：${G.offset} ms`;
  }

  function refreshNotesToggle() {
    dom.notesToggle.textContent = `音符提示：${G.showNotes ? '开' : '关'}`;
  }

  function bestKey(id) { return BEST_PREFIX + id; }

  function loadBest(id) {
    try { return localStorage.getItem(bestKey(id)); } catch (e) { return null; }
  }

  function saveBest(id, grade) {
    try {
      const old = localStorage.getItem(bestKey(id));
      if (!old || GRADE_RANK[grade] > GRADE_RANK[old]) {
        localStorage.setItem(bestKey(id), grade);
      }
    } catch (e) { /* 忽略 */ }
  }

  function loadShowNotes() {
    try {
      const v = localStorage.getItem(NOTES_KEY);
      return v === null ? true : v === '1';   // 默认开着，先让人能玩
    } catch (e) { return true; }
  }

  function saveShowNotes(v) {
    try { localStorage.setItem(NOTES_KEY, v ? '1' : '0'); } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 关卡 ---------------- */

  function setupLevel(i) {
    G.level = Math.max(0, Math.min(Core.LEVELS.length - 1, i | 0));
    G.lv = Core.levelAt(G.level);
    G.spb = Core.spbOf(G.lv);
    G.beats = Core.beatsOf(G.lv);
    G.total = Core.totalOf(G.lv);
    G.chart = Core.buildChart(G.level);
  }

  function renderLevels() {
    const MODE = { echo: '模仿', beat: '卡点', rush: '连打' };
    dom.levelList.innerHTML = Core.LEVELS.map((lv, i) => {
      const best = loadBest(lv.id);
      const stars = '★'.repeat(lv.diff) + '☆'.repeat(3 - lv.diff);
      const mode = MODE[lv.mode] || '';
      return `<button class="level" data-lv="${i}" type="button">
        <b>${i + 1}</b>
        <span><em>${lv.name}</em><i>${mode} · ${stars}</i></span>
        <u>${best || ''}</u>
      </button>`;
    }).join('');
    dom.levelList.querySelectorAll('.level').forEach((btn) => {
      btn.addEventListener('click', () => startGame(+btn.dataset.lv));
    });
  }

  /* ---------------- 状态 ---------------- */

  function showScreen(name) {
    dom.home.hidden = name !== 'home';
    dom.calib.hidden = name !== 'calib';
    dom.result.hidden = name !== 'result';
  }

  function startGame(i) {
    setupLevel(i == null ? G.level : i);
    audio.unlock().then((ok) => {
      audio.stop();
      G.latency = audio.latency();
      G.offset = loadOffset();
      G.chart = Core.buildChart(G.level);
      G.notes = G.chart.map((n) => Object.assign({}, n, { judged: null, dt: 0 }));
      G.results = [];
      G.combo = 0;
      G.maxCombo = 0;
      G.lastHit = null;
      G.hitFlash = 0;
      G.pose = { raise: 0, strike: 0, whiff: 0, scale: 1, judge: null };
      G.tapCount = 0;
      G.result = null;
      G.lastBar = -1;
      G.sectionHint = null;
      G.startT = ctxNow() + 2.4;
      const endT = G.startT + G.total;
      audio.playTrack(audio.buildTrack(G.startT, {
        bpm: G.lv.bpm,
        bars: G.lv.bars,
        music: G.lv.music,
        notes: G.chart,
        rollBar: G.lv.rollBar,
      }), endT);
      G.state = 'play';
      showScreen(null);
      dom.audioWarn.hidden = !!ok;
    });
  }

  function finish() {
    G.state = 'result';
    audio.stop();
    const t = Core.tally(G.results);
    G.result = t;
    saveBest(G.lv.id, t.grade);

    dom.gradeKicker.textContent = `第 ${G.level + 1} 关 · ${G.lv.name}`;
    dom.grade.textContent = t.grade;
    dom.grade.className = 'grade' + (t.grade === 'C' ? ' c' : t.grade === 'D' ? ' d' : '');
    dom.resultSub.innerHTML =
      `完美 <b>${t.perfect}</b> · 不错 <b>${t.good}</b> · 失误 <b>${t.miss}</b> · 漏拍 <b>${t.none}</b><br>` +
      `最大连击 <b>${t.maxCombo}</b> · 准确率 <b>${Math.round(t.acc * 100)}%</b>`;
    dom.nextBtn.textContent = G.level < Core.LEVELS.length - 1 ? '下一关' : '从第一关再来';
    showScreen('result');
    renderLevels();
  }

  /* ---------------- 校准 ---------------- */

  function startCalib() {
    audio.unlock().then((ok) => {
      audio.stop();
      G.latency = audio.latency();
      const startT = ctxNow() + 1.2;
      G.startT = startT;
      G.calib = { startT, map: new Map(), done: false };
      const ev = [];
      for (let i = 0; i < CALIB_BEATS; i++) {
        ev.push({ t: startT + i * CALIB_SPB, fn: 'click', accent: i % 4 === 0 });
      }
      audio.playTrack(ev, startT + CALIB_BEATS * CALIB_SPB);
      G.state = 'calib';
      G.results = [];
      showScreen('calib');
      updateCalibUi();
      dom.audioWarn.hidden = !!ok;
    });
  }

  function updateCalibUi() {
    const n = G.calib ? G.calib.map.size : 0;
    dom.calibNum.textContent = String(n);
    dom.calibNum.classList.toggle('done', n >= CALIB_BEATS);
  }

  function calibTap(ev) {
    const c = G.calib;
    if (!c || c.done) return;
    const t = eventAudioTime(ev) - G.latency - c.startT;
    const beat = Math.round(t / CALIB_SPB);
    if (beat < 0 || beat >= CALIB_BEATS) return;
    if (c.map.has(beat)) return;
    const dt = (t - beat * CALIB_SPB) * 1000;
    if (Math.abs(dt) > 280) return;
    c.map.set(beat, dt);
    updateCalibUi();
    audio.clap(0.18);
    if (c.map.size >= CALIB_BEATS) finishCalib();
  }

  function finishCalib() {
    const c = G.calib;
    if (!c || c.done) return;
    c.done = true;
    const ordered = [...c.map.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const off = ordered.length >= 3 ? Core.calibrate(ordered) : 0;
    G.offset = off;
    saveOffset(off);
    audio.stop();
    G.calib = null;
    G.state = 'home';
    showScreen('home');
    refreshOffsetInfo();
  }

  function cancelCalib() {
    audio.stop();
    G.calib = null;
    G.state = 'home';
    showScreen('home');
    refreshOffsetInfo();
  }

  /* ---------------- 判定 ---------------- */

  function applyJudge(kind, dt) {
    if (kind === 'perfect' || kind === 'good') {
      G.combo++;
      if (G.combo > G.maxCombo) G.maxCombo = G.combo;
    } else {
      G.combo = 0;
    }
    G.lastHit = { kind, dt: Math.round(dt), age: 0 };
    G.hitFlash = 1;
    G.pressAt = performance.now();
    audio.judgeSfx(kind);
    audio.clap(kind === 'perfect' ? 0.34 : kind === 'miss' ? 0.16 : 0.27);
    // 手机震动（iOS Safari 不支持，静默跳过）
    if ((kind === 'perfect' || kind === 'good') && navigator.vibrate) {
      try { navigator.vibrate(kind === 'perfect' ? 14 : 9); } catch (e) { /* 忽略 */ }
    }
  }

  function onTap(ev) {
    if (G.state === 'calib') { calibTap(ev); return; }
    if (G.state !== 'play') return;
    G.tapCount++;
    G.pressAt = performance.now();

    const t = eventAudioTime(ev) - G.latency - G.offset / 1000 - G.startT;
    let best = null;
    let bestD = Infinity;
    for (const n of G.notes) {
      if (n.judged || n.demo) continue;
      const d = (t - n.t) * 1000;
      if (Math.abs(d) < Math.abs(bestD)) { bestD = d; best = n; }
    }
    if (!best) return;
    const kind = Core.judge(bestD);
    if (kind === 'far') return;
    best.judged = kind;
    best.dt = bestD;
    G.results.push(kind);
    applyJudge(kind, bestD);
  }

  function reapMissed(t) {
    for (const n of G.notes) {
      if (n.judged || n.demo) continue;
      // 多留 80ms 余量：主线程卡一帧时，输入事件可能晚到，别急着判漏
      if ((t - n.t) * 1000 > Core.WIN.miss + 80) {
        n.judged = 'none';
        G.results.push('none');
        G.combo = 0;
        G.lastHit = { kind: 'none', dt: 0, age: 0 };
      }
    }
  }

  /* ---------------- 动作状态 ---------------- */

  // 拍点前 0.24 秒举起；按中了 70ms 内完成动作；没按就落空
  function updatePose() {
    if (G.poseHold) return;   // 截图/调试用，正常流程永远为 false
    const t = songT();

    // 前奏段：豆豆按拍点自己拍，给玩家看示范
    // 节奏必须和后面第一段 play 一致（都是每 2 拍），不能前奏教一套、正片换一套
    const demo = G.lv.demoBars * 4 * G.spb;
    if (t < demo) {
      const period = G.spb * 2;
      const ph = ((t / period) % 1 + 1) % 1;
      let raise = 0;
      let strike = 0;
      if (ph >= 0.7) {
        raise = (ph - 0.7) / 0.3;
      } else if (ph < 0.12) {
        raise = 1;
        strike = ph / 0.12;
      } else if (ph < 0.6) {
        const k = (ph - 0.12) / 0.48;
        raise = 1 - k;
        strike = 1 - k;
      }
      G.pose.raise = raise;
      G.pose.strike = strike;
      G.pose.whiff = 0;
      G.pose.scale = 1;
      G.pose.judge = strike > 0.3 ? 'perfect' : null;
      return;
    }

    // 正式段：动作跟着拍点自己走，玩家在同一个瞬间按
    let prev = null;
    let next = null;
    for (const n of G.notes) {
      if (n.t <= t) prev = n;
      else if (!next) next = n;
    }

    let raise = 0;
    let strike = 0;
    if (prev && t - prev.t < 0.5) {
      const age = t - prev.t;
      if (age < 0.09) {
        strike = Math.pow(age / 0.09, 0.7);   // 合拢要快
      } else if (age < 0.3) {
        strike = 1;                            // 拍中后停住，让玩家看清
      } else {
        strike = Math.max(0, 1 - (age - 0.3) / 0.2);  // 再分开
      }
    } else if (next && next.t - t < 0.45) {
      const raw = 1 - (next.t - t) / 0.45;
      raise = 1 - (1 - raw) * (1 - raw);      // 张开先快后慢
    }

    // 连着打的时候动作收小，不然快速段会抖成鬼畜
    let scale = 1;
    if (prev && next && next.t - prev.t < 0.34) scale = 0.6;

    G.pose.raise = raise;
    G.pose.strike = strike;
    G.pose.whiff = 0;
    G.pose.scale = scale;
    G.pose.judge = (G.lastHit && G.lastHit.age < 0.35) ? G.lastHit.kind : null;
  }

  /* ---------------- 更新 ---------------- */

  function update(dt) {
    G.hitFlash = Math.max(0, G.hitFlash - dt * 3.4);
    // 按钮回弹按真实时间算，不依赖帧率
    G.press = G.pressAt ? Math.max(0, 1 - (performance.now() - G.pressAt) / 220) : 0;
    if (G.lastHit) {
      G.lastHit.age += dt;
      if (G.lastHit.age > 0.6) G.lastHit = null;
    }

    if (G.state === 'play') {
      const t = songT();
      reapMissed(t);
      updatePose();
      updateSection(t, dt);
      if (t >= G.total + 0.5) finish();
    } else if (G.state === 'calib') {
      const c = G.calib;
      if (!c || c.done) return;
      const t = ctxNow() - G.latency - c.startT;
      if (t > CALIB_BEATS * CALIB_SPB + 0.3) finishCalib();
    }
  }

  // 示范段 / 跟做段切换时给一句提示
  function updateSection(t, dt) {
    const bar = Math.floor(t / (4 * G.spb));
    if (bar === G.lastBar) {
      if (G.sectionHint) {
        G.sectionHint.age += dt;
        if (G.sectionHint.age > 1.6) G.sectionHint = null;
      }
      // 示范段最后一小节：临近结尾先喊一声「该你了」，别等拍子到了才说
      if (!G.sectionHint && bar >= 0) {
        const nb = bar + 1;
        if (Core.isDemoBar(G.lv, bar) && !Core.isDemoBar(G.lv, nb)) {
          const barEnd = (bar + 1) * 4 * G.spb;
          if (barEnd - t < 1.2) G.sectionHint = { text: '该你了', age: 0 };
        }
      }
      return;
    }
    G.lastBar = bar;
    if (bar < 0) return;
    const demo = Core.isDemoBar(G.lv, bar);
    const prev = Core.isDemoBar(G.lv, bar - 1);
    if (demo && !prev) G.sectionHint = { text: '看豆豆拍', age: 0 };
  }

  /* ---------------- 绘制 ---------------- */

  let scaleX = 1;
  let scaleY = 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    scaleX = canvas.width / W;
    scaleY = canvas.height / H;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (w <= 0.5 || h <= 0.5) return;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function draw() {
    drawBackdrop();

    if (G.state === 'calib') {
      drawCalibGlow();
    } else if (G.state === 'home' || G.state === 'result') {
      drawDecor();
    } else {
      drawActor();
      drawLane();
      drawBeats();
      drawNotes();
      drawRhythmButton();
      drawIntroHint();
      drawSectionHint();
      drawRushHint();
      drawJudgeText();
      drawCombo();
    }

    if (G.state === 'play' || G.state === 'calib') drawHud();
  }

  function drawBackdrop() {
    const th = G.lv.theme;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky);
    g.addColorStop(1, '#05070c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const s = ctx.createRadialGradient(360, 580, 30, 360, 580, 560);
    s.addColorStop(0, th.glow);
    s.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, W, H);
  }

  function drawDecor() {
    const t = performance.now() / 1000;
    const th = G.lv.theme;
    for (let i = 0; i < 8; i++) {
      const x = 70 + ((i * 197) % 580);
      const y = 260 + ((i * 331) % 1160) + Math.sin(t * 0.6 + i * 1.7) * 20;
      const r = 9 + (i % 3) * 6;
      ctx.globalAlpha = 0.16 + (i % 3) * 0.06;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.84, 0, 0, Math.PI * 2);
      ctx.fillStyle = th.accent;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 角色 ---------- */

  function drawBodyShape(x, y, sx, sy, shadowY, glow, legsFn) {
    const ground = shadowY == null ? y + 206 * sy : shadowY;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(x, ground, 146 * sx, 19, 0, 0, Math.PI * 2);
    ctx.fill();

    if (legsFn) legsFn();

    const bg = ctx.createRadialGradient(x - 46, y - 74, 18, x, y, 210 * sy);
    bg.addColorStop(0, '#fff8ea');
    bg.addColorStop(0.5, '#ffdda9');
    bg.addColorStop(1, '#e6a469');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(x, y, 166 * sx, 184 * sy, 0, 0, Math.PI * 2);
    ctx.fill();

    // 拍点前后整个身体发光：抬手越到位，轮廓越亮
    const g = glow || 0;
    if (g > 0.02) {
      ctx.strokeStyle = `rgba(255,226,150,${0.3 + g * 0.7})`;
      ctx.lineWidth = 6 + g * 12;
    } else {
      ctx.strokeStyle = 'rgba(88,48,18,0.5)';
      ctx.lineWidth = 6;
    }
    ctx.stroke();

    // 拍下的瞬间闪一层白
    if (g > 0.6) {
      ctx.fillStyle = `rgba(255,255,255,${(g - 0.6) * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 166 * sx, 184 * sy, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 两条短腿：bend 0=伸直，1=蹲；spread 让两脚分开
  function drawLegs(x, y, bend, spread) {
    const hipY = y + 140;
    const footY = y + 236 + bend * 18;
    for (const side of [-1, 1]) {
      const hipX = x + side * 52;
      const kneeX = hipX + side * (8 + bend * 28);
      const kneeY = hipY + 40 - bend * 8;
      const footX = x + side * (52 + spread);
      ctx.strokeStyle = '#eeb184';
      ctx.lineWidth = 24;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(footX, footY + 4, 30, 16, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f2b98c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,50,20,0.4)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  function drawFace(x, y, pose) {
    const mood = pose.judge;
    const happy = mood === 'perfect' || mood === 'good';
    const sad = mood === 'miss' || mood === 'none';
    const ex = 64;
    const ey = y - 24;

    if (happy) {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x + side * ex, ey + 6, 20, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
      }
    } else if (sad) {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        const cx = x + side * ex;
        ctx.beginPath();
        ctx.moveTo(cx - 16, ey - 14); ctx.lineTo(cx + 16, ey + 14);
        ctx.moveTo(cx + 16, ey - 14); ctx.lineTo(cx - 16, ey + 14);
        ctx.stroke();
      }
    } else {
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#2f1d0d';
        ctx.beginPath();
        ctx.ellipse(x + side * ex, ey, 15, 19, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(x + side * ex - 5, ey - 7, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = 'rgba(255,140,150,0.32)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + side * 112, y + 44, 26, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#3a2412';
    if (happy) {
      ctx.beginPath();
      ctx.arc(x, y + 56, 30, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.fill();
    } else if (sad) {
      ctx.beginPath();
      ctx.ellipse(x, y + 66, 16, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y + 48, 22, 0.18 * Math.PI, 0.82 * Math.PI);
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#3a2412';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (sad) {
      ctx.fillStyle = 'rgba(150,210,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(x + 176, y - 120, 12, 18, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSpark(x, y, k, s) {
    if (k < 0.35) return;
    const t = (k - 0.35) / 0.65;
    const sc = s || 1;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineCap = 'round';
    ctx.lineWidth = 7 * sc;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t * 0.7;
      const r1 = (42 + t * 70) * sc;
      const r2 = r1 + 30 * (1 - t) * sc;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawDust(x, y) {
    ctx.fillStyle = 'rgba(255,232,190,0.42)';
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + i * Math.PI / 4;
      const r = 76 + (i % 3) * 18;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r, y - 18 + Math.sin(a) * 8, 10 - i * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawActor() {
    const b = G.pose;
    const pose = {
      raise: b.raise * b.scale,
      strike: b.strike * b.scale,
      whiff: b.whiff,
      judge: b.judge,
    };
    drawStick(pose, G.lv.action);
    // 跳绳关：绳子绕人转一圈，脚底就是拍点
    if (G.lv.action === 'jump' && G.state === 'play') {
      const ph = ((songT() / G.spb) % 1 + 1) % 1;
      drawRope(ph);
    }
    // 接球关：球从天上掉到手里，球到手就是拍点
    if (G.lv.action === 'catch' && G.state === 'play') {
      drawCatchBall();
    }
  }

  function drawCatchBall() {
    const t = songT();
    let next = null;
    for (const n of G.notes) {
      if (!n.judged && !n.demo && n.t > t - 0.12) { next = n; break; }
    }
    if (!next) return;
    const d = next.t - t;
    if (d > 1.5 || d < -0.2) return;

    const handY = 716 - 118;
    const y = handY - Math.max(0, d) * 430;
    const r = 24 + Math.max(0, d) * 12;

    ctx.beginPath();
    ctx.arc(360, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ff9a6b';
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,50,20,0.5)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(360 - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRope(phase) {
    const cx = 360;
    const cy = 690;
    const tilt = Math.sin(phase * Math.PI * 2) * 0.22;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 132, 232, tilt, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(214,172,112,0.65)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  function drawLimb(x1, y1, x2, y2, w) {
    ctx.strokeStyle = '#ffd9a8';
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // 火柴人：圆头 + 线身体 + 四肢。动作靠肢体角度表达，不再靠圆球缩放
  function drawStick(pose, action) {
    const x = 360;
    const baseY = 716;
    const groundY = 918;

    let lift = 0, crouch = 0, headDrop = 0, tilt = 0, sx = 1, sy = 1, dx = 0;
    if (action === 'jump') {
      lift = pose.strike * 104;
      crouch = pose.raise * 28 * (1 - pose.strike);
    } else if (action === 'nod') {
      headDrop = pose.strike * 20;
      crouch = pose.raise * 10;
    } else if (action === 'spin') {
      sx = Math.cos(pose.strike * Math.PI);
    } else if (action === 'lean') {
      tilt = pose.raise * 0.3 - pose.strike * 0.3;
    } else if (action === 'pulse') {
      const s = 1 + pose.strike * 0.2;
      sx = s; sy = s;
    } else if (action === 'shake') {
      dx = Math.sin(pose.strike * Math.PI * 8) * 26 * pose.strike;
    }

    const y = baseY + crouch - lift;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, groundY, 110, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x + dx, y);
    ctx.rotate(tilt);
    ctx.scale(Math.abs(sx) < 0.02 ? 0.02 * Math.sign(sx || 1) : sx, sy);
    ctx.translate(-x, -y);

    const headR = 44;
    const headY = y - 168 + headDrop;
    const neckY = headY + headR;
    const hipY = y + 20;
    const footY = y + 196;

    // 腿：蹲下时膝盖向外弯
    const legBend = pose.raise * (1 - pose.strike) * 30;
    drawLimb(x - 12, hipY, x - 46 - legBend, footY, 16);
    drawLimb(x + 12, hipY, x + 46 + legBend, footY, 16);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + side * (46 + legBend), footY + 6, 26, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd9a8';
      ctx.fill();
    }

    // 身体
    drawLimb(x, neckY, x, hipY, 20);

    // 手臂
    const shoulderY = neckY + 16;
    let handLX, handLY, handRX, handRY;
    if (action === 'clap') {
      handLX = x - 132 + pose.strike * 112 - pose.raise * 8;
      handLY = y - 36 - pose.raise * 44;
      handRX = x + 132 - pose.strike * 112 + pose.raise * 8;
      handRY = handLY;
    } else if (action === 'hit') {
      handLX = x - 118;
      handLY = y - 36;
      handRX = x + 118 + pose.strike * 46;
      handRY = y - 36 - pose.strike * 36;
    } else if (action === 'jump') {
      handLX = x - 110 - pose.raise * 20;
      handLY = y - 30 - pose.strike * 30;
      handRX = x + 110 + pose.raise * 20;
      handRY = y - 30 - pose.strike * 30;
    } else if (action === 'catch') {
      handLX = x - 64 + pose.strike * 34;
      handLY = y - 118 - pose.raise * 16;
      handRX = x + 64 - pose.strike * 34;
      handRY = handLY;
    } else {
      handLX = x - 110;
      handLY = y - 30 - pose.raise * 30;
      handRX = x + 110;
      handRY = y - 30 - pose.raise * 30;
    }
    drawLimb(x, shoulderY, handLX, handLY, 14);
    drawLimb(x, shoulderY, handRX, handRY, 14);
    for (const [hx, hy] of [[handLX, handLY], [handRX, handRY]]) {
      ctx.beginPath();
      ctx.arc(hx, hy, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd9a8';
      ctx.fill();
    }

    // 头
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe8c8';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,20,0.55)';
    ctx.lineWidth = 5;
    ctx.stroke();

    // 脸
    const mood = pose.judge;
    const happy = mood === 'perfect' || mood === 'good';
    const sad = mood === 'miss' || mood === 'none';
    const ex = 16;
    const ey = headY - 4;
    if (happy) {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x + side * ex, ey + 2, 7, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    } else if (sad) {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 4;
        const cx = x + side * ex;
        ctx.beginPath();
        ctx.moveTo(cx - 6, ey - 6); ctx.lineTo(cx + 6, ey + 6);
        ctx.moveTo(cx + 6, ey - 6); ctx.lineTo(cx - 6, ey + 6);
        ctx.stroke();
      }
    } else {
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#2f1d0d';
        ctx.beginPath();
        ctx.arc(x + side * ex, ey, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#3a2412';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (happy) ctx.arc(x, headY + 14, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (sad) ctx.arc(x, headY + 24, 9, 1.1 * Math.PI, 1.9 * Math.PI);
    else ctx.arc(x, headY + 12, 10, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    ctx.restore();

    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (pose.strike > 0.5) drawSpark(x, y - 60, pose.strike, good ? 1.35 : 1);
  }

  function drawClapActor(pose) {
    const y = 716;
    drawBodyShape(360, y, 1 + pose.strike * 0.03, 1 - pose.strike * 0.05, y + 250, pose.raise + pose.strike, () => drawLegs(360, y, 0, 0));

    // 水平合拢：手在同一高度从两侧拍到中间，这才是拍手
    const spread = 150 + pose.raise * 90 - pose.strike * 120;
    const hy = y + 120;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = '#f2b98c';
      ctx.lineWidth = 24;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(360 + side * 140, y + 92);
      ctx.lineTo(360 + side * spread, hy);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(360 + side * spread, hy, 33, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcf9a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,50,20,0.45)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    drawFace(360, y, pose);
    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (pose.strike > 0.5) drawSpark(360, hy, pose.strike, good ? 1.35 : 1);
  }

  function drawNodActor(pose) {
    const lift = pose.raise * 18 * (1 - pose.strike);
    const y = 716 - lift + pose.strike * 22;
    const tilt = -pose.raise * 0.04 + pose.strike * 0.16;
    const squash = 1 + pose.raise * 0.05 * (1 - pose.strike) - pose.strike * 0.09;

    ctx.save();
    ctx.translate(360, y + 172);
    ctx.rotate(tilt);
    ctx.translate(-360, -(y + 172));

    drawBodyShape(360, y, 1, squash, y + 250, pose.raise + pose.strike, () => drawLegs(360, y, pose.raise, 0));

    for (const side of [-1, 1]) {
      const hx = 360 + side * 172;
      const hy = y + 66 - pose.raise * 96 + pose.strike * 26;
      ctx.beginPath();
      ctx.arc(hx, hy, 30, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcf9a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,50,20,0.45)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    drawFace(360, y, pose);
    ctx.restore();

    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (pose.strike > 0.5) drawSpark(360, y + 120, pose.strike, good ? 1.35 : 1);
  }

  function drawJumpActor(pose) {
    const crouch = pose.raise * 24 * (1 - pose.strike);
    const y = 716 + crouch - pose.strike * 108;
    const squash = 1 - pose.raise * 0.07 * (1 - pose.strike);
    const stretch = 1 + pose.strike * 0.06;

    drawBodyShape(360, y, 1 / stretch, squash * stretch, 902, pose.raise + pose.strike, () => drawLegs(360, y, pose.raise * (1 - pose.strike), 0));

    for (const side of [-1, 1]) {
      const hx = 360 + side * (190 + pose.strike * 18);
      const hy = y + 36;
      ctx.beginPath();
      ctx.arc(hx, hy, 30, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcf9a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,50,20,0.45)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    drawFace(360, y, pose);
    if (pose.strike > 0.85) drawDust(360, 902);
    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (pose.strike > 0.4) drawSpark(360, y + 170, pose.strike, good ? 1.35 : 1);
  }

  function drawHitActor(pose) {
    const y = 716;
    const dx = 360 + 180;
    const dy = y + 132;

    // 鼓
    const good = pose.judge === 'perfect' || pose.judge === 'good';
    ctx.fillStyle = '#8e2b28';
    ctx.beginPath();
    ctx.ellipse(dx, dy, 92, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f0d3a2';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = pose.strike > 0.5 && good ? '#fff4d8' : '#f0d3a2';
    ctx.beginPath();
    ctx.ellipse(dx, dy - 12, 80, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    drawBodyShape(360, y, 1, 1, y + 250, pose.raise + pose.strike, () => drawLegs(360, y, 0, 0));

    // 鼓棒：拍点前举手把棒子举高，拍点那一下落手砸下
    const handY = y + 34 - pose.raise * 110 * (1 - pose.strike);
    const ang = -0.35 + pose.strike * 2.7;
    ctx.save();
    ctx.translate(360 + 148, handY);
    ctx.rotate(ang);
    ctx.strokeStyle = '#d9a35f';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -170);
    ctx.stroke();
    ctx.fillStyle = '#ffcf9a';
    ctx.beginPath();
    ctx.arc(0, -170, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawFace(360, y, pose);
    if (pose.strike > 0.5) drawSpark(dx, dy - 20, pose.strike, good ? 1.35 : 1);
  }

  /* ---------- HUD / 跑道 ---------- */

  /* ---------- 进阶动作（6-10 关） ---------- */

  // 转圈：横向翻转 + 缩小，像在转
  function drawSpinActor(pose) {
    const y = 716;
    const sx = Math.cos(pose.strike * Math.PI);
    const s = 1 - Math.abs(Math.sin(pose.strike * Math.PI)) * 0.28;
    ctx.save();
    ctx.translate(360, y);
    ctx.scale(Math.abs(sx) < 0.02 ? 0.02 * Math.sign(sx || 1) : sx * s, s);
    ctx.translate(-360, -y);
    drawBodyShape(360, y, 1, 1, y + 250, pose.raise + pose.strike, () => drawLegs(360, y, 0, 0));
    drawFace(360, y, pose);
    ctx.restore();
    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (pose.strike > 0.5) drawSpark(360, y, pose.strike, good ? 1.35 : 1);
  }

  // 摇摆：左右倾倒
  function drawLeanActor(pose) {
    const y = 716;
    const tilt = pose.raise * 0.3 - pose.strike * 0.3;
    ctx.save();
    ctx.translate(360, y + 180);
    ctx.rotate(tilt);
    ctx.translate(-360, -(y + 180));
    drawBodyShape(360, y, 1, 1, y + 250, pose.raise + pose.strike, () => drawLegs(360, y, 0, 0));
    drawFace(360, y, pose);
    ctx.restore();
    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (pose.strike > 0.5) drawSpark(360, y, pose.strike, good ? 1.35 : 1);
  }

  // 弹跳：整体缩放
  function drawPulseActor(pose) {
    const y = 716;
    const s = 1 + pose.strike * 0.22 - pose.raise * 0.08;
    ctx.save();
    ctx.translate(360, y);
    ctx.scale(s, s);
    ctx.translate(-360, -y);
    drawBodyShape(360, y, 1, 1, y + 250, pose.raise + pose.strike, () => drawLegs(360, y, 0, 0));
    drawFace(360, y, pose);
    ctx.restore();
    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (pose.strike > 0.5) drawSpark(360, y, pose.strike, good ? 1.35 : 1);
  }

  // 抖动：拍点瞬间左右抖
  function drawShakeActor(pose) {
    const y = 716;
    const dx = Math.sin(pose.strike * Math.PI * 8) * 30 * pose.strike;
    ctx.save();
    ctx.translate(dx, 0);
    drawBodyShape(360, y, 1, 1, y + 250, pose.raise + pose.strike, () => drawLegs(360, y, 0, 0));
    drawFace(360, y, pose);
    ctx.restore();
    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (pose.strike > 0.5) drawSpark(360 + dx, y, pose.strike, good ? 1.35 : 1);
  }

  function drawHud() {
    const total = G.total;
    let p = 0;
    if (G.state === 'play') p = Math.max(0, Math.min(1, songT() / total));
    else if (G.state === 'calib' && G.calib) p = G.calib.map.size / CALIB_BEATS;

    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    roundRect(80, 158, 560, 8, 4);
    ctx.fill();

    ctx.fillStyle = G.lv.theme.accent;
    roundRect(80, 158, 560 * p, 8, 4);
    ctx.fill();
  }

  function drawLane() {
    const accent = G.lv.theme.accent;
    ctx.fillStyle = 'rgba(120,160,230,0.09)';
    roundRect(72, LANE_Y - 46, 576, 92, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,176,220,0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 判定区：贴到线附近时整块亮一点，眼睛不用找
    ctx.fillStyle = `rgba(255,209,102,${0.05 + G.hitFlash * 0.14})`;
    ctx.fillRect(HIT_X - 42, LANE_Y - 46, 84, 92);

    ctx.fillStyle = accent;
    ctx.fillRect(HIT_X - 4, LANE_Y - 46, 8, 92);

    ctx.save();
    ctx.translate(HIT_X, LANE_Y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(255,246,214,0.95)';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();

    if (G.hitFlash > 0) {
      ctx.globalAlpha = G.hitFlash * 0.8;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(HIT_X, LANE_Y, 34 + (1 - G.hitFlash) * 66, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawBeats() {
    const beatNow = G.state === 'play' ? Math.floor(Math.max(0, songT()) / G.spb) : 0;
    const inBar = beatNow % 4;
    for (let i = 0; i < 4; i++) {
      const bx = 240 + i * 80;
      const on = i === inBar;
      ctx.beginPath();
      ctx.arc(bx, 1170, on ? 13 : 8, 0, Math.PI * 2);
      ctx.fillStyle = on ? G.lv.theme.accent : 'rgba(150,176,220,0.26)';
      ctx.fill();
    }
  }

  function drawNotes() {
    if (!G.showNotes) return;
    const t = songT();
    for (const n of G.notes) {
      if (n.judged || n.demo) continue;
      const x = HIT_X + (n.t - t) * SPEED;
      if (x < -110 || x > W + 110) continue;

      const near = Math.abs(x - HIT_X) < 48;
      const grd = ctx.createLinearGradient(x, LANE_Y - 19, x, LANE_Y + 19);
      grd.addColorStop(0, '#fff8d8');
      grd.addColorStop(1, '#ffc94d');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(x, LANE_Y, 24, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = near ? 'rgba(255,248,214,0.95)' : 'rgba(120,70,10,0.55)';
      ctx.lineWidth = near ? 6 : 4;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(x - 7, LANE_Y - 7, 6, 4, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 手机上的节奏按钮：手指有明确落点，按下有反馈
  function drawRhythmButton() {
    const cx = 360;
    const cy = BTN_Y;
    const r = BTN_R;
    const press = G.press;
    const lit = press > 0.15;
    const accent = G.lv.theme.accent;

    // 每拍给一个脉冲环：拍子在哪，手指就能看见
    const beatPh = ((songT() / G.spb) % 1 + 1) % 1;
    const pulse = Math.max(0, 1 - beatPh * 3.2);
    if (pulse > 0) {
      ctx.globalAlpha = pulse * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 30 + (1 - pulse) * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
    ctx.strokeStyle = lit ? accent : 'rgba(150,176,220,0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const g = ctx.createRadialGradient(cx, cy - 30, 8, cx, cy, r * 1.1);
    if (lit) {
      g.addColorStop(0, '#fff6d8');
      g.addColorStop(1, '#ffc94d');
    } else {
      g.addColorStop(0, '#26314a');
      g.addColorStop(1, '#141b29');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 - press * 0.06), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = lit ? 'rgba(255,209,102,0.9)' : 'rgba(150,176,220,0.28)';
    ctx.lineWidth = 3;
    ctx.stroke();

    if (G.hitFlash > 0) {
      ctx.globalAlpha = G.hitFlash * 0.65;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10 + (1 - G.hitFlash) * 56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = lit ? '#3a2412' : '#7f8aa4';
    ctx.font = '900 54px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(BTN_LABEL[G.lv.action] || '按', cx, cy + 2);
    ctx.textBaseline = 'alphabetic';
  }

  function drawIntroHint() {
    if (G.state !== 'play') return;
    const t = songT();
    if (t < -2.6 || t > 2.6) return;

    let txt;
    if (t < 0) txt = '准备好了吗';
    else if (G.lv.mode === 'beat') txt = '跟豆豆一起拍';
    else if (G.lv.mode === 'rush') txt = '跟上节奏';
    else return;   // 模仿关的提示交给 drawSectionHint

    const a = Math.min(1, (t + 2.6) / 0.4, (2.6 - t) / 0.4);
    ctx.globalAlpha = Math.max(0, a) * 0.85;
    ctx.textAlign = 'center';
    ctx.font = '600 40px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(205,220,245,0.9)';
    ctx.fillText(txt, 360, 380);
    ctx.globalAlpha = 1;
  }

  function drawSectionHint() {
    if (G.state !== 'play' || !G.sectionHint) return;
    const h = G.sectionHint;
    const a = Math.max(0, 1 - h.age / 1.6);
    ctx.globalAlpha = a * 0.9;
    ctx.textAlign = 'center';
    ctx.font = '700 44px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = h.text === '该你了' ? G.lv.theme.accent : 'rgba(205,220,245,0.9)';
    ctx.fillText(h.text, 360, 380);
    ctx.globalAlpha = 1;
  }

  function drawRushHint() {
    const lv = G.lv;
    if (!lv.rollBar) return;
    const t = songT();
    const at = lv.rollBar * 4 * G.spb + 3 * G.spb;
    const span = G.spb * 3;
    if (t < at - 0.1 || t > at + span) return;
    const a = Math.min(1, (t - at + 0.1) / 0.15, (at + span - t) / 0.4);
    ctx.globalAlpha = Math.max(0, a);
    ctx.textAlign = 'center';
    ctx.font = '900 58px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = lv.theme.accent;
    ctx.fillText('变快了', 360, 300);
    ctx.globalAlpha = 1;
  }

  function drawJudgeText() {
    const h = G.lastHit;
    if (!h) return;
    const a = Math.max(0, 1 - h.age / 0.6);
    const txt = h.kind === 'perfect' ? '完美'
      : h.kind === 'good' ? '不错'
        : h.kind === 'none' ? '漏了' : '失误';
    const col = h.kind === 'perfect' ? '#ffd166'
      : h.kind === 'good' ? '#8fd0ff' : '#ff7f9c';

    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = '900 64px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = col;
    ctx.fillText(txt, 360, 1062 - (1 - a) * 22);

    if (h.kind === 'perfect' || h.kind === 'good') {
      ctx.font = '700 30px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText(`${h.dt > 0 ? '+' : ''}${h.dt} ms`, 360, 1104);
    }
    ctx.globalAlpha = 1;
  }

  function drawCombo() {
    if (G.combo < 2) return;
    ctx.textAlign = 'center';
    ctx.font = '900 56px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = G.lv.theme.accent;
    ctx.fillText(`${G.combo} 连`, 360, 1128);
  }

  function drawCalibGlow() {
    const c = G.calib;
    if (!c) return;
    const t = ctxNow() - G.latency - c.startT;
    if (t < 0) return;
    const beatPos = t / CALIB_SPB;
    const since = beatPos - Math.floor(beatPos);
    const pulse = Math.max(0, 1 - since * 3.6);
    ctx.beginPath();
    ctx.arc(360, 780, 132 + pulse * 46, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,209,102,${0.18 + pulse * 0.72})`;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(360, 780, 108, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(150,176,220,0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  /* ---------------- 输入 ---------------- */

  function bindInput() {
    if (window.PointerEvent) {
      let pid = null;
      canvas.addEventListener('pointerdown', (e) => {
        if (pid !== null) return;
        pid = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        onTap(e);
      });
      const release = (e) => { if (e.pointerId === pid) pid = null; };
      canvas.addEventListener('pointerup', release);
      canvas.addEventListener('pointercancel', release);
      canvas.addEventListener('lostpointercapture', release);
    } else {
      canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        onTap(e);
      }, { passive: false });
    }

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyF') {
        e.preventDefault();
        onTap(e);
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---------------- 主循环 ---------------- */

  let lastTs = 0;

  function frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    G.offset = loadOffset();
    G.showNotes = loadShowNotes();
    setupLevel(0);
    refreshOffsetInfo();
    refreshNotesToggle();
    renderLevels();

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));

    bindInput();

    dom.againBtn.addEventListener('click', () => startGame(G.level));
    dom.nextBtn.addEventListener('click', () => {
      startGame(G.level < Core.LEVELS.length - 1 ? G.level + 1 : 0);
    });
    dom.homeBtn.addEventListener('click', () => {
      G.state = 'home';
      showScreen('home');
      refreshOffsetInfo();
      renderLevels();
    });
    dom.calibBtn.addEventListener('click', startCalib);
    dom.calibCancel.addEventListener('click', cancelCalib);
    dom.notesToggle.addEventListener('click', () => {
      G.showNotes = !G.showNotes;
      saveShowNotes(G.showNotes);
      refreshNotesToggle();
    });

    document.addEventListener('visibilitychange', () => {
      if (!audio.ctx) return;
      if (G.state !== 'play' && G.state !== 'calib') return;
      if (document.hidden) audio.ctx.suspend().catch(() => {});
      else audio.ctx.resume().catch(() => {});
    });

    requestAnimationFrame(frame);
  }

  init();

  // 测试钩子
  window.__rhythm = {
    G,
    audio,
    state: () => G.state,
    songT,
    start: startGame,
    levels: Core.LEVELS.length,
    testJudge(dtMs) {
      if (G.state !== 'play') return null;
      const n = G.notes.find((x) => !x.judged && !x.demo);
      if (!n) return null;
      const kind = Core.judge(dtMs);
      if (kind === 'far') return 'far';
      n.judged = kind;
      n.dt = dtMs;
      G.results.push(kind);
      applyJudge(kind, dtMs);
      return kind;
    },
    skipTo(beat) {
      G.startT = ctxNow() - G.latency - G.offset / 1000 - beat * G.spb;
    },
  };
  if (testMode) window.__rhythm.testMode = true;
})();
