/* 鲸鱼娘大战 v2 — UI 模块（SPEC 5.5）
 *
 * 浏览器全局脚本（IIFE），不 import/export，不依赖 DOM，可在 Node 用假 ctx 运行。
 * 对外只挂 WV.UI = { draw(G, ctx), hitTest(mx, my, G) }。
 *
 * 布局（逻辑分辨率 800x600）：
 *   左 600x600 = 游戏区；右 200x600 = HUD（x 600..800）。
 *   静音按钮固定在 canvas 右上角 44x44（x=748..792, y=8..52）。
 *   三选一卡片：150x190，横排居中于游戏区（x=55/225/395, y=205..395）。
 *   「开始 / 再来一局 / 继续」按钮：220x56，命中区均 >= 44px。
 *
 * hitTest 返回 { action, index } 或 null；action 属于：
 *   start / card / restart / mute / resume。
 */
(function (root) {
  'use strict';

  const WV = root.WV = root.WV || {};

  /* ------------------------------------------------------------------ *
   * 调色板与字体（系统字体，零外部资源）
   * ------------------------------------------------------------------ */
  const C = {
    bg: '#061019',
    panel: '#0b1927',
    raised: '#0f2438',
    deep: '#081521',
    text: '#eef6ff',
    dim: '#93a9bf',
    faint: 'rgba(255,255,255,0.34)',
    line: 'rgba(255,255,255,0.11)',
    lineSoft: 'rgba(255,255,255,0.07)',
    accent: '#5ad2ff',
    accent2: '#ffd166',
    green: '#8ce99a',
    danger: '#ff7b8a',
    heart: '#ff8fa8',
    shade: 'rgba(3,9,15,0.82)',
  };
  const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif';
  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Microsoft YaHei", sans-serif';

  /* 三选一卡片尺寸（SPEC：每张 150x190） */
  const CARD_W = 150;
  const CARD_H = 190;
  const CARD_GAP = 20;
  const CARD_TOP = 205;

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */
  function n(v, d) {
    return typeof v === 'number' && isFinite(v) ? v : d;
  }

  function clampInt(v, lo, hi) {
    v = Math.round(n(v, lo));
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function wvNum(key, fallback) {
    const w = root.WV;
    return w && typeof w[key] === 'number' && isFinite(w[key]) ? w[key] : fallback;
  }

  function mapW() { return wvNum('MAP_W', 600); }
  function canvasW() { return wvNum('W', mapW() + wvNum('HUD_W', 200)); }
  function canvasH() { return wvNum('H', 600); }

  function accentOf(G) {
    return G && G.theme && typeof G.theme.accent === 'string' ? G.theme.accent : C.accent;
  }

  function accent2Of(G) {
    return G && G.theme && typeof G.theme.accent2 === 'string' ? G.theme.accent2 : C.accent2;
  }

  function fmtNum(v) {
    const num = Math.max(0, Math.floor(n(v, 0)));
    return String(num);
  }

  function fmtTime(sec) {
    const t = Math.max(0, Math.floor(n(sec, 0)));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m + ':' + (s < 10 ? '0' + s : String(s));
  }

  function setFont(ctx, size, weight, emoji) {
    ctx.font = (weight ? weight + ' ' : '') + size + 'px ' + (emoji ? EMOJI_FONT : FONT);
  }

  /* ------------------------------------------------------------------ *
   * 形状 / 文本绘制（只用标准 2D API）
   * ------------------------------------------------------------------ */
  function rr(ctx, x, y, w, h, radius) {
    const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function hline(ctx, x, y, w, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 1);
  }

  function textLeft(ctx, s, x, y, size, weight, color) {
    ctx.save();
    setFont(ctx, size, weight, false);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(s), x, y);
    ctx.restore();
  }

  function textRight(ctx, s, right, y, size, weight, color) {
    const str = String(s);
    ctx.save();
    setFont(ctx, size, weight, false);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(str).width;
    ctx.fillText(str, right - w, y);
    ctx.restore();
  }

  function centerText(ctx, s, cx, y, size, weight, color) {
    const str = String(s);
    ctx.save();
    setFont(ctx, size, weight, false);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(str).width;
    ctx.fillText(str, cx - w / 2, y);
    ctx.restore();
  }

  function iconText(ctx, ch, cx, cy, size) {
    const str = String(ch);
    ctx.save();
    setFont(ctx, size, '', true);
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(str).width;
    ctx.fillText(str, cx - w / 2, cy);
    ctx.restore();
  }

  function wrapText(ctx, s, maxWidth, size) {
    const str = String(s == null ? '' : s);
    const lines = [];
    let cur = '';
    ctx.save();
    setFont(ctx, size, '', false);
    for (let i = 0; i < str.length; i++) {
      const ch = str.charAt(i);
      if (ch === '\n') {
        lines.push(cur);
        cur = '';
        continue;
      }
      const test = cur + ch;
      if (cur && ctx.measureText(test).width > maxWidth) {
        lines.push(cur);
        cur = ch;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    ctx.restore();
    return lines;
  }

  function heart(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.78);
    ctx.bezierCurveTo(cx - s * 1.12, cy + s * 0.02, cx - s * 0.62, cy - s * 0.92, cx, cy - s * 0.30);
    ctx.bezierCurveTo(cx + s * 0.62, cy - s * 0.92, cx + s * 1.12, cy + s * 0.02, cx, cy + s * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function wave(ctx, y, amp, color) {
    const MW = mapW();
    const seg = 6;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let i = 0; i < seg; i++) {
      const cxp = MW * (i + 0.5) / seg;
      const nx = MW * (i + 1) / seg;
      ctx.quadraticCurveTo(cxp, y + (i % 2 === 0 ? -amp : amp) * 2, nx, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function button(ctx, r, label, opts) {
    opts = opts || {};
    rr(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = opts.bg || 'rgba(90,210,255,0.18)';
    ctx.fill();
    ctx.strokeStyle = opts.stroke || 'rgba(90,210,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    centerText(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + (opts.size || 22) * 0.35,
      opts.size || 22, 'bold', opts.color || C.text);
  }

  function panel(ctx, r, fill, stroke, radius) {
    rr(ctx, r.x, r.y, r.w, r.h, radius == null ? 18 : radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function checkMark(ctx, cx, cy, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy + 1);
    ctx.lineTo(cx - 2, cy + 7);
    ctx.lineTo(cx + 9, cy - 6);
    ctx.stroke();
    ctx.restore();
  }

  function crossMark(ctx, cx, cy, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 7);
    ctx.lineTo(cx + 7, cy + 7);
    ctx.moveTo(cx + 7, cy - 7);
    ctx.lineTo(cx - 7, cy + 7);
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * 点击区（draw 与 hitTest 共用同一份几何）
   * ------------------------------------------------------------------ */
  function muteRect() {
    return { x: canvasW() - 8 - 44, y: 8, w: 44, h: 44 };
  }

  function startRect() {
    const MW = mapW();
    return { x: Math.round(MW / 2 - 110), y: 272, w: 220, h: 56 };
  }

  function restartRect() {
    const MW = mapW();
    return { x: Math.round(MW / 2 - 110), y: 396, w: 220, h: 56 };
  }

  function resumeRect() {
    const MW = mapW();
    return { x: Math.round(MW / 2 - 110), y: 292, w: 220, h: 56 };
  }

  function cardRect(index) {
    const MW = mapW();
    const total = CARD_W * 3 + CARD_GAP * 2;
    const x0 = Math.round((MW - total) / 2);
    return {
      x: x0 + index * (CARD_W + CARD_GAP),
      y: CARD_TOP,
      w: CARD_W,
      h: CARD_H,
    };
  }

  function inside(mx, my, r) {
    return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
  }

  /* ------------------------------------------------------------------ *
   * HUD（右侧 200px）
   * ------------------------------------------------------------------ */
  function resolveUpgrade(id) {
    const list = root.WV && root.WV.UPGRADES;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u && u.id === id) return u;
      }
    }
    return null;
  }

  function iconOf(id) {
    const u = resolveUpgrade(id);
    return u && u.icon ? u.icon : '★';
  }

  function drawMute(G, ctx) {
    const r = muteRect();
    const muted = !!(G && G.muted);
    rr(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = muted ? '#3a1a24' : '#12293d';
    ctx.fill();
    ctx.strokeStyle = muted ? C.danger : 'rgba(90,210,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    iconText(ctx, muted ? '🔇' : '🔊', r.x + r.w / 2, r.y + r.h / 2 + 1, 21);
  }

  function drawHud(G, ctx) {
    const H = canvasH();
    const x0 = mapW();
    const hudW = canvasW() - x0;
    const pad = 14;
    const ix = x0 + pad;
    const iw = hudW - pad * 2;

    /* 面板底 */
    ctx.fillStyle = C.panel;
    ctx.fillRect(x0, 0, hudW, H);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(x0, 0, hudW, 54);
    ctx.fillStyle = accentOf(G);
    ctx.fillRect(x0, 0, 2, H);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(x0 + 2, 0, 2, H);

    /* 顶部：标题小字 + 静音 */
    textLeft(ctx, '鲸鱼娘大战', ix, 31, 14, 'bold', C.text);
    hline(ctx, ix, 46, iw - 52, C.line);
    drawMute(G, ctx);

    /* 关卡 */
    const lv = clampInt(n(G.level, 0), 0, 2);
    textLeft(ctx, '第 ' + (lv + 1) + ' / 3 关', ix, 74, 12, '', accent2Of(G));
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(ix + iw - 6 - (2 - i) * 12, 70, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === lv ? accentOf(G) : 'rgba(255,255,255,0.18)';
      ctx.fill();
    }
    const levelName = (G && typeof G.levelName === 'string' && G.levelName) ? G.levelName : '准备中';
    textLeft(ctx, levelName, ix, 101, 19, 'bold', C.text);
    hline(ctx, ix, 114, iw, C.lineSoft);

    /* 剩余敌人 */
    const left = Math.max(0, Math.floor(n(G.enemiesLeft, 0)));
    const total = Math.max(0, Math.floor(n(G.totalEnemies, 0)));
    textLeft(ctx, '剩余敌人', ix, 138, 12, '', C.dim);
    textRight(ctx, left + ' / ' + total, ix + iw, 138, 15, 'bold', C.text);
    rr(ctx, ix, 146, iw, 6, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    if (total > 0 && left > 0) {
      const ratio = Math.max(0, Math.min(1, left / total));
      rr(ctx, ix, 146, Math.max(6, iw * ratio), 6, 3);
      ctx.fillStyle = left <= 3 ? C.danger : accentOf(G);
      ctx.fill();
    }

    /* 命（心形 x lives） */
    textLeft(ctx, '生命', ix, 176, 12, '', C.dim);
    const lives = Math.max(0, Math.floor(n(G && G.player && G.player.lives, 3)));
    const hearts = Math.min(lives, 8);
    for (let i = 0; i < hearts; i++) {
      heart(ctx, ix + 9 + i * 20, 189, 9, C.heart);
    }
    if (lives === 0) textLeft(ctx, '× 0', ix + 4, 193, 12, '', C.danger);

    /* 分数 */
    textLeft(ctx, '分数', ix, 219, 12, '', C.dim);
    textRight(ctx, fmtNum(G.score), ix + iw, 220, 20, 'bold', accent2Of(G));
    hline(ctx, ix, 233, iw, C.lineSoft);

    /* 已拿强化：最多 8 个，两列 */
    const ups = Array.isArray(G.upgrades) ? G.upgrades.slice(0, 8) : [];
    textLeft(ctx, '已拿强化', ix, 257, 12, '', C.dim);
    textRight(ctx, ups.length + ' / 8', ix + iw, 257, 11, '', C.faint);
    const cellW = (iw - 8) / 2;
    const cellH = 26;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        const idx = row * 2 + col;
        const cx = ix + col * (cellW + 8);
        const cy = 268 + row * 32;
        rr(ctx, cx, cy, cellW, cellH, 8);
        ctx.fillStyle = idx < ups.length ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.028)';
        ctx.fill();
        if (idx < ups.length) {
          ctx.strokeStyle = 'rgba(90,210,255,0.30)';
          ctx.lineWidth = 1;
          ctx.stroke();
          iconText(ctx, iconOf(ups[idx]), cx + cellW / 2, cy + cellH / 2 + 1, 15);
        }
      }
    }

    /* 底部操作提示 */
    hline(ctx, ix, 500, iw, C.line);
    textLeft(ctx, '方向键/WASD 移动 · 空格 开火', ix, 528, 11, '', C.dim);
    textLeft(ctx, '点右上角静音', ix, 552, 10, '', C.faint);
  }

  /* ------------------------------------------------------------------ *
   * title
   * ------------------------------------------------------------------ */
  function drawRiceBowl(ctx, cx, cy, s) {
    ctx.save();
    /* 蒸汽 */
    ctx.strokeStyle = 'rgba(205,236,255,0.34)';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      const bx = cx + i * s * 0.38;
      ctx.beginPath();
      ctx.moveTo(bx, cy - s * 0.52);
      ctx.quadraticCurveTo(bx - 7, cy - s * 0.82, bx, cy - s * 1.10);
      ctx.stroke();
    }
    /* 碗身 */
    ctx.beginPath();
    ctx.moveTo(cx - s, cy);
    ctx.quadraticCurveTo(cx, cy + s * 0.98, cx + s, cy);
    ctx.closePath();
    ctx.fillStyle = '#dfeefc';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* 碗口 */
    ctx.beginPath();
    ctx.ellipse(cx, cy, s, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f7fbff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,220,0.72)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    /* 米饭堆 */
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * s * 0.27, cy - s * 0.08, s * 0.30, Math.PI, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f1f8ff';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTitle(G, ctx) {
    const MW = mapW();
    const H = canvasH();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, MW, H);

    /* 深海光晕 */
    for (let i = 2; i >= 0; i--) {
      ctx.beginPath();
      ctx.arc(MW / 2, 205, 150 + i * 90, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(90,210,255,' + (0.035 + (2 - i) * 0.022).toFixed(3) + ')';
      ctx.fill();
    }

    /* 水波 */
    for (let k = 0; k < 3; k++) {
      wave(ctx, 522 + k * 26, 10, 'rgba(90,210,255,' + (0.05 + k * 0.035).toFixed(3) + ')');
    }

    /* 气泡 */
    const bubbles = [
      [64, 128, 5], [116, 88, 3], [512, 132, 6], [472, 196, 3.5],
      [88, 300, 4], [534, 330, 5], [168, 388, 3], [420, 372, 4],
    ];
    ctx.strokeStyle = 'rgba(160,220,255,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < bubbles.length; i++) {
      ctx.beginPath();
      ctx.arc(bubbles[i][0], bubbles[i][1], bubbles[i][2], 0, Math.PI * 2);
      ctx.stroke();
    }

    /* 大标题：鲸鱼娘大战 Claude */
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(90,210,255,0.55)';
    ctx.shadowBlur = 20;
    setFont(ctx, 46, 'bold', false);
    const w1 = ctx.measureText('鲸鱼娘大战').width;
    setFont(ctx, 40, 'bold', false);
    const w2 = ctx.measureText('Claude').width;
    const totalW = w1 + 12 + w2;
    let tx = MW / 2 - totalW / 2;
    setFont(ctx, 46, 'bold', false);
    ctx.fillStyle = C.text;
    ctx.fillText('鲸鱼娘大战', tx, 178);
    tx += w1 + 12;
    setFont(ctx, 40, 'bold', false);
    ctx.fillStyle = accentOf(G);
    ctx.fillText('Claude', tx, 178);
    ctx.restore();

    /* 分隔短条 + 副标题 */
    ctx.fillStyle = accent2Of(G);
    ctx.fillRect(MW / 2 - 42, 198, 84, 3);
    centerText(ctx, '3 关 · 5 分钟 · 大白饭保卫战', MW / 2, 232, 18, '', accent2Of(G));

    /* 开始按钮 */
    button(ctx, startRect(), '开始游戏', { size: 22, bg: 'rgba(90,210,255,0.20)' });
    centerText(ctx, '点击任意处开始 · 回车', MW / 2, 358, 13, '', C.dim);

    /* 大白饭 */
    drawRiceBowl(ctx, MW / 2, 458, 50);

    /* 最高分 / 页脚 */
    const best = Math.floor(n(G && G.best, 0));
    if (best > 0) {
      centerText(ctx, '最高分 ' + fmtNum(best), MW / 2, 556, 12, '', 'rgba(255,255,255,0.55)');
    }
    textLeft(ctx, 'WHALE vs CLAUDE', 14, 588, 10, '', 'rgba(255,255,255,0.22)');
    textRight(ctx, 'v2', MW - 14, 588, 10, '', 'rgba(255,255,255,0.22)');
  }

  /* ------------------------------------------------------------------ *
   * intro
   * ------------------------------------------------------------------ */
  function goalOf(G) {
    const lv = clampInt(n(G.level, 0), 0, 2);
    if (lv === 2) {
      return { boss: true, title: 'BOSS 出现', sub: '击破要塞 BOSS，守住大白饭' };
    }
    if (lv === 1) {
      return { boss: false, title: '穿过暗流，清掉所有 Claude 娘', sub: '水边窄道，别被抄后路' };
    }
    return { boss: false, title: '守住大白饭，清掉所有 Claude 娘', sub: '砖墙可以打掉，记得留条退路' };
  }

  function drawIntro(G, ctx) {
    const MW = mapW();
    const H = canvasH();
    const lv = clampInt(n(G.level, 0), 0, 2);
    const goal = goalOf(G);
    const name = (G && typeof G.levelName === 'string' && G.levelName) ? G.levelName : '未知关卡';

    /* 半透明背景（露出后面的战场） */
    ctx.fillStyle = 'rgba(4,11,19,0.64)';
    ctx.fillRect(0, 0, MW, H);

    /* 顶部装饰短条 */
    ctx.fillStyle = accentOf(G);
    ctx.fillRect(MW / 2 - 30, 132, 60, 3);

    const r = { x: 60, y: 150, w: MW - 120, h: 258 };
    panel(ctx, r, 'rgba(10,24,38,0.92)', 'rgba(90,210,255,0.45)');

    centerText(ctx, '第 ' + (lv + 1) + ' 关 · 共 3 关', MW / 2, 196, 13, '', accent2Of(G));
    centerText(ctx, name, MW / 2, 252, 40, 'bold', C.text);

    if (goal.boss) {
      centerText(ctx, goal.title, MW / 2, 300, 28, 'bold', C.danger);
    } else {
      centerText(ctx, goal.title, MW / 2, 298, 17, '', C.text);
    }
    centerText(ctx, goal.sub, MW / 2, 330, 13, '', C.dim);

    /* 关卡进度点 */
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(MW / 2 + (i - 1) * 18, 362, 4, 0, Math.PI * 2);
      ctx.fillStyle = i === lv ? accentOf(G) : 'rgba(255,255,255,0.20)';
      ctx.fill();
    }
    centerText(ctx, '准备出发…', MW / 2, 390, 12, '', C.faint);
  }

  /* ------------------------------------------------------------------ *
   * clear
   * ------------------------------------------------------------------ */
  function drawClear(G, ctx) {
    const MW = mapW();
    const H = canvasH();
    const lv = clampInt(n(G.level, 0), 0, 2);

    ctx.fillStyle = 'rgba(4,11,19,0.56)';
    ctx.fillRect(0, 0, MW, H);

    const r = { x: 90, y: 158, w: MW - 180, h: 252 };
    panel(ctx, r, 'rgba(10,24,38,0.93)', 'rgba(140,233,154,0.45)');

    /* 通过徽章 */
    ctx.beginPath();
    ctx.arc(MW / 2, 196, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(140,233,154,0.14)';
    ctx.fill();
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    checkMark(ctx, MW / 2, 196, C.green);

    centerText(ctx, '第 ' + (lv + 1) + ' 关 通过', MW / 2, 254, 32, 'bold', accent2Of(G));
    hline(ctx, r.x + 40, 272, r.w - 80, C.line);

    const lx = r.x + 40;
    const rx = r.x + r.w - 40;
    textLeft(ctx, '分数', lx, 306, 13, '', C.dim);
    textRight(ctx, fmtNum(G.score), rx, 306, 20, 'bold', C.text);
    textLeft(ctx, '用时', lx, 338, 13, '', C.dim);
    const used = typeof G.levelTime === 'number' && isFinite(G.levelTime) ? G.levelTime : G.time;
    textRight(ctx, fmtTime(used), rx, 338, 18, 'bold', C.text);

    const hint = lv < 2 ? '接下来：选择一样强化' : '全部关卡完成，正在结算…';
    centerText(ctx, hint, MW / 2, 382, 12, '', C.dim);
  }

  /* ------------------------------------------------------------------ *
   * upgrade（三选一）
   * ------------------------------------------------------------------ */
  function drawCard(ctx, r, card, idx) {
    panel(ctx, r, C.raised, 'rgba(90,210,255,0.45)', 14);
    ctx.fillStyle = C.accent;
    ctx.fillRect(r.x + 16, r.y + 1, r.w - 32, 3);

    /* 序号角标 */
    ctx.beginPath();
    ctx.arc(r.x + 22, r.y + 24, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(90,210,255,0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,210,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    centerText(ctx, String(idx + 1), r.x + 22, r.y + 29, 12, 'bold', C.accent);

    /* 图标 */
    const icon = (card && card.icon) ? card.icon : iconOf(card && card.id);
    iconText(ctx, icon, r.x + r.w / 2, r.y + 74, 34);

    /* 名称 */
    const nm = (card && card.name) ? card.name : '强化';
    centerText(ctx, nm, r.x + r.w / 2, r.y + 116, 16, 'bold', C.text);

    /* 描述（自动换行） */
    const desc = (card && card.desc) ? card.desc : '';
    const lines = wrapText(ctx, desc, r.w - 28, 12);
    const startY = r.y + 140;
    for (let i = 0; i < lines.length && i < 3; i++) {
      centerText(ctx, lines[i], r.x + r.w / 2, startY + i * 16, 12, '', C.dim);
    }

    /* 底部装饰 */
    hline(ctx, r.x + 20, r.y + r.h - 14, r.w - 40, 'rgba(90,210,255,0.18)');
  }

  function drawUpgrade(G, ctx) {
    const MW = mapW();
    const H = canvasH();
    const cards = Array.isArray(G.cardChoices) ? G.cardChoices : [];

    ctx.fillStyle = 'rgba(3,9,15,0.80)';
    ctx.fillRect(0, 0, MW, H);

    centerText(ctx, '选择强化', MW / 2, 132, 26, 'bold', C.text);
    centerText(ctx, '本关通过 · 选一样带走', MW / 2, 160, 13, '', C.dim);

    if (cards.length === 0) {
      centerText(ctx, '（等待卡牌数据…）', MW / 2, 300, 14, '', C.faint);
    } else {
      const count = Math.min(cards.length, 3);
      for (let i = 0; i < count; i++) drawCard(ctx, cardRect(i), cards[i], i);
    }

    centerText(ctx, '点击卡片 · 或按 1 / 2 / 3', MW / 2, 440, 12, '', C.faint);
  }

  /* ------------------------------------------------------------------ *
   * result
   * ------------------------------------------------------------------ */
  function drawResult(G, ctx) {
    const MW = mapW();
    const H = canvasH();
    const res = G && G.result ? G.result : {};
    const win = !!res.win;
    const color = win ? C.green : C.danger;

    ctx.fillStyle = C.shade;
    ctx.fillRect(0, 0, MW, H);

    const r = { x: 70, y: 110, w: MW - 140, h: 380 };
    panel(ctx, r, 'rgba(10,24,38,0.95)', win ? 'rgba(140,233,154,0.45)' : 'rgba(255,123,138,0.45)');

    /* 结果徽章 */
    ctx.beginPath();
    ctx.arc(MW / 2, 160, 20, 0, Math.PI * 2);
    ctx.fillStyle = win ? 'rgba(140,233,154,0.14)' : 'rgba(255,123,138,0.14)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (win) checkMark(ctx, MW / 2, 160, color);
    else crossMark(ctx, MW / 2, 160, color);

    centerText(ctx, win ? '战斗胜利' : '战斗失败', MW / 2, 222, 38, 'bold', color);

    const msg = res && typeof res.msg === 'string' ? res.msg : '';
    if (msg) centerText(ctx, msg, MW / 2, 248, 13, '', C.dim);
    hline(ctx, r.x + 40, 264, r.w - 80, C.line);

    const lx = r.x + 40;
    const rx = r.x + r.w - 40;
    textLeft(ctx, '分数', lx, 296, 13, '', C.dim);
    textRight(ctx, fmtNum(G.score), rx, 296, 19, 'bold', C.text);
    textLeft(ctx, '用时', lx, 328, 13, '', C.dim);
    /* game.js 的 playTime 是真正在战斗里的时间；没有就退回 G.time */
    const used = (typeof G.playTime === 'number' && isFinite(G.playTime)) ? G.playTime : G.time;
    textRight(ctx, fmtTime(used), rx, 328, 17, 'bold', C.text);
    textLeft(ctx, '最高分', lx, 360, 13, '', C.dim);
    textRight(ctx, fmtNum(G.best), rx, 360, 17, 'bold', accent2Of(G));

    button(ctx, restartRect(), '再来一局', { size: 20, bg: 'rgba(90,210,255,0.22)' });
    centerText(ctx, '点击「再来一局」重新出发', MW / 2, 476, 12, '', C.faint);
  }

  /* ------------------------------------------------------------------ *
   * play 时的暂停浮层（提供 resume 点击区）
   * ------------------------------------------------------------------ */
  function drawPause(G, ctx) {
    const MW = mapW();
    const H = canvasH();
    ctx.fillStyle = 'rgba(3,9,15,0.62)';
    ctx.fillRect(0, 0, MW, H);

    const r = { x: 120, y: 200, w: MW - 240, h: 210 };
    panel(ctx, r, 'rgba(10,24,38,0.94)', 'rgba(90,210,255,0.45)');
    centerText(ctx, '暂停', MW / 2, 252, 30, 'bold', C.text);
    centerText(ctx, '点击「继续游戏」回到战斗', MW / 2, 278, 12, '', C.dim);
    button(ctx, resumeRect(), '继续游戏', { size: 20, bg: 'rgba(90,210,255,0.22)' });
    centerText(ctx, '静音请点右上角', MW / 2, 378, 11, '', C.faint);
  }

  /* ------------------------------------------------------------------ *
   * 对外接口
   * ------------------------------------------------------------------ */
  function draw(G, ctx) {
    if (!ctx || typeof ctx.fillRect !== 'function') return;
    G = G || { mode: 'play' };
    const mode = typeof G.mode === 'string' ? G.mode : 'play';

    ctx.save();
    try {
      /* HUD 先画，模式浮层只覆盖左侧游戏区，静音按钮始终可见 */
      drawHud(G, ctx);

      if (mode === 'title') {
        drawTitle(G, ctx);
      } else if (mode === 'intro') {
        drawIntro(G, ctx);
      } else if (mode === 'clear') {
        drawClear(G, ctx);
      } else if (mode === 'upgrade') {
        drawUpgrade(G, ctx);
      } else if (mode === 'result') {
        drawResult(G, ctx);
      } else if (mode === 'play') {
        if (G.paused) drawPause(G, ctx);
      }
    } finally {
      ctx.restore();
    }
  }

  function hitTest(mx, my, G) {
    if (typeof mx !== 'number' || typeof my !== 'number' || !isFinite(mx) || !isFinite(my)) return null;
    G = G || {};

    /* 静音按钮：任何模式都优先命中 */
    if (inside(mx, my, muteRect())) return { action: 'mute', index: -1 };

    const mode = typeof G.mode === 'string' ? G.mode : 'play';

    if (mode === 'title') {
      /* 「点任意处开始」：游戏区内任意位置都算开始，HUD 区不误触 */
      if (mx >= 0 && mx <= mapW() && my >= 0 && my <= canvasH()) return { action: 'start', index: -1 };
      return null;
    }

    if (mode === 'upgrade') {
      const cards = Array.isArray(G.cardChoices) ? G.cardChoices : [];
      const count = Math.min(cards.length, 3);
      for (let i = 0; i < count; i++) {
        if (inside(mx, my, cardRect(i))) return { action: 'card', index: i };
      }
      return null;
    }

    if (mode === 'result') {
      if (inside(mx, my, restartRect())) return { action: 'restart', index: -1 };
      return null;
    }

    if (mode === 'play') {
      if (G.paused) {
        if (inside(mx, my, resumeRect())) return { action: 'resume', index: -1 };
        return null;
      }
      return null;
    }

    /* intro / clear：无交互 */
    return null;
  }

  WV.UI = {
    draw: draw,
    hitTest: hitTest,
  };
})(typeof window !== 'undefined' ? window : globalThis);
