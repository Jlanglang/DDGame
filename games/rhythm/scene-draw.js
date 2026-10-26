/* 节奏豆豆 · 扁平插画
   零件跟着拍子动。预测线不画。碰上的那一帧才压扁、才冒火花。
*/
(function () {
  'use strict';

  const S = window.RhythmScenes;
  if (!S) { console.error('rhythm: 情景表没加载'); return; }

  const INK = '#3a2416';
  const SKIN = '#ffe3c2';
  const PLANT = 908;

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function ink(ctx, w) {
    ctx.lineWidth = w || 6;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function gloss(ctx, x, y, rx, ry) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function lively(pt) {
    return pt;
  }

  function bone(ctx, a, b, width, fill) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + 8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function joint(ctx, p, r) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ink(ctx, 5);
  }

  function placePos(p, visual) {
    if (p.at === 'tip') {
      const t = S.actorTip(visual);
      return { x: t.x + (p.ox || 0), y: t.y + (p.oy || 0) };
    }
    if (p.at === 'aim' && visual.aim) {
      return { x: visual.aim[0] + (p.ox || 0), y: visual.aim[1] + (p.oy || 0) };
    }
    return { x: p.x, y: p.y };
  }

  function propPoint(visual, arrive, ends) {
    const b = visual.prop;
    if (!b) return null;
    if (b.travel === 'fixed') return ends.home;
    if (!arrive || arrive.mode === 'park') return null;
    const far = arrive.mode === 'leave' ? ends.exit : ends.enter;
    const s = arrive.s || 0;
    return {
      x: ends.home.x + (far.x - ends.home.x) * s,
      y: ends.home.y + (far.y - ends.home.y) * s,
    };
  }

  function drawGround(ctx) {
    ctx.strokeStyle = 'rgba(255,244,220,0.16)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(36, PLANT + 16);
    ctx.lineTo(684, PLANT + 16);
    ctx.stroke();
  }

  function drawPlace(ctx, p, visual, pose) {
    const q = placePos(p, visual);
    const x = q.x;
    const y = q.y;
    const f = p.f || '#f6f1e6';
    const strike = (pose && pose.strike) || 0;
    ctx.save();
    const actor = visual && visual.actor;
    const counting = !actor || !actor.k || actor.k === 'none';
    const g = pose && pose.groove;
    const arriving = pose && pose.arrive && pose.arrive.mode === 'approach';
    // 有 cue 的关只在铃声那几拍跳。没有 cue 的关仍是每一拍点一下。
    const hopAmt = (pose && pose.cue) ? (pose.cue.bounce || 0) : (g && g.bounce || 0);
    if (counting && hopAmt > 0.02 && !arriving) {
      const hop = hopAmt;
      ctx.translate(x, y - hop * 28);
      ctx.scale(1 + hop * 0.1, Math.max(0.76, 1 - hop * 0.24));
      ctx.translate(-x, -y);
    }
    if (arriving) {
      const u = 1 - Math.max(0, Math.min(1, pose.arrive.s || 0));
      ctx.translate(x, y);
      ctx.translate(0, u * 10);
      ctx.scale(1 + u * 0.06, Math.max(0.88, 1 - u * 0.1));
      ctx.translate(-x, -y);
    }
    ctx.fillStyle = f;
    if (p.k === 'cup' || p.k === 'bowl') {
      const w = p.k === 'bowl' ? 54 : 32;
      const h = p.k === 'bowl' ? 36 : 56;
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.lineTo(x - w * 0.7, y + h);
      ctx.quadraticCurveTo(x, y + h + 12, x + w * 0.7, y + h);
      ctx.lineTo(x + w, y);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 6);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.82, y + 6);
      ctx.quadraticCurveTo(x, y + 16, x + w * 0.82, y + 6);
      ctx.strokeStyle = 'rgba(58,36,22,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      gloss(ctx, x - w * 0.35, y + h * 0.35, 6, h * 0.22);
    } else if (p.k === 'basket') {
      ctx.beginPath();
      ctx.moveTo(x - 46, y);
      ctx.lineTo(x - 32, y + 54);
      ctx.lineTo(x + 32, y + 54);
      ctx.lineTo(x + 46, y);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 6);
      ctx.beginPath();
      ctx.moveTo(x - 46, y + 8);
      ctx.lineTo(x + 46, y + 8);
      ink(ctx, 5);
    } else if (p.k === 'drum') {
      ctx.fillStyle = '#6b221c';
      ctx.beginPath();
      ctx.ellipse(x, y + 20, 92, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, 78, 28, 0, 0, Math.PI * 2);
      ctx.fillStyle = strike >= 1 && strike < 1.14 ? '#fff8e8' : '#f0d3a2';
      ctx.fill();
      ctx.strokeStyle = '#f3d7ae';
      ctx.lineWidth = 7;
      ctx.stroke();
    } else if (p.k === 'wall') {
      roundRect(ctx, x, y - 180, 30, 360, 8);
      ctx.fillStyle = '#d9c6aa';
      ctx.fill();
      ink(ctx, 6);
    } else if (p.k === 'hole') {
      ctx.fillStyle = '#241910';
      ctx.beginPath();
      ctx.ellipse(x, PLANT + 10, 40, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
    } else if (p.k === 'door') {
      roundRect(ctx, x, y - (p.h || 200) / 2, p.w || 140, p.h || 200, 8);
      ctx.fill();
      ink(ctx, 6);
      const dw = (p.w || 140) - 28;
      const dh = (p.h || 200) - 36;
      roundRect(ctx, x + 14, y - dh / 2, dw, dh * 0.46, 4);
      ctx.strokeStyle = 'rgba(58,36,22,0.35)';
      ctx.lineWidth = 4;
      ctx.stroke();
      roundRect(ctx, x + 14, y + 6, dw, dh * 0.42, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + (p.w || 140) - 22, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#e7b15a';
      ctx.fill();
      ink(ctx, 3);
    } else if (p.k === 'board' || p.k === 'desk' || p.k === 'pages' || p.k === 'ivory') {
      roundRect(ctx, x - (p.w || 160) / 2, y - (p.h || 20) / 2, p.w || 160, p.h || 20, 6);
      ctx.fill();
      ink(ctx, 5);
      if ((p.h || 20) > 16) {
        ctx.strokeStyle = 'rgba(90,50,20,0.28)';
        ctx.lineWidth = 3;
        const left = x - (p.w || 160) / 2 + 10;
        const right = x + (p.w || 160) / 2 - 10;
        ctx.beginPath();
        ctx.moveTo(left, y - 4);
        ctx.lineTo(right, y - 4);
        ctx.moveTo(left, y + 4);
        ctx.lineTo(right, y + 4);
        ctx.stroke();
      }
    } else if (p.k === 'paper' || p.k === 'envelope') {
      roundRect(ctx, x - (p.w || 120) / 2, y - (p.h || 90) / 2, p.w || 120, p.h || 90, 6);
      ctx.fill();
      ink(ctx, 5);
      if (p.k === 'envelope') {
        ctx.beginPath();
        ctx.moveTo(x - 50, y - 40);
        ctx.lineTo(x, y - 8);
        ctx.lineTo(x + 50, y - 40);
        ink(ctx, 4);
      }
    } else if (p.k === 'target') {
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, Math.PI * 2);
      ctx.fillStyle = '#f6f1e6';
      ctx.fill();
      ink(ctx, 5);
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fillStyle = '#c23b3b';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#f6f1e6';
      ctx.fill();
      ink(ctx, 4);
    } else if (p.k === 'pot') {
      ctx.beginPath();
      ctx.moveTo(x - 50, y - 20);
      ctx.lineTo(x - 40, y + 36);
      ctx.lineTo(x + 40, y + 36);
      ctx.lineTo(x + 50, y - 20);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 6);
      ctx.beginPath();
      ctx.moveTo(x - 64, y - 8);
      ctx.lineTo(x - 50, y - 8);
      ctx.moveTo(x + 50, y - 8);
      ctx.lineTo(x + 64, y - 8);
      ink(ctx, 6);
    } else if (p.k === 'lock' || p.k === 'socket') {
      roundRect(ctx, x - 28, y - 28, 56, 56, 8);
      ctx.fill();
      ink(ctx, 5);
      ctx.fillStyle = '#241910';
      ctx.beginPath();
      ctx.arc(x, y - 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 3, y, 6, 14);
    } else if (p.k === 'rail') {
      bone(ctx, { x: x - (p.w || 200) / 2, y: y }, { x: x + (p.w || 200) / 2, y: y }, 10, f);
    } else if (p.k === 'jar') {
      ctx.beginPath();
      ctx.moveTo(x - 28, y - 50);
      ctx.lineTo(x - 40, y + 40);
      ctx.lineTo(x + 40, y + 40);
      ctx.lineTo(x + 28, y - 50);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 5);
      roundRect(ctx, x - 22, y - 64, 44, 16, 4);
      ctx.fillStyle = f;
      ctx.fill();
      ink(ctx, 4);
    } else if (p.k === 'record') {
      ctx.beginPath();
      ctx.arc(x, y, 54, 0, Math.PI * 2);
      ctx.fillStyle = '#241910';
      ctx.fill();
      ink(ctx, 5);
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#e7b15a';
      ctx.fill();
    } else if (p.k === 'nest') {
      ctx.beginPath();
      ctx.ellipse(x, y, 58, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 5);
      ctx.strokeStyle = '#8a5a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x - 16, y, 18, 0.2, 2.4);
      ctx.stroke();
    } else if (p.k === 'mailbox') {
      roundRect(ctx, x - 36, y - 40, 72, 90, 8);
      ctx.fill();
      ink(ctx, 5);
      ctx.fillStyle = '#241910';
      roundRect(ctx, x - 22, y - 8, 44, 8, 2);
      ctx.fill();
    } else if (p.k === 'pond' || p.k === 'soil' || p.k === 'dish') {
      ctx.beginPath();
      ctx.ellipse(x, y, (p.w || 160) / 2, p.k === 'dish' ? 16 : 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 5);
      if (p.ripple && strike >= 1 && strike < 1.25) {
        ctx.globalAlpha = 1 - (strike - 1) / 0.25;
        ctx.beginPath();
        ctx.ellipse(x, y, 30 + strike * 20, 10, 0, 0, Math.PI * 2);
        ink(ctx, 3);
        ctx.globalAlpha = 1;
      }
    } else if (p.k === 'lane' || p.k === 'groove') {
      roundRect(ctx, x, y - 8, p.w || 200, 16, 6);
      ctx.fill();
      ink(ctx, 4);
    } else if (p.k === 'swing') {
      bone(ctx, { x: x - p.w / 2, y: y }, { x: x + p.w / 2, y: y }, 12, f);
      bone(ctx, { x: x - p.w / 2, y: y }, { x: x - p.w / 2, y: y + p.h }, 12, f);
      bone(ctx, { x: x + p.w / 2, y: y }, { x: x + p.w / 2, y: y + p.h }, 12, f);
    } else if (p.k === 'frame') {
      roundRect(ctx, x - (p.w || 48) / 2, y - (p.h || 140) / 2, p.w || 48, p.h || 140, 6);
      ctx.fillStyle = 'rgba(186, 220, 245, 0.28)';
      ctx.fill();
      ink(ctx, 8);
    } else if (p.k === 'spike') {
      bone(ctx, { x: x, y: y + 70 }, { x: x, y: y - 36 }, 8, f);
      ctx.beginPath();
      ctx.moveTo(x, y - 48);
      ctx.lineTo(x - 8, y - 28);
      ctx.lineTo(x + 8, y - 28);
      ctx.closePath();
      ctx.fillStyle = f;
      ctx.fill();
      ink(ctx, 4);
    } else if (p.k === 'cuke') {
      roundRect(ctx, x - 46, y - 12, 92, 24, 12);
      ctx.fill();
      ink(ctx, 5);
      if (strike >= 1) {
        ctx.beginPath();
        ctx.moveTo(x, y - 16);
        ctx.lineTo(x, y + 16);
        ink(ctx, 4);
      }
    } else if (p.k === 'nail') {
      bone(ctx, { x: x, y: y }, { x: x, y: y + 36 }, 6, f);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = f;
      ctx.fill();
      ink(ctx, 4);
    } else if (p.k === 'pin') {
      ctx.beginPath();
      ctx.ellipse(x, y + 28, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 12, y + 20);
      ctx.quadraticCurveTo(x, y - 36, x + 12, y + 20);
      ctx.fill();
      ink(ctx, 4);
    } else if (p.k === 'grid') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 70, y + i * 28);
        ctx.lineTo(x + 70, y + i * 28);
        ctx.moveTo(x + i * 36, y - 56);
        ctx.lineTo(x + i * 36, y + 56);
        ctx.stroke();
      }
    } else if (p.k === 'teeth') {
      ctx.strokeStyle = f;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (p.w || 200), y);
      ctx.stroke();
      ink(ctx, 3);
    } else if (p.k === 'cabinet') {
      roundRect(ctx, x, y - (p.h || 160) / 2, p.w || 200, p.h || 160, 8);
      ctx.fill();
      ink(ctx, 6);
    } else if (p.k === 'shell') {
      ctx.beginPath();
      ctx.ellipse(x, y, 70, 26, 0, 0, Math.PI);
      ctx.fill();
      ink(ctx, 5);
    } else if (p.k === 'bell') {
      drawBell(ctx, x, y, f, 28);
    } else if (p.k === 'phone') {
      roundRect(ctx, x - 74, y - 8, 148, 52, 16);
      ctx.fill();
      ink(ctx, 5);
      ctx.fillStyle = f;
      roundRect(ctx, x - 58, y - 28, 18, 30, 6);
      ctx.fill();
      ink(ctx, 4);
      ctx.fillStyle = f;
      roundRect(ctx, x + 40, y - 28, 18, 30, 6);
      ctx.fill();
      ink(ctx, 4);
      ctx.fillStyle = '#c23b3b';
      ctx.beginPath();
      ctx.arc(x + 40, y + 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 3);
    } else if (p.k === 'candle') {
      roundRect(ctx, x - 12, y - 10, 24, 70, 4);
      ctx.fill();
      ink(ctx, 4);
      if (p.flame && strike < 1) {
        ctx.beginPath();
        ctx.moveTo(x, y - 40);
        ctx.quadraticCurveTo(x + 14, y - 18, x, y - 8);
        ctx.quadraticCurveTo(x - 14, y - 18, x, y - 40);
        ctx.fillStyle = '#ff9a3c';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y - 32);
        ctx.quadraticCurveTo(x + 7, y - 16, x, y - 12);
        ctx.quadraticCurveTo(x - 7, y - 16, x, y - 32);
        ctx.fillStyle = '#ffe27a';
        ctx.fill();
      }
    } else if (p.k === 'lamp') {
      ctx.beginPath();
      ctx.moveTo(x - 36, y + 10);
      ctx.lineTo(x - 22, y + 48);
      ctx.lineTo(x + 22, y + 48);
      ctx.lineTo(x + 36, y + 10);
      ctx.closePath();
      ctx.fillStyle = strike >= 1 ? '#fff4c4' : f;
      ctx.fill();
      ink(ctx, 5);
      bone(ctx, { x: x, y: y + 48 }, { x: x, y: y + 110 }, 6, '#c48a55');
      if (strike >= 1) {
        ctx.fillStyle = 'rgba(255, 230, 140, 0.28)';
        ctx.beginPath();
        ctx.arc(x, y + 20, 70, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.k === 'sling') {
      bone(ctx, { x: x, y: y + 40 }, { x: x - 28, y: y - 30 }, 8, f);
      bone(ctx, { x: x, y: y + 40 }, { x: x + 28, y: y - 30 }, 8, f);
      ctx.strokeStyle = '#6b3a22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 28, y - 30);
      ctx.quadraticCurveTo(x, y - 8, x + 28, y - 30);
      ctx.stroke();
    } else if (p.k === 'bow') {
      ctx.strokeStyle = f;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(x + 30, y, 70, 0.7 * Math.PI, 1.3 * Math.PI);
      ctx.stroke();
      ink(ctx, 3);
    } else if (p.k === 'spout') {
      roundRect(ctx, x - 16, y, 32, 18, 4);
      ctx.fill();
      ink(ctx, 4);
    } else if (p.k === 'ribbon') {
      const h = p.h || 18;
      const full = p.w || 200;
      if (p.split && strike >= 1) {
        const gap = 18;
        const half = full / 2 - gap;
        roundRect(ctx, x - full / 2, y - h / 2, half, h, 4);
        ctx.fill();
        ink(ctx, 4);
        roundRect(ctx, x + gap, y - h / 2, half, h, 4);
        ctx.fill();
        ink(ctx, 4);
      } else {
        roundRect(ctx, x - full / 2, y - h / 2, full, h, 4);
        ctx.fill();
        ink(ctx, 4);
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
    }
    ctx.restore();
  }

  function drawBell(ctx, x, y, fill, r) {
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.2);
    ctx.quadraticCurveTo(x, y - r * 1.3, x + r, y - r * 0.2);
    ctx.lineTo(x + r * 0.7, y + r * 0.7);
    ctx.lineTo(x - r * 0.7, y + r * 0.7);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ink(ctx, 5);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.85, 5, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }

  function drawActor(ctx, visual, u) {
    const a = visual.actor;
    if (!a || a.k === 'none') return;
    if (a.k === 'pivot' || a.k === 'flower' || a.k === 'pedal' || a.k === 'needle') {
      const ang = S.angOf(a, u);
      const tip = S.polar(a.x, a.y, ang, a.len || 0);
      if (a.k === 'flower') {
        bone(ctx, { x: a.x, y: a.y }, tip, 14, a.f || '#63b85a');
        ctx.fillStyle = '#3f8f45';
        ctx.beginPath();
        ctx.ellipse(a.x + 16, a.y - 28, 16, 8, -0.6, 0, Math.PI * 2);
        ctx.ellipse(a.x - 14, a.y - 52, 14, 7, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ink(ctx, 3);
        ctx.fillStyle = '#ff8d5a';
        for (let i = 0; i < 6; i++) {
          const p = i * Math.PI * 2 / 6 + ang;
          ctx.beginPath();
          ctx.ellipse(tip.x + Math.cos(p) * 18, tip.y + Math.sin(p) * 18, 14, 8, p, 0, Math.PI * 2);
          ctx.fill();
          ink(ctx, 3);
        }
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd15c';
        ctx.fill();
        ink(ctx, 4);
        gloss(ctx, tip.x - 4, tip.y - 4, 4, 3);
        return;
      }
      if (a.k === 'pedal') {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(ang);
        roundRect(ctx, 0, -10, a.len, 20, 8);
        ctx.fillStyle = a.f || '#d5c2a6';
        ctx.fill();
        ink(ctx, 5);
        ctx.restore();
        joint(ctx, { x: a.x, y: a.y }, 8);
        return;
      }
      bone(ctx, { x: a.x, y: a.y }, tip, a.head === 'stylus' ? 8 : 12, a.f || '#e7b15a');
      drawHead(ctx, a, tip, ang);
      return;
    }
    if (a.k === 'leg' || a.k === 'arm') {
      const L = S.limbAt(a, u);
      const skin = SKIN;
      bone(ctx, L.hip, L.knee, a.k === 'leg' ? 22 : 20, skin);
      bone(ctx, L.knee, L.end, a.k === 'leg' ? 20 : 18, skin);
      joint(ctx, L.knee, a.k === 'leg' ? 11 : 10);
      if (a.k === 'leg') {
        ctx.beginPath();
        ctx.ellipse(L.end.x + 16, L.end.y + 2, 28, 13, 0, 0, Math.PI * 2);
        ctx.fillStyle = skin;
        ctx.fill();
        ink(ctx, 6);
      } else {
        ctx.beginPath();
        ctx.arc(L.end.x, L.end.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = skin;
        ctx.fill();
        ink(ctx, 5);
      }
      return;
    }
    if (a.k === 'paddle') {
      const ang = u < 0 ? 0.04 : (-0.35 + 0.55 * u);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(ang);
      roundRect(ctx, -(a.w || 140) / 2, -(a.h || 18) / 2, a.w || 140, a.h || 18, 10);
      ctx.fillStyle = a.f || '#f0943e';
      ctx.fill();
      ink(ctx, 6);
      ctx.restore();
      return;
    }
    if (a.k === 'pinch') {
      const g = u < 0 ? a.open : a.open + (a.close - a.open) * u;
      const len = a.len;
      const tips = [
        { x: a.x - Math.sin(g) * len, y: a.y + Math.cos(g) * len },
        { x: a.x + Math.sin(g) * len, y: a.y + Math.cos(g) * len },
      ];
      bone(ctx, { x: a.x, y: a.y }, tips[0], 10, a.f || '#e7b15a');
      bone(ctx, { x: a.x, y: a.y }, tips[1], 10, a.f || '#e7b15a');
      joint(ctx, { x: a.x, y: a.y }, 8);
      return;
    }
    if (a.k === 'hinge') {
      const ang = S.angOf(a, u);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(ang);
      roundRect(ctx, 0, -(a.h || 16) / 2, a.w || 100, a.h || 16, 6);
      ctx.fillStyle = a.f || '#f6f1e6';
      ctx.fill();
      ink(ctx, 5);
      if ((a.h || 16) >= 60) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 3;
        const pleats = 4;
        for (let i = 1; i < pleats; i++) {
          const px = ((a.w || 100) * i) / pleats;
          ctx.beginPath();
          ctx.moveTo(px, -(a.h || 16) / 2 + 4);
          ctx.lineTo(px, (a.h || 16) / 2 - 4);
          ctx.stroke();
        }
      }
      ctx.restore();
      joint(ctx, { x: a.x, y: a.y }, 7);
    }
  }

  function drawHead(ctx, a, tip, ang) {
    const head = a.head;
    if (!head || head === 'knob' || head === 'stylus') {
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, head === 'stylus' ? 5 : 8, 0, Math.PI * 2);
      ctx.fillStyle = head === 'stylus' ? '#d5dde8' : '#fff6df';
      ctx.fill();
      ink(ctx, 4);
      return;
    }
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(ang);
    if (head === 'mitt') {
      ctx.beginPath();
      ctx.ellipse(0, 0, 38, 26, 0, 0, Math.PI * 2);
      ctx.fillStyle = SKIN;
      ctx.fill();
      ink(ctx, 6);
    } else if (head === 'swat') {
      roundRect(ctx, -8, -28, 46, 56, 8);
      ctx.fillStyle = '#f2d2a2';
      ctx.fill();
      ink(ctx, 5);
    } else if (head === 'mallet') {
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#8a5a3a';
      ctx.fill();
      ink(ctx, 6);
    } else if (head === 'stamp' || head === 'hammer') {
      roundRect(ctx, -8, -22, head === 'hammer' ? 36 : 28, head === 'hammer' ? 28 : 36, 4);
      ctx.fillStyle = head === 'stamp' ? '#6f6256' : '#5c4030';
      ctx.fill();
      ink(ctx, 5);
    } else if (head === 'racket') {
      ctx.beginPath();
      ctx.ellipse(16, 0, 28, 34, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f0943e';
      ctx.fill();
      ink(ctx, 5);
    } else if (head === 'seat') {
      roundRect(ctx, -28, -8, 56, 16, 6);
      ctx.fillStyle = '#e7b15a';
      ctx.fill();
      ink(ctx, 5);
    }
    ctx.restore();
  }

  function drawThing(ctx, b, pt, pose) {
    const strike = (pose && pose.strike) || 0;
    if (b.pop && strike >= 1) {
      spark(ctx, pt.x, pt.y, strike, 0.7);
      return;
    }
    const squash = strike >= 1 && strike < 1.22 ? 1 - (strike - 1) / 0.22 : 0;
    ctx.save();
    // 漏拍：物件歪掉，不是原地不动
    if (pose.judge === 'miss' || pose.judge === 'none') {
      ctx.translate(pt.x, pt.y);
      ctx.rotate(0.18);
      ctx.translate(-pt.x, -pt.y);
    }
    if (squash > 0) {
      ctx.translate(pt.x, pt.y);
      ctx.scale(1 + 0.22 * squash, Math.max(0.62, 1 - 0.34 * squash));
      ctx.translate(-pt.x, -pt.y);
    }
    const hot = strike >= 1 && strike < 1.14;
    const fill = hot ? '#fff6d0' : (b.f || '#ff8d5a');
    const x = pt.x;
    const y = pt.y;
    const r = b.r || 16;
    const waiting = pose.arrive && pose.arrive.mode === 'ready' && pose.groove;
    if (waiting && pose.groove.bounce > 0.04) {
      const hop = pose.groove.bounce;
      ctx.translate(x, y);
      ctx.scale(1 + hop * 0.16, Math.max(0.62, 1 - hop * 0.28));
      ctx.translate(-x, -y);
    }
    ctx.fillStyle = fill;
    if (b.k === 'ball' || b.k === 'marble' || b.k === 'pebble' || b.k === 'bean') {
      const spin = pose.groove ? pose.groove.beat * 1.1 : 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0.4, Math.PI - 0.2);
      ctx.strokeStyle = 'rgba(58,36,22,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
      gloss(ctx, -r * 0.32, -r * 0.34, r * 0.28, r * 0.16);
      ctx.restore();
    } else if (b.k === 'disc') {
      ctx.beginPath();
      ctx.ellipse(x, y, 30, 13, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 5);
      ctx.beginPath();
      ctx.ellipse(x - 4, y - 2, 10, 4, -0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (b.k === 'drop') {
      ctx.beginPath();
      ctx.moveTo(x, y - r - 8);
      ctx.quadraticCurveTo(x + r, y, x, y + r);
      ctx.quadraticCurveTo(x - r, y, x, y - r - 8);
      ctx.fill();
      ink(ctx, 4);
      gloss(ctx, x - r * 0.28, y - 2, r * 0.22, r * 0.34);
    } else if (b.k === 'bar' || b.k === 'paper' || b.k === 'sash' || b.k === 'pull' || b.k === 'drawer' || b.k === 'ribbon' || b.k === 'letter' || b.k === 'bolt') {
      const w = b.w || 60;
      const h = b.h || 20;
      roundRect(ctx, x - w / 2, y - h / 2, w, h, 6);
      ctx.fill();
      ink(ctx, 5);
      if (h >= 36 && (b.k === 'paper' || b.k === 'letter')) {
        ctx.strokeStyle = 'rgba(58,36,22,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.28, y - 6);
        ctx.lineTo(x + w * 0.28, y - 6);
        ctx.moveTo(x - w * 0.28, y + 4);
        ctx.lineTo(x + w * 0.18, y + 4);
        ctx.stroke();
      }
    } else if (b.k === 'bubble') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = fill;
      ctx.lineWidth = 4;
      ctx.stroke();
      ink(ctx, 2);
    } else if (b.k === 'coin') {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'key') {
      ctx.beginPath();
      ctx.arc(x - 16, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
      roundRect(ctx, x - 6, y - 4, 40, 8, 2);
      ctx.fill();
      ink(ctx, 3);
    } else if (b.k === 'egg') {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'leaf') {
      ctx.beginPath();
      ctx.ellipse(x, y, r + 6, r * 0.55, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'bell') {
      drawBell(ctx, x, y, fill, r);
    } else if (b.k === 'arrow') {
      bone(ctx, { x: x - 46, y: y }, { x: x, y: y }, 6, b.f || '#c48a55');
      ctx.beginPath();
      ctx.moveTo(x + 16, y);
      ctx.lineTo(x - 8, y - 10);
      ctx.lineTo(x - 8, y + 10);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'bobber') {
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI, 0);
      ctx.fillStyle = '#ff5b45';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI);
      ctx.fillStyle = '#f6f1e6';
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'hanger') {
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x - 28, y + 10);
      ctx.lineTo(x + 28, y + 10);
      ctx.closePath();
      ctx.fill();
      ink(ctx, 4);
      ctx.beginPath();
      ctx.arc(x, y - 22, 6, Math.PI, 0);
      ink(ctx, 4);
    } else if (b.k === 'cake') {
      ctx.beginPath();
      ctx.ellipse(x, y, r + 4, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'shuttle') {
      ctx.beginPath();
      ctx.ellipse(x, y, 10, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'knife') {
      roundRect(ctx, x - 7, y - 92, 14, 48, 4);
      ctx.fillStyle = '#8a5a3a';
      ctx.fill();
      ink(ctx, 4);
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 44);
      ctx.lineTo(x + 14, y - 44);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'stamp') {
      roundRect(ctx, x - 8, y - 70, 16, 42, 4);
      ctx.fillStyle = '#8a5a3a';
      ctx.fill();
      ink(ctx, 4);
      roundRect(ctx, x - (b.w || 50) / 2, y - 28, b.w || 50, 28, 4);
      ctx.fillStyle = fill;
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'lid') {
      ctx.beginPath();
      ctx.ellipse(x, y, r, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 5);
      roundRect(ctx, x - 8, y - 28, 16, 16, 3);
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'ring') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.lineWidth = 8;
      ctx.strokeStyle = fill;
      ctx.stroke();
      ink(ctx, 3);
    } else if (b.k === 'fly') {
      const flap = pose.groove ? Math.sin(pose.groove.beat * Math.PI * 4) : 0;
      ctx.fillStyle = 'rgba(210,230,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(x - 16, y - 4 - flap * 3, 16, 7, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 3);
      ctx.beginPath();
      ctx.ellipse(x + 16, y - 4 + flap * 3, 16, 7, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 3);
      ctx.beginPath();
      ctx.ellipse(x, y, 11, 8, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ink(ctx, 4);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + 3, y - 2, 2.2, 0, Math.PI * 2);
      ctx.arc(x + 8, y - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x + 4, y - 2, 1, 0, Math.PI * 2);
      ctx.arc(x + 9, y - 1, 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.k === 'mole') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 5);
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.arc(x + 7, y - 4, 3, 0, Math.PI * 2);
      ctx.arc(x + 7, y + 6, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.k === 'branch') {
      ctx.strokeStyle = b.f || '#6b3a22';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 36, y + 4);
      ctx.quadraticCurveTo(x, y - 12, x + 40, y - 2);
      ctx.stroke();
      ctx.fillStyle = '#63b85a';
      ctx.beginPath();
      ctx.ellipse(x + 28, y - 10, 14, 7, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.k === 'tassel') {
      bone(ctx, { x: x, y: y - 70 }, { x: x, y: y }, 4, '#c48a55');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ink(ctx, 4);
    } else if (b.k === 'handset') {
      const w = b.w || 108;
      const h = b.h || 18;
      roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
      ctx.fill();
      ink(ctx, 5);
      ctx.fillStyle = '#1a1614';
      ctx.beginPath();
      ctx.arc(x - w / 2 + 8, y, 11, 0, Math.PI * 2);
      ctx.arc(x + w / 2 - 8, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 3);
    } else if (b.k === 'puff') {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x - 14, y + 4, r * 0.7, 0, Math.PI * 2);
      ctx.arc(x + 12, y + 2, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 4);
    }
    ctx.restore();
  }

  function spark(ctx, x, y, k, sc) {
    if (k < 1) return;
    const d = k - 1;
    if (d > 0.16) return;
    const t = d / 0.16;
    const s = sc || 1;
    ctx.globalAlpha = (1 - t) * 0.95;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineCap = 'round';
    ctx.lineWidth = 7 * s;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t * 0.5;
      const r1 = (28 + t * 24) * s;
      const r2 = r1 + 18 * (1 - t) * s;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* 画面经验：一关一个地方，扁平色块加粗轮廓，停着不动。
     不要改回纯色渐变，也不要再套同一套天空、远山、窗户、瓷砖。 */
  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  function rrect(ctx, x, y, w, h, color, rad) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, rad == null ? 10 : rad);
    ctx.fill();
    ink(ctx, 5);
  }
  function oval(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ink(ctx, 5);
  }
  function poly(ctx, pts, color) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ink(ctx, 5);
  }

  const SCENERY = {
    lift(ctx) {
      const bg = window.RHYTHM_IMG && window.RHYTHM_IMG.bg;
      if (bg && bg.complete && bg.naturalWidth) {
        ctx.drawImage(bg, 0, 0, 720, 1600);
        return;
      }
      rect(ctx, 0, 320, 720, 760, '#f4e7cf');
      rect(ctx, 0, 780, 720, 300, '#e7d3b0');
      rect(ctx, 0, 848, 720, 28, '#c4894a');
      rect(ctx, 70, 876, 26, 160, '#a56b3c');
      rect(ctx, 624, 876, 26, 160, '#a56b3c');
      rrect(ctx, 48, 480, 120, 86, '#7eb6e0', 6);
      poly(ctx, [70, 540, 110, 500, 160, 540], '#63b85a');
      oval(ctx, 620, 800, 28, 22, '#c23b3b');
      rect(ctx, 608, 800, 8, 48, '#63b85a');
    },
    disc(ctx) {
      rect(ctx, 0, 320, 720, 500, '#7eb6e8');
      rect(ctx, 0, 820, 720, 260, '#3f9a4e');
      rect(ctx, 0, 900, 720, 10, '#f6f1e6');
      oval(ctx, 110, 760, 70, 50, '#2f7a40');
      rect(ctx, 96, 760, 28, 120, '#6b3a22');
      oval(ctx, 560, 430, 36, 16, '#ffffff');
    },
    kick(ctx) {
      rect(ctx, 0, 320, 720, 420, '#9fd0f2');
      for (let i = 0; i < 6; i++) rect(ctx, 0, 740 + i * 48, 720, 24, i % 2 ? '#4ea856' : '#3c8f46');
      rect(ctx, 560, 620, 12, 280, '#f6f1e6');
      rect(ctx, 680, 620, 12, 280, '#f6f1e6');
      rect(ctx, 560, 620, 132, 10, '#f6f1e6');
      rect(ctx, 572, 630, 108, 8, '#f6f1e6');
      rect(ctx, 572, 660, 108, 8, '#f6f1e6');
    },
    drum(ctx) {
      rect(ctx, 0, 320, 720, 760, '#4a1c24');
      rect(ctx, 0, 360, 720, 70, '#c23b3b');
      rect(ctx, 0, 390, 90, 620, '#9a2e2e');
      rect(ctx, 630, 390, 90, 620, '#9a2e2e');
      rect(ctx, 0, 900, 720, 180, '#c4894a');
      rect(ctx, 0, 900, 720, 16, '#8a5a32');
      oval(ctx, 460, 780, 70, 18, '#f6e7a8');
      rect(ctx, 80, 760, 8, 140, '#2a241c');
      oval(ctx, 84, 750, 16, 10, '#d5dde8');
    },
    duck(ctx) {
      rect(ctx, 0, 320, 720, 460, '#b7e3f5');
      rect(ctx, 0, 780, 720, 80, '#8d6840');
      rect(ctx, 0, 860, 720, 220, '#5aaa62');
      for (let x = 24; x < 700; x += 36) {
        rect(ctx, x, 700, 16, 90, '#f6f1e6');
      }
      rect(ctx, 20, 746, 680, 10, '#f6f1e6');
      oval(ctx, 600, 820, 16, 16, '#ff8d5a');
      rect(ctx, 594, 820, 6, 40, '#63b85a');
    },
    swat(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f6efe4');
      rect(ctx, 0, 960, 720, 22, '#c4a574');
      rect(ctx, 0, 982, 720, 98, '#d7b48a');
      rrect(ctx, 80, 460, 36, 52, '#f6f1e6', 4);
      rect(ctx, 92, 478, 12, 18, '#e7b15a');
      rrect(ctx, 520, 500, 110, 130, '#fff', 4);
      for (let i = 0; i < 4; i++) rect(ctx, 536, 530 + i * 24, 78, 4, '#d5dde8');
    },
    high(ctx) {
      rect(ctx, 0, 320, 720, 400, '#8ec8ef');
      rect(ctx, 300, 520, 200, 150, '#f6f1e6');
      rect(ctx, 292, 512, 216, 12, '#c23b3b');
      rect(ctx, 388, 670, 16, 160, '#d5dde8');
      rect(ctx, 0, 830, 720, 250, '#2f6b8a');
      rect(ctx, 250, 900, 220, 8, '#f6f1e6');
      oval(ctx, 140, 430, 40, 16, '#ffffff');
    },
    stone(ctx) {
      rect(ctx, 0, 320, 720, 760, '#d5e6d0');
      rect(ctx, 0, 860, 720, 220, '#6b8f62');
      oval(ctx, 180, 940, 70, 28, '#b7c4bc');
      oval(ctx, 340, 980, 54, 22, '#9aa8a4');
      oval(ctx, 520, 930, 80, 30, '#c5d0cc');
      oval(ctx, 640, 990, 40, 18, '#8d9c98');
      rect(ctx, 70, 560, 10, 280, '#6b3a22');
      oval(ctx, 86, 540, 22, 22, '#e7b15a');
    },
    sash(ctx) {
      rect(ctx, 0, 320, 720, 760, '#3a2a4a');
      rect(ctx, 180, 480, 340, 420, '#1a2744');
      oval(ctx, 460, 580, 28, 28, '#f6f1e6');
      rect(ctx, 120, 460, 36, 460, '#6b4a7a');
      rect(ctx, 540, 460, 36, 460, '#6b4a7a');
      rect(ctx, 0, 960, 720, 120, '#2a2038');
      rect(ctx, 80, 980, 200, 16, '#c23b3b');
    },
    bump(ctx) {
      rect(ctx, 0, 320, 720, 760, '#e7eef4');
      rect(ctx, 40, 780, 640, 18, '#2a241c');
      rect(ctx, 40, 798, 640, 14, '#f6f1e6');
      rect(ctx, 40, 812, 640, 70, '#1f8a4c');
      rect(ctx, 348, 798, 8, 84, '#f6f1e6');
      rect(ctx, 80, 882, 16, 120, '#8a5a3a');
      rect(ctx, 624, 882, 16, 120, '#8a5a3a');
      rect(ctx, 0, 1000, 720, 80, '#d7c4a8');
    },
    mole(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f2d7a4');
      for (let i = 0; i < 8; i++) rect(ctx, i * 90, 470, 90, 36, i % 2 ? '#c23b3b' : '#f6f1e6');
      rect(ctx, 0, 506, 720, 12, '#8a5a3a');
      rect(ctx, 40, 860, 640, 28, '#a56b3c');
      rect(ctx, 40, 888, 640, 140, '#6b4a32');
      oval(ctx, 140, 800, 18, 14, '#e7b15a');
    },
    rain(ctx) {
      rect(ctx, 0, 320, 720, 760, '#c5d5e0');
      rect(ctx, 120, 460, 480, 400, '#d7ecff');
      rect(ctx, 100, 440, 520, 18, '#8a5a3a');
      rect(ctx, 100, 860, 520, 22, '#8a5a3a');
      rect(ctx, 100, 440, 20, 442, '#8a5a3a');
      rect(ctx, 600, 440, 20, 442, '#8a5a3a');
      rect(ctx, 80, 882, 560, 16, '#d7c4a8');
      ctx.strokeStyle = '#7ea4bc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        ctx.moveTo(150 + i * 36, 500);
        ctx.lineTo(132 + i * 36, 760);
      }
      ctx.stroke();
    },
    lamp(ctx) {
      rect(ctx, 0, 320, 720, 80, '#efe6d4');
      rect(ctx, 0, 400, 720, 680, '#f6efe2');
      rect(ctx, 0, 392, 720, 10, '#c4b49a');
      rrect(ctx, 70, 560, 140, 100, '#7eb6e0', 4);
      rect(ctx, 0, 980, 720, 100, '#c4894a');
      rrect(ctx, 520, 860, 150, 70, '#6b4a7a', 16);
      rect(ctx, 500, 900, 40, 28, '#8a5a3a');
    },
    knife(ctx) {
      rect(ctx, 0, 320, 720, 500, '#f7f1e6');
      for (let y = 420; y < 760; y += 48) {
        for (let x = 0; x < 720; x += 48) {
          rect(ctx, x + 3, y + 3, 42, 42, ((x + y) / 48) % 2 ? '#f7f1e6' : '#d5ebe4');
        }
      }
      rect(ctx, 0, 820, 720, 260, '#e7d3b0');
      rect(ctx, 560, 620, 16, 80, '#d5dde8');
      oval(ctx, 568, 700, 22, 10, '#d5dde8');
      rect(ctx, 80, 700, 10, 90, '#c48a55');
      rect(ctx, 70, 690, 36, 28, '#f6f1e6');
    },
    sling(ctx) {
      rect(ctx, 0, 320, 720, 460, '#b7e0f4');
      rect(ctx, 0, 780, 720, 300, '#6aaa58');
      for (let x = 0; x < 720; x += 28) rect(ctx, x, 620, 22, 180, '#c4894a');
      rect(ctx, 0, 760, 720, 14, '#8a5a32');
      oval(ctx, 140, 430, 28, 12, '#ffffff');
    },
    pour(ctx) {
      rect(ctx, 0, 320, 720, 520, '#f3efe6');
      rect(ctx, 0, 840, 720, 240, '#d7c4a8');
      rect(ctx, 36, 460, 16, 300, '#8a5a3a');
      rect(ctx, 36, 500, 150, 12, '#8a5a3a');
      rect(ctx, 36, 620, 150, 12, '#8a5a3a');
      rrect(ctx, 60, 456, 28, 40, '#7ec8e3', 4);
      rrect(ctx, 108, 468, 24, 28, '#e7b15a', 4);
      rrect(ctx, 70, 584, 36, 32, '#c23b3b', 4);
      oval(ctx, 600, 780, 26, 34, '#63b85a');
    },
    rod(ctx) {
      rect(ctx, 0, 320, 720, 420, '#c5e4f4');
      rect(ctx, 0, 740, 720, 80, '#6b8f62');
      rect(ctx, 0, 820, 720, 260, '#2f86b0');
      oval(ctx, 180, 900, 50, 16, '#f6f1e6');
      rect(ctx, 40, 760, 6, 70, '#63b85a');
      rect(ctx, 58, 750, 6, 80, '#3e8c4c');
      rect(ctx, 76, 770, 6, 60, '#63b85a');
      oval(ctx, 600, 400, 26, 26, '#fff4c4');
    },
    knock(ctx) {
      rect(ctx, 0, 320, 720, 640, '#f0e2cc');
      rect(ctx, 0, 960, 720, 18, '#8a5a3a');
      rect(ctx, 0, 978, 720, 102, '#d7b48a');
      rect(ctx, 250, 990, 220, 70, '#6b3a4a');
      rect(ctx, 70, 520, 8, 70, '#8a5a3a');
      oval(ctx, 74, 500, 22, 16, '#2a241c');
      rrect(ctx, 540, 560, 90, 120, '#e7e2d4', 4);
    },
    press(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f7f1e4');
      rect(ctx, 40, 480, 160, 420, '#6b4228');
      for (let i = 0; i < 8; i++) {
        rect(ctx, 52, 500 + i * 46, 130, 36, ['#c23b3b', '#3a6ea5', '#e7b15a', '#63b85a', '#6b4a7a', '#d5dde8', '#ff8d5a', '#2a241c'][i]);
      }
      rect(ctx, 0, 920, 720, 160, '#c9a36e');
      oval(ctx, 620, 860, 16, 28, '#f6f1e6');
    },
    bubble(ctx) {
      rect(ctx, 0, 320, 720, 760, '#e7f4f6');
      for (let y = 360; y < 560; y += 40) {
        for (let x = 0; x < 240; x += 40) rect(ctx, x + 2, y + 2, 36, 36, '#d5ebe8');
      }
      rrect(ctx, 40, 600, 150, 180, '#d7ecff', 8);
      oval(ctx, 560, 900, 120, 48, '#f6f1e6');
      rect(ctx, 460, 860, 200, 16, '#d5dde8');
      oval(ctx, 80, 820, 14, 14, '#ffffff');
    },
    pinch(ctx) {
      rect(ctx, 0, 320, 720, 500, '#f6efe6');
      rect(ctx, 0, 820, 720, 260, '#c4894a');
      rect(ctx, 80, 860, 560, 90, '#f3e6cf');
      rrect(ctx, 500, 780, 70, 50, '#f6f1e6', 4);
      rect(ctx, 150, 900, 8, 70, '#d5dde8');
      rect(ctx, 170, 900, 8, 70, '#d5dde8');
      oval(ctx, 90, 500, 20, 28, '#63b85a');
    },
    stamp(ctx) {
      rect(ctx, 0, 320, 720, 760, '#ece7dc');
      rect(ctx, 0, 860, 720, 220, '#b7b2a8');
      rrect(ctx, 80, 800, 70, 40, '#c23b3b', 4);
      rrect(ctx, 560, 760, 110, 28, '#d5dde8', 4);
      rrect(ctx, 560, 792, 110, 28, '#e7e2d4', 4);
      for (let i = 0; i < 5; i++) rect(ctx, 80, 480 + i * 28, 70, 16, '#fff');
      rect(ctx, 78, 468, 74, 8, '#c23b3b');
    },
    zip(ctx) {
      rect(ctx, 0, 320, 720, 760, '#e7eef6');
      poly(ctx, [180, 420, 540, 420, 600, 980, 120, 980], '#3a6ea5');
      rect(ctx, 300, 470, 120, 70, '#2a4a78');
      rrect(ctx, 80, 860, 70, 70, '#d5dde8', 8);
      rrect(ctx, 570, 860, 70, 70, '#d5dde8', 8);
    },
    marble(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f6efe2');
      rrect(ctx, 60, 620, 600, 340, '#e7c48a', 16);
      oval(ctx, 180, 720, 10, 10, '#8a5a3a');
      oval(ctx, 260, 800, 10, 10, '#8a5a3a');
      oval(ctx, 340, 700, 10, 10, '#8a5a3a');
      poly(ctx, [80, 660, 200, 660, 140, 620], '#c4894a');
      oval(ctx, 600, 480, 24, 24, '#7eb6ff');
    },
    sprinkle(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f7f1e6');
      rect(ctx, 80, 400, 250, 280, '#d7ecff');
      rect(ctx, 70, 390, 270, 14, '#8a5a3a');
      rect(ctx, 70, 670, 270, 14, '#8a5a3a');
      rect(ctx, 0, 860, 720, 220, '#d7c4a8');
      oval(ctx, 160, 820, 36, 28, '#c48a55');
      oval(ctx, 160, 760, 16, 22, '#63b85a');
      oval(ctx, 140, 770, 12, 16, '#3e8c4c');
    },
    lid(ctx) {
      rect(ctx, 0, 320, 720, 420, '#f4efe4');
      rect(ctx, 180, 360, 360, 28, '#d5dde8');
      rect(ctx, 300, 388, 16, 80, '#d5dde8');
      rect(ctx, 0, 780, 720, 300, '#2a241c');
      oval(ctx, 200, 900, 54, 22, '#4a4038');
      oval(ctx, 560, 940, 40, 16, '#4a4038');
      rrect(ctx, 500, 680, 50, 70, '#d5dde8', 8);
    },
    key(ctx) {
      rect(ctx, 0, 320, 720, 760, '#d7c4a8');
      rect(ctx, 160, 420, 400, 560, '#c4894a');
      rrect(ctx, 200, 480, 140, 180, '#a56b3c', 6);
      rrect(ctx, 380, 480, 140, 180, '#a56b3c', 6);
      oval(ctx, 360, 560, 12, 12, '#2a241c');
      rect(ctx, 140, 400, 20, 600, '#8a5a32');
      rect(ctx, 560, 400, 20, 600, '#8a5a32');
    },
    go(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f3ead2');
      for (let i = 0; i < 4; i++) {
        rect(ctx, 40 + i * 40, 400, 8, 320, '#c4b49a');
        rect(ctx, 40, 400 + i * 80, 160, 8, '#c4b49a');
      }
      rect(ctx, 0, 880, 720, 200, '#6b4228');
      oval(ctx, 140, 800, 36, 16, '#2a241c');
      oval(ctx, 140, 786, 36, 12, '#f6f1e6');
    },
    hanger(ctx) {
      rect(ctx, 0, 320, 720, 760, '#efe4ea');
      rect(ctx, 0, 320, 50, 760, '#d7b8c8');
      rect(ctx, 670, 320, 50, 760, '#d7b8c8');
      rect(ctx, 50, 520, 620, 16, '#c49a62');
      rrect(ctx, 120, 430, 80, 36, '#3a6ea5', 4);
      rrect(ctx, 230, 446, 70, 28, '#f6f1e6', 4);
      rect(ctx, 50, 980, 620, 100, '#c4894a');
    },
    drawer(ctx) {
      rect(ctx, 0, 320, 720, 640, '#f6efe2');
      rect(ctx, 0, 960, 720, 120, '#d7c4a8');
      rrect(ctx, 430, 430, 70, 90, '#f6f1e6', 8);
      rect(ctx, 458, 390, 10, 40, '#8a5a3a');
      oval(ctx, 463, 378, 18, 12, '#e7b15a');
      rrect(ctx, 80, 620, 90, 110, '#d7ecff', 4);
    },
    fan(ctx) {
      rect(ctx, 0, 320, 720, 560, '#f8efe6');
      rect(ctx, 0, 880, 720, 200, '#c9a36e');
      oval(ctx, 140, 760, 24, 30, '#7eb6e0');
      rect(ctx, 132, 790, 16, 70, '#c48a55');
      poly(ctx, [100, 620, 150, 560, 180, 700], '#63b85a');
      rrect(ctx, 540, 700, 100, 14, '#8a5a3a', 2);
    },
    wax(ctx) {
      rect(ctx, 0, 320, 720, 500, '#f7f1e6');
      rect(ctx, 0, 820, 720, 260, '#6b4228');
      rect(ctx, 80, 760, 90, 16, '#c23b3b');
      poly(ctx, [200, 790, 250, 700, 258, 800], '#2a241c');
      oval(ctx, 560, 760, 28, 20, '#e7b15a');
      rect(ctx, 548, 780, 24, 40, '#8a5a3a');
    },
    coin(ctx) {
      rect(ctx, 0, 320, 720, 500, '#f4efe4');
      rect(ctx, 0, 820, 720, 260, '#c4894a');
      rrect(ctx, 500, 640, 140, 120, '#d5dde8', 6);
      rect(ctx, 520, 700, 100, 10, '#2a241c');
      rect(ctx, 560, 660, 20, 30, '#e7b15a');
      rrect(ctx, 70, 700, 80, 50, '#f6f1e6', 4);
      rect(ctx, 86, 716, 48, 6, '#c23b3b');
    },
    shell(ctx) {
      rect(ctx, 0, 320, 720, 420, '#9fd4f0');
      rect(ctx, 0, 740, 720, 340, '#f0d7a8');
      poly(ctx, [0, 760, 180, 720, 360, 770, 540, 710, 720, 760, 720, 800, 0, 800], '#7ec8e3');
      poly(ctx, [80, 980, 100, 940, 130, 970, 150, 930, 170, 980], '#e7b15a');
      oval(ctx, 600, 430, 30, 30, '#fff4c4');
    },
    stylus(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f0e6d4');
      rrect(ctx, 160, 820, 360, 40, '#2a241c', 8);
      rrect(ctx, 140, 860, 400, 28, '#c4894a', 4);
      rrect(ctx, 540, 620, 110, 180, '#3a4a58', 6);
      oval(ctx, 595, 680, 18, 18, '#d5dde8');
      rect(ctx, 80, 700, 40, 160, '#8a5a3a');
    },
    bowl(ctx) {
      rect(ctx, 0, 320, 720, 300, '#1c2430');
      rrect(ctx, 250, 380, 220, 28, '#f6e7a8', 4);
      rect(ctx, 0, 620, 720, 460, '#d7b48a');
      rect(ctx, 80, 620, 28, 460, '#4a4038');
      rect(ctx, 612, 620, 28, 460, '#4a4038');
      rect(ctx, 200, 700, 320, 8, '#f6f1e6');
      for (let i = 0; i < 4; i++) poly(ctx, [430 + i * 22, 760, 438 + i * 22, 720, 448 + i * 22, 760], '#f6f1e6');
    },
    swing(ctx) {
      rect(ctx, 0, 320, 720, 500, '#8ec8ef');
      oval(ctx, 160, 620, 120, 90, '#2f7a40');
      rect(ctx, 140, 640, 36, 280, '#6b3a22');
      oval(ctx, 360, 980, 420, 80, '#5aaa62');
      oval(ctx, 560, 430, 34, 14, '#ffffff');
    },
    shuttle(ctx) {
      rect(ctx, 0, 320, 720, 380, '#b7e3f5');
      rect(ctx, 0, 700, 720, 380, '#2f8a4c');
      rect(ctx, 60, 760, 600, 8, '#f6f1e6');
      rect(ctx, 60, 980, 600, 8, '#f6f1e6');
      rect(ctx, 348, 760, 8, 228, '#f6f1e6');
      rect(ctx, 200, 640, 8, 160, '#d5dde8');
      rect(ctx, 512, 640, 8, 160, '#d5dde8');
      for (let y = 680; y < 800; y += 10) rect(ctx, 208, y, 304, 3, '#f6f1e6');
    },
    nail(ctx) {
      rect(ctx, 0, 320, 720, 500, '#d7c4a8');
      for (let y = 400; y < 760; y += 50) {
        for (let x = 40; x < 300; x += 50) oval(ctx, x, y, 5, 5, '#8a5a3a');
      }
      rect(ctx, 70, 470, 8, 70, '#d5dde8');
      rect(ctx, 48, 470, 52, 10, '#d5dde8');
      poly(ctx, [160, 560, 220, 500, 230, 620], '#c48a55');
      rect(ctx, 0, 820, 720, 260, '#a56b3c');
      rrect(ctx, 500, 760, 50, 36, '#6b4228', 4);
    },
    cake(ctx) {
      rect(ctx, 0, 320, 720, 480, '#f7f1e6');
      rect(ctx, 0, 800, 720, 280, '#3a3a3a');
      rect(ctx, 80, 860, 560, 16, '#d5dde8');
      oval(ctx, 180, 900, 36, 14, '#5a5048');
      rect(ctx, 540, 700, 14, 100, '#c48a55');
      oval(ctx, 547, 690, 22, 8, '#e7d3b0');
      rrect(ctx, 80, 620, 36, 70, '#7ec8e3', 4);
    },
    arrow(ctx) {
      rect(ctx, 0, 320, 720, 460, '#c5e6f6');
      rect(ctx, 0, 780, 720, 300, '#6aaa58');
      rrect(ctx, 70, 700, 36, 90, '#8a5a3a', 4);
      for (let i = 0; i < 3; i++) {
        rect(ctx, 78, 640 - i * 8, 4, 70, '#e7b15a');
        poly(ctx, [74, 640 - i * 8, 86, 640 - i * 8, 80, 626 - i * 8], '#c23b3b');
      }
      rect(ctx, 300, 560, 6, 40, '#f6f1e6');
      rect(ctx, 286, 548, 34, 16, '#c23b3b');
      oval(ctx, 140, 420, 26, 12, '#ffffff');
    },
    book(ctx) {
      rect(ctx, 0, 320, 720, 520, '#f6efe4');
      rect(ctx, 0, 840, 720, 240, '#c9a36e');
      rect(ctx, 80, 430, 10, 160, '#8a5a3a');
      poly(ctx, [60, 430, 110, 430, 85, 390], '#e7b15a');
      rrect(ctx, 70, 760, 28, 80, '#c23b3b', 2);
      rrect(ctx, 100, 780, 26, 60, '#3a6ea5', 2);
      rrect(ctx, 128, 750, 24, 90, '#63b85a', 2);
    },
    piano(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f3eee4');
      rect(ctx, 80, 700, 560, 220, '#2a241c');
      rect(ctx, 80, 680, 560, 28, '#1a140f');
      rect(ctx, 200, 430, 280, 200, '#f6f1e6');
      for (let i = 0; i < 5; i++) rect(ctx, 230, 480 + i * 24, 220, 2, '#2a241c');
      oval(ctx, 150, 620, 8, 8, '#2a241c');
    },
    egg(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f0e2c0');
      rect(ctx, 40, 420, 200, 500, '#c4894a');
      oval(ctx, 140, 560, 40, 40, '#1a140f');
      oval(ctx, 560, 820, 50, 36, '#f6f1e6');
      poly(ctx, [610, 820, 640, 800, 620, 840], '#e7b15a');
      oval(ctx, 548, 800, 10, 10, '#2a241c');
      rect(ctx, 500, 856, 8, 40, '#e7b15a');
      rect(ctx, 590, 856, 8, 40, '#e7b15a');
      for (let x = 300; x < 680; x += 14) rect(ctx, x, 960, 8, 28, '#e7c48a');
    },
    latch(ctx) {
      rect(ctx, 0, 320, 720, 760, '#c5e6c8');
      for (let x = 60; x < 400; x += 48) rect(ctx, x, 480, 40, 520, '#d7c4a8');
      rect(ctx, 40, 460, 380, 16, '#8a5a32');
      rect(ctx, 40, 960, 380, 16, '#8a5a32');
      rrect(ctx, 70, 700, 28, 50, '#d5dde8', 4);
      rect(ctx, 430, 480, 20, 500, '#6b4228');
      oval(ctx, 600, 430, 28, 28, '#fff4c4');
    },
    mail(ctx) {
      rect(ctx, 0, 320, 720, 460, '#9fd0f2');
      rect(ctx, 0, 780, 720, 80, '#6aaa58');
      rect(ctx, 0, 860, 720, 220, '#c9c2b4');
      rect(ctx, 0, 400, 180, 380, '#f6efe2');
      poly(ctx, [0, 400, 180, 400, 90, 330], '#c23b3b');
      rect(ctx, 470, 860, 18, 140, '#8a5a3a');
      oval(ctx, 120, 430, 30, 14, '#ffffff');
    },
    bells(ctx) {
      rect(ctx, 0, 320, 720, 760, '#2a2438');
      rect(ctx, 200, 860, 320, 18, '#c4894a');
      rect(ctx, 250, 878, 20, 120, '#8a5a3a');
      rect(ctx, 450, 878, 20, 120, '#8a5a3a');
      rrect(ctx, 180, 760, 360, 100, '#6b1c34', 12);
      oval(ctx, 140, 480, 16, 16, '#f6e7a8');
      oval(ctx, 580, 520, 10, 10, '#f6e7a8');
    },
    leaf(ctx) {
      rect(ctx, 0, 320, 720, 440, '#f0d2a8');
      rect(ctx, 0, 760, 720, 320, '#2f86b0');
      poly(ctx, [0, 360, 80, 520, 40, 700], '#6b3a22');
      oval(ctx, 70, 480, 28, 14, '#c23b3b');
      oval(ctx, 120, 560, 22, 12, '#e7b15a');
      oval(ctx, 500, 860, 36, 14, '#63b85a');
      oval(ctx, 180, 400, 22, 22, '#fff4c4');
    },
    cut(ctx) {
      rect(ctx, 0, 320, 720, 760, '#f8f1e6');
      for (let i = 0; i < 12; i++) rect(ctx, i * 60, 380, 60, 50, i % 2 ? '#c23b3b' : '#e7b15a');
      rect(ctx, 80, 720, 16, 280, '#d5dde8');
      rect(ctx, 624, 720, 16, 280, '#d5dde8');
      oval(ctx, 88, 700, 22, 10, '#e7b15a');
      oval(ctx, 632, 700, 22, 10, '#e7b15a');
      rect(ctx, 0, 980, 720, 100, '#d7c4a8');
    },
    candle(ctx) {
      rect(ctx, 0, 320, 720, 760, '#2a2430');
      rect(ctx, 480, 420, 160, 200, '#1a2744');
      oval(ctx, 560, 490, 16, 16, '#f6f1e6');
      rect(ctx, 0, 860, 720, 220, '#3a2a24');
      oval(ctx, 200, 900, 50, 16, '#f6f1e6');
      oval(ctx, 250, 860, 14, 18, '#c23b3b');
      rect(ctx, 80, 800, 40, 60, '#6b4228');
    },
    phone(ctx) {
      rect(ctx, 0, 320, 720, 500, '#1e2a44');
      oval(ctx, 150, 500, 46, 46, '#f6f1e6');
      ctx.strokeStyle = '#3a2416';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(150, 500);
      ctx.lineTo(150, 468);
      ctx.moveTo(150, 500);
      ctx.lineTo(172, 500);
      ctx.stroke();
      rect(ctx, 0, 820, 720, 260, '#6b4228');
      rect(ctx, 0, 820, 720, 16, '#c4894a');
      rrect(ctx, 70, 860, 130, 96, '#f6f1e6', 6);
      rect(ctx, 92, 888, 86, 4, '#c9bba6');
      rect(ctx, 92, 908, 86, 4, '#c9bba6');
      rect(ctx, 92, 928, 58, 4, '#c9bba6');
      rect(ctx, 214, 900, 64, 8, '#e7b15a');
    },
  };

  function drawRoom(ctx, id) {
    const fn = SCENERY[id];
    if (fn) fn(ctx);
  }

  // 房间背景是静止的：每关只画一次，之后直接贴图，省下每帧几十个形状
  const roomCache = {};
  function drawRoomCached(ctx, id) {
    // 第 1 关有 AI 素材：加载好就直接贴，只画场景区，别盖住顶栏和跑道
    const bg = window.RHYTHM_IMG && window.RHYTHM_IMG.bg;
    if (id === 'lift' && bg && bg.complete && bg.naturalWidth) {
      ctx.drawImage(bg, 0, 300, 720, 870, 0, 300, 720, 870);
      return;
    }
    if (!roomCache[id]) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const off = document.createElement('canvas');
      off.width = Math.round(720 * dpr);
      off.height = Math.round(1600 * dpr);
      const octx = off.getContext('2d');
      octx.scale(dpr, dpr);
      drawRoom(octx, id);
      roomCache[id] = off;
    }
    ctx.drawImage(roomCache[id], 0, 0, 720, 1600);
  }

  function draw(ctx, lv, pose) {
    const visual = lv && lv.visual;
    if (!visual) return;
    pose = pose || {};
    drawRoomCached(ctx, lv.id);
    const u = S.cueU(visual, pose);
    const ends = S.propEnds(visual);
    const pt = lively(propPoint(visual, pose.arrive, ends));
    drawGround(ctx);
    (visual.places || []).forEach((p) => drawPlace(ctx, p, visual, pose));
    if (pt && visual.prop && visual.prop.behind) drawThing(ctx, visual.prop, pt, pose);
    const actor = visual.actor || {};
    const idle = u < 0 ? 1 : (u < 0.18 ? 1 - u / 0.18 : 0);
    const g = pose.groove;
    ctx.save();
    if (g && idle > 0.02 && actor.k && actor.k !== 'none') {
      const ax = actor.x != null ? actor.x : (actor.hip ? actor.hip[0] : 360);
      const ay = actor.y != null ? actor.y : (actor.hip ? actor.hip[1] : 820);
      const hop = g.bounce * idle;
      ctx.translate(ax, ay - hop * 36);
      ctx.rotate(g.sway * 0.05 * idle);
      ctx.scale(1 + hop * 0.12, Math.max(0.72, 1 - hop * 0.26));
      ctx.translate(-ax, -ay);
    }
    drawActor(ctx, visual, u);
    ctx.restore();
    if (pt && visual.prop && !visual.prop.behind) drawThing(ctx, visual.prop, pt, pose);
    if ((pose.strike || 0) >= 1) spark(ctx, ends.home.x, ends.home.y, pose.strike, 1);
  }

  window.SceneDraw = { draw };
})();
