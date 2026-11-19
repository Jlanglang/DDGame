// game.js — 状态机 / 主循环 / 子弹 / 波次 / 结算 / 输入
(function (root) {
  'use strict';
  const WV = root.WV = root.WV || {};
  const FIXED = 1 / 60;
  const MAX_ALIVE = 4;

  const hasDOM = typeof document !== 'undefined' && !!document.getElementById('c');
  const canvas = hasDOM ? document.getElementById('c') : null;
  const ctx = canvas ? canvas.getContext('2d') : null;

  const G = {
    mode: 'title', level: 0, levelName: '', theme: null, grid: null,
    dinner: null, spawners: [], playerSpawn: { x: 0, y: 0 }, player: null,
    enemies: [], bullets: [], particles: [], floats: [],
    waveIndex: 0, waveSizes: [], spawnQueue: [], spawnCd: 0, bossPending: false,
    totalEnemies: 0, enemiesLeft: 0, score: 0, kills: 0, playTime: 0,
    upgrades: [], cardChoices: [], boss: null, bossHp: 0, bossMaxHp: 0,
    result: { win: false, msg: '' }, muted: false, hitstop: 0,
    introT: 0, clearT: 0, best: 0, time: 0, levelTime: 0, shakeT: 0,
    dinnerHp: 3, dinnerMaxHp: 3,
  };

  // ---------------- 存档 ----------------
  function readBest() {
    try { return parseInt(root.localStorage && root.localStorage.getItem('wvc-best') || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function writeBest(v) {
    try { if (root.localStorage) root.localStorage.setItem('wvc-best', String(v)); }
    catch (e) { /* 忽略 */ }
  }
  G.best = readBest();

  // ---------------- 关卡 ----------------
  function loadLevel(i, keepTitle) {
    const lv = WV.Levels[i];
    G.level = i;
    G.levelName = lv.name;
    G.theme = WV.applyTheme(lv.theme);
    G.grid = WV.buildGrid(i);
    WV.grid = G.grid;
    G.dinner = lv.dinner;
    G.spawners = lv.spawners;
    G.playerSpawn = lv.playerSpawn;
    const prevPlayer = G.player;
    G.player = WV.Player.create(G);
    if (prevPlayer) {
      // 跨关保留强化后的属性，位置/无敌由 create 重置
      G.player.lives = prevPlayer.lives;
      G.player.speed = prevPlayer.speed;
      G.player.fireRate = prevPlayer.fireRate;
      G.player.bulletSpeed = prevPlayer.bulletSpeed;
      G.player.bulletPower = prevPlayer.bulletPower;
      G.player.pierce = prevPlayer.pierce;
      G.player.doubleShot = prevPlayer.doubleShot;
      G.player.doubleLevel = prevPlayer.doubleLevel;
      G.player.shieldTime = prevPlayer.shieldTime;
    }
    G.enemies.length = 0;
    G.bullets.length = 0;
    G.particles.length = 0;
    G.floats.length = 0;
    G.waveIndex = 0;
    G.waveSizes = lv.waveSizes.slice();
    G.spawnQueue.length = 0;
    G.spawnCd = 0.8;
    G.bossPending = !!lv.hasBoss;
    G.totalEnemies = lv.enemyQuota + (lv.hasBoss ? 1 : 0);
    G.enemiesLeft = G.totalEnemies;
    G.boss = null;
    G.bossHp = 0;
    G.bossMaxHp = 0;
    G.dinnerHp = 3;
    G.dinnerMaxHp = 3;
    G.levelTime = 0;
    G.shakeT = 0;
    G.hitstop = 0;
    G.mode = keepTitle ? 'title' : 'intro';
    if (!keepTitle) G.introT = 1.9;
  }

  function startGame() {
    dirStack.length = 0;
    WV.input.dir = -1;
    WV.input.fire = false;
    if (WV.Player.touch) { WV.Player.touch.dir = -1; WV.Player.touch.fire = false; }
    G.score = 0;
    G.kills = 0;
    G.playTime = 0;
    G.upgrades = [];
    G.cardChoices = [];
    G.result = { win: false, msg: '' };
    G.player = null;
    loadLevel(0, false);
    WV.audio.play('start');
  }

  // ---------------- 波次 ----------------
  function enemyKindFor(level, idx) {
    const r = WV.rand();
    if (level === 0) return r < 0.7 ? 'grunt' : 'scout';
    if (level === 1) return r < 0.42 ? 'grunt' : r < 0.74 ? 'scout' : 'heavy';
    return r < 0.45 ? 'grunt' : r < 0.85 ? 'heavy' : 'sniper';
  }

  function aliveCap() {
    return G.boss ? 3 : MAX_ALIVE;
  }

  function updateWaves(dt) {
    // 开始下一波
    if (G.spawnQueue.length === 0 && G.waveIndex < G.waveSizes.length) {
      const size = G.waveSizes[G.waveIndex];
      for (let i = 0; i < size; i++) G.spawnQueue.push(enemyKindFor(G.level, i));
      G.waveIndex++;
    }

    // BOSS：最后一波小怪全部刷出后登场
    if (G.bossPending && G.waveIndex >= G.waveSizes.length && G.spawnQueue.length === 0) {
      const p = WV.Enemies.pickSpawn(G);
      WV.Enemies.spawn(G, 'boss', p.x, p.y);
      G.bossPending = false;
      G.boss = G.enemies.find(e => e.isBoss) || null;
      G.bossMaxHp = G.boss ? (G.boss.maxHp || 40) : 0;
      G.bossHp = G.bossMaxHp;
      WV.audio.play('boss');
      WV.FX.float(G, WV.MAP_W / 2, 80, 'Claude 大将军出现！', '#ffd166');
      // 关底补给：BOSS 登场回满命，别让玩家带着残血打最终战
      if (G.player) G.player.lives = 5;
    }

    // 刷小怪
    G.spawnCd -= dt;
    if (G.spawnQueue.length > 0 && G.spawnCd <= 0 && G.enemies.length < aliveCap()) {
      const kind = G.spawnQueue.shift();
      const p = WV.Enemies.pickSpawn(G);
      WV.Enemies.spawn(G, kind, p.x, p.y);
      G.spawnCd = 1.0;
    }
  }

  // ---------------- 玩家受击 / 重生 ----------------
  function respawnPlayer() {
    if (!G.player) return;
    G.player.x = G.playerSpawn.x;
    G.player.y = G.playerSpawn.y;
    G.player.dir = 0;
    G.player.invuln = Math.max(2.5, G.player.invuln || 0);
  }

  function onPlayerHit() {
    if (G.player && G.player.invuln > 0) return;   // 无敌期挨弹不该被传回出生点
    const alive = WV.Player.hit(G);
    if (alive) respawnPlayer();
    else result(false, '鲸鱼娘倒下了…大白饭还在等你');
  }

  // ---------------- 子弹 ----------------
  function removeBullet(i) { G.bullets.splice(i, 1); }

  function bulletHitsTank(b) {
    if (b.owner === 'player') {
      for (const e of G.enemies) {
        if (WV.aabb(b.x - 4, b.y - 4, 8, 8, e.x, e.y, e.w, e.h)) return e;
      }
    } else if (G.player) {
      const p = G.player;
      if (WV.aabb(b.x - 4, b.y - 4, 8, 8, p.x, p.y, p.w, p.h)) return p;
    }
    return null;
  }

  function updateBullets(dt) {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      if (!b) continue;
      b.life -= dt;
      if (b.life <= 0) { removeBullet(i); continue; }

      const dist = b.speed * dt;
      const steps = Math.max(1, Math.ceil(dist / 6));
      const stepLen = dist / steps;
      let dead = false;

      for (let s = 0; s < steps && !dead; s++) {
        b.x += b.dx * stepLen;
        b.y += b.dy * stepLen;

        if (b.x < 0 || b.x > WV.MAP_W || b.y < 0 || b.y > WV.MAP_H) { dead = true; break; }

        const t = WV.tileAt(b.x, b.y);
        if (t === WV.DINNER) {
          // 玩家自己的子弹和 BOSS 弹幕都不扣大白饭，只有敌人子弹算数
          if (b.noDinner || b.owner === 'player') continue;
          G.dinnerHp--;
          WV.FX.burst(G, b.x, b.y, '#f6e7c8', 26, 200);
          WV.FX.float(G, b.x, b.y - 20, '大白饭 -1', '#ffb36b');
          WV.audio.play('hit');
          removeBullet(i);
          if (G.dinnerHp <= 0) {
            WV.audio.play('lose');
            result(false, '大白饭被 Claude 吃光了…');
            return;
          }
          dead = true;
          break;
        }
        if (t === WV.BRICK || t === WV.STEEL) {
          // noDinner 的 BOSS 弹幕不拆老巢钢墙，不然破洞后小怪能钻进去偷家
          const res = WV.damageTileAt(b.x, b.y, b.noDinner ? 1 : (b.power || 1));
          if (res.destroyed) {
            WV.FX.burst(G, b.x, b.y, res.type === WV.STEEL ? '#c9d6e2' : '#d98b5f', 10, 140);
          }
          WV.audio.play('ricochet');
          removeBullet(i);
          dead = true;
          break;
        }
        if (t === WV.WATER) continue;

        const target = bulletHitsTank(b);
        if (target) {
          if (b.owner === 'player') {
            const killed = WV.Enemies.damage(G, target, b.dmg || 1);
            WV.FX.burst(G, b.x, b.y, '#ffe9b8', 8, 120);
            if (killed) onEnemyKilled(target);
            else WV.audio.play('hit');
          } else {
            WV.FX.burst(G, b.x, b.y, '#ff9f6b', 10, 130);
            onPlayerHit();
          }
          if (b.pierce && b.pierce > 0) {
            b.pierce--;
            // 沿弹道推出目标身体，避免下一帧重复命中同一个敌人
            b.x += b.dx * 14;
            b.y += b.dy * 14;
          } else {
            removeBullet(i);
          }
          dead = true;
          break;
        }
      }
      if (!dead && (b.x < 0 || b.x > WV.MAP_W || b.y < 0 || b.y > WV.MAP_H)) removeBullet(i);
    }
  }

  // 敌我子弹对撞
  function resolveBulletCollisions() {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const a = G.bullets[i];
      if (!a) continue;
      for (let j = i - 1; j >= 0; j--) {
        const b = G.bullets[j];
        if (!b) continue;
        if ((a.owner === 'player') === (b.owner === 'player')) continue;
        if (Math.abs(a.x - b.x) < 10 && Math.abs(a.y - b.y) < 10) {
          WV.FX.burst(G, (a.x + b.x) / 2, (a.y + b.y) / 2, '#fff6dd', 10, 110);
          WV.audio.play('ricochet');
          G.bullets.splice(i, 1);
          G.bullets.splice(j, 1);
          break;
        }
      }
    }
  }

  function onEnemyKilled(e) {
    const idx = G.enemies.indexOf(e);
    if (idx >= 0) G.enemies.splice(idx, 1);
    if (e.isBoss) {
      G.boss = null;
      G.bossHp = 0;
      for (let i = 0; i < 4; i++) {
        WV.FX.burst(G, e.x + e.w / 2 + (i - 1.5) * 14, e.y + e.h / 2, '#ffd166', 22, 240);
      }
      WV.FX.hitstop(G, 0.16);
      WV.audio.play('explode');
      WV.FX.float(G, e.x + e.w / 2, e.y, 'BOSS 击破！', '#ffd166');
    } else {
      WV.FX.burst(G, e.x + e.w / 2, e.y + e.h / 2, '#ff9a5b', 18, 180);
      WV.FX.hitstop(G, 0.05);
      WV.audio.play('kill');
    }
    G.kills++;
    if (!e.summoned) G.enemiesLeft = Math.max(0, G.enemiesLeft - 1);
    G.score += e.score || 100;
    WV.FX.float(G, e.x + e.w / 2, e.y, '+' + (e.score || 100), '#ffe9b8');
  }

  // 玩家和敌人别叠在一起（推开前必须确认目标位置不撞墙，否则会把玩家推进砖里卡死）
  function separatePlayer() {
    const p = G.player;
    if (!p) return;
    for (const e of G.enemies) {
      if (!WV.aabb(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) continue;
      const pxc = p.x + p.w / 2, pyc = p.y + p.h / 2;
      const exc = e.x + e.w / 2, eyc = e.y + e.h / 2;
      const dx = pxc - exc, dy = pyc - eyc;
      let nx = p.x, ny = p.y;
      if (Math.abs(dx) > Math.abs(dy)) nx += dx > 0 ? 1.2 : -1.2;
      else ny += dy > 0 ? 1.2 : -1.2;
      if (!WV.blockedForTank(nx, ny, p.w, p.h)) { p.x = nx; p.y = ny; }
    }
  }

  // ---------------- 关卡结算 ----------------
  function levelClear() {
    if (G.mode !== 'play') return;
    G.mode = 'clear';
    G.clearT = 2.0;
    G.score += 500;
    if (G.player) G.player.lives = Math.min(5, G.player.lives + 1);
    WV.audio.play('win');
  }

  function checkLevelClear() {
    if (G.waveIndex >= G.waveSizes.length && G.spawnQueue.length === 0 &&
        !G.bossPending && G.enemies.length === 0) levelClear();
  }

  function enterUpgrade() {
    const pool = WV.UPGRADES.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(WV.rand() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    G.cardChoices = pool.slice(0, 3).map(u => ({ id: u.id, name: u.name, desc: u.desc, icon: u.icon }));
    G.mode = 'upgrade';
    WV.audio.play('card');
  }

  function chooseCard(i) {
    if (G.mode !== 'upgrade') return;
    const c = G.cardChoices[i];
    if (!c) return;
    WV.Player.applyUpgrade(G, c.id);
    G.upgrades.push(c.id);
    WV.audio.play('powerup');
    G.level++;
    loadLevel(G.level, false);
  }

  function result(win, msg) {
    if (G.mode === 'result') return;
    G.mode = 'result';
    G.result = { win: !!win, msg: msg || (win ? '大白饭守住了！' : '再来一次吧') };
    if (win) {
      G.score += 1000;
      if (G.score > G.best) { G.best = G.score; writeBest(G.best); }
      WV.audio.play('win');
    } else {
      if (G.score > G.best) { G.best = G.score; writeBest(G.best); }
      WV.audio.play('lose');
    }
  }

  // ---------------- 输入 ----------------
  const dirStack = [];
  const keyDir = {
    ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1,
    ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3,
  };

  function syncDir() {
    WV.input.dir = dirStack.length ? dirStack[dirStack.length - 1] : -1;
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    if (WV.audio && WV.audio.init) WV.audio.init();
    const d = keyDir[e.code];
    if (d !== undefined) {
      if (!dirStack.includes(d)) dirStack.push(d);
      syncDir();
      e.preventDefault();
      return;
    }
    if (e.code === 'Space' || e.code === 'KeyJ') {
      WV.input.fire = true;
      e.preventDefault();
      if (G.mode === 'title') startGame();
      else if (G.mode === 'result') startGame();
      return;
    }
    if (e.code === 'Enter') {
      if (G.mode === 'title' || G.mode === 'result') startGame();
      return;
    }
    if (e.code === 'KeyM') { toggleMute(); return; }
    if (G.mode === 'upgrade') {
      if (e.code === 'Digit1' || e.code === 'Numpad1') chooseCard(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') chooseCard(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') chooseCard(2);
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space' || e.code === 'KeyJ') { WV.input.fire = false; return; }
    const d = keyDir[e.code];
    if (d !== undefined) {
      const i = dirStack.indexOf(d);
      if (i >= 0) dirStack.splice(i, 1);
      syncDir();
    }
  }

  function toggleMute() {
    if (WV.audio && WV.audio.toggle) WV.audio.toggle();
    G.muted = WV.audio ? !!WV.audio.muted : false;
  }

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (WV.W / r.width),
      y: (e.clientY - r.top) * (WV.H / r.height),
    };
  }

  function onPointerDown(e) {
    if (WV.audio && WV.audio.init) WV.audio.init();
    const p = toCanvas(e);
    const hit = WV.UI.hitTest(p.x, p.y, G);
    if (hit && hit.action === 'mute') { toggleMute(); return; }
    if (!hit) return;
    if (hit.action === 'start') { startGame(); return; }
    if (hit.action === 'restart') { startGame(); return; }
    if (hit.action === 'card') { chooseCard(hit.index); return; }
  }

  // ---------------- 主循环 ----------------
  let acc = 0, last = 0;

  function step(dt) {
    G.time += dt;
    if (G.hitstop > 0) { G.hitstop -= dt; return; }

    if (G.mode === 'intro') {
      G.introT -= dt;
      if (G.introT <= 0) G.mode = 'play';
      return;
    }
    if (G.mode === 'play') {
      G.levelTime += dt;
      G.playTime += dt;
      WV.Player.update(G, dt);
      WV.Enemies.update(G, dt);
      updateBullets(dt);
      resolveBulletCollisions();
      separatePlayer();
      WV.FX.update(G, dt);
      updateWaves(dt);
      // 同步 Boss 血量
      if (G.boss && !G.enemies.includes(G.boss)) G.boss = null;
      if (G.boss) G.bossHp = Math.max(0, G.boss.hp);
      checkLevelClear();
      return;
    }
    if (G.mode === 'clear') {
      G.clearT -= dt;
      WV.FX.update(G, dt);
      if (G.clearT <= 0) {
        if (G.level < WV.Levels.length - 1) enterUpgrade();
        else result(true, '三关全破，大白饭守住了！');
      }
      return;
    }
    WV.FX.update(G, dt);
  }

  function drawTankFlash(e) {
    if (!e.flash || e.flash <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, e.flash * 4);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(e.x + e.w / 2, e.y + e.h / 2, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBullets() {
    for (const b of G.bullets) {
      WV.drawRiceBall(ctx, b, b.owner === 'player' ? '#fffdf5' : '#ffe0c2');
    }
  }

  // 大白饭血量：老巢上方三颗小饭团
  function drawDinnerHp() {
    if (!G.dinner || G.mode === 'title') return;
    const x0 = G.dinner.x + G.dinner.w / 2 - 22;
    const y0 = G.dinner.y - 14;
    for (let i = 0; i < G.dinnerMaxHp; i++) {
      ctx.save();
      ctx.globalAlpha = i < G.dinnerHp ? 1 : 0.22;
      ctx.fillStyle = '#fffdf5';
      ctx.beginPath();
      ctx.arc(x0 + i * 22, y0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5a3a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBossBar() {
    if (!G.boss || G.bossMaxHp <= 0) return;
    const w = 320, x = WV.MAP_W / 2 - w / 2, y = 14;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    WV.roundRect(ctx, x - 4, y - 4, w + 8, 24, 6); ctx.fill();
    ctx.fillStyle = '#5a2c18';
    WV.roundRect(ctx, x, y, w, 16, 5); ctx.fill();
    ctx.fillStyle = '#ff8a4c';
    WV.roundRect(ctx, x, y, w * (G.bossHp / G.bossMaxHp), 16, 5); ctx.fill();
    ctx.fillStyle = '#fff3e0';
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Claude 大将军  ' + Math.ceil(G.bossHp) + '/' + G.bossMaxHp, WV.MAP_W / 2, y + 13);
    ctx.restore();
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, WV.W, WV.H);
    ctx.fillStyle = '#07101a';
    ctx.fillRect(0, 0, WV.W, WV.H);

    if (!G.grid) return;

    // 地图
    WV.drawTiles(G, ctx, G.time);

    // 子弹
    drawBullets();

    // 敌人
    for (const e of G.enemies) {
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      if (e.isBoss) {
        // BOSS 专属表现：金底光 + 1.35 倍体型，跟杂兵一眼分得开
        ctx.save();
        ctx.globalAlpha = 0.42;
        const grd = ctx.createRadialGradient(cx, cy, 8, cx, cy, 42);
        grd.addColorStop(0, '#ffd166');
        grd.addColorStop(1, 'rgba(255,209,102,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(cx, cy, 42, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1.35, 1.35);
        WV.drawCharacter('claude', 0, 0, e.dir, 1, ctx);
        ctx.restore();
      } else {
        WV.drawCharacter('claude', cx, cy, e.dir, 1, ctx);
      }
      drawTankFlash(e);
      if (e.isBoss) {
        ctx.save();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2, e.y + e.h / 2, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 玩家
    if (G.player) {
      let alpha = 1;
      if (G.player.invuln > 0 && Math.floor(G.time * 20) % 2 === 0) alpha = 0.45;
      WV.drawCharacter('player', G.player.x + G.player.w / 2, G.player.y + G.player.h / 2, G.player.dir, alpha, ctx);
      if (G.player.shieldTime > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(140,220,255,.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(G.player.x + G.player.w / 2, G.player.y + G.player.h / 2, 23, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 粒子/飘字
    WV.FX.draw(G, ctx);
    drawBossBar();
    drawDinnerHp();

    // UI
    WV.UI.draw(G, ctx);
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    acc += dt;
    let guard = 0;
    while (acc >= FIXED && guard < 6) {
      step(FIXED);
      acc -= FIXED;
      guard++;
    }
    render();
    root.requestAnimationFrame(loop);
  }

  // ---------------- 初始化 ----------------
  function init() {
    if (canvas) { canvas.width = WV.W; canvas.height = WV.H; }
    loadLevel(0, true);
    WV.loadSprites();
    if (WV.Player.attachTouch) WV.Player.attachTouch(G);
    G.muted = WV.audio ? !!WV.audio.muted : false;
    if (hasDOM) {
      root.addEventListener('keydown', onKeyDown);
      root.addEventListener('keyup', onKeyUp);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('contextmenu', e => e.preventDefault());   // 手机长按不弹菜单
      // 测试/截图用：?play=1 跳过标题直接开局；?level=2 从第 3 关起
      try {
        const q = new URLSearchParams(root.location.search);
        if (q.has('play')) {
          startGame();
          if (q.has('level')) {
            const lv = Math.max(0, Math.min(WV.Levels.length - 1, parseInt(q.get('level'), 10) || 0));
            loadLevel(lv, false);
            G.mode = 'play';
          }
        }
        // 截图用：?boss=1 直接跳到 BOSS 波（跳过小怪），用于验收 BOSS 画面
        if (q.has('boss')) {
          G.spawnQueue.length = 0;
          G.enemies.length = 0;
          G.waveIndex = G.waveSizes.length;
          G.bossPending = true;
          G.enemiesLeft = 1;
          G.boss = null;
          if (G.player) G.player.invuln = 99999;
          step(FIXED); // 让 updateWaves 生成 BOSS
          render();
        }
        // 截图用：?tick=600 先跑 10 秒逻辑再画一帧，能拍到敌人/子弹/BOSS
        if (q.has('tick')) {
          const n = Math.max(0, Math.min(7200, parseInt(q.get('tick'), 10) || 0));
          const wantGod = q.has('god');
          const wantFire = q.has('fire');
          for (let i = 0; i < n; i++) {
            if (wantGod && G.player) G.player.invuln = 99999;
            if (wantFire) WV.input.fire = true;
            step(FIXED);
          }
          if (q.has('dir') && G.player) G.player.dir = Math.max(0, Math.min(3, parseInt(q.get('dir'), 10) || 0));
          render();
        }
      } catch (e) { /* file:// 下也应有 location */ }
      root.requestAnimationFrame(loop);
    }
  }

  // ---------------- 测试钩子 ----------------
  root.__WV = {
    G,
    step,
    render,
    init,
    start: startGame,
    chooseCard,
    restart: startGame,
    tick(n) { for (let i = 0; i < n; i++) step(FIXED); return G; },
    state() {
      return {
        mode: G.mode, level: G.level, score: G.score, kills: G.kills,
        enemies: G.enemies.length, enemiesLeft: G.enemiesLeft, lives: G.player ? G.player.lives : 0,
        waveIndex: G.waveIndex, queue: G.spawnQueue.length, bossHp: G.boss ? G.boss.hp : 0,
        playTime: G.playTime, upgrades: G.upgrades.slice(), result: G.result,
      };
    },
    setInput(dir, fire) { WV.input.dir = dir; WV.input.fire = !!fire; },
    forceCard(i) { if (G.mode === 'upgrade') chooseCard(i); },
    god(bool) { if (G.player) G.player.invuln = bool ? 99999 : 0; },
    jump(n) { G.player = null; loadLevel(n, false); G.mode = 'play'; },
  };

  if (hasDOM) init();

})(typeof window !== 'undefined' ? window : globalThis);
