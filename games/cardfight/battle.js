/* 卡牌战斗 · 战斗页逻辑
   依赖 formation.js（站位规则 / 阵容存档）、levels.js（20 关）、combat.js（规则） */
(function () {
  'use strict';

  var W = 1280, H = 720;
  var stage = document.getElementById('stage');
  var unitsHost = document.getElementById('units');
  var logText = document.getElementById('logText');
  var roundEl = document.getElementById('round');
  var teamHp = document.getElementById('teamHp');
  var statusEl = document.getElementById('status');

  /* 结算遮罩样式（只战斗页要，直接注入） */
  (function () {
    var st = document.createElement('style');
    st.textContent = [
      '#endcard{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;',
      'background:rgba(8,6,10,.72);backdrop-filter:blur(6px)}',
      '#endcard .endcard-inner{width:430px;padding:26px 30px 22px;border-radius:16px;',
      'border:1px solid rgba(214,176,112,.45);background:linear-gradient(180deg,#1b141c,#120e14);',
      'text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6)}',
      '.end-tag{font-size:11px;letter-spacing:.3em;color:#b99a6d}',
      '#endcard h2{margin:8px 0 6px;font-size:24px;color:#f5e4c8}',
      '#endcard p{margin:0 0 18px;font-size:12px;color:#9f8d75}',
      '.end-actions{display:flex;gap:10px;justify-content:center}',
      '.end-actions .btn{min-width:96px;height:38px;line-height:36px;padding:0 16px;border-radius:999px;',
      'border:1px solid rgba(217,176,106,.45);background:rgba(30,20,18,.9);color:#f2ddb8;font-size:13px;',
      'text-decoration:none;display:inline-block;cursor:pointer;font-family:inherit}',
      '.end-actions .btn.primary{background:linear-gradient(180deg,#dfb15f,#a76a2e);border-color:#f4d494;color:#24130a;font-weight:700}'
    ].join('');
    document.head.appendChild(st);
  })();

  /* ---------- 关卡 & 阵容 ---------- */
  function levelFromUrl() {
    var m = /[?&]level=(\d+)/.exec(location.search);
    var id = m ? parseInt(m[1], 10) : 1;
    return CF.levelById(id) || CF.LEVELS[0];
  }

  var LEVEL = levelFromUrl();

  function playerUnits() {
    return CF.loadFormation().map(function (it, i) {
      var h = CF.HEROES[it.hero];
      return {
        id: 'p' + i + '-' + it.hero,
        art: it.hero, hero: it.hero,
        name: h.name, img: h.img,
        side: 'player', row: it.slot <= 2 ? 'front' : 'back', slot: it.slot,
        col: it.slot <= 2 ? it.slot - 1 : it.slot - 4,
        atk: h.atk, hp: h.hp, maxHp: h.hp, rage: 0,
        rageSkill: h.rageSkill, attackFrames: h.attackFrames, skillImg: h.skillImg,
        alive: true, acted: false
      };
    });
  }

  function buildUnits() {
    return playerUnits().concat(CF.enemyUnits(LEVEL));
  }

  var units = buildUnits();
  var POS = {};                 // id -> { left, bottom, h }
  var slotPos = { player: {}, enemy: {} };

  var fighting = false;
  var selectedId = '';
  var round = 1;
  var timer = 0;
  var rageQueue = [];
  var rageSeq = 0;
  var autoRage = false;
  var speed = 1;
  var saved = null;
  var ended = false;

  function openDetail() { /* 战斗页不显示详情 */ }

  /* ---------- 站位 ---------- */
  function slotWidths(side) {
    var w = {};
    units.forEach(function (u) {
      if (u.side !== side) return;
      if (u.slot === 1 || u.slot === 3 || u.slot === 4) w[u.slot] = CF.widthOf(u.art);
    });
    return w;
  }

  function computeSlots() {
    slotPos.player = CF.computeSlots('player', slotWidths('player'));
    slotPos.enemy = CF.computeSlots('enemy', slotWidths('enemy'));
  }

  function fit() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  fit();

  function unitEl(id) { return document.getElementById('u-' + id); }
  function el(id) { return document.getElementById(id); }

  function buildScene() {
    unitsHost.innerHTML = '';
    computeSlots();
    units.forEach(function (u) {
      var sp = slotPos[u.side][u.slot] || slotPos[u.side][1];
      var h = CF.BODY_H;
      POS[u.id] = { left: sp.left, bottom: sp.bottom, h: h };

      var s = CF.depthScale(720 - sp.bottom);
      var node = document.createElement('div');
      node.id = 'u-' + u.id;
      node.className = 'unit ' + (u.side === 'player' ? 'player' : 'enemy') + (u.row === 'back' ? ' back' : '');
      node.style.left = sp.left + 'px';
      node.style.bottom = sp.bottom + 'px';
      node.style.height = h + 'px';
      node.style.setProperty('--s', s);
      node.style.zIndex = Math.round((720 - sp.bottom) / 10);
      node.dataset.id = u.id;
      node.innerHTML =
        '<img src="' + u.img + '" alt="" style="height:' + (s * 100).toFixed(1) + '%">' +
        '<div class="plate">' +
          '<div class="nm">' + u.name + '<span class="slotno">' + u.slot + '</span></div>' +
          '<div class="hpbar"><i></i></div>' +
        '</div>';
      node.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        onUnitClick(u);
      });
      unitsHost.appendChild(node);
    });
  }

  function buildSlots() {
    var host = el('slots');
    host.innerHTML = '';
    computeSlots();
    ['player', 'enemy'].forEach(function (side) {
      for (var no = 1; no <= 5; no += 1) {
        var p = slotPos[side][no];
        var used = units.some(function (u) { return u.side === side && u.slot === no; });
        var d = document.createElement('div');
        d.className = 'slot-marker' + (used ? '' : ' empty');
        d.style.left = p.left + 'px';
        d.style.bottom = p.bottom + 'px';
        var s = CF.depthScale(720 - p.bottom);
        d.style.width = (72 * s) + 'px';
        d.style.height = (72 * s * CF.FLOOR_RATIO) + 'px';
        d.style.fontSize = (9 * s) + 'px';
        d.textContent = no;
        host.appendChild(d);
      }
    });
  }

  /* ---------- 基础 ---------- */
  function log(line) {
    var old = logText.innerHTML.split('<br>');
    old.unshift(line);
    logText.innerHTML = old.slice(0, 4).join('<br>');
  }

  function living(side) { return CardFight.livingSide(units, side); }

  function outcome() {
    if (!living('player').length) return 'lose';
    if (!living('enemy').length) return 'win';
    return '';
  }

  function render() {
    units.forEach(function (u) {
      var node = unitEl(u.id);
      if (!node) return;
      var hp = Math.max(0, u.hp);
      var ratio = u.maxHp ? hp / u.maxHp : 0;
      var queued = rageQueue.some(function (q) { return q.id === u.id; });
      node.classList.toggle('sel', u.id === selectedId);
      node.classList.toggle('acted', !!u.acted && u.alive);
      node.classList.toggle('queue', queued);
      node.classList.toggle('ready', !!(u.rageSkill && (u.rage || 0) >= CardFight.RAGE_MAX));
      node.classList.toggle('guard', !!(u.guard > 0));
      node.classList.toggle('dead', !u.alive);
      node.querySelector('.nm').innerHTML = u.name + '<span class="slotno">' + u.slot + '</span>';
      node.querySelector('.hpbar i').style.width = Math.max(0, Math.min(100, ratio * 100)) + '%';
    });

    var players = living('player').length;
    var enemies = living('enemy').length;
    teamHp.textContent = players + ' / ' + units.filter(function (u) { return u.side === 'player'; }).length + ' 人';
    el('enemyHp').textContent = enemies + ' / ' + units.filter(function (u) { return u.side === 'enemy'; }).length + ' 人';
    roundEl.textContent = '回合 ' + round;
    statusEl.textContent = autoRage ? '自动怒气：开' : '自动怒气：关';
    el('start').disabled = fighting || ended;
    el('auto').textContent = autoRage ? '关自动' : '开自动';
    el('again').disabled = false;
  }

  /* ---------- 交互 ---------- */
  function toast(text) {
    var d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    el('fx').appendChild(d);
    setTimeout(function () { d.remove(); }, 1500);
  }

  function onUnitClick(u) {
    if (!u || ended) return;
    if (!fighting) { selectedId = u.id; toast('点开战开始；点英雄排怒气'); render(); return; }
    if (u.side !== 'player') { selectedId = u.id; render(); return; }
    if (!u.rageSkill) { selectedId = u.id; toast('这个单位没有怒气技能'); render(); return; }
    if (CardFight.rageReady(u)) {
      if (rageQueue.some(function (q) { return q.id === u.id; })) {
        toast(u.name + ' 的怒气已经排队');
      } else if (offerRage(u)) {
        toast(u.name + ' 怒气释放 · 排队');
      }
    } else {
      selectedId = u.id;
      toast(u.name + ' 怒气 ' + (u.rage || 0) + ' / ' + CardFight.RAGE_MAX);
    }
    render();
  }

  /* ---------- 特效 ---------- */
  function unitCenter(id) {
    var p = POS[id];
    if (!p) return { x: 640, y: 420 };
    return { x: p.left, y: H - p.bottom - p.h * 0.55 };
  }

  function showDamage(id, amount, crit) {
    var p = POS[id];
    if (!p) return;
    var d = document.createElement('div');
    d.className = 'dmg' + (crit ? ' crit' : '');
    d.textContent = '-' + amount;
    d.style.left = (p.left + (Math.random() * 40 - 20)) + 'px';
    d.style.top = (H - p.bottom - p.h * 0.72) + 'px';
    el('fx').appendChild(d);
    setTimeout(function () { d.remove(); }, 820);
  }

  function impactFx(id, big, heal) {
    var c = unitCenter(id);
    var d = document.createElement('div');
    d.className = 'impact' + (heal ? ' heal' : '');
    d.style.left = c.x + 'px';
    d.style.top = c.y + 'px';
    d.style.width = d.style.height = (big ? 140 : 90) + 'px';
    el('fx').appendChild(d);
    setTimeout(function () { d.remove(); }, 460);
  }

  function showHeal(id, amount) {
    var p = POS[id];
    if (!p) return;
    var d = document.createElement('div');
    d.className = 'dmg heal';
    d.textContent = '+' + amount;
    d.style.left = (p.left + (Math.random() * 30 - 15)) + 'px';
    d.style.top = (H - p.bottom - p.h * 0.72) + 'px';
    el('fx').appendChild(d);
    setTimeout(function () { d.remove(); }, 820);
  }

  function beamFx(fromId, toId) {
    var a = unitCenter(fromId);
    var b = unitCenter(toId);
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var deg = Math.atan2(dy, dx) * 180 / Math.PI;
    var d = document.createElement('div');
    d.className = 'beam';
    d.style.left = a.x + 'px';
    d.style.top = (a.y - 7) + 'px';
    d.style.width = len + 'px';
    d.style.setProperty('--a', deg + 'deg');
    el('fx').appendChild(d);
    setTimeout(function () { d.remove(); }, 440);
  }

  function skillBanner(name, label) {
    var d = document.createElement('div');
    d.className = 'skill-banner';
    d.textContent = name + ' · ' + label;
    el('fx').appendChild(d);
    setTimeout(function () { d.remove(); }, 950);
  }

  function lunge(attackerId, targetId) {
    var node = unitEl(attackerId);
    var a = POS[attackerId], b = POS[targetId];
    if (!node || !a) return;
    var dir = b && b.left < a.left ? -1 : 1;
    node.style.setProperty('--dx', (dir * 24) + 'px');
    node.style.setProperty('--dy', '-10px');
    node.classList.add('attacking');
    setTimeout(function () { node.classList.remove('attacking'); }, 330);
  }

  function setUnitImg(id, src) {
    var node = unitEl(id);
    if (!node || !src) return;
    var img = node.querySelector('img');
    if (img) img.src = src;
  }

  function playAttack(unit) {
    var frames = unit.attackFrames || [];
    if (!frames.length) return;
    setUnitImg(unit.id, frames[0]);
    setTimeout(function () { setUnitImg(unit.id, unit.img); }, 260);
  }

  function playSkill(unit) {
    if (!unit.skillImg) return;
    setUnitImg(unit.id, unit.skillImg);
    setTimeout(function () { setUnitImg(unit.id, unit.img); }, 680);
  }

  /* ---------- 怒气 ---------- */
  function offerRage(unit) {
    var result = CardFight.enqueueRage(rageQueue, unit, rageSeq);
    if (!result.ok) return false;
    rageQueue = result.queue;
    rageSeq = result.seq;
    log('<b>' + unit.name + '</b> 怒气排队');
    return true;
  }

  function pullReady() {
    var before = {};
    rageQueue.forEach(function (item) { before[item.id] = true; });
    var result = CardFight.enqueueReady(rageQueue, units, rageSeq, { playerAuto: autoRage });
    rageQueue = result.queue;
    rageSeq = result.seq;
    result.queue.forEach(function (item) {
      if (before[item.id]) return;
      var u = units.find(function (x) { return x.id === item.id; });
      log((u ? u.name : item.id) + ' 怒气排队');
    });
  }

  function gainRage(unit, n) {
    if (!unit || !unit.rageSkill || !CardFight.alive(unit)) return;
    var before = unit.rage || 0;
    unit.rage = Math.min(CardFight.RAGE_MAX, before + n);
    if (before < CardFight.RAGE_MAX && unit.rage >= CardFight.RAGE_MAX) {
      if (unit.side === 'enemy' || autoRage) offerRage(unit);
      else toast(unit.name + ' 怒气已满 · 点英雄释放');
    }
  }

  function skillLabel(type) {
    if (type === 'back') return '落日狙击';
    if (type === 'guard') return '磐石架势';
    if (type === 'heal-row') return '月华治愈';
    if (type === 'row-sweep') return '横扫一排';
    if (type === 'front-sweep') return '横扫前排';
    if (type === 'execute') return '斩杀追击';
    return '怒气';
  }

  function describe(attacker, action, result) {
    if (action.type === 'guard') {
      return attacker.name + ' 怒气 磐石架势，防御 +' + (result.guard || CardFight.GUARD_DEF);
    }
    if (action.type === 'heal-row') {
      if (!result.heals || !result.heals.length) return attacker.name + ' 怒气 月华治愈，这一排已经满血';
      return result.heals.map(function (h) {
        return attacker.name + ' 月华治愈 ' + h.name + '，+' + h.heal;
      }).join('；');
    }
    if (action.type === 'back' || action.type === 'row-sweep' || action.type === 'front-sweep' || action.type === 'execute') {
      var label = skillLabel(action.type);
      if (!result.ok) return attacker.name + ' ' + label + '，' + result.reason;
      if (result.reason === '落空') return attacker.name + ' ' + label + '，落空';
      return result.hits.map(function (h, i) {
        var prefix = i === 1 ? '追击 ' : '';
        return attacker.name + ' ' + label + ' ' + prefix + h.name + '，' + h.damage + ' 伤害';
      }).join('；');
    }
    var verb = action.asRage ? '怒气' : (action.type === 'pick' ? '选取攻击' : '自动攻击');
    if (!result.ok) return attacker.name + ' ' + verb + '，' + result.reason;
    return result.hits.map(function (h) {
      return attacker.name + ' ' + verb + ' ' + h.name + '，' + h.damage + ' 伤害';
    }).join('；');
  }

  function hitAnim(id) {
    var node = unitEl(id);
    if (!node) return;
    node.classList.add('hit');
    setTimeout(function () { node.classList.remove('hit'); }, 160);
  }

  function applyStrike(attackerId, action) {
    var attacker = units.find(function (u) { return u.id === attackerId; });
    if (!attacker) return;
    var result = CardFight.strike(units, attackerId, action);
    log(describe(attacker, action, result));
    if (result.ok) {
      if (action.asRage) playSkill(attacker);
      else playAttack(attacker);
      if (result.hits.length) lunge(attackerId, result.hits[0].id);
      if (action.asRage) {
        skillBanner(attacker.name, skillLabel(action.type));
        if (action.type === 'back' && result.hits.length) beamFx(attackerId, result.hits[0].id);
      }
      if (action.asRage) attacker.rage = 0;
      else {
        attacker.acted = true;
        gainRage(attacker, CardFight.RAGE_ON_ATTACK);
        if (attacker.guard) {
          attacker.guard = 0;
          log(attacker.name + ' 普攻完成，护盾消失');
        }
      }
      var kills = 0;
      result.hits.forEach(function (h) {
        hitAnim(h.id);
        showDamage(h.id, h.damage, !!action.asRage || h.damage >= attacker.atk * 2);
        impactFx(h.id, !!action.asRage);
        var victim = units.find(function (u) { return u.id === h.id; });
        gainRage(victim, CardFight.rageOnHurt(victim.maxHp, h.hpBefore, h.hp));
        if (h.killed) kills += 1;
      });
      if (result.heals) {
        result.heals.forEach(function (h) {
          showHeal(h.id, h.heal);
          impactFx(h.id, false, true);
        });
      }
      if (kills) gainRage(attacker, kills * CardFight.RAGE_ON_KILL);
    }
    var end = outcome();
    if (end) {
      finish(end);
    }
    render();
  }

  /* ---------- 回合循环 ---------- */
  function stopLoop() { clearInterval(timer); timer = 0; }

  function startLoop() {
    stopLoop();
    timer = setInterval(step, 700 / speed);
  }

  function resolveRage() {
    var before = rageQueue.slice();
    var taken = CardFight.takeRage(rageQueue, units);
    rageQueue = taken.queue;
    if (!taken.unit) return false;
    applyStrike(taken.unit.id, { type: taken.unit.rageSkill || 'back', asRage: true });
    return true;
  }

  function step() {
    if (!fighting || ended || outcome()) return;
    pullReady();
    if (rageQueue.length) { resolveRage(); return; }
    var actor = CardFight.nextActor(units);
    if (!actor) {
      units.forEach(function (u) { u.acted = false; });
      round += 1;
      log('第 ' + round + ' 回合');
      render();
      return;
    }
    applyStrike(actor.id, { type: 'auto' });
  }

  function startBattle() {
    if (fighting || ended) return;
    saved = units.map(function (u) { var c = {}; for (var k in u) c[k] = u[k]; return c; });
    fighting = true;
    round = 1;
    rageQueue = [];
    rageSeq = 0;
    units.forEach(function (u) { u.acted = false; });
    log('第 ' + LEVEL.id + ' 关 · ' + LEVEL.name + '，开战');
    render();
    startLoop();
  }

  function again() {
    stopLoop();
    fighting = false;
    ended = false;
    round = 1;
    rageQueue = [];
    rageSeq = 0;
    if (saved) units = saved.map(function (u) { var c = {}; for (var k in u) c[k] = u[k]; return c; });
    else units = buildUnits();
    units.forEach(function (u) { u.hp = u.maxHp; u.alive = true; u.acted = false; u.rage = 0; u.guard = 0; });
    var card = document.getElementById('endcard');
    if (card) card.remove();
    log('重新摆好，可以再打。');
    buildScene();
    render();
  }

  /* ---------- 结算 ---------- */
  function finish(result) {
    if (ended) return;
    ended = true;
    stopLoop();
    fighting = false;
    var reward = 0;
    if (result === 'win') {
      CF.markCleared(LEVEL.id);
      if (window.ECO) {
        reward = ECO.stageReward(LEVEL.id);
        ECO.addGold(reward);
      }
    }
    showEndCard(result, reward);
    render();
  }

  function showEndCard(result, reward) {
    var win = result === 'win';
    var card = document.createElement('div');
    card.id = 'endcard';
    card.innerHTML =
      '<div class="endcard-inner">' +
        '<div class="end-tag">' + (win ? '关卡通过' : '战斗失败') + '</div>' +
        '<h2>' + LEVEL.name + '</h2>' +
        '<p>' + (win
          ? '已记录进度' + (reward ? ' · 金币 +' + reward : '') + '，可以继续下一关。'
          : '调整一下布阵，再来一次。') + '</p>' +
        '<div class="end-actions">' +
          '<a class="btn" href="index.html">返回关卡</a>' +
          '<button class="btn" id="endAgain" type="button">再打一次</button>' +
          (win && LEVEL.id < CF.LEVELS.length ? '<a class="btn primary" href="battle.html?level=' + (LEVEL.id + 1) + '">下一关</a>' : '') +
        '</div>' +
      '</div>';
    stage.appendChild(card);
    card.querySelector('#endAgain').addEventListener('click', function () {
      card.remove();
      again();
      startBattle();
    });
  }

  /* ---------- 启动 ---------- */
  var stageNameEl = document.querySelector('.stage-name');
  if (stageNameEl) stageNameEl.textContent = '第 ' + LEVEL.id + ' 关 · ' + LEVEL.name;
  document.title = '卡牌战斗 · ' + LEVEL.name;
  el('hint').innerHTML = '点英雄 → 满怒释放<br>战斗页不显示详情';

  el('start').addEventListener('click', startBattle);
  el('again').addEventListener('click', again);
  el('auto').addEventListener('click', function () {
    autoRage = !autoRage;
    if (autoRage && fighting && !outcome()) pullReady();
    render();
  });
  el('speed').addEventListener('click', function () {
    speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
    this.textContent = '×' + speed;
    this.classList.toggle('on', speed > 1);
    if (fighting) startLoop();
  });

  buildScene();
  buildSlots();
  render();
  logText.innerHTML = '点开战开始；点英雄排怒气';
  log('第 ' + LEVEL.id + ' 关 · ' + LEVEL.name + '：点开战开始');

  if (/[?&]debug=1/.test(location.search)) {
    window.__cf = {
      units: function () { return units; },
      start: startBattle,
      step: step,
      finish: finish,
      level: LEVEL
    };
  }
})();
