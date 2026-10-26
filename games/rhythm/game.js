/* 节奏豆豆 · 游戏编排：关卡 / 时钟 / 卡点动作 / 判定 / 输入
   核心原则：判定只认 AudioContext 的时间轴，掉帧不掉判定；
   东西碰上的那一帧再按。身子是侧面，只动做事的那一处。
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
  const BTN_LABEL = {
    lift: '让', disc: '接', kick: '踢', drum: '敲', duck: '躲',
    swat: '拍', high: '接', stone: '踩', sash: '推', bump: '颠', mole: '打',
  };
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
    startBtn: document.getElementById('startBtn'),
    modeOne: document.getElementById('modeOne'),
    modeMix: document.getElementById('modeMix'),
    modeDesc: document.getElementById('modeDesc'),
    quitBtn: document.getElementById('quitBtn'),
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
    pose: { raise: 0, strike: 0, phase: 0, whiff: 0, scale: 1, judge: null },
    trails: [[], []],
    tapCount: 0,
    mix: false,
    mixFrom: 0,
    runResults: [],
    playMode: 'one',
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

  function paintThumb(canvas, lv) {
    const g = canvas.getContext('2d');
    const cw = 168;
    const ch = 112;
    const viewY = 600;
    const viewH = 480;
    canvas.width = cw;
    canvas.height = ch;
    g.fillStyle = '#10151f';
    g.fillRect(0, 0, cw, ch);
    if (!window.SceneDraw || !lv) return;
    g.save();
    g.beginPath();
    g.rect(0, 0, cw, ch);
    g.clip();
    g.scale(cw / 720, ch / viewH);
    g.translate(0, -viewY);
    window.SceneDraw.draw(g, lv, {
      raise: 0,
      strike: 1,
      arrive: { s: 0, show: true, mode: 'tap' },
      groove: { beat: 0, bounce: 0, sway: 0 },
    });
    g.restore();
  }

  function renderLevels() {
    const starsOf = (lv) => '★'.repeat(lv.diff) + '☆'.repeat(3 - lv.diff);
    dom.levelList.innerHTML = Core.LEVELS.map((lv, i) => {
      const best = loadBest(lv.id);
      const on = i === G.level ? ' on' : '';
      return `<button class="level${on}" data-lv="${i}" type="button">
        <canvas class="thumb" width="168" height="112" aria-hidden="true"></canvas>
        <b>${i + 1}</b>
        <em>${lv.name}</em>
        <i>${starsOf(lv)}</i>
        ${best ? `<u>${best}</u>` : ''}
      </button>`;
    }).join('');
    dom.levelList.querySelectorAll('.level').forEach((btn) => {
      paintThumb(btn.querySelector('canvas'), Core.levelAt(+btn.dataset.lv));
      btn.addEventListener('click', () => selectLevel(+btn.dataset.lv));
    });
  }

  function selectLevel(i) {
    setupLevel(i);
    dom.levelList.querySelectorAll('.level').forEach((btn) => {
      btn.classList.toggle('on', +btn.dataset.lv === G.level);
    });
  }

  function setPlayMode(mode) {
    G.playMode = mode === 'mix' ? 'mix' : 'one';
    dom.modeOne.classList.toggle('on', G.playMode === 'one');
    dom.modeMix.classList.toggle('on', G.playMode === 'mix');
    dom.modeDesc.textContent = G.playMode === 'mix'
      ? '从选中的关开始，打完立刻换下一个场景。'
      : '选一关，打完看评价。';
  }

  /* ---------------- 状态 ---------------- */

  function showScreen(name) {
    dom.home.hidden = name !== 'home';
    dom.calib.hidden = name !== 'calib';
    dom.result.hidden = name !== 'result';
    dom.quitBtn.hidden = name !== null;
  }

  function backToPick() {
    audio.stop();
    G.state = 'home';
    showScreen('home');
    refreshOffsetInfo();
    renderLevels();
  }

  function startGame(i, opt) {
    const chain = !!(opt && opt.chain);
    if (!chain) {
      G.mix = G.playMode === 'mix';
      G.runResults = [];
      G.combo = 0;
      G.maxCombo = 0;
      G.tapCount = 0;
    }
    setupLevel(i == null ? G.level : i);
    if (!chain) G.mixFrom = G.level;
    G.chart = Core.buildChart(G.level);
    G.notes = G.chart.map((n) => Object.assign({}, n, { judged: null, dt: 0 }));
    G.results = [];
    G.lastHit = null;
    G.hitFlash = 0;
    G.pose = {
      raise: 0, strike: 0, phase: 0, whiff: 0, scale: 1, judge: null,
      arrive: { s: 1, show: false, mode: 'park' },
    };
    G.trails = [[], []];
    G.result = null;
    G.lastBar = -1;
    G.sectionHint = null;
    G.state = 'cut';
    showScreen(null);
    if (audio.ctx) audio.stop();
    const lead = chain ? 0.45 : 2.4;
    audio.unlock().then((ok) => {
      audio.stop();
      G.latency = audio.latency();
      G.offset = loadOffset();
      G.startT = ctxNow() + lead;
      const endT = G.startT + G.total;
      audio.playTrack(audio.buildTrack(G.startT, {
        bpm: G.lv.bpm,
        bars: G.lv.bars,
        music: G.lv.music,
        notes: G.chart,
        rollBar: G.lv.rollBar,
      }), endT);
      G.state = 'play';
      dom.audioWarn.hidden = !!ok;
    });
  }

  function finish() {
    if (G.state !== 'play') return;
    const sceneResults = G.results.slice();
    saveBest(G.lv.id, Core.tally(sceneResults).grade);
    if (G.mix && G.level < Core.LEVELS.length - 1) {
      G.runResults.push(...sceneResults);
      startGame(G.level + 1, { chain: true });
      return;
    }
    const all = G.mix ? G.runResults.concat(sceneResults) : sceneResults;
    G.state = 'result';
    audio.stop();
    const t = Core.tally(all);
    G.result = t;

    if (G.mix) {
      dom.gradeKicker.textContent = `混合 · 第 ${G.mixFrom + 1}–${G.level + 1} 关`;
      dom.nextBtn.hidden = true;
      dom.againBtn.textContent = '再来一轮';
    } else {
      dom.gradeKicker.textContent = `第 ${G.level + 1} 关 · ${G.lv.name}`;
      dom.nextBtn.hidden = false;
      dom.nextBtn.textContent = G.level < Core.LEVELS.length - 1 ? '下一关' : '从第一关再来';
      dom.againBtn.textContent = '再来一次';
    }
    dom.grade.textContent = t.grade;
    dom.grade.className = 'grade' + (t.grade === 'C' ? ' c' : t.grade === 'D' ? ' d' : '');
    dom.resultSub.innerHTML =
      `完美 <b>${t.perfect}</b> · 不错 <b>${t.good}</b> · 失误 <b>${t.miss}</b> · 漏拍 <b>${t.none}</b><br>` +
      `最大连击 <b>${t.maxCombo}</b> · 准确率 <b>${Math.round(t.acc * 100)}%</b>`;
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

  // 数拍时 B 不进画面。进场长短和快慢跟着这一关的动词，不共用一条曲线。
  // 连着的打打不再飞回去。颠球、翻饼、秋千的两下之间才走完那段弧。
  const ENTER = {
    fall: { win: 0.5, pow: 4 },
    roll: { win: 0.62, pow: 1.4 },
    dart: { win: 0.24, pow: 3 },
    pour: { win: 0.46, pow: 2 },
    snap: { win: 0.2, pow: 3 },
    dip: { win: 0.28, pow: 2 },
    tug: { win: 0.22, pow: 2 },
    drift: { win: 0.7, pow: 1.25 },
    open: { win: 0.48, pow: 1.5 },
    close: { win: 0.45, pow: 1.6 },
    pop: { win: 0.32, pow: 2 },
    arc: { win: 0.36, pow: 3 },
    swing: { win: 0.42, pow: 1.6 },
  };

  function propArrive(t, prevT, nextT) {
    const spb = G.spb || 0.5;
    const leave = 0.12;
    const gap = (nextT != null && prevT != null) ? nextT - prevT : Infinity;
    const enter = (G.lv && G.lv.enter) || 'fall';
    const spec = ENTER[enter] || ENTER.fall;
    if (nextT != null && prevT != null && gap <= spb * 1.05 && t >= prevT && t < nextT) {
      return { s: 0, show: true, mode: 'tap' };
    }
    const across = enter === 'arc' || enter === 'swing';
    if (across && nextT != null && prevT != null && gap > spb * 1.2 && gap <= spb * 3.2 && t >= prevT && t <= nextT) {
      const u = (t - prevT) / gap;
      const s = Math.sin(Math.max(0, Math.min(1, u)) * Math.PI);
      return { s, show: true, mode: enter };
    }
    let approach = spec.win;
    if (Number.isFinite(gap)) approach = Math.min(approach, Math.max(0.16, gap * 0.72));
    if (nextT != null && t >= nextT - approach && t <= nextT + 0.0001) {
      const lin = Math.max(0, Math.min(1, (nextT - t) / approach));
      const p = 1 - lin;
      const s = 1 - Math.pow(p, spec.pow);
      return { s, show: true, mode: 'approach' };
    }
    if (prevT != null && t >= prevT && t < prevT + leave) {
      const lin = Math.max(0, Math.min(1, (t - prevT) / leave));
      const s = 1 - Math.pow(1 - lin, 3);
      return { s, show: true, mode: 'leave' };
    }
    return { s: 1, show: false, mode: 'park' };
  }

  function grooveOf(t) {
    const spb = G.spb || 0.5;
    const beat = t / spb;
    const frac = beat - Math.floor(beat);
    return {
      beat,
      bounce: Math.pow(Math.max(0, 1 - frac), 2.4),
      sway: Math.sin(beat * Math.PI * 2),
    };
  }

  // 手落到点上的那一帧就是拍点。示范音符和玩家音符用同一套。
  function updatePose() {
    if (G.poseHold) return;
    const t = songT();
    let prev = null;
    let next = null;
    for (const n of G.notes) {
      if (n.t <= t) prev = n;
      else { next = n; break; }
    }
    const pose = Core.cuePose(t, prev ? prev.t : null, next ? next.t : null);
    G.pose.raise = pose.raise;
    G.pose.strike = pose.strike;
    G.pose.phase = pose.phase;
    G.pose.arrive = propArrive(t, prev ? prev.t : null, next ? next.t : null);
    G.pose.groove = grooveOf(t);
    G.pose.whiff = 0;
    G.pose.scale = 1;
    G.pose.judge = (G.lastHit && G.lastHit.age < 0.35) ? G.lastHit.kind : null;
  }

  /* ---------------- 更新 ---------------- */

  function update(dt) {
    G.hitFlash = Math.max(0, G.hitFlash - dt * 3.4);
    for (const tr of G.trails) {
      if (!tr.length) continue;
      for (const pt of tr) pt.life -= dt;
      let i = 0;
      while (i < tr.length && tr[i].life <= 0) i++;
      if (i) tr.splice(0, i);
    }
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
      drawJudgeText();
      drawCombo();
    }

    if (G.state === 'play' || G.state === 'calib' || G.state === 'cut') drawHud();
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

    // 背景保持静止。每拍闪全屏会把拍点从动作上抢走。
    const s = ctx.createRadialGradient(360, 640, 20, 360, 700, 520);
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
    if (k < 1) return;
    const d = k - 1;
    if (d > 0.16) return;
    const t = d / 0.16;
    const sc = s || 1;
    ctx.globalAlpha = (1 - t) * 0.95;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineCap = 'round';
    ctx.lineWidth = 7 * sc;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t * 0.5;
      const r1 = (36 + t * 28) * sc;
      const r2 = r1 + 22 * (1 - t) * sc;
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

  const SIDE_X = 300;
  const PLANT = 908;

  function mixPt(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // 侧面。脸朝右，东西从右边来。身子钉住，只动这一下要用的那一处。
  function sidePose(action, strike, raise, bob) {
    const hit = Math.max(0, strike);
    const motion = hit <= 0 ? 0 : (hit < 1 ? Math.pow(hit, 1.7) : hit);
    const p = Math.min(1, motion);
    const over = Math.max(0, hit - 1);
    const acting = raise > 0.02 || hit > 0.02;
    const x = SIDE_X;
    const hipY = PLANT - 168 - (bob || 0);
    const shoulderY = hipY - 98;
    const farHip = { x: x - 10, y: hipY };
    const farFoot = { x: x - 64, y: PLANT };
    const nearHip = { x: x + 12, y: hipY };
    const footNeutral = { x: x + 48, y: PLANT };

    let nearFoot = footNeutral;
    if (acting && (action === 'lift' || action === 'kick' || action === 'stone')) {
      const wind = action === 'kick' ? { x: x + 24, y: PLANT - 26 }
        : action === 'stone' ? { x: x + 34, y: PLANT - 34 }
        : { x: x + 48, y: PLANT - 6 };
      const contact = action === 'kick' ? { x: x + 92, y: PLANT - 4 }
        : action === 'stone' ? { x: x + 88, y: PLANT }
        : { x: x + 48, y: PLANT - 84 };
      nearFoot = hit > 0.02 ? mixPt(wind, contact, p) : wind;
      if (over > 0 && action === 'kick') {
        nearFoot = { x: nearFoot.x + over * 16, y: nearFoot.y - over * 8 };
      }
    }

    let headX = x + 16;
    let headY = shoulderY - 64;
    const headR = 46;
    let headPitch = 0;
    if (acting && action === 'duck') {
      const windY = headY - 4;
      const hitY = headY + 30;
      headY = hit > 0.02 ? windY + (hitY - windY) * p : windY;
      headPitch = 0.12 + (hit > 0.02 ? p : 0) * 0.4;
    }

    const farShoulder = { x: x - 4, y: shoulderY + 6 };
    const farHand = { x: x - 18, y: shoulderY + 74 };
    const nearShoulder = { x: x + 20, y: shoulderY };
    const hang = { x: x + 36, y: shoulderY + 80 };
    const book = {
      disc: [{ x: x + 88, y: shoulderY + 30 }, { x: x + 150, y: shoulderY + 34 }],
      drum: [{ x: x + 96, y: shoulderY - 72 }, { x: x + 128, y: shoulderY + 22 }],
      swat: [{ x: x + 100, y: shoulderY + 2 }, { x: x + 158, y: shoulderY - 4 }],
      high: [{ x: x + 100, y: shoulderY + 8 }, { x: x + 146, y: shoulderY - 24 }],
      sash: [{ x: x + 96, y: shoulderY + 42 }, { x: x + 154, y: shoulderY + 50 }],
      bump: [{ x: x + 112, y: shoulderY + 16 }, { x: x + 132, y: shoulderY - 6 }],
      mole: [{ x: x + 78, y: shoulderY - 40 }, { x: x + 176, y: PLANT - 78 }],
    };

    let nearHand = hang;
    if (acting && book[action]) {
      const wind = book[action][0];
      const contact = book[action][1];
      nearHand = hit > 0.02 ? mixPt(wind, contact, p) : wind;
      if (over > 0) {
        nearHand = {
          x: nearHand.x + (contact.x - wind.x) * over * 0.08,
          y: nearHand.y + (contact.y - wind.y) * over * 0.08,
        };
      }
    }

    let stickTip = null;
    if (action === 'drum') {
      const dx = nearHand.x - nearShoulder.x;
      const dy = nearHand.y - nearShoulder.y;
      const d = Math.hypot(dx, dy) || 1;
      stickTip = { x: nearHand.x + (dx / d) * 42, y: nearHand.y + (dy / d) * 42 };
    }

    return {
      x, hipY, shoulderY, headX, headY, headR, headPitch,
      farHip, farFoot, nearHip, nearFoot,
      farShoulder, farHand, nearShoulder, nearHand, stickTip,
      groundY: PLANT + 16,
    };
  }

  // -1 待机，0 蓄力，1 碰上。只在 cuePose 的最后大约 0.42 秒里从 0 走到 1。
  function sceneU(strike, raise) {
    const hit = Math.max(0, strike);
    if (raise <= 0.02 && hit <= 0.02) return -1;
    if (hit <= 0.02) return 0;
    if (hit >= 1) return 1;
    return Math.pow(hit, 1.7);
  }

  // 两截等长。关节靠向 prefer，用来规定膝向前、肘向上，不把骨头拉长。
  function limb2(root, target, lenA, lenB, prefer) {
    const dx = target.x - root.x;
    const dy = target.y - root.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const max = lenA + lenB - 0.01;
    const min = Math.abs(lenA - lenB) + 0.01;
    const clamped = Math.max(min, Math.min(max, dist));
    const ux = dx / dist;
    const uy = dy / dist;
    const end = { x: root.x + ux * clamped, y: root.y + uy * clamped };
    const c = (lenA * lenA - lenB * lenB + clamped * clamped) / (2 * clamped);
    const h = Math.sqrt(Math.max(0, lenA * lenA - c * c));
    const px = -uy;
    const py = ux;
    const j1 = { x: root.x + ux * c + px * h, y: root.y + uy * c + py * h };
    const j2 = { x: root.x + ux * c - px * h, y: root.y + uy * c - py * h };
    const d1 = (j1.x - prefer.x) ** 2 + (j1.y - prefer.y) ** 2;
    const d2 = (j2.x - prefer.x) ** 2 + (j2.y - prefer.y) ** 2;
    return { joint: d1 <= d2 ? j1 : j2, end };
  }

  function swingAng(u, rest, wind, hit) {
    if (u < 0) return rest;
    return wind + (hit - wind) * u;
  }

  function polar(pivot, ang, len) {
    return { x: pivot.x + Math.cos(ang) * len, y: pivot.y + Math.sin(ang) * len };
  }

  const MITT_LEN = 108;
  function mittAt(u) {
    const pivot = { x: 300, y: 860 };
    const ang = swingAng(u, 0.9, 0.25, -0.72);
    return { pivot, ang, pocket: polar(pivot, ang, MITT_LEN) };
  }

  function stickAt(u) {
    const pivot = { x: 246, y: 748 };
    const len = 214;
    const ang = swingAng(u, -0.25, -1.05, 0.52);
    return { pivot, ang, len, tip: polar(pivot, ang, len) };
  }

  function flowerAt(u) {
    const base = { x: 330, y: PLANT };
    const len = 196;
    const ang = swingAng(u, -Math.PI / 2, -Math.PI / 2 - 0.06, -Math.PI / 2 + 0.72);
    return { base, ang, len, head: polar(base, ang, len) };
  }

  function swatAt(u) {
    const pivot = { x: 268, y: 790 };
    const len = 176;
    const ang = swingAng(u, -0.2, -0.95, 0.12);
    return { pivot, ang, len, tip: polar(pivot, ang, len) };
  }

  function malletAt(u) {
    const pivot = { x: 270, y: 690 };
    const len = 236;
    const ang = swingAng(u, -0.12, -0.72, 0.82);
    return { pivot, ang, len, tip: polar(pivot, ang, len) };
  }

  function pedalAt(u) {
    const pivot = { x: 348, y: PLANT - 6 };
    const len = 128;
    const ang = swingAng(u, -0.06, -0.42, 0.04);
    return { pivot, ang, len, end: polar(pivot, ang, len) };
  }

  function kickAt(u) {
    const hip = { x: 300, y: PLANT - 158 };
    const L = 100;
    const foot = u < 0
      ? { x: 400, y: PLANT - 2 }
      : mixPt({ x: 330, y: 850 }, { x: 470, y: PLANT - 6 }, u);
    const solved = limb2(hip, foot, L, L, { x: hip.x + 120, y: hip.y + 10 });
    return { hip, knee: solved.joint, foot: solved.end, L };
  }

  function armAt(u) {
    const shoulder = { x: 118, y: 748 };
    const L = 78;
    const hand = u < 0
      ? { x: 196, y: 812 }
      : mixPt({ x: 210, y: 700 }, { x: 252, y: 768 }, u);
    const solved = limb2(shoulder, hand, L, L, { x: 190, y: 660 });
    return { shoulder, elbow: solved.joint, hand: solved.end, L };
  }

  function propEnds(action) {
    const g = PLANT;
    if (action === 'lift') {
      return { kind: 'ball', r: 20, scene: 'cup', home: { x: 430, y: g - 10 }, enter: { x: 660, y: g - 10 }, exit: { x: 430, y: g - 10 } };
    }
    if (action === 'disc') {
      const pocket = mittAt(1).pocket;
      return { kind: 'disc', r: 16, home: pocket, enter: { x: pocket.x + 240, y: pocket.y }, exit: pocket };
    }
    if (action === 'kick') {
      const foot = kickAt(1).foot;
      return { kind: 'ball', r: 18, home: { x: foot.x + 16, y: g - 4 }, enter: { x: 660, y: g - 4 }, exit: { x: foot.x + 160, y: g - 180 } };
    }
    if (action === 'drum') {
      const tip = stickAt(1).tip;
      return { kind: null, r: 16, scene: 'drum', home: tip, enter: tip, exit: tip };
    }
    if (action === 'duck') {
      const top = flowerAt(-1).head;
      const y = top.y - 78;
      return { kind: 'branch', r: 12, home: { x: top.x + 16, y }, enter: { x: top.x + 280, y }, exit: { x: top.x - 200, y } };
    }
    if (action === 'swat') {
      const hit = swatAt(1);
      const home = { x: hit.tip.x + Math.cos(hit.ang) * 15, y: hit.tip.y + Math.sin(hit.ang) * 15 };
      return { kind: 'fly', r: 14, scene: 'wall', home, enter: { x: home.x, y: home.y - 220 }, exit: home };
    }
    if (action === 'high') {
      return { kind: 'ball', r: 18, scene: 'basket', home: { x: 430, y: 804 }, enter: { x: 430, y: 460 }, exit: { x: 430, y: 836 } };
    }
    if (action === 'stone') {
      return { kind: 'stone', r: 18, scene: 'pedal', home: { x: 460, y: g + 2 }, enter: { x: 680, y: g + 2 }, exit: { x: 460, y: g + 2 } };
    }
    if (action === 'sash') {
      const hand = armAt(1).hand;
      return { kind: 'sash', r: 14, scene: 'window', home: { x: hand.x + 18, y: hand.y }, enter: { x: hand.x + 230, y: hand.y }, exit: { x: hand.x + 250, y: hand.y } };
    }
    if (action === 'bump') {
      return { kind: 'ball', r: 18, scene: 'paddle', home: { x: 410, y: 808 }, enter: { x: 410, y: 480 }, exit: { x: 410, y: 500 } };
    }
    if (action === 'mole') {
      const tip = malletAt(1).tip;
      return { kind: 'mole', r: 16, scene: 'hole', home: { x: tip.x, y: tip.y + 6 }, enter: { x: tip.x, y: g + 8 }, exit: { x: tip.x, y: g + 18 } };
    }
    return null;
  }

  function sideRig(pose, action) {
    const arrive = (G.pose && G.pose.arrive) || { s: 1, show: false, mode: 'park' };
    const spec = propEnds(action);
    let prop = null;
    if (spec && spec.kind && arrive.mode !== 'park') {
      const far = arrive.mode === 'leave' ? spec.exit : spec.enter;
      prop = {
        x: spec.home.x + (far.x - spec.home.x) * arrive.s,
        y: spec.home.y + (far.y - spec.home.y) * arrive.s,
        kind: spec.kind,
      };
    }
    return {
      prop,
      paths: [],
      marks: [],
      markR: spec ? spec.r : 16,
      sparkAt: spec && spec.home,
      cue: prop,
      spec,
      u: sceneU(pose.strike, pose.raise),
    };
  }

  function drawGroundLine() {
    ctx.strokeStyle = 'rgba(255,244,220,0.16)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(36, PLANT + 16);
    ctx.lineTo(684, PLANT + 16);
    ctx.stroke();
  }

  function drawWall(x) {
    ctx.fillStyle = '#d9c6aa';
    roundRect(x, 548, 34, 376, 8);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawWindowFrame(x, y) {
    ctx.fillStyle = 'rgba(186, 220, 245, 0.28)';
    roundRect(x, y - 78, 48, 156, 6);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawHole(x) {
    ctx.fillStyle = '#241910';
    ctx.beginPath();
    ctx.ellipse(x, PLANT + 10, 40, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawSideScene() {
    drawGroundLine();
  }

  function drawBone(a, b, width, fill) {
    paperStroke(() => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }, width, fill);
  }

  function drawJoint(p, r) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawCup(x, y) {
    ctx.beginPath();
    ctx.moveTo(x - 32, y);
    ctx.lineTo(x - 22, y + 52);
    ctx.quadraticCurveTo(x, y + 64, x + 22, y + 52);
    ctx.lineTo(x + 32, y);
    ctx.closePath();
    ctx.fillStyle = '#f6f1e6';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawBasket(x, y) {
    ctx.beginPath();
    ctx.moveTo(x - 46, y);
    ctx.lineTo(x - 32, y + 54);
    ctx.lineTo(x + 32, y + 54);
    ctx.lineTo(x + 46, y);
    ctx.closePath();
    ctx.fillStyle = '#e7b15a';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 46, y + 8);
    ctx.lineTo(x + 46, y + 8);
    ctx.stroke();
  }

  function drawMitt(m) {
    ctx.save();
    ctx.translate(m.pivot.x, m.pivot.y);
    ctx.rotate(m.ang);
    ctx.fillStyle = SHIRT;
    roundRect(18, -18, 46, 36, 10);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(MITT_LEN, 0, 38, 26, 0, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawStickTool(s) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(s.pivot.x, s.pivot.y);
    ctx.lineTo(s.tip.x, s.tip.y);
    ctx.stroke();
    ctx.strokeStyle = '#e7b15a';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = '#fff6df';
    ctx.beginPath();
    ctx.arc(s.tip.x, s.tip.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlower(f) {
    drawBone(f.base, f.head, 14, '#63b85a');
    ctx.fillStyle = '#ff8d5a';
    for (let i = 0; i < 5; i++) {
      const a = f.ang + i * Math.PI * 2 / 5;
      ctx.beginPath();
      ctx.ellipse(f.head.x + Math.cos(a) * 16, f.head.y + Math.sin(a) * 16, 12, 8, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(f.head.x, f.head.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd15c';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawSwatter(s) {
    drawBone(s.pivot, s.tip, 12, '#d7c4a8');
    ctx.save();
    ctx.translate(s.tip.x, s.tip.y);
    ctx.rotate(s.ang);
    ctx.fillStyle = '#f2d2a2';
    roundRect(-8, -28, 46, 56, 8);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  function drawMallet(s) {
    drawBone(s.pivot, s.tip, 16, '#c48a55');
    ctx.beginPath();
    ctx.arc(s.tip.x, s.tip.y, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#8a5a3a';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawPaddle(u) {
    const ang = u < 0 ? 0.04 : (-0.35 + 0.55 * u);
    ctx.save();
    ctx.translate(410, 858);
    ctx.rotate(ang);
    ctx.fillStyle = '#f0943e';
    roundRect(-70, -12, 140, 24, 12);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  function drawPedalBoard(p) {
    ctx.save();
    ctx.translate(p.pivot.x, p.pivot.y);
    ctx.rotate(p.ang);
    ctx.fillStyle = '#d5c2a6';
    roundRect(0, -10, p.len, 20, 8);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    drawJoint(p.pivot, 8);
  }

  function drawKickLeg(k) {
    drawBone(k.hip, k.knee, 22, SKIN);
    drawBone(k.knee, k.foot, 20, SKIN);
    drawJoint(k.knee, 11);
    ctx.beginPath();
    ctx.ellipse(k.foot.x + 16, k.foot.y + 2, 28, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawForearm(a) {
    drawBone(a.shoulder, a.elbow, 20, SKIN);
    drawBone(a.elbow, a.hand, 18, SKIN);
    drawJoint(a.elbow, 10);
    drawMitten(a.hand);
  }

  function drawSideHead(fr, pose) {
    ctx.save();
    ctx.translate(fr.headX, fr.headY);
    ctx.rotate(fr.headPitch || 0);
    const still = pose.raise > 0.35 || pose.strike > 0.05;
    const wig = still ? 0 : Math.sin(performance.now() / 480) * 0.1;
    ctx.save();
    ctx.translate(6, -fr.headR + 4);
    ctx.rotate(-0.4 + wig);
    ctx.strokeStyle = '#6fbf62';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(4, -16, 16, -24);
    ctx.stroke();
    ctx.fillStyle = '#8ed67a';
    ctx.beginPath();
    ctx.ellipse(18, -24, 10, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, fr.headR, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(fr.headR - 6, 10, 14, 9, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();

    const mood = pose.judge;
    const happy = mood === 'perfect' || mood === 'good';
    const sad = mood === 'miss' || mood === 'none';
    const blink = !happy && !sad && (performance.now() % 3200) < 110;
    ctx.fillStyle = '#2f1d0d';
    if (blink || sad) {
      ctx.strokeStyle = '#2f1d0d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, -8);
      ctx.lineTo(24, -8);
      ctx.stroke();
    } else if (happy) {
      ctx.strokeStyle = '#2f1d0d';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(16, -4, 7, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(16, -6, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#3a2412';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (happy) ctx.arc(20, 16, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (sad) ctx.arc(20, 24, 7, 1.15 * Math.PI, 1.85 * Math.PI);
    else ctx.arc(20, 16, 8, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawSideDoll(pose, rig) {
    const action = G.lv.action;
    const u = rig.u;
    const spec = rig.spec;
    const strike = pose.strike;

    if (action === 'lift' && spec) drawCup(spec.home.x, spec.home.y + 8);
    else if (action === 'high') drawBasket(430, 820);
    else if (action === 'drum' && spec) drawDrum(spec.home.x, spec.home.y, strike);
    else if (action === 'swat' && spec) drawWall(spec.home.x - 8);
    else if (action === 'sash' && spec) drawWindowFrame(spec.home.x + 36, spec.home.y);
    else if (action === 'mole' && spec) drawHole(spec.home.x);

    const behind = action === 'lift' || action === 'kick' || action === 'stone' || action === 'high'
      || action === 'bump' || action === 'swat' || action === 'mole' || action === 'sash';
    if (behind && rig.prop) drawProp(rig.prop, strike);

    if (action === 'disc') drawMitt(mittAt(u));
    else if (action === 'kick') drawKickLeg(kickAt(u));
    else if (action === 'drum') drawStickTool(stickAt(u));
    else if (action === 'duck') drawFlower(flowerAt(u));
    else if (action === 'swat') drawSwatter(swatAt(u));
    else if (action === 'stone') drawPedalBoard(pedalAt(u));
    else if (action === 'sash') drawForearm(armAt(u));
    else if (action === 'bump') drawPaddle(u);
    else if (action === 'mole') drawMallet(malletAt(u));

    if (!behind && rig.prop) drawProp(rig.prop, strike);

    if (rig.sparkAt) {
      const good = pose.judge === 'perfect' || pose.judge === 'good';
      drawSpark(rig.sparkAt.x, rig.sparkAt.y, strike, good ? 1.2 : 1);
    }
  }

  function drawActor() {
    const b = G.pose;
    const pose = {
      raise: b.raise,
      strike: b.strike,
      whiff: b.whiff,
      judge: b.judge,
      arrive: b.arrive,
      groove: b.groove,
    };
    if (window.SceneDraw && G.lv && G.lv.visual) {
      window.SceneDraw.draw(ctx, G.lv, pose);
      return;
    }
    const rig = sideRig(pose, G.lv.action);
    if (G.state === 'play' && pose.strike >= 1 && rig.cue) pushTrail(rig.cue, 0);
    drawTrail();
    drawSideScene();
    drawSideDoll(pose, rig);
  }

  function pushTrail(pt, slot) {
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    const tr = G.trails[slot] || G.trails[0];
    const last = tr[tr.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 3) return;
    tr.push({ x: pt.x, y: pt.y, life: 0.14 });
    if (tr.length > 8) tr.shift();
  }

  function drawTrail() {
    ctx.lineCap = 'round';
    for (const pts of G.trails) {
      if (pts.length < 2) continue;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const al = Math.max(0, b.life / 0.14);
        ctx.globalAlpha = al * 0.8;
        ctx.strokeStyle = 'rgba(255, 236, 200, 0.95)';
        ctx.lineWidth = 5 + al * 9;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCatchBall(rig) {
    const b = rig && rig.ball;
    if (!b) return;
    const r = 26;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8d5a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(90,40,16,0.55)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(b.x - 8, b.y - 8, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBead(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#fff6df';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#6b4328';
    ctx.stroke();
  }

  function drawRope(rig, front) {
    const ang = (rig.phase || 0) * Math.PI * 2;
    const lower = Math.cos(ang) >= 0;
    const a = rig.left;
    const b = rig.right;
    if (a && b && lower === front) {
      const drop = Math.cos(ang) * rig.ropeDrop;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2 + drop;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(midX, midY, b.x, b.y);
      ctx.lineCap = 'round';
      ctx.strokeStyle = front ? '#5a3418' : 'rgba(40,24,12,0.45)';
      ctx.lineWidth = front ? 12 : 7;
      ctx.stroke();
      if (front) {
        ctx.strokeStyle = '#f2d2a2';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
    if (front && rig.bead) drawBead(rig.bead);
  }

  const STICK_LEN = 100;
  const SHOULDER_DX = 52;
  const INK = '#3a2416';
  const SKIN = '#ffe3c2';
  const SHIRT = '#f0943e';

  // 手的位置相对身体中心。走短弧，不绕肩膀转圈。
  function qbez(a, b, c, t) {
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
      y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    };
  }

  function mirrorArm(curve) {
    return {
      a: { x: -curve.a.x, y: curve.a.y },
      b: { x: -curve.b.x, y: curve.b.y },
      c: { x: -curve.c.x, y: curve.c.y },
    };
  }

  function armCurve(action, side) {
    const relax = { a: { x: -118, y: 72 }, b: { x: -118, y: 72 }, c: { x: -118, y: 72 } };
    const rightOnly = {
      hit: { a: { x: 108, y: -96 }, b: { x: 176, y: -16 }, c: { x: 148, y: 78 } },
      spin: { a: { x: 126, y: 46 }, b: { x: 168, y: -4 }, c: { x: 150, y: -24 } },
      pulse: { a: { x: 98, y: 58 }, b: { x: 122, y: 12 }, c: { x: 108, y: -18 } },
      shake: { a: { x: 112, y: 34 }, b: { x: 130, y: 26 }, c: { x: 148, y: 30 } },
    };
    if (rightOnly[action]) return side > 0 ? relax : rightOnly[action];
    const table = {
      clap: { a: { x: -76, y: 34 }, b: { x: -50, y: 16 }, c: { x: -20, y: 34 } },
      catch: { a: { x: -46, y: 24 }, b: { x: -32, y: 12 }, c: { x: -16, y: 24 } },
      jump: { a: { x: -138, y: 6 }, b: { x: -138, y: 6 }, c: { x: -138, y: 6 } },
    };
    const src = table[action] || relax;
    return side > 0 ? src : mirrorArm(src);
  }

  function paperElbow(sx, sy, hx, hy, side) {
    const mx = (sx + hx) / 2;
    const my = (sy + hy) / 2;
    const dx = hx - sx;
    const dy = hy - sy;
    const len = Math.hypot(dx, dy) || 1;
    let px = -dy / len;
    let py = dx / len;
    const outward = side > 0 ? -1 : 1;
    if (px * outward < 0) { px = -px; py = -py; }
    const bend = Math.min(32, len * 0.38);
    return { x: mx + px * bend, y: my + py * bend };
  }

  function stickTipOf(elbow, hand, len) {
    const ex = hand.x - elbow.x;
    const ey = hand.y - elbow.y;
    const d = Math.hypot(ex, ey) || 1;
    return { x: hand.x + (ex / d) * len, y: hand.y + (ey / d) * len };
  }

  function makeArm(shoulder, curve, side, p, over, originX, originY) {
    const a = { x: originX + curve.a.x, y: originY + curve.a.y };
    const b = { x: originX + curve.b.x, y: originY + curve.b.y };
    const c = { x: originX + curve.c.x, y: originY + curve.c.y };
    const hand = qbez(a, b, c, p);
    const travel = Math.hypot(curve.c.x - curve.a.x, curve.c.y - curve.a.y);
    if (over > 0 && travel > 12) {
      const dx = curve.c.x - curve.b.x;
      const dy = curve.c.y - curve.b.y;
      const d = Math.hypot(dx, dy) || 1;
      hand.x += (dx / d) * over * 12;
      hand.y += (dy / d) * over * 12;
    }
    return { hand, elbow: paperElbow(shoulder.x, shoulder.y, hand.x, hand.y, side) };
  }

  function layoutArms(action, p, over, sL, sR, cx, shoulderY) {
    const L = makeArm(sL, armCurve(action, 1), 1, p, over, cx, shoulderY);
    const R = makeArm(sR, armCurve(action, -1), -1, p, over, cx, shoulderY);
    const tip = action === 'hit' ? stickTipOf(R.elbow, R.hand, STICK_LEN) : null;
    return { L, R, tip };
  }

  function skeletonFrame(action, strike, raise, bob) {
    const hit = Math.max(0, strike);
    // 前半段留在蓄力姿势，靠近拍点才赶到。strike 到 1 时画面也正好到位。
    const motion = hit <= 0 ? 0 : (hit < 1 ? Math.pow(hit, 1.7) : hit);
    const p = Math.min(1, motion);
    const over = Math.max(0, hit - 1);
    const x = 360;
    const plant = 912;
    // 身子钉在地上。整个人晃来晃去会把眼睛从那一下上带走。
    const tilt = 0;
    const dx = 0;
    let headPitch = 0;
    const legLen = 178;
    const hipY = plant - legLen - (bob || 0);
    const shoulderY = hipY - 118;
    const tuck = action === 'jump' ? motion * 42 : 0;
    const footL = { x: x - 62, y: plant - tuck };
    let footR = { x: x + 62, y: plant - tuck };
    if (action === 'lean') {
      footR = { x: x + 64 + p * 36, y: plant - (1 - p) * 26 };
    }
    const footY = action === 'lean' ? footR.y : plant - tuck;
    const lift = tuck;
    const sL = { x: x - SHOULDER_DX, y: shoulderY };
    const sR = { x: x + SHOULDER_DX, y: shoulderY };
    const hL = { x: x - 30, y: hipY };
    const hR = { x: x + 30, y: hipY };

    let headX = x;
    let headY = shoulderY - 86;
    const headR = 52;
    if (action === 'nod') {
      const ant = raise * (1 - p);
      headPitch = -ant * 0.16 + p * 0.22;
      headY = shoulderY - 104 - ant * 4 + p * 28;
    }

    const arms = layoutArms(action, p, over, sL, sR, x, shoulderY);
    const pivotY = action === 'lean' ? footY : hipY;
    function toWorld(px, py) {
      const lx = px - x;
      const ly = py - pivotY;
      const c = Math.cos(tilt);
      const sn = Math.sin(tilt);
      return {
        x: lx * c - ly * sn + x + dx,
        y: lx * sn + ly * c + pivotY,
      };
    }

    return {
      x, hipY, footY, footL, footR, shoulderY, headX, headY, headR, headPitch,
      sL, sR, hL, hR, pivotY, tilt, dx, lift,
      lArm: arms.L, rArm: arms.R, stickTip: arms.tip,
      toWorld, groundY: 928,
    };
  }

  function worldOf(fr, pt) {
    return fr.toWorld(pt.x, pt.y);
  }

  // 拍点在 home，两拍中间在 far。路径是一条直线，far 要选在不穿头的空处。
  function propAt(phase, home, far) {
    const t = Math.max(0, Math.min(1, phase));
    const s = Math.sin(t * Math.PI);
    return {
      x: home.x + (far.x - home.x) * s,
      y: home.y + (far.y - home.y) * s,
    };
  }

  function propPath(phase, home, far) {
    const pts = [];
    for (let i = 1; i <= 8; i++) {
      const u = phase + (1 - phase) * (i / 8);
      pts.push(propAt(u, home, far));
    }
    return pts;
  }

  function actorRig(pose, action) {
    const idle = Math.sin(performance.now() / 700) * 4
      * (1 - Math.min(1, pose.strike))
      * (1 - Math.min(1, pose.raise));
    const live = skeletonFrame(action, pose.strike, pose.raise, idle);
    const contact = skeletonFrame(action, 1, 0, 0);
    const p = Math.min(1, Math.max(0, pose.strike));
    const show = pose.raise > 0.02 && pose.strike < 1;
    let phase = G.pose.phase || 0;
    if (G.poseHold && Number.isFinite(G.ropePhase)) phase = G.ropePhase;
    phase = Math.max(0, Math.min(1, phase));

    function approach(pick) {
      const logical = Math.min(1, Math.max(0, p));
      const vis = logical <= 0 ? 0 : Math.pow(logical, 1.7);
      const pts = [];
      for (let i = 1; i <= 10; i++) {
        const v = vis + (1 - vis) * (i / 10);
        const u = Math.pow(v, 1 / 1.7);
        const fr = skeletonFrame(action, u, Math.max(0, 1 - u), 0);
        pts.push(pick(fr));
      }
      return pts;
    }

    const wL = worldOf(live, live.lArm.hand);
    const wR = worldOf(live, live.rArm.hand);
    const cL = worldOf(contact, contact.lArm.hand);
    const cR = worldOf(contact, contact.rArm.hand);
    const cup = { x: (cL.x + cR.x) / 2, y: (cL.y + cR.y) / 2 };
    const cFoot = contact.toWorld(contact.x, contact.footY);
    const ropeDrop = Math.max(180, cFoot.y + 30 - (cL.y + cR.y) / 2);
    const bead = {
      x: (wL.x + wR.x) / 2,
      y: (wL.y + wR.y) / 2 + Math.cos(phase * Math.PI * 2) * ropeDrop,
    };
    const paths = [];
    const marks = [];
    let sparkAt = cup;
    let markR = 18;
    let drum = null;
    let prop = null;

    function fly(home, far, kind, r) {
      markR = r;
      sparkAt = home;
      let at = propAt(phase, home, far);
      if (action === 'shake' && pose.strike > 1) {
        const o = pose.strike - 1;
        at = {
          x: at.x + Math.sin(o * 36) * 12 * Math.exp(-o * 5),
          y: at.y,
          kind,
        };
      } else {
        at = { x: at.x, y: at.y, kind };
      }
      prop = at;
      if (show) {
        marks.push(home);
        paths.push(propPath(phase, home, far));
      }
    }

    if (action === 'hit') {
      const tip = worldOf(contact, contact.stickTip);
      sparkAt = tip;
      drum = tip;
      if (show) paths.push(approach((fr) => worldOf(fr, fr.stickTip)));
    } else if (action === 'jump') {
      sparkAt = {
        x: (cL.x + cR.x) / 2,
        y: (cL.y + cR.y) / 2 + ropeDrop,
      };
    } else if (action === 'nod') {
      const head = contact.toWorld(contact.headX, contact.headY);
      fly({ x: head.x + 46, y: head.y - 4 }, { x: head.x + 188, y: head.y - 150 }, 'fruit', 16);
    } else if (action === 'lean') {
      const step = contact.toWorld(contact.footR.x, contact.footR.y);
      fly(step, { x: step.x + 170, y: step.y }, 'pedal', 22);
    } else if (action === 'shake') {
      fly(cR, { x: cR.x + 190, y: cR.y }, 'bell', 16);
    } else if (action === 'spin') {
      fly(cR, { x: cR.x + 36, y: cR.y + 230 }, 'hoop', 22);
    } else if (action === 'pulse') {
      fly(cR, { x: cR.x, y: cR.y - 280 }, 'ball', 18);
    } else if (action === 'catch') {
      fly(cup, { x: cup.x + 220, y: cup.y - 230 }, 'ball', 22);
    } else if (action === 'clap') {
      fly(cup, { x: cup.x + 210, y: cup.y - 170 }, 'disc', 18);
    }

    let cues = [wL, wR];
    if (prop) cues = [prop];
    else if (action === 'hit' && live.stickTip) cues = [worldOf(live, live.stickTip)];
    else if (action === 'jump') cues = [bead];

    return {
      frame: live,
      left: wL,
      right: wR,
      cues,
      paths,
      marks,
      markR,
      sparkAt,
      drum,
      cup,
      bead,
      ball: prop && prop.kind === 'ball' ? prop : null,
      prop,
      phase,
      ropeDrop,
    };
  }

  function drawMotionPath(paths) {
    if (!paths || !paths.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 244, 214, 0.92)';
    ctx.lineWidth = 7;
    ctx.setLineDash([14, 12]);
    for (const pts of paths) {
      if (!pts || pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMarkRings(pts, r) {
    if (!pts || !pts.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 248, 230, 0.95)';
    ctx.lineWidth = 5;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDrum(x, y, strike) {
    const hot = strike >= 1 && strike < 1.14;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 52, 72, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b221c';
    ctx.beginPath();
    ctx.ellipse(x, y + 20, 92, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y, 78, 28, 0, 0, Math.PI * 2);
    ctx.fillStyle = hot ? '#fff8e8' : '#f0d3a2';
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#f3d7ae';
    ctx.stroke();
  }

  function paperStroke(drawLine, width, fill) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + 8;
    drawLine();
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    drawLine();
    ctx.stroke();
  }

  function drawPaperArm(shoulder, arm) {
    paperStroke(() => {
      ctx.beginPath();
      ctx.moveTo(shoulder.x, shoulder.y);
      ctx.quadraticCurveTo(arm.elbow.x, arm.elbow.y, arm.hand.x, arm.hand.y);
    }, 22, SKIN);
  }

  function drawPaperLeg(hip, foot, side) {
    const mx = (hip.x + foot.x) / 2 + side * 18;
    const my = (hip.y + foot.y) / 2 + 6;
    paperStroke(() => {
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.quadraticCurveTo(mx, my, foot.x, foot.y);
    }, 24, SKIN);
    ctx.beginPath();
    ctx.ellipse(foot.x + side * 6, foot.y + 4, 30, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawPaperTorso(fr) {
    const top = fr.shoulderY + 8;
    const bot = fr.hipY + 12;
    const w = 118;
    const h = Math.max(48, bot - top);
    ctx.fillStyle = SHIRT;
    roundRect(fr.x - w / 2, top, w, h, 42);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#d86a28';
    roundRect(fr.x - w / 2 + 10, bot - 20, w - 20, 14, 7);
    ctx.fill();
  }

  function drawPaperNeck(fr) {
    paperStroke(() => {
      ctx.beginPath();
      ctx.moveTo(fr.x, fr.shoulderY + 6);
      ctx.lineTo(fr.headX, fr.headY + fr.headR * 0.62);
    }, 16, SKIN);
  }

  function drawMitten(hand) {
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawHead(fr, pose) {
    const headR = fr.headR;
    ctx.save();
    ctx.translate(fr.headX, fr.headY);
    ctx.rotate(fr.headPitch || 0);
    const still = pose.raise > 0.35 || pose.strike > 0.05;
    const wig = still ? 0 : Math.sin(performance.now() / 480) * 0.12;
    ctx.save();
    ctx.translate(0, -headR + 2);
    ctx.rotate(-0.35 + wig);
    ctx.strokeStyle = '#6fbf62';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.quadraticCurveTo(-6, -12, -16, -22);
    ctx.stroke();
    ctx.fillStyle = '#8ed67a';
    ctx.beginPath();
    ctx.ellipse(-17, -24, 11, 6, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(0.85);
    ctx.beginPath();
    ctx.moveTo(2, 6);
    ctx.quadraticCurveTo(10, -8, 18, -16);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(19, -18, 11, 6, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, headR, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    ctx.stroke();

    const mood = pose.judge;
    const happy = mood === 'perfect' || mood === 'good';
    const sad = mood === 'miss' || mood === 'none';
    const ex = 18;
    const ey = -4;
    if (happy) {
      ctx.fillStyle = 'rgba(255, 140, 120, 0.5)';
      ctx.beginPath();
      ctx.ellipse(-24, 12, 8, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(24, 12, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(side * ex, ey + 2, 7, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    } else if (sad) {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 4;
        const cx = side * ex;
        ctx.beginPath();
        ctx.moveTo(cx - 6, ey - 6); ctx.lineTo(cx + 6, ey + 6);
        ctx.moveTo(cx + 6, ey - 6); ctx.lineTo(cx - 6, ey + 6);
        ctx.stroke();
      }
    } else {
      const blink = (performance.now() % 3200) < 110;
      for (const side of [-1, 1]) {
        if (blink) {
          ctx.strokeStyle = '#2f1d0d';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(side * ex - 7, ey);
          ctx.lineTo(side * ex + 7, ey);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#2f1d0d';
          ctx.beginPath();
          ctx.arc(side * ex, ey, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.strokeStyle = '#3a2412';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (happy) ctx.arc(0, 14, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (sad) ctx.arc(0, 24, 9, 1.1 * Math.PI, 1.9 * Math.PI);
    else ctx.arc(0, 12, 10, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawProp(p, strike) {
    if (!p) return;
    const hot = strike >= 1 && strike < 1.14;
    const squash = strike >= 1 && strike < 1.22 ? 1 - (strike - 1) / 0.22 : 0;
    ctx.save();
    if (squash > 0) {
      ctx.translate(p.x, p.y);
      ctx.scale(1 + 0.22 * squash, Math.max(0.62, 1 - 0.34 * squash));
      ctx.translate(-p.x, -p.y);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (p.kind === 'disc') {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 30, 13, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = hot ? '#fff6d0' : '#ffd15c';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    } else if (p.kind === 'fruit') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5b45';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.strokeStyle = '#63b85a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 14);
      ctx.quadraticCurveTo(p.x + 10, p.y - 28, p.x + 16, p.y - 16);
      ctx.stroke();
    } else if (p.kind === 'hoop') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
      ctx.lineWidth = 9;
      ctx.strokeStyle = hot ? '#fff6d0' : '#8fd4ff';
      ctx.stroke();
    } else if (p.kind === 'ball') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = hot ? '#fff0c8' : '#ff8d5a';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
    } else if (p.kind === 'bell') {
      ctx.beginPath();
      ctx.moveTo(p.x - 16, p.y - 8);
      ctx.lineTo(p.x + 16, p.y - 8);
      ctx.lineTo(p.x + 10, p.y + 14);
      ctx.lineTo(p.x - 10, p.y + 14);
      ctx.closePath();
      ctx.fillStyle = hot ? '#fff6d0' : '#ffd15c';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y + 16, 5, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    } else if (p.kind === 'pedal') {
      ctx.fillStyle = '#6b221c';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 8, 46, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 4, 40, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = hot ? '#fff8e8' : '#f0d3a2';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#f3d7ae';
      ctx.stroke();
    } else if (p.kind === 'branch') {
      ctx.strokeStyle = '#6b3a22';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - 36, p.y + 4);
      ctx.quadraticCurveTo(p.x, p.y - 12, p.x + 40, p.y - 2);
      ctx.stroke();
      ctx.fillStyle = '#63b85a';
      ctx.beginPath();
      ctx.ellipse(p.x + 28, p.y - 10, 14, 7, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'fly') {
      ctx.strokeStyle = 'rgba(210, 225, 245, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x - 12, p.y - 2, 14, 6, -0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(p.x + 12, p.y - 2, 14, 6, 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#2a241c';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'stone') {
      ctx.fillStyle = hot ? '#fff4dc' : '#6f6256';
      roundRect(p.x - 36, p.y - 14, 72, 24, 8);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    } else if (p.kind === 'sash') {
      ctx.fillStyle = hot ? '#fff6d0' : '#d7ecff';
      roundRect(p.x - 14, p.y - 62, 30, 124, 6);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    } else if (p.kind === 'mole') {
      ctx.fillStyle = hot ? '#fff0d0' : '#a56b45';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.arc(p.x + 7, p.y - 4, 3, 0, Math.PI * 2);
      ctx.arc(p.x + 7, p.y + 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStick(pose, action, rig) {
    rig = rig || actorRig(pose, action);
    const fr = rig.frame;
    const x = fr.x;
    const sw = 120 * (1 - Math.min(0.5, fr.lift / 240));
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(x + fr.dx * 0.25, fr.groundY, Math.max(42, sw), 16, 0, 0, Math.PI * 2);
    ctx.fill();

    if (rig.prop && rig.prop.kind === 'pedal') drawProp(rig.prop, pose.strike);

    ctx.save();
    ctx.translate(x + fr.dx, fr.pivotY);
    ctx.rotate(fr.tilt);
    ctx.translate(-x, -fr.pivotY);

    const footL = fr.footL || { x: x - 62, y: fr.footY };
    const footR = fr.footR || { x: x + 62, y: fr.footY };
    drawPaperLeg(fr.hL, footL, 1);
    drawPaperLeg(fr.hR, footR, -1);
    drawPaperTorso(fr);
    drawPaperNeck(fr);
    drawHead(fr, pose);
    ctx.restore();

    drawMotionPath(rig.paths);
    if (action !== 'hit' && action !== 'jump') drawMarkRings(rig.marks, rig.markR);
    if (action === 'hit' && rig.drum) drawDrum(rig.drum.x, rig.drum.y, pose.strike);

    ctx.save();
    ctx.translate(x + fr.dx, fr.pivotY);
    ctx.rotate(fr.tilt);
    ctx.translate(-x, -fr.pivotY);
    drawPaperArm(fr.sL, fr.lArm);
    drawPaperArm(fr.sR, fr.rArm);
    ctx.restore();

    const pl = worldOf(fr, fr.lArm.hand);
    const pr = worldOf(fr, fr.rArm.hand);
    drawMitten(pl);
    drawMitten(pr);

    if (action === 'hit' && fr.stickTip) {
      const tip = worldOf(fr, fr.stickTip);
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.strokeStyle = '#e7b15a';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.fillStyle = '#fff6df';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (rig.prop && rig.prop.kind !== 'pedal') drawProp(rig.prop, pose.strike);

    if (action === 'jump' && fr.lift > 20 && pose.strike > 0.8 && pose.strike < 1.2) {
      drawDust(x, fr.groundY);
    }

    const good = pose.judge === 'perfect' || pose.judge === 'good';
    if (rig.sparkAt) drawSpark(rig.sparkAt.x, rig.sparkAt.y, pose.strike, good ? 1.2 : 1);
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

    if (G.state === 'play' || G.state === 'cut') {
      ctx.textAlign = 'center';
      ctx.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(238,242,250,0.9)';
      const tag = G.mix ? '混合' : '单关';
      ctx.fillText(`${tag}  ${G.level + 1}/${Core.LEVELS.length}  ${G.lv.name}`, 360, 204);
      ctx.textAlign = 'left';
    }
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
    ctx.fillText((G.lv && G.lv.btn) || BTN_LABEL[G.lv.action] || '按', cx, cy + 2);
    ctx.textBaseline = 'alphabetic';
  }

  function drawIntroHint() {
    if (G.state !== 'play') return;
    const t = songT();
    if (t < -2.6 || t > 2.6) return;

    const intro = (G.spb || 0.5) * 4 * ((G.lv && G.lv.demoBars) || 1);
    if (t > intro - 0.2) return;
    const txt = t < 0 ? '准备好了吗' : '碰上再按';

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

  function drawJudgeText() {
    const h = G.lastHit;
    if (!h) return;
    const a = Math.max(0, 1 - h.age / 0.6);
    const txt = h.kind === 'perfect' ? '完美'
      : h.kind === 'good' ? '不错'
        : h.kind === 'none' ? '漏了' : '失误';
    const col = h.kind === 'perfect' ? '#ffd166'
      : h.kind === 'good' ? '#8fd0ff' : '#ff7f9c';

    const pop = 1 + Math.max(0, 0.12 - h.age) * 4;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(64 * pop)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
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
    setPlayMode('one');

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));

    bindInput();

    dom.againBtn.addEventListener('click', () => startGame(G.mix ? G.mixFrom : G.level));
    dom.nextBtn.addEventListener('click', () => {
      startGame(G.level < Core.LEVELS.length - 1 ? G.level + 1 : 0);
    });
    dom.homeBtn.addEventListener('click', backToPick);
    dom.quitBtn.addEventListener('click', backToPick);
    dom.startBtn.addEventListener('click', () => startGame(G.level));
    dom.modeOne.addEventListener('click', () => setPlayMode('one'));
    dom.modeMix.addEventListener('click', () => setPlayMode('mix'));
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
