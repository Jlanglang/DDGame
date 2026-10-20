/* 豆豆暗黑传奇 · M1 原型
   跑通主流程：移动 → 回合战斗 → 升级 → 掉落 → 进洞 → 首领
   规则按 docs/豆豆暗黑传奇-规则与任务.md（v13 首版） */
(() => {
  'use strict';

  const TILE = 32;
  const VIEW_W = 720;
  const VIEW_H = 1120;
  const SAVE_KEY = 'darklegend-save-v1';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const el = {
    lv: document.getElementById('lv'),
    hpFill: document.getElementById('hpFill'),
    hpText: document.getElementById('hpText'),
    mpFill: document.getElementById('mpFill'),
    mpText: document.getElementById('mpText'),
    gold: document.getElementById('gold'),
    potion: document.getElementById('potion'),
    exp: document.getElementById('exp'),
    log: document.getElementById('log'),
    over: document.getElementById('over'),
    overK: document.getElementById('overK'),
    overT: document.getElementById('overT'),
    overS: document.getElementById('overS'),
    overBtn: document.getElementById('overBtn'),
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const roll = (v) => v * (0.75 + Math.random() * 0.5);
  const key = (x, y) => x + ',' + y;

  /* ---------------- 数据 ---------------- */
  const MON = [
    { id: 'chicken', name: '鸡', glyph: '🐔', aggro: 0 },
    { id: 'rat', name: '田鼠', glyph: '🐭', aggro: 0 },
    { id: 'dog', name: '野狗', glyph: '🐕', aggro: 5 },
    { id: 'bee', name: '蜜蜂', glyph: '🐝', aggro: 4 },
    { id: 'scarecrow', name: '稻草人', glyph: '🎃', aggro: 0 },
    { id: 'boar', name: '野猪', glyph: '🐗', aggro: 5 },
    { id: 'queen', name: '蜂后', glyph: '🐝', aggro: 4 },
    { id: 'treant', name: '树精', glyph: '🌳', aggro: 5 },
  ];
  const BOSS = { id: 'boss', name: '巨型稻草人', glyph: '👹', aggro: 6 };

  /* ---------------- 玩家 ---------------- */
  const P = {
    x: 4, y: 24, dir: 'r',
    lv: 1, exp: 0, hp: 60, mp: 15, gold: 0, potions: 5,
    weapon: 0, armor: 0,
  };

  const maxHp = () => 60 + 18 * (P.lv - 1) + P.armor * 6;
  const maxMp = () => 15 + 3 * (P.lv - 1);
  const atkMean = () => 5 + 1.5 * (P.lv - 1) + P.weapon;
  const defMean = () => 3 + 1 * (P.lv - 1);
  const needExp = () => Math.round(100 * Math.pow(1.18, P.lv - 1));

  /* ---------------- 地图 ---------------- */
  let map = [];
  let seen = new Set();
  let enemies = [];
  let inCave = false;
  let turn = 0;
  let over = false;
  let door = { x: 0, y: 0 };
  let back = { x: 0, y: 0 };
  let logs = [];

  const isWall = (x, y) => x < 0 || y < 0 || x >= map[0].length || y >= map.length || map[y][x] === 1;
  const enemyAt = (x, y) => enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);

  function blank(w, h) {
    return Array.from({ length: h }, () => Array.from({ length: w }, () => 1));
  }

  function carve(m, x, y, w, h) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j > 0 && i > 0 && j < m.length - 1 && i < m[0].length - 1) m[j][i] = 0;
      }
    }
  }

  function corridor(m, a, b) {
    let x = a.x, y = a.y;
    while (x !== b.x) { x += x < b.x ? 1 : -1; m[y][x] = 0; }
    while (y !== b.y) { y += y < b.y ? 1 : -1; m[y][x] = 0; }
  }

  function genOverworld() {
    const m = blank(48, 48);
    const rooms = [];
    for (let i = 0; i < 26 && rooms.length < 12; i++) {
      const w = randi(5, 9), h = randi(4, 7);
      const x = randi(2, 47 - w - 2), y = randi(2, 47 - h - 2);
      const r = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
      const overlap = rooms.some((o) =>
        x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y);
      if (overlap) continue;
      rooms.push(r);
      carve(m, x, y, w, h);
    }
    for (let i = 1; i < rooms.length; i++) corridor(m, rooms[i - 1], rooms[i]);
    map = m;
    seen = new Set();
    enemies = [];
    inCave = false;
    const start = rooms[0];
    P.x = start.cx;
    P.y = start.cy;
    const last = rooms[rooms.length - 1];
    door = { x: last.cx, y: last.cy };
    map[door.y][door.x] = 2;
    // 刷怪：按房间位置给等级
    rooms.forEach((r, i) => {
      if (i === 0) return;
      const lv = clamp(1 + Math.floor((r.cx / 48) * 10), 1, 10);
      const n = randi(1, 3);
      for (let k = 0; k < n; k++) {
        const type = MON[clamp(Math.round((lv - 1) * 0.85), 0, MON.length - 1)];
        const x = randi(r.x, r.x + r.w - 1);
        const y = randi(r.y, r.y + r.h - 1);
        if (isWall(x, y) || enemyAt(x, y) || (x === P.x && y === P.y)) continue;
        enemies.push(makeEnemy(lv, type));
        enemies[enemies.length - 1].x = x;
        enemies[enemies.length - 1].y = y;
      }
    });
    log('你回到了鸡鸣村外。', 'good');
  }

  function genCave() {
    const m = blank(26, 26);
    carve(m, 2, 9, 6, 8);
    carve(m, 14, 8, 8, 10);
    corridor(m, { x: 5, y: 13 }, { x: 17, y: 13 });
    map = m;
    seen = new Set();
    inCave = true;
    P.x = 4;
    P.y = 13;
    back = { x: 3, y: 13 };
    map[back.y][back.x] = 2;
    enemies = [
      Object.assign(makeEnemy(9, MON[7], false, true), { x: 12, y: 12 }),
      Object.assign(makeEnemy(9, MON[7], false, true), { x: 13, y: 14 }),
      Object.assign(makeEnemy(10, BOSS, true), { x: 19, y: 13 }),
    ];
    log('稻草垛洞：潮湿、发霉，深处有东西在动。', 'bad');
  }

  function makeEnemy(lv, type, boss = false, elite = false) {
    const hp = 18 * Math.pow(1.085, lv) * (boss ? 6 : elite ? 3 : 1);
    return {
      name: type.name,
      glyph: type.glyph,
      boss,
      aggro: type.aggro,
      lv,
      x: 0, y: 0,
      hp: Math.round(hp),
      maxHp: Math.round(hp),
      atk: (10 + 4 * lv) * (boss ? 1.0 : elite ? 1.5 : 0.8), // 图 1 覆盖：R14.2c
      def: 2 * Math.pow(1.075, lv) * (boss ? 1.5 : elite ? 1.2 : 1),
      exp: Math.round(10 * Math.pow(1.12, lv - 1) * (boss ? 30 : elite ? 3 : 1)),
      gold: boss ? randi(80, 120) : randi(2, 4 + lv),
    };
  }

  /* ---------------- 日志 / HUD ---------------- */
  function log(text, cls) {
    logs.push({ text, cls });
    if (logs.length > 30) logs.shift();
    const last = logs.slice(-4).map((l) => `<div class="${l.cls || ''}">${l.text}</div>`).join('');
    el.log.innerHTML = last;
  }

  function syncHud() {
    el.lv.textContent = `Lv.${P.lv}`;
    el.hpFill.style.width = `${clamp(P.hp / maxHp(), 0, 1) * 100}%`;
    el.hpText.textContent = `${Math.max(0, Math.ceil(P.hp))} / ${maxHp()}`;
    el.mpFill.style.width = `${clamp(P.mp / maxMp(), 0, 1) * 100}%`;
    el.mpText.textContent = `${Math.ceil(P.mp)} / ${maxMp()}`;
    el.gold.textContent = `🪙 ${P.gold}`;
    el.potion.textContent = `🧪 ${P.potions}`;
    el.exp.textContent = `经验 ${P.exp}/${needExp()}`;
  }

  /* ---------------- 存档 ---------------- */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        lv: P.lv, exp: P.exp, hp: P.hp, mp: P.mp, gold: P.gold,
        potions: P.potions, weapon: P.weapon, armor: P.armor,
      }));
    } catch { /* 忽略 */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      P.lv = s.lv || 1;
      P.exp = s.exp || 0;
      P.gold = s.gold || 0;
      P.potions = s.potions ?? 3;
      P.weapon = s.weapon || 0;
      P.armor = s.armor || 0;
      P.hp = Math.min(s.hp || maxHp(), maxHp());
      P.mp = Math.min(s.mp || maxMp(), maxMp());
    } catch { /* 忽略 */ }
  }

  /* ---------------- 战斗 ---------------- */
  function playerDamage(mult) {
    return Math.max(1, Math.round(roll(atkMean()) * mult - roll(0)));
  }

  function hurt(e, dmg, tag) {
    e.hp -= dmg;
    log(`${tag}对${e.name}造成 <b>${dmg}</b> 伤害，剩余 ${Math.max(0, Math.ceil(e.hp))}。`);
    if (e.hp <= 0) kill(e);
  }

  function kill(e) {
    e.hp = 0;
    P.exp += e.exp;
    P.gold += e.gold;
    log(`${e.name}倒下了，+${e.exp} 经验、+${e.gold} 金币。`, 'good');
    if (Math.random() < 0.12) { P.potions++; log('捡到 1 瓶药水。', 'good'); }
    if (Math.random() < 0.08) dropEquip(e);
    while (P.exp >= needExp()) {
      P.exp -= needExp();
      P.lv++;
      P.hp = maxHp();
      P.mp = maxMp();
      log(`升级！现在是 Lv.${P.lv}，属性已恢复。`, 'good');
    }
    if (e.boss) win();
  }

  function dropEquip(e) {
    if (Math.random() < 0.5) {
      const bonus = randi(1, 3);
      if (bonus > P.weapon) {
        P.weapon = bonus;
        log(`掉落：铁剑 +${bonus} 攻击，已换上。`, 'good');
      } else log(`掉落：铁剑 +${bonus} 攻击（不如手头的）。`);
    } else {
      const bonus = randi(1, 2);
      if (bonus > P.armor) {
        P.armor = bonus;
        P.hp = Math.min(P.hp + bonus * 6, maxHp());
        log(`掉落：皮甲 +${bonus} 防御，已换上。`, 'good');
      } else log(`掉落：皮甲 +${bonus} 防御（不如手头的）。`);
    }
  }

  function enemiesTurn() {
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = Math.abs(e.x - P.x) + Math.abs(e.y - P.y);
      if (d === 1) {
        let dmg = Math.max(1, Math.round(roll(e.atk) - roll(defMean() * 0.8)));
        // R14.11 防秒杀：前期单次伤害有上限，普通 35%、首领 50%
        dmg = Math.min(dmg, Math.ceil(maxHp() * (e.boss ? 0.5 : 0.35)));
        P.hp -= dmg;
        log(`${e.name}攻击你，<span class="bad">-${dmg} HP</span>。`, 'bad');
        if (P.hp <= 0) { die(); return; }
      } else if (d <= e.aggro) {
        const steps = [];
        if (Math.abs(e.x - P.x) > Math.abs(e.y - P.y)) steps.push([e.x < P.x ? 1 : -1, 0]);
        else steps.push([0, e.y < P.y ? 1 : -1]);
        steps.push([Math.abs(e.x - P.x) > Math.abs(e.y - P.y) ? 0 : (e.x < P.x ? 1 : -1), Math.abs(e.x - P.x) > Math.abs(e.y - P.y) ? (e.y < P.y ? 1 : -1) : 0]);
        for (const [dx, dy] of steps) {
          if (!dx && !dy) continue;
          const nx = e.x + dx, ny = e.y + dy;
          if (!isWall(nx, ny) && !enemyAt(nx, ny) && !(nx === P.x && ny === P.y)) {
            e.x = nx; e.y = ny; break;
          }
        }
      }
    }
  }

  function die() {
    over = true;
    P.hp = 0;
    P.exp = Math.floor(P.exp * 0.95);
    el.overK.textContent = '倒下';
    el.overT.textContent = '你被稻草垛里的东西拖了进去';
    el.overS.textContent = `等级 Lv.${P.lv} 保留，损失本局 5% 经验。回到村口再来。`;
    el.over.hidden = false;
    save();
  }

  function win() {
    over = true;
    el.overK.textContent = '通关';
    el.overT.textContent = '你击败了巨型稻草人';
    el.overS.textContent = `Lv.${P.lv} · 金币 ${P.gold} · 图 1 结束。后面的图还没做（M3）。`;
    el.over.hidden = false;
    save();
  }

  /* ---------------- 行动 ---------------- */
  function after() {
    if (over) return;
    enemiesTurn();
    if (over) return;
    turn++;
    syncHud();
    save();
  }

  function facingVec() {
    if (P.dir === 'l') return [-1, 0];
    if (P.dir === 'r') return [1, 0];
    if (P.dir === 'u') return [0, -1];
    return [0, 1];
  }

  function adjacentTarget() {
    const [fx, fy] = facingVec();
    const front = enemies.find((e) => e.hp > 0 && e.x === P.x + fx && e.y === P.y + fy);
    if (front) return front;
    return enemies.filter((e) => e.hp > 0 && Math.abs(e.x - P.x) + Math.abs(e.y - P.y) === 1)
      .sort((a, b) => a.hp - b.hp)[0] || null;
  }

  function attack(mult, tag) {
    const t = adjacentTarget();
    if (!t) { log('身边没有敌人。'); return false; }
    hurt(t, Math.max(1, Math.round(roll(atkMean()) * mult - roll(t.def))), tag);
    return true;
  }

  function halfMoon() {
    if (P.mp < 12) { log('MP 不足。'); return false; }
    P.mp -= 12;
    const [fx, fy] = facingVec();
    let hit = false;
    for (let i = 1; i <= 2; i++) {
      const e = enemies.find((en) => en.hp > 0 && en.x === P.x + fx * i && en.y === P.y + fy * i);
      if (e) { hurt(e, Math.max(1, Math.round(roll(atkMean()) * 1.1 - roll(e.def))), '半月'); hit = true; }
    }
    if (!hit) { log('半月劈在空气里。'); }
    return true;
  }

  function fireSword() {
    if (P.mp < 18) { log('MP 不足。'); return false; }
    const t = adjacentTarget();
    if (!t) { log('身边没有敌人。'); return false; }
    P.mp -= 18;
    hurt(t, Math.max(1, Math.round(roll(atkMean()) * 2.2 - roll(t.def))), '烈火');
    return true;
  }

  function drink() {
    if (P.potions <= 0) { log('没有药水了。'); return false; }
    P.potions--;
    const heal = Math.round(maxHp() * 0.4);
    P.hp = Math.min(maxHp(), P.hp + heal);
    log(`喝下药水，回复 ${heal} HP。`, 'good');
    return true;
  }

  function move(dx, dy) {
    if (dx < 0) P.dir = 'l'; else if (dx > 0) P.dir = 'r';
    else if (dy < 0) P.dir = 'u'; else if (dy > 0) P.dir = 'd';
    const nx = P.x + dx, ny = P.y + dy;
    if (isWall(nx, ny)) { log('那边是墙。'); return false; }
    const e = enemyAt(nx, ny);
    if (e) { attack(1.4, '攻击'); return true; }
    P.x = nx; P.y = ny;
    if (map[ny][nx] === 2) {
      if (inCave) { genOverworld(); }
      else { genCave(); }
      log(inCave ? '你走进了稻草垛洞。' : '你回到了村外。');
    }
    return true;
  }

  function act(kind) {
    if (over) return;
    let ok = true;
    if (kind === 'attack') ok = attack(1.4, '攻击');
    else if (kind === 'half') { ok = halfMoon(); }
    else if (kind === 'fire') { ok = fireSword(); }
    else if (kind === 'potion') ok = drink();
    else if (kind === 'wait') { log('你按兵不动。'); }
    if (ok) after();
  }

  /* ---------------- 渲染 ---------------- */
  const cam = { x: 0, y: 0 };

  function visible(x, y) {
    return Math.max(Math.abs(x - P.x), Math.abs(y - P.y)) <= 8;
  }

  function draw() {
    const mw = map[0].length * TILE;
    const mh = map.length * TILE;
    const tx = clamp(P.x * TILE + TILE / 2 - VIEW_W / 2, 0, Math.max(0, mw - VIEW_W));
    const ty = clamp(P.y * TILE + TILE / 2 - VIEW_H / 2, 0, Math.max(0, mh - VIEW_H));
    cam.x += (tx - cam.x) * 0.18;
    cam.y += (ty - cam.y) * 0.18;

    ctx.fillStyle = '#070a11';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const x0 = Math.floor(cam.x / TILE) - 1;
    const y0 = Math.floor(cam.y / TILE) - 1;
    const x1 = x0 + Math.ceil(VIEW_W / TILE) + 3;
    const y1 = y0 + Math.ceil(VIEW_H / TILE) + 3;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= map[0].length || y >= map.length) continue;
        const t = map[y][x];
        const vis = visible(x, y);
        if (vis) seen.add(key(x, y));
        if (!seen.has(key(x, y))) continue;
        const sx = x * TILE - cam.x;
        const sy = y * TILE - cam.y;
        if (t === 1) ctx.fillStyle = vis ? '#151f33' : '#0d1422';
        else if (t === 2) ctx.fillStyle = vis ? '#b8860b' : '#5b440f';
        else ctx.fillStyle = vis ? (inCave ? '#1b1a2e' : '#1b2436') : '#111827';
        ctx.fillRect(sx, sy, TILE - 1, TILE - 1);
        if (t === 2 && vis) {
          ctx.font = '18px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('🕳', sx + TILE / 2, sy + TILE - 6);
        }
      }
    }

    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (!visible(e.x, e.y) || !seen.has(key(e.x, e.y))) continue;
      const sx = e.x * TILE - cam.x + TILE / 2;
      const sy = e.y * TILE - cam.y + TILE / 2;
      ctx.font = `${e.boss ? 34 : 24}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(e.glyph, sx, sy + 8);
      const w = 26;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx - w / 2, sy - 18, w, 4);
      ctx.fillStyle = '#e05a5a';
      ctx.fillRect(sx - w / 2, sy - 18, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }

    // 玩家
    const px = P.x * TILE - cam.x + TILE / 2;
    const py = P.y * TILE - cam.y + TILE / 2;
    ctx.font = '26px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🧙', px, py + 8);

    // 视野暗角
    const g = ctx.createRadialGradient(px, py, 120, px, py, 520);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    requestAnimationFrame(draw);
  }

  /* ---------------- 输入 ---------------- */
  function bind() {
    const keys = {
      w: () => move(0, -1), a: () => move(-1, 0), s: () => move(0, 1), d: () => move(1, 0),
      arrowup: () => move(0, -1), arrowleft: () => move(-1, 0), arrowdown: () => move(0, 1), arrowright: () => move(1, 0),
      j: () => act('attack'), '1': () => act('half'), '2': () => act('fire'), q: () => act('potion'),
    };
    window.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (keys[k]) { e.preventDefault(); keys[k](); }
    });
    document.getElementById('btnAtk').addEventListener('click', () => act('attack'));
    document.getElementById('btnHalf').addEventListener('click', () => act('half'));
    document.getElementById('btnFire').addEventListener('click', () => act('fire'));
    document.getElementById('btnPotion').addEventListener('click', () => act('potion'));
    el.overBtn.addEventListener('click', () => {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    });
    document.getElementById('btnRestart').addEventListener('click', () => {
      if (!confirm('重开？进度会清空。')) return;
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    });
  }

  /* ---------------- 启动 ---------------- */
  load();
  genOverworld();
  bind();
  log('鸡鸣村外：先打鸡，学会走位；打不动就换武器——破防靠装备。');
  P.hp = maxHp();
  P.mp = maxMp();
  syncHud();
  draw();

  if (location.search.includes('debug')) {
    window.__dl = { P, act, move, enemies: () => enemies, map: () => map, genCave, genOverworld };
  }
})();
