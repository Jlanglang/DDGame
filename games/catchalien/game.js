(function () {
  var CA = window.CatchAlien;
  var stage = document.getElementById('stage');
  var title = document.getElementById('title');
  var notice = document.getElementById('notice');
  var building = document.getElementById('building');
  var toast = document.getElementById('toast');
  var win = document.getElementById('win');
  var lose = document.getElementById('lose');
  var state = null;
  var toastTimer = 0;

  var loading = document.getElementById('loading');
  var ready = {};          /* 已经生成好的关卡： index -> { seed, level } */
  var pending = {};        /* worker 请求 id -> 回调 */
  var reqSeq = 0;
  var worker = null;

  try {
    worker = new Worker('level-worker.js');
    worker.onmessage = function (e) {
      var d = e.data || {};
      var job = pending[d.id];
      if (!job) return;
      delete pending[d.id];
      job(d.level || null, d.seed);
    };
    worker.onerror = function () { worker = null; };
  } catch (err) {
    worker = null;   /* file:// 打开时 Worker 可能不可用，退回主线程生成 */
  }

  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function freshSeed() {
    return (Date.now() ^ (Math.floor(Math.random() * 0x7fffffff))) >>> 0;
  }

  function showLoading() {
    if (loading) loading.hidden = false;
  }

  function hideLoading() {
    if (loading) loading.hidden = true;
  }

  /* 要一份关卡：优先 Worker，退化为主线程（先让 loading 画出来再生成） */
  function requestLevel(index, seed, cb) {
    var done = false;
    function deliver(level, usedSeed) {
      if (done) return;
      done = true;
      cb(level, usedSeed);
    }
    function fallback() {
      setTimeout(function () {
        var level = null;
        try { level = CA.generateLevel(CA.bandFor(index), seed); } catch (err) { level = null; }
        deliver(level, seed);
      }, 24);
    }
    if (worker) {
      var id = ++reqSeq;
      pending[id] = deliver;
      /* Worker 起不来（比如 file:// 打开）时不能一直转圈 */
      setTimeout(function () {
        if (done || !pending[id]) return;
        delete pending[id];
        worker = null;
        fallback();
      }, 3500);
      worker.postMessage({ id: id, band: CA.bandFor(index), seed: seed });
      return;
    }
    fallback();
  }

  /* 后台先把「换一栋」和「下一栋」算好 */
  function prefetch(index) {
    if (!worker) return;
    var targets = [index, index + 1];
    for (var i = 0; i < targets.length; i++) {
      (function (idx) {
        if (ready[idx]) return;
        requestLevel(idx, freshSeed(), function (level, seed) {
          if (level) ready[idx] = { seed: seed, level: level };
        });
      })(targets[i]);
    }
  }

  function startLevel(index, seed) {
    var cached = seed == null ? ready[index] : null;
    if (cached) {
      delete ready[index];
      applyLevel(index, cached.seed, cached.level);
      return;
    }
    showLoading();
    requestLevel(index, seed == null ? freshSeed() : seed, function (level, usedSeed) {
      hideLoading();
      if (!level) {
        showToast('这栋楼没生成出来，再点一次。');
        return;
      }
      applyLevel(index, usedSeed, level);
    });
  }

  function applyLevel(levelIndex, seed, level) {
    state = {
      levelIndex: levelIndex,
      seed: seed,
      level: level,
      opened: [level.doudouKey],
      killed: [],
      mode: 'visit',
    };
    win.hidden = true;
    lose.hidden = true;
    hideToast();
    preloadCards(level);
    render();
    focusDoor(level.doudouKey);
    prefetch(levelIndex);
  }

  /* 预加载本关会用到的卡面，翻牌时才不会闪一下 */
  function preloadCards(level) {
    var cards = window.CHARACTER_CARDS || {};
    var spec = window.CHARACTER_SPECIAL || {};
    var seen = {};
    var list = [];
    for (var i = 0; i < level.cells.length; i++) {
      var cell = level.cells[i];
      var src = cell.role === 'doudou'
        ? (spec.doudou_1 && spec.doudou_1.card)
        : cards[cell.name];
      if (src && !seen[src]) { seen[src] = 1; list.push(src); }
    }
    if (spec.alien_3 && spec.alien_3.card) list.push(spec.alien_3.card);
    for (var k = 0; k < list.length; k++) { var img = new Image(); img.src = list[k]; }
  }

  function hideToast() {
    toast.hidden = true;
    toast.textContent = '';
  }

  function showToast(text) {
    toast.hidden = false;
    toast.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3200);
  }

  function render() {
    var level = state.level;
    var caught = state.killed.length;
    title.textContent = '第 ' + state.levelIndex + ' 栋 · ' + level.label;
    notice.textContent = level.units + ' 单元 ' + level.floors + ' 层 · 这栋有 ' + level.alienCount + ' 个外星人 · 已捉住 ' + caught;
    applyFit(level);
    drawBuilding();
    var buttons = document.querySelectorAll('#modes button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-on', buttons[i].getAttribute('data-mode') === state.mode);
    }
  }

  function applyFit(level) {
    var n = level.units * level.floors;
    var fit = Math.max(0.78, Math.min(1, 4.5 / Math.sqrt(n)));
    var gap = n >= 24 ? 3 : (n >= 15 ? 4 : 6);
    building.style.setProperty('--fit', fit.toFixed(3));
    building.style.setProperty('--gap', gap + 'px');
    building.style.setProperty('--floors', String(level.floors));
    building.style.setProperty('--units', String(level.units));
    stage.classList.toggle('is-tight', level.floors >= 5 || level.units >= 5);
    layoutRows();
  }

  function layoutRows() {
    if (!state) return;
    var level = state.level;
    var width = building.clientWidth;
    var height = building.clientHeight;
    if (width < 1 || height < 1) return;
    var gap = parseFloat(building.style.getPropertyValue('--gap')) || 4;
    var cardW = (width - gap * Math.max(0, level.units - 1)) / level.units;
    var natural = cardW * 4 / 3;
    var fitH = (height - gap * Math.max(0, level.floors - 1)) / level.floors;
    var rowH = Math.min(natural, fitH);
    if (!(rowH > 0)) return;
    building.style.setProperty('--row-h', rowH.toFixed(1) + 'px');
  }

  function doorSig(cell) {
    var opened = state.opened.indexOf(cell.key) >= 0;
    var killed = state.killed.indexOf(cell.key) >= 0;
    var bubble = opened && !killed && cell.speech && !cell.speech.atom ? cell.speech.clue : '';
    return (opened ? '1' : '0') + (killed ? '1' : '0') + '|' + bubble;
  }

  function doorNode(cell) {
    var sig = doorSig(cell);
    var holder = document.createElement('div');
    holder.innerHTML = doorHtml(cell).replace('<button ', '<button data-sig="' + sig + '" ');
    return holder.firstElementChild;
  }

  /* 楼房骨架的签名：单元数 × 楼层数变了就必须整片重建 */
  var gridShape = '';

  function drawBuilding() {
    var level = state.level;
    var rows = [];
    for (var f = level.floors - 1; f >= 0; f--) {
      var cells = [];
      for (var x = 0; x < level.units; x++) cells.push(level.byKey[x + ':' + f]);
      rows.push(cells);
    }

    var shape = level.units + 'x' + level.floors;
    /* 第一次渲染，或者换了一栋尺寸不同的楼 */
    if (shape !== gridShape || !building.querySelector('.floor-row')) {
      gridShape = shape;
      var html = '';
      for (var r = 0; r < rows.length; r++) {
        html += '<div class="floor-row">';
        html += '<div class="doors" style="grid-template-columns:repeat(' + level.units + ',minmax(0,1fr))">';
        for (var i = 0; i < rows[r].length; i++) {
          var sig = doorSig(rows[r][i]);
          html += doorHtml(rows[r][i]).replace('<button ', '<button data-sig="' + sig + '" ');
        }
        html += '</div></div>';
      }
      building.innerHTML = html;
      return;
    }

    /* 之后只替换状态变了的门：没变的门不重建，图片也不会重新加载 */
    for (var r2 = 0; r2 < rows.length; r2++) {
      for (var i2 = 0; i2 < rows[r2].length; i2++) {
        var cell = rows[r2][i2];
        var el = building.querySelector('[data-key="' + cell.key + '"]');
        if (!el) continue;
        if (el.getAttribute('data-sig') !== doorSig(cell)) {
          var fresh = doorNode(cell);
          if (fresh) el.replaceWith(fresh);
        }
      }
    }
  }

  function esc(text) {
    return String(text).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  function hairOf(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
    return 'hsl(' + (h % 360) + ' 42% 36%)';
  }

  function avatarSvg(kind, name) {
    if (kind === 'closed') {
      return '<svg viewBox="0 0 80 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<circle cx="40" cy="34" r="22" fill="#5c6b88"/>' +
        '<path d="M12 76c5-20 15-28 28-28s23 8 28 28" fill="#5c6b88"/></svg>';
    }
    if (kind === 'alien') {
      return '<svg viewBox="0 0 80 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<line x1="28" y1="18" x2="20" y2="4" stroke="#8dffb0" stroke-width="2.4"/>' +
        '<line x1="52" y1="18" x2="60" y2="4" stroke="#8dffb0" stroke-width="2.4"/>' +
        '<circle cx="20" cy="4" r="3.5" fill="#8dffb0"/><circle cx="60" cy="4" r="3.5" fill="#8dffb0"/>' +
        '<ellipse cx="40" cy="44" rx="24" ry="26" fill="#c6f5d0"/>' +
        '<ellipse cx="31" cy="44" rx="6" ry="8" fill="#102216"/>' +
        '<ellipse cx="49" cy="44" rx="6" ry="8" fill="#102216"/>' +
        '<ellipse cx="31.6" cy="42" rx="2" ry="2" fill="#eafff0"/>' +
        '<ellipse cx="49.6" cy="42" rx="2" ry="2" fill="#eafff0"/>' +
        '<path d="M32 58h16" stroke="#1d4a30" stroke-width="2.2" stroke-linecap="round"/></svg>';
    }
    /* 豆豆：棕色齐肩卷发（旧版是粉发双丸子，和卡面/封面不一致） */
    var hair = kind === 'doudou' ? '#6b4a33' : hairOf(name);
    var front = '';
    if (kind === 'doudou') {
      front = '<circle cx="24" cy="50" r="3.4" fill="#ff9ec4" opacity="0.9"/>' +
        '<circle cx="56" cy="50" r="3.4" fill="#ff9ec4" opacity="0.9"/>';
    } else if (kind === 'passer') {
      front = '<path d="M16 32c3-16 12-20 24-20s21 4 24 20" fill="#3d4d66"/>' +
        '<rect x="12" y="30" width="56" height="6" rx="3" fill="#3d4d66"/>';
    } else if (kind === 'classmate') {
      front = '<path d="M22 62h36l-6 14H28z" fill="#d5e4ff"/>';
    } else if (kind === 'friend') {
      front = '<path d="M40 60c-5-3.2-8-.6-8 2.6 0 3.2 8 7.4 8 7.4s8-4.2 8-7.4c0-3.2-3-5.8-8-2.6z" fill="#ff8eb8"/>';
    }
    var buns = kind === 'doudou'
      ? '<path d="M8 40c2-6 6-9 10-9M72 40c-2-6-6-9-10-9" stroke="#6b4a33" stroke-width="6" fill="none" stroke-linecap="round"/>'
      : '';
    return '<svg viewBox="0 0 80 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      buns +
      '<circle cx="40" cy="42" r="26" fill="#ffd3b0"/>' +
      '<path d="M16 40c2-22 12-30 24-30s22 8 24 30c-6-12-14-16-24-16s-18 4-24 16z" fill="' + hair + '"/>' +
      '<circle cx="31" cy="44" r="2.8" fill="#243044"/><circle cx="49" cy="44" r="2.8" fill="#243044"/>' +
      '<path d="M32 54c2.6 4 13.4 4 16 0" fill="none" stroke="#c47a62" stroke-width="1.8" stroke-linecap="round"/>' +
      front + '</svg>';
  }

  function roomNo(cell) {
    return String(cell.floor + 1) + '0' + String(cell.unit + 1);
  }

  function stampSvg() {
    return '<svg viewBox="0 0 80 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<rect width="80" height="80" fill="#121820"/>' +
      '<circle cx="40" cy="38" r="20" fill="none" stroke="#9aa6bd" stroke-width="4"/>' +
      '<line x1="26" y1="52" x2="54" y2="24" stroke="#9aa6bd" stroke-width="4" stroke-linecap="round"/>' +
      '</svg>';
  }

  function bubbleHtml(cell, opened, killed) {
    if (killed || !opened || !cell.speech || !cell.speech.clue) return '';
    return '<span class="bubble">' + esc(cell.speech.clue) + '</span>';
  }

  function cardImg(src) {
    return '<img src="' + src + '" alt="" loading="lazy" decoding="async">';
  }

  function faceHtml(cell, opened, killed) {
    var cards = window.CHARACTER_CARDS || {};
    var thumbs = window.CHARACTER_THUMBS || {};
    var spec = window.CHARACTER_SPECIAL || {};
    // 抓住 / 撞见：直接是外星人惊恐脸
    if (killed || (opened && cell.alien)) return cardImg(spec.alien_3.card);
    // 豆豆：开门用大卡，没开门用缩略
    if (cell.role === 'doudou') {
      return cardImg(opened ? spec.doudou_1.card : spec.doudou_1.thumb);
    }
    // 邻居：没开门也给脸，只是用小图，省流量
    if (cards[cell.name]) return cardImg(opened ? cards[cell.name] : thumbs[cell.name]);
    return avatarSvg(cell.role || 'classmate', cell.name);
  }

  function doorHtml(cell) {
    var opened = state.opened.indexOf(cell.key) >= 0;
    var killed = state.killed.indexOf(cell.key) >= 0;
    var cls = 'door';
    if (opened) cls += ' is-open';
    if (opened && cell.speech && !cell.speech.atom) cls += ' is-chat';
    if (killed || (opened && cell.alien)) cls += ' is-alien';
    var face = faceHtml(cell, opened, killed);
    var label = killed ? '捉住了' : (opened && cell.alien ? '外星人' : cell.name);
    var roleText = cell.role && cell.role !== 'doudou' ? (CA.ROLE_LABEL[cell.role] || '') : '';
    var roleCls = roleText ? ' role role-' + cell.role : '';
    return '<button type="button" class="' + cls + '" data-key="' + cell.key + '">' +
      '<span class="room">' + roomNo(cell) + '</span>' +
      (roleText ? '<span class="' + roleCls.trim() + '">' + esc(roleText) + '</span>' : '') +
      '<span class="avatar">' + face + '</span>' +
      '<span class="name">' + esc(label) + '</span>' +
      bubbleHtml(cell, opened, killed) + '</button>';
  }

  function focusDoor(key) {
    var el = building.querySelector('[data-key="' + key + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function onDoor(key) {
    if (win.hidden === false || lose.hidden === false) return;
    if (state.mode === 'visit' && state.opened.indexOf(key) >= 0) return;
    var result = CA.assess(state.level, state, { type: state.mode, key: key });
    if (result.lose) {
      document.getElementById('lose-k').textContent = result.wrong ? '抓错了' : '撞见了';
      document.getElementById('lose-title').textContent = result.wrong ? '这户是好人' : '这户是外星人';
      state.opened.push(key);
      render();
      focusDoor(key);
      lose.hidden = false;
      return;
    }
    if (!result.ok) {
      if (result.message) showToast(result.message);
      return;
    }
    var cell = state.level.byKey[key];
    if (state.mode === 'visit') {
      state.opened.push(key);
      render();
      focusDoor(key);
      return;
    }
    state.killed.push(key);
    showToast(cell.name + ' 的伪装掉了。捉住了。');
    render();
    focusDoor(key);
    if (state.killed.length >= state.level.alienCount) win.hidden = false;
  }

  building.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.door') : null;
    if (!btn) return;
    onDoor(btn.getAttribute('data-key'));
  });

  document.getElementById('modes').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    state.mode = btn.getAttribute('data-mode');
    render();
  });

  /* 换一栋：同一关，重新生成一栋楼（同一个种子重开没意义——答案已经看过了） */
  document.getElementById('retry').addEventListener('click', function () {
    startLevel(state.levelIndex);
  });

  document.getElementById('next').addEventListener('click', function () {
    startLevel(state.levelIndex + 1);
  });

  document.getElementById('win-next').addEventListener('click', function () {
    startLevel(state.levelIndex + 1);
  });

  document.getElementById('lose-retry').addEventListener('click', function () {
    startLevel(state.levelIndex);
  });

  window.addEventListener('resize', function () {
    if (state) layoutRows(state.level);
  });

  var query = new URLSearchParams(location.search);
  var startIndex = parseInt(query.get('level') || '1', 10);
  if (!startIndex || startIndex < 1) startIndex = 1;
  var seedArg = query.get('seed');
  startLevel(startIndex, seedArg == null ? null : (parseInt(seedArg, 10) >>> 0));
  if (location.search.indexOf('debug=1') >= 0) {
    setTimeout(function () {
      var b = document.getElementById('building');
      var rows = b.querySelectorAll('.floor-row');
      var r0 = rows[0];
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#000;color:#0f0;font:11px monospace;padding:3px;white-space:pre';
      t.textContent = 'lv floors=' + state.level.floors + ' units=' + state.level.units +
        '\nbld ' + b.clientWidth + 'x' + b.clientHeight + ' scrollTop=' + b.scrollTop +
        '\nrows=' + rows.length + ' row0=' + (r0 ? r0.clientWidth + 'x' + r0.clientHeight : '-') +
        '\nrowH=' + getComputedStyle(b).getPropertyValue('--row-h') +
        '\nstage=' + document.getElementById('stage').clientHeight;
      document.body.appendChild(t);
    }, 1500);
  }
})();

