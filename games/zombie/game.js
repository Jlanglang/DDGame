/**
 * 豆豆大战僵尸 · 画面与点选
 * 院子是画出来的，不外链图片，断网双击也能开。
 * 点选：先点卡片（或铲子），再点格子。右键 / Esc 放下。
 */
(function () {
  const D = window.ZombieData;
  const Sim = window.ZombieSim;
  const L = D.LAYOUT;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const titleVeil = document.getElementById('title');
  const endVeil = document.getElementById('end');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FAST = Math.max(1, Math.min(8, Number(new URLSearchParams(location.search).get('fast')) || 1));

  let match = Sim.createMatch();
  let mode = 'title';
  let hover = null;
  let pointerId = null;
  let toast = '';
  let toastT = 0;
  let floats = [];
  let bits = [];
  let shake = 0;
  let banner = '';
  let bannerT = 0;
  let ending = false;
  let endDelay = 0;
  let clock = 0;
  let sx = 1;
  let sy = 1;

  const TUFTS = [];
  const FLOWERS = [];
  for (let r = 0; r < L.ROWS; r++) {
    for (let c = 0; c < L.COLS; c++) {
      for (let k = 0; k < 3; k++) {
        const n = r * 40 + c * 7 + k * 3;
        TUFTS.push({
          x: L.LAWN_X + c * L.COL_W + 10 + hash(n) * (L.COL_W - 20),
          y: r * L.ROW_H + 16 + hash(n + 1) * (L.ROW_H * 0.42),
          s: 0.7 + hash(n + 2) * 0.7,
          flip: hash(n + 3) > 0.5,
        });
      }
      if (hash(r * 9 + c + 5) > 0.62) {
        FLOWERS.push({
          x: L.LAWN_X + c * L.COL_W + 18 + hash(c + 20 + r) * (L.COL_W - 36),
          y: r * L.ROW_H + 22 + hash(c + 4 + r) * 28,
          s: 0.8 + hash(c + r) * 0.5,
          pink: hash(c * 3 + r) > 0.7,
        });
      }
    }
  }

  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function fresh() {
    match = Sim.createMatch();
    hover = null;
    floats = [];
    bits = [];
    shake = 0;
    banner = '';
    bannerT = 0;
    ending = false;
    endDelay = 0;
    toast = '';
    toastT = 0;
  }

  function showToast(text) {
    toast = text;
    toastT = 2.1;
  }

  function startPlay(fromEnd) {
    if (fromEnd || mode === 'end') fresh();
    mode = 'play';
    titleVeil.hidden = true;
    endVeil.hidden = true;
    showToast('点卡片，再点空格子');
  }

  function openEnd() {
    if (mode === 'end') return;
    mode = 'end';
    const win = match.result === 'win';
    document.getElementById('endK').textContent = win ? '守住了' : '失守';
    document.getElementById('endTitle').textContent = win ? '前院这一天过了' : '僵尸进了屋子';
    document.getElementById('endSub').textContent = win
      ? '卡片和数值都还是暂定，下一版可以换。'
      : '每行的割草机只有一次。阳光紧的时候先种阳光豆。';
    endVeil.hidden = false;
  }

  document.getElementById('start').addEventListener('click', function () { startPlay(false); });
  document.getElementById('again').addEventListener('click', function () { startPlay(true); });
  document.getElementById('restart').addEventListener('click', function () {
    const backToTitle = mode === 'title';
    fresh();
    if (backToTitle) {
      mode = 'title';
      titleVeil.hidden = false;
      endVeil.hidden = true;
    } else {
      mode = 'play';
      titleVeil.hidden = true;
      endVeil.hidden = true;
      showToast('点卡片，再点空格子');
    }
  });

  const rotateSkip = document.getElementById('rotateSkip');
  if (rotateSkip) {
    rotateSkip.addEventListener('click', function () {
      document.getElementById('rotate').style.display = 'none';
      setTimeout(resize, 30);
    });
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * L.W,
      y: (e.clientY - r.top) / r.height * L.H,
    };
  }

  function onDown(x, y, button) {
    if (mode !== 'play') return;
    if (button === 2) {
      match.selected = null;
      return;
    }
    const sun = Sim.sunAt(match, x, y);
    if (sun) {
      Sim.collectSun(match, sun.id);
      return;
    }
    const pi = D.hitPacket(x, y);
    if (pi >= 0) {
      const r = Sim.pickCard(match, D.CARDS[pi].id);
      if (!r.ok && r.reason) showToast(r.reason);
      return;
    }
    if (D.hitShovel(x, y)) {
      Sim.pickShovel(match);
      return;
    }
    const cell = D.cellAt(x, y);
    if (!cell) return;
    if (!match.selected) {
      showToast('先点一张卡片');
      return;
    }
    const r = Sim.useAt(match, cell.row, cell.col);
    if (!r.ok && r.reason) showToast(r.reason);
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (pointerId != null && pointerId !== e.pointerId) return;
    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    hover = D.cellAt(p.x, p.y);
    onDown(p.x, p.y, e.button);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (pointerId != null && e.pointerId !== pointerId) return;
    const p = pos(e);
    hover = D.cellAt(p.x, p.y);
    const hot = Sim.sunAt(match, p.x, p.y) || D.hitPacket(p.x, p.y) >= 0 || D.hitShovel(p.x, p.y);
    canvas.style.cursor = hot ? 'pointer' : 'default';
  });

  function endPointer(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('pointerleave', function () {
    if (pointerId == null) hover = null;
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    if (e.key === 'Enter' && mode === 'title') { startPlay(false); return; }
    if (e.key === 'Enter' && mode === 'end') { startPlay(true); return; }
    if (mode !== 'play') return;
    if (e.key === 'Escape') { match.selected = null; return; }
    if (e.key === 's' || e.key === 'S') { Sim.pickShovel(match); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= D.CARDS.length) {
      const r = Sim.pickCard(match, D.CARDS[n - 1].id);
      if (!r.ok && r.reason) showToast(r.reason);
    }
  });

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (speed || 90) * (0.4 + Math.random());
      bits.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 30,
        life: 0.45 + Math.random() * 0.3,
        max: 0.7,
        color: color,
        r: 2 + Math.random() * 3.5,
      });
    }
  }

  function floater(x, y, text, color) {
    floats.push({ x: x, y: y, text: text, color: color, life: 0.9, vy: -42 });
  }

  function takeEvents() {
    const ev = match.events.splice(0, match.events.length);
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.t === 'collect') floater(e.x, e.y, '+' + e.value, '#c47a00');
      else if (e.t === 'hit') floater(e.x, e.y, String(e.dmg), e.ice ? '#1d4e89' : '#3d2914');
      else if (e.t === 'boom') {
        shake = Math.max(shake, 10);
        burst(e.x, e.y, '#ff5a3c', 16, 160);
        burst(e.x, e.y, '#ffd15c', 8, 90);
      } else if (e.t === 'dead' && e.kind === 'zombie') burst(e.x, e.y, '#8fbf6a', 8, 70);
      else if (e.t === 'place') burst(D.cellCenterX(e.col), D.feetY(e.row) - 20, '#fff', 6, 50);
      else if (e.t === 'mower') burst(L.LAWN_X, D.feetY(e.row) - 20, '#d0d4da', 8, 80);
      else if (e.t === 'wave') {
        banner = e.flag ? '一大波僵尸正在接近' : ('第 ' + e.n + ' 波');
        bannerT = e.flag ? 2.8 : 1.5;
      } else if (e.t === 'lose') shake = 14;
    }
  }

  function statusText() {
    const total = match.level.waves.length;
    if (match.phase === 'prelude') return '第 1 波 · ' + Math.ceil(match.phaseT);
    if (match.phase === 'between') return '下一波 · ' + Math.ceil(match.phaseT);
    const n = Math.max(1, match.waveIndex + 1);
    return '第 ' + n + ' / ' + total + ' 波';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function fillText(str, x, y, size, color, align, weight) {
    ctx.fillStyle = color;
    ctx.font = (weight || 800) + ' ' + size + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  function shadow(x, y, rx) {
    ctx.fillStyle = 'rgba(30, 50, 20, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function eyePair(x, y, s) {
    ctx.fillStyle = '#24160f';
    ctx.beginPath();
    ctx.arc(x - 8 * s, y, 3.1 * s, 0, Math.PI * 2);
    ctx.arc(x + 8 * s, y, 3.1 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - 7 * s, y - 1.1 * s, 1.1 * s, 0, Math.PI * 2);
    ctx.arc(x + 9 * s, y - 1.1 * s, 1.1 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlant(kind, x, y, scale, opt) {
    const o = opt || {};
    const bob = (!o.icon && !reduceMotion) ? Math.sin(clock * 2.4 + (o.id || 0)) * 2 : 0;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(scale, scale);
    if (o.ghost) ctx.globalAlpha = 0.55;
    if (!o.icon) shadow(0, 0, 26);
    if (kind === 'sun') drawSunflower();
    else if (kind === 'pea') drawShooter('#7ed957', '#3e8f2e', false);
    else if (kind === 'ice') drawShooter('#b9ecff', '#3a8fbf', true);
    else if (kind === 'wall') drawWall();
    else if (kind === 'mine') drawMine(!!o.armed);
    else if (kind === 'cherry') drawCherry(o.fuse || 0);
    ctx.restore();
  }

  function drawSunflower() {
    ctx.fillStyle = '#3f8f32';
    ctx.fillRect(-3, -36, 6, 28);
    ctx.beginPath();
    ctx.ellipse(-14, -16, 10, 5, -0.6, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + clock * 0.2;
      ctx.fillStyle = i % 2 ? '#ffb703' : '#ffd15c';
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 22, -62 + Math.sin(a) * 22, 8, 12, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(0, -62, 16, 0, Math.PI * 2);
    ctx.fill();
    eyePair(0, -64, 0.85);
    ctx.strokeStyle = '#c47a00';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -58, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  function drawShooter(body, leaf, ice) {
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(-16, -28, 12, 6, -0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, -40, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath();
    ctx.arc(-8, -48, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(20, -36, 16, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();
    if (ice) {
      ctx.fillStyle = '#e8fbff';
      ctx.beginPath();
      ctx.moveTo(18, -48);
      ctx.lineTo(28, -34);
      ctx.lineTo(12, -32);
      ctx.fill();
    }
    eyePair(0, -44, 1);
    ctx.strokeStyle = '#245022';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-1, -34, 6, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  function drawWall() {
    ctx.fillStyle = '#c9843f';
    ctx.beginPath();
    ctx.ellipse(0, -40, 30, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0a86a';
    ctx.beginPath();
    ctx.ellipse(-8, -52, 10, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 48, 18, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -58);
    ctx.lineTo(-2, -44);
    ctx.lineTo(-12, -30);
    ctx.stroke();
    eyePair(-2, -44, 1);
    ctx.strokeStyle = '#6a3e16';
    ctx.beginPath();
    ctx.arc(-2, -32, 7, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  function drawMine(armed) {
    ctx.fillStyle = '#8d5a32';
    ctx.beginPath();
    ctx.ellipse(0, -8, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b4124';
    ctx.beginPath();
    ctx.ellipse(0, -12, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!armed) {
      ctx.fillStyle = '#c9843f';
      ctx.fillRect(-2, -22, 4, 12);
      return;
    }
    ctx.fillStyle = '#d7b48a';
    ctx.beginPath();
    ctx.arc(0, -20, 12, 0, Math.PI * 2);
    ctx.fill();
    eyePair(0, -22, 0.7);
    ctx.fillStyle = '#e23b32';
    ctx.beginPath();
    ctx.arc(0, -30, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCherry(fuse) {
    const spark = 0.5 + Math.sin(clock * 18) * 0.5;
    ctx.strokeStyle = '#6b4124';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -48);
    ctx.quadraticCurveTo(0, -70, 12, -46);
    ctx.stroke();
    ctx.fillStyle = '#ff5a6a';
    ctx.beginPath();
    ctx.arc(-14, -36, 16, 0, Math.PI * 2);
    ctx.arc(14, -32, 16, 0, Math.PI * 2);
    ctx.fill();
    eyePair(-14, -38, 0.7);
    eyePair(14, -34, 0.7);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(0, -66, 3 + spark * 3, 0, Math.PI * 2);
    ctx.fill();
    if (fuse > 0 && fuse < 0.4) {
      ctx.fillStyle = 'rgba(255, 90, 60, ' + (0.35 + spark * 0.4) + ')';
      ctx.beginPath();
      ctx.arc(0, -40, 34, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawZombie(z) {
    const eating = z.hp > 0 && match.plants.some(function (p) {
      if (p.row !== z.row) return false;
      const cx = D.cellCenterX(p.col);
      return z.x <= cx + 28 && z.x >= cx - 34;
    });
    const swing = reduceMotion ? 0 : Math.sin(clock * (eating ? 14 : 7) + z.id);
    const fade = z.hp <= 0 ? Math.max(0, z.dying / 0.55) : 1;
    const feet = D.feetY(z.row);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(z.x, feet + (z.hp <= 0 ? (1 - fade) * 26 : 0));
    shadow(26, 0, 22);
    ctx.strokeStyle = '#6d8f52';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(16, -8);
    ctx.lineTo(10 + swing * 6, 0);
    ctx.moveTo(30, -8);
    ctx.lineTo(34 - swing * 6, 0);
    ctx.stroke();
    ctx.fillStyle = z.slow > 0 ? '#9fd0c8' : '#8fbf6a';
    ctx.beginPath();
    ctx.ellipse(26, -46, 18, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6d8f52';
    ctx.beginPath();
    ctx.ellipse(-2, -40 + (eating ? swing * 3 : 0), 14, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = z.slow > 0 ? '#b7e0d8' : '#a4cf84';
    ctx.beginPath();
    ctx.arc(16, -78, 16, 0, Math.PI * 2);
    ctx.fill();
    eyePair(14, -80, 0.9);
    ctx.strokeStyle = '#24160f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(12, -72, 5, 0.15, Math.PI - 0.1);
    ctx.stroke();
    if (z.kind === 'cone') {
      ctx.fillStyle = '#f08a2a';
      ctx.beginPath();
      ctx.moveTo(16, -112);
      ctx.lineTo(30, -84);
      ctx.lineTo(2, -84);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.moveTo(16, -106);
      ctx.lineTo(20, -88);
      ctx.lineTo(12, -88);
      ctx.fill();
    } else if (z.kind === 'bucket') {
      ctx.fillStyle = '#8d97a3';
      roundRect(2, -108, 28, 26, 4);
      ctx.fill();
      ctx.fillStyle = '#d5dbe3';
      ctx.fillRect(8, -104, 6, 16);
    } else {
      ctx.fillStyle = '#6d8f52';
      ctx.beginPath();
      ctx.ellipse(16, -92, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = z.kind === 'bucket' ? '#6a7c90' : (z.kind === 'cone' ? '#d06a28' : '#c4564a');
    ctx.fillRect(16, -58, 14, 16);
    if (z.hp > 0 && z.hp < z.maxHp) hpBar(4, -120, 40, z.hp, z.maxHp);
    ctx.restore();
  }

  function hpBar(x, y, w, hp, max) {
    const k = Math.max(0, Math.min(1, hp / max));
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    roundRect(x, y, w, 6, 3);
    ctx.fill();
    ctx.fillStyle = k > 0.45 ? '#7ad36a' : '#e15a4a';
    roundRect(x, y, Math.max(2, w * k), 6, 3);
    ctx.fill();
  }

  function drawMower(m) {
    if (m.x > L.W + 40) return;
    const y = D.feetY(m.row);
    ctx.save();
    ctx.translate(m.x, y);
    shadow(16, 0, 18);
    ctx.fillStyle = '#30343a';
    ctx.beginPath();
    ctx.arc(4, -6, 7, 0, Math.PI * 2);
    ctx.arc(28, -6, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e24b3a';
    roundRect(0, -22, 34, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#f3f5f8';
    ctx.fillRect(24, -28, 4, 12);
    ctx.restore();
  }

  function drawPea(p) {
    const y = D.feetY(p.row) - 52;
    ctx.fillStyle = p.slow ? '#d7f4ff' : '#b6e86a';
    ctx.beginPath();
    ctx.arc(p.x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath();
    ctx.arc(p.x - 2, y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSunOrb(s) {
    const pop = Math.min(1, (clock - s.born) * 4);
    const r = 22 * (0.7 + 0.3 * pop);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(clock * 0.6 + s.id);
    ctx.fillStyle = 'rgba(255, 209, 92, 0.35)';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, -r - 6, 3, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(0);
    ctx.restore();
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = '#ffd15c';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(-5, -5, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    eyePair(0, -2, 0.7);
    ctx.restore();
  }

  function drawLawn() {
    for (let r = 0; r < L.ROWS; r++) {
      const y = r * L.ROW_H;
      const g = ctx.createLinearGradient(0, y, 0, y + L.ROW_H);
      g.addColorStop(0, r % 2 ? '#63c24c' : '#58b743');
      g.addColorStop(0.55, r % 2 ? '#4eaa3c' : '#459934');
      g.addColorStop(1, '#3d8c2e');
      ctx.fillStyle = g;
      ctx.fillRect(L.LAWN_X, y, L.COLS * L.COL_W, L.ROW_H);
      for (let c = 0; c < L.COLS; c++) {
        if ((r + c) % 2 === 0) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(L.LAWN_X + c * L.COL_W, y, L.COL_W, L.ROW_H);
      }
      ctx.fillStyle = 'rgba(30, 70, 20, 0.18)';
      ctx.fillRect(L.LAWN_X, y + L.ROW_H - 8, L.COLS * L.COL_W, 8);
    }
    for (let i = 0; i < TUFTS.length; i++) {
      const t = TUFTS[i];
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.flip ? -t.s : t.s, t.s);
      ctx.fillStyle = '#3f9a34';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(5, -12, 1, -18);
      ctx.quadraticCurveTo(7, -8, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < FLOWERS.length; i++) {
      const f = FLOWERS[i];
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.fillStyle = f.pink ? '#ffb7c8' : '#fff';
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 4 * f.s, Math.sin(a) * 4 * f.s, 2.1 * f.s, 3 * f.s, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd15c';
      ctx.beginPath();
      ctx.arc(0, 0, 2 * f.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = match.selected ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = match.selected ? 1.6 : 1;
    ctx.beginPath();
    for (let c = 0; c <= L.COLS; c++) {
      const x = L.LAWN_X + c * L.COL_W;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, L.H);
    }
    for (let r = 0; r <= L.ROWS; r++) {
      const y = r * L.ROW_H;
      ctx.moveTo(L.LAWN_X, y);
      ctx.lineTo(L.LAWN_X + L.COLS * L.COL_W, y);
    }
    ctx.stroke();
  }

  function drawSidewalk() {
    const x = L.LAWN_X + L.COLS * L.COL_W;
    const w = L.W - x;
    const g = ctx.createLinearGradient(x, 0, L.W, 0);
    g.addColorStop(0, '#d5dbe2');
    g.addColorStop(1, '#b7c0ca');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, L.H);
    for (let r = 0; r < L.ROWS; r++) {
      const y = r * L.ROW_H;
      ctx.fillStyle = '#c4a27a';
      ctx.fillRect(x + 10, y + 18, 12, L.ROW_H - 30);
      ctx.fillStyle = '#8d6239';
      ctx.fillRect(x + 4, y + 36, L.SIDE_W - 6, 8);
      ctx.fillRect(x + 4, y + L.ROW_H - 48, L.SIDE_W - 6, 8);
    }
  }

  function drawHouse() {
    const x = L.PANEL_W;
    const w = L.LAWN_X - x;
    const sky = ctx.createLinearGradient(0, 0, 0, 210);
    sky.addColorStop(0, '#79c8f6');
    sky.addColorStop(1, '#dff4ff');
    ctx.fillStyle = sky;
    ctx.fillRect(x, 0, w, 210);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, 150);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    const drift = reduceMotion ? 0 : (clock * 8) % 80;
    drawCloud(x + 36 + drift * 0.2, 48, 1);
    drawCloud(x + 110 - drift * 0.15, 86, 0.65);
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
    ctx.beginPath();
    ctx.arc(x + w - 28, 36, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d4534a';
    ctx.beginPath();
    ctx.moveTo(x - 6, 188);
    ctx.lineTo(x + w * 0.5, 118);
    ctx.lineTo(x + w + 10, 188);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 32, 28, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const yy = 140 + i * 9;
      ctx.beginPath();
      ctx.moveTo(x + 20, yy);
      ctx.lineTo(x + w - 16, yy);
      ctx.stroke();
    }

    const wall = ctx.createLinearGradient(0, 180, 0, L.H);
    wall.addColorStop(0, '#f8e2b8');
    wall.addColorStop(1, '#e7c48a');
    ctx.fillStyle = wall;
    ctx.fillRect(x, 180, w, L.H - 180);
    ctx.fillStyle = 'rgba(90, 50, 20, 0.08)';
    for (let i = 0; i < 8; i++) ctx.fillRect(x, 200 + i * 64, w, 2);

    drawWindow(x + 22, 230);
    drawWindow(x + w - 58, 230);
    drawWindow(x + 22, 420);

    ctx.fillStyle = '#8d4b32';
    roundRect(x + w / 2 - 26, 300, 52, 150, 8);
    ctx.fill();
    ctx.fillStyle = '#c9843f';
    ctx.fillRect(x + w / 2 + 12, 370, 6, 6);
    fillText('家', x + w / 2, 360, 22, '#f8e2b8');

    ctx.fillStyle = '#6aa84f';
    ctx.beginPath();
    ctx.ellipse(x + w - 8, 214, 28, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 14 * s, 0, Math.PI * 2);
    ctx.arc(x + 16 * s, y + 4, 12 * s, 0, Math.PI * 2);
    ctx.arc(x - 14 * s, y + 6, 10 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWindow(x, y) {
    ctx.fillStyle = '#9fd4f2';
    roundRect(x, y, 36, 40, 4);
    ctx.fill();
    ctx.strokeStyle = '#f8e2b8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 18, y);
    ctx.lineTo(x + 18, y + 40);
    ctx.moveTo(x, y + 20);
    ctx.lineTo(x + 36, y + 20);
    ctx.stroke();
  }

  function drawBank() {
    ctx.fillStyle = '#5c341c';
    ctx.fillRect(0, 0, L.PANEL_W, L.H);
    const wood = ctx.createLinearGradient(0, 0, L.PANEL_W, 0);
    wood.addColorStop(0, '#7a4524');
    wood.addColorStop(0.5, '#8d552e');
    wood.addColorStop(1, '#6b3e22');
    ctx.fillStyle = wood;
    roundRect(5, 5, L.PANEL_W - 14, L.H - 10, 10);
    ctx.fill();

    for (let i = 0; i < D.CARDS.length; i++) drawPacket(i);
    drawShovel();
  }

  function drawPacket(i) {
    const card = D.CARDS[i];
    const st = match.cards[i];
    const r = D.packetRect(i);
    const selected = match.selected === card.id;
    ctx.save();
    ctx.fillStyle = '#f4e2c2';
    roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = '#ef9a3a';
      ctx.lineWidth = 4;
      roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
      ctx.stroke();
    }
    drawPlant(card.id, r.x + r.w / 2, r.y + r.h * 0.48, 0.34, { icon: true });
    const bodyH = r.h - 38;
    if (match.sun < card.cost && st.cd <= 0) {
      ctx.fillStyle = 'rgba(40, 32, 24, 0.28)';
      ctx.fillRect(r.x, r.y, r.w, bodyH);
    }
    if (st.cd > 0) {
      const k = Math.max(0, Math.min(1, st.cd / card.cd));
      ctx.fillStyle = 'rgba(20, 16, 12, 0.55)';
      ctx.fillRect(r.x, r.y, r.w, bodyH * k);
      fillText(String(Math.ceil(st.cd)), r.x + r.w / 2, r.y + 26, 18, '#fffaf0');
    }
    fillText(card.name, r.x + r.w / 2, r.y + r.h - 30, 16, '#3d2914');
    ctx.fillStyle = match.sun < card.cost ? '#a94438' : '#2f7d32';
    roundRect(r.x + 8, r.y + r.h - 22, r.w - 16, 16, 6);
    ctx.fill();
    fillText(String(card.cost), r.x + r.w / 2, r.y + r.h - 14, 14, '#fffaf0');
    ctx.restore();
  }

  function drawShovel() {
    const r = D.shovelRect();
    const selected = match.selected === 'shovel';
    ctx.save();
    ctx.fillStyle = selected ? '#ffe08a' : '#f4e2c2';
    roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = '#ef9a3a';
      ctx.lineWidth = 4;
      roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
      ctx.stroke();
    }
    ctx.strokeStyle = '#8d552e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r.x + 34, r.y + 46);
    ctx.lineTo(r.x + 70, r.y + 16);
    ctx.stroke();
    ctx.fillStyle = '#d5dbe3';
    ctx.beginPath();
    ctx.moveTo(r.x + 62, r.y + 14);
    ctx.lineTo(r.x + 86, r.y + 28);
    ctx.lineTo(r.x + 70, r.y + 42);
    ctx.closePath();
    ctx.fill();
    fillText('铲子', r.x + r.w / 2, r.y + r.h - 14, 15, '#3d2914');
    ctx.restore();
  }

  function drawHover() {
    if (mode !== 'play' || !hover || !match.selected) return;
    const rect = D.cellRect(hover.row, hover.col);
    const prev = Sim.preview(match, hover.row, hover.col);
    ctx.fillStyle = prev && prev.ok ? 'rgba(190, 255, 150, 0.38)' : 'rgba(255, 70, 60, 0.32)';
    ctx.fillRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
    if (prev && prev.mode === 'plant') {
      drawPlant(prev.kind, D.cellCenterX(hover.col), D.feetY(hover.row), 1, { ghost: true, id: 3 });
    }
  }

  function drawSunHud() {
    const x = L.PANEL_W + 10;
    const y = 16;
    const w = L.LAWN_X - x - 12;
    ctx.fillStyle = 'rgba(255, 250, 236, 0.92)';
    roundRect(x, y, w, 58, 12);
    ctx.fill();
    fillText('☀ ' + match.sun, x + w / 2, y + 30, 28, '#c47a00');
  }

  function drawPills() {
    if (mode === 'title') return;
    const label = statusText();
    pill(L.LAWN_X + (L.COLS * L.COL_W) / 2, 28, label, '#3d2914');
    const cx = L.LAWN_X + (L.COLS * L.COL_W) / 2;
    if (toastT > 0 && toast) pill(cx, 72, toast, '#8a2e24');
    else if (match.selected && match.selected !== 'shovel') {
      const def = D.cardById(match.selected);
      if (def) pill(cx, 72, def.blurb, '#245022');
    } else if (match.selected === 'shovel') {
      pill(cx, 72, '铲子 · 点一株豆豆铲掉，不退阳光', '#6a3b16');
    }
    if (bannerT > 0 && banner) {
      ctx.font = '800 40px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#fff8e8';
      ctx.strokeText(banner, L.LAWN_X + (L.COLS * L.COL_W) / 2, 150);
      ctx.fillStyle = '#e23b32';
      ctx.fillText(banner, L.LAWN_X + (L.COLS * L.COL_W) / 2, 150);
    }
  }

  function pill(x, y, text, color) {
    ctx.font = '800 20px "Microsoft YaHei", "PingFang SC", sans-serif';
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = 'rgba(255, 250, 236, 0.88)';
    roundRect(x - w / 2, y - 16, w, 32, 16);
    ctx.fill();
    fillText(text, x, y, 20, color);
  }

  function drawBits() {
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i];
      ctx.globalAlpha = Math.max(0, b.life / b.max);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i];
      ctx.globalAlpha = Math.max(0, f.life / 0.9);
      fillText(f.text, f.x, f.y, 22, f.color);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    const mag = shake > 0.4 ? shake : 0;
    const ox = mag ? (Math.random() - 0.5) * mag : 0;
    const oy = mag ? (Math.random() - 0.5) * mag * 0.45 : 0;
    ctx.setTransform(sx, 0, 0, sy, ox * sx, oy * sy);
    ctx.clearRect(-30, -30, L.W + 60, L.H + 60);

    drawLawn();
    drawSidewalk();
    drawHouse();
    for (let i = 0; i < match.mowers.length; i++) drawMower(match.mowers[i]);
    for (let i = 0; i < match.plants.length; i++) {
      const p = match.plants[i];
      drawPlant(p.kind, D.cellCenterX(p.col), D.feetY(p.row), 1, {
        id: p.id,
        armed: p.armed,
        fuse: p.fuse,
      });
      if (p.hp < p.maxHp) hpBar(D.cellCenterX(p.col) - 22, D.feetY(p.row) - 108, 44, p.hp, p.maxHp);
      if (p.kind === 'mine' && !p.armed) {
        const def = D.cardById('mine');
        const k = 1 - Math.max(0, p.arm) / def.arm;
        const bx = D.cellCenterX(p.col) - 18;
        const by = D.feetY(p.row) - 18;
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(bx, by, 36, 5);
        ctx.fillStyle = '#ffd15c';
        ctx.fillRect(bx, by, 36 * k, 5);
      }
    }
    const zs = match.zombies.slice().sort(function (a, b) { return a.row - b.row || a.x - b.x; });
    for (let i = 0; i < zs.length; i++) drawZombie(zs[i]);
    for (let i = 0; i < match.peas.length; i++) drawPea(match.peas[i]);
    drawHover();
    for (let i = 0; i < match.suns.length; i++) drawSunOrb(match.suns[i]);
    drawBits();
    drawBank();
    drawSunHud();
    drawPills();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    sx = canvas.width / L.W;
    sy = canvas.height / L.H;
    if (stage) stage.style.setProperty('--u', String(r.width / L.W));
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

  let last = 0;
  function frame(now) {
    if (!last) last = now;
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduceMotion) clock += dt;
    dt *= FAST;

    if (mode === 'play') {
      Sim.step(match, dt);
      takeEvents();
      if (match.result && !ending) {
        ending = true;
        endDelay = match.result === 'lose' ? 0.4 : 0.75;
      }
      if (ending) {
        endDelay -= dt / FAST;
        if (endDelay <= 0) openEnd();
      }
    }

    if (toastT > 0) toastT -= dt / FAST;
    if (bannerT > 0) bannerT -= dt / FAST;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt / FAST;
      b.x += b.vx * (dt / FAST);
      b.y += b.vy * (dt / FAST);
      b.vy += 180 * (dt / FAST);
      if (b.life <= 0) bits.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt / FAST;
      f.y += f.vy * (dt / FAST);
      if (f.life <= 0) floats.splice(i, 1);
    }
    if (shake > 0) {
      shake = reduceMotion ? 0 : Math.max(0, shake - 28 * (dt / FAST));
    }
    render();
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  window.__Z = {
    get mode() { return mode; },
    get match() { return match; },
    start: function () { startPlay(false); },
  };
})();
