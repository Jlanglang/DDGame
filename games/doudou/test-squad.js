/* 小队模式测试：真浏览器里发真实触摸 / 鼠标，验证拖放、合成、开战。
   用法：node games/doudou/test-squad.js

   零依赖，和 test-input.js 一样用 Chrome 的 --remote-debugging-pipe（fd 3 写、fd 4 读）。

   模拟 400×800 竖屏 → 逻辑 720×1440，坐标一律从页面里的真实 rect 换算，不写死。
*/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((f) => fs.existsSync(f));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; lines.push('  PASS ' + name); }
  else { fail++; lines.push('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

async function main() {
  if (!CHROME) throw new Error('没找到 Chrome / Edge');
  const url = 'file:///' + path.join(__dirname, 'squad.html').replace(/\\/g, '/') + '?fast=8';

  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--remote-debugging-pipe', '--allow-file-access-from-files',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

  const input = proc.stdio[3], output = proc.stdio[4];
  const pending = new Map();
  let seq = 0, buf = '';
  output.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const m = { id: ++seq, method, params };
    if (sessionId) m.sessionId = sessionId;
    pending.set(m.id, { resolve, reject });
    input.write(JSON.stringify(m) + '\0');
  });

  await wait(500);
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sid = attached.sessionId;

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) throw new Error('页面异常：' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };

  await send('Page.enable', {}, sid);
  await send('Runtime.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 400, height: 800, deviceScaleFactor: 2, mobile: true,
  }, sid);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sid);
  await send('Page.navigate', { url }, sid);

  for (let i = 0; i < 80; i++) {
    if (await ev('!!window.__squad')) break;
    await wait(100);
  }
  ok('页面加载出 __squad', await ev('!!window.__squad'));
  ok('开局待命区 3 人', await ev('window.__squad.bench.filter(Boolean).length') === 3);

  /* 坐标：从真实 canvas rect 换算，别写死 */
  const geo = await ev(`(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    const a = window.__squadApi;
    const kx = r.width / a.STAGE.W, ky = r.height / a.STAGE.H;
    const P = (x, y) => ({ x: r.left + x * kx, y: r.top + y * ky });
    const slot = (i) => P(a.GRID.x + (i % a.GRID.cols) * a.CELL + a.CELL / 2,
                          a.GRID.y + Math.floor(i / a.GRID.cols) * a.CELL + a.CELL / 2);
    const btn = (b) => P(b.x + b.w / 2, b.y + b.h / 2);
    return {
      slot0: slot(18), slot1: slot(12), slot6: slot(24),
      fight: btn(a.BTN.fight), speed: btn(a.SPEED_BTN), panel: btn(a.PANEL_BTN),
    };
  })()`);

  // 待命位坐标：每次拖/点之前都按页面真实 rect 重算
  const benchPos = (i) => ev(`(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    const a = window.__squadApi;
    const p = a.benchCenter(${i});
    return { x: r.left + p.x * r.width / a.STAGE.W, y: r.top + p.y * r.height / a.STAGE.H };
  })()`);

  const touchDrag = async (from, to) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] }, sid);
    await wait(70);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }] }, sid);
    await wait(60);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x, y: to.y }] }, sid);
    await wait(80);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sid);
    await wait(140);
  };

  const mouseDrag = async (from, to) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 }, sid);
    await wait(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, button: 'left' }, sid);
    await wait(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to.x, y: to.y, button: 'left' }, sid);
    await wait(80);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 }, sid);
    await wait(140);
  };

  const click = async (at) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }, sid);
    await wait(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }, sid);
    await wait(130);
  };

  /* 1. 空场不能开战 */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geo.fight.x, y: geo.fight.y, button: 'left', clickCount: 1 }, sid);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geo.fight.x, y: geo.fight.y, button: 'left', clickCount: 1 }, sid);
  await wait(200);
  ok('空场点开战不进入战斗', await ev('window.__squad.phase') === 'prep');

  /* 1.1 布局：格子宽约 40%（街道 60%） */
  const gridRatio = await ev('window.__squadApi.GRID.w / window.__squadApi.STAGE.W');
  ok('格子宽约 40%', gridRatio > 0.37 && gridRatio < 0.42, { gridRatio });

  /* 1.2 战斗倍速：×1 → ×2 → ×3 → ×1 */
  await click(geo.speed);
  const sp1 = await ev('window.__squad.speed');
  await click(geo.speed);
  const sp2 = await ev('window.__squad.speed');
  await click(geo.speed);
  const sp3 = await ev('window.__squad.speed');
  ok('倍速循环 2 / 3 / 1', sp1 === 2 && sp2 === 3 && sp3 === 1, { sp1, sp2, sp3 });

  /* 1.3 养成面板：10 行、能开关 */
  await click(geo.panel);
  ok('养成面板打开', await ev('window.__squad.panel') === true);
  ok('养成面板 10 行', await ev('window.__squadApi.panelRows().length') === 10);

  /* 1.3.1 卡片详情：点第一张卡进详情，点返回回列表 */
  const detailPos = await ev(`(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    const a = window.__squadApi;
    const row = a.panelRows()[0];
    const back = a.detailRects().back;
    const P = (x, y) => ({ x: r.left + x * r.width / a.STAGE.W, y: r.top + y * r.height / a.STAGE.H });
    return { card: P(row.x + row.w / 2, row.y + row.h / 2), back: P(back.x + back.w / 2, back.y + back.h / 2) };
  })()`);
  await click(detailPos.card);
  ok('点卡片打开详情页', await ev('window.__squad.panelDetail') === 0);
  await click(detailPos.back);
  ok('详情页返回列表', await ev('window.__squad.panelDetail') === null);

  await click(geo.panel);
  ok('养成面板关闭', await ev('window.__squad.panel') === false);

  /* 1.4 技能节点按兵种分化：技能不再绑等级，花点解锁；测完还原 */
  const mastery = await ev(`(() => {
    const a = window.__squadApi;
    const g = window.__squad;
    const oldArr = a.SAVE.mastery.slice();
    a.SAVE.mastery[0] = 1; const rifleRate5 = a.masteryOf(0).rate;
    a.SAVE.mastery[0] = 2; const rifleDmg9 = a.masteryOf(0).dmg;
    a.SAVE.mastery[0] = 4; const riflePellets10 = a.masteryOf(0).pellets;
    a.SAVE.mastery[2] = 1; const snipePierce5 = a.masteryOf(2).pierce;
    a.SAVE.mastery[2] = 4; const snipePierce10 = a.masteryOf(2).pierce;
    a.SAVE.mastery[4] = 1; const medicHeal5 = a.masteryOf(4).heal;
    const probe = { kind: 0, star: 1, w: 1, h: 1, cd: 0 };
    a.SAVE.mastery[7] = 4; g.aux.drum = 1; const drumRate10 = a.unitRate(probe);
    a.SAVE.mastery[7] = 0; const drumRate3 = a.unitRate(probe);
    g.aux.drum = 0;
    for (let i = 0; i < oldArr.length; i++) a.SAVE.mastery[i] = oldArr[i];
    return { rifleRate5, rifleDmg9, riflePellets10, snipePierce5, snipePierce10, medicHeal5,
      drumRate10, drumRate3, back: a.SAVE.mastery[0],
      nodes: Object.values(a.MASTERY).every((x) => x.length === 4) };
  })()`);
  ok('步枪技能1：攻速 +15%', mastery.rifleRate5 === 1.15, mastery);
  ok('步枪技能2：伤害 ×1.2', Math.abs(mastery.rifleDmg9 - 1.2) < 1e-9, mastery);
  ok('步枪技能4：弹道 +1', mastery.riflePellets10 === 1, mastery);
  ok('狙击技能1：穿透 +1（不是攻速）', mastery.snipePierce5 === 1, mastery);
  ok('狙击技能4：穿透累计 +2', mastery.snipePierce10 === 2, mastery);
  ok('医务技能1：治疗 +30%', mastery.medicHeal5 === 1.3, mastery);
  ok('鼓号技能4：光环真的提速 >10%', mastery.drumRate10 > mastery.drumRate3 * 1.1, mastery);
  ok('10 个兵种各有 4 个技能节点', mastery.nodes === true, mastery);
  ok('技能测试后状态还原', mastery.back === 0, mastery);

  /* 1.5 升级：杀怪攒经验，升级才弹三选一；选完回战斗 */
  const lvup = await ev(`(() => {
    const g = window.__squad, a = window.__squadApi;
    const old = { phase: g.phase, xp: g.xp, level: g.level, pending: g.pendingLevels, buff: JSON.parse(JSON.stringify(g.buff)) };
    g.phase = 'battle'; g.level = 1; g.xp = a.xpNeed(1) - 1; g.pendingLevels = 0; g.choices = null;
    a.gainXP(1);
    const atChoice = { phase: g.phase, level: g.level, pending: g.pendingLevels, choices: (g.choices || []).length };
    const picked = a.chooseUpgrade(0);
    const after = { phase: g.phase, pending: g.pendingLevels };
    g.phase = old.phase; g.xp = old.xp; g.level = old.level; g.pendingLevels = old.pending;
    g.buff = old.buff; g.choices = null;
    return { atChoice, picked, after };
  })()`);
  ok('经验够了升级并弹三选一', lvup.atChoice.phase === 'choose' && lvup.atChoice.level === 2 && lvup.atChoice.choices === 3, lvup);
  ok('选完词条回到战斗', lvup.after.phase === 'battle' && lvup.after.pending === 0, lvup);

  /* 1.6 卡片门槛：前 2 关 2 个候选、只出 1 星；第 5 关 3 个候选、会出 2/3 星 */
  const gate = await ev(`(() => {
    const g = window.__squad, a = window.__squadApi;
    const old = { stage: g.stage, level: g.level };
    g.stage = 1; g.level = 1;
    const n1 = a.benchCandidateCount(), s1 = a.maxBenchStar();
    g.stage = 5; g.level = 1;
    const n5 = a.benchCandidateCount();
    let s5 = 1;
    for (let i = 0; i < 80; i++) s5 = Math.max(s5, a.maxBenchStar());
    g.stage = old.stage; g.level = old.level;
    return { n1, s1, n5, s5 };
  })()`);
  ok('第 1 关候选 2 个', gate.n1 === 2, gate);
  ok('第 1 关只出 1 星', gate.s1 === 1, gate);
  ok('第 5 关候选 3 个', gate.n5 === 3, gate);
  ok('第 5 关会出 2/3 星', gate.s5 >= 2, gate);

  /* 1.7 词条门槛：Lv1 只出普通，Lv12 会出史诗 */
  const aff = await ev(`(() => {
    const g = window.__squad, a = window.__squadApi;
    const old = { stage: g.stage, level: g.level };
    g.stage = 5; g.level = 1;
    let early = 0, earlyBad = 0;
    for (let i = 0; i < 30; i++) for (const x of a.rollUpgrades()) { early++; if (x.tier > 1) earlyBad++; }
    g.level = 12;
    let lateEpic = 0;
    for (let i = 0; i < 40; i++) for (const x of a.rollUpgrades()) if (x.tier === 3) lateEpic++;
    g.stage = old.stage; g.level = old.level;
    return { early, earlyBad, lateEpic };
  })()`);
  ok('Lv1 三选一只出普通词条', aff.early > 0 && aff.earlyBad === 0, aff);
  ok('Lv12 三选一会出史诗词条', aff.lateEpic > 0, aff);

  /* 1.8 单机进度：强化点 + 关卡等级上限（2026-11-20 主人改） */
  const prog = await ev(`(() => {
    const g = window.__squad, a = window.__squadApi;
    const saved = {
      cleared: a.SAVE.cleared.slice(), pts: a.SAVE.pts, spent: a.SAVE.spent.slice(),
      stage: g.stage, finished: g.finished, first: g.firstClear,
      stats: JSON.parse(JSON.stringify(a.SAVE.stats)),
    };
    a.SAVE.cleared.fill(false);
    a.SAVE.pts = 0;
    a.SAVE.spent.fill(0);
    const cap0 = a.refreshLV();
    const lv0 = a.LV[0];
    a.SAVE.cleared[0] = true;
    const cap1 = a.refreshLV();
    a.SAVE.cleared[1] = true;
    const cap2 = a.refreshLV();

    // 给 10 点，把 0 号兵从 Lv3 一路点到上限 Lv6
    const costAt3 = a.lvCost(a.LV[0]);
    a.SAVE.pts = 10;
    const up1 = a.spendPoint(0);        // 3 → 4，花 1
    const up2 = a.spendPoint(0);        // 4 → 5，花 1
    const up3 = a.spendPoint(0);        // 5 → 6，花 2
    const ptsLeft = a.SAVE.pts;
    const upCap = a.spendPoint(0);      // 已到上限 6，不能再升
    const lvAtCap = a.LV[0];

    a.SAVE.cleared = saved.cleared; a.SAVE.pts = saved.pts; a.SAVE.spent = saved.spent;
    a.refreshLV();
    g.stage = saved.stage; g.finished = saved.finished; g.firstClear = saved.first;
    a.SAVE.stats = saved.stats;
    return { cap0, cap1, cap2, lv0, costAt3, up1, up2, up3, ptsLeft, upCap, lvAtCap, back: a.LV[0] };
  })()`);
  ok('初始等级上限 Lv.3', prog.cap0 === 3 && prog.lv0 === 3, prog);
  ok('通关 1 关 → 上限 Lv.5', prog.cap1 === 5, prog);
  ok('通关 2 关 → 上限 Lv.6', prog.cap2 === 6, prog);
  ok('升级花费按等级递增（Lv3 花 1 点）', prog.costAt3 === 1, prog);
  ok('花点能升到新上限 Lv.6', prog.up1 && prog.up2 && prog.up3 && prog.lvAtCap === 6, prog);
  ok('点到上限后不能再升', prog.upCap === false, prog);
  ok('升级扣的是强化点（10 - 4 = 6）', prog.ptsLeft === 6, prog);
  ok('进度测试后等级还原', prog.back === 3, prog);

  /* 1.9 首通发强化点：第 1 关首通 +6，重复通关不再发 */
  const ptsTest = await ev(`(() => {
    const g = window.__squad, a = window.__squadApi;
    const saved = {
      cleared: a.SAVE.cleared.slice(), pts: a.SAVE.pts, stage: g.stage,
      finished: g.finished, first: g.firstClear,
      stats: JSON.parse(JSON.stringify(a.SAVE.stats)),
    };
    a.SAVE.cleared.fill(false);
    g.stage = 1; g.finished = false; g.firstClear = false;
    const before = a.SAVE.pts;
    a.finishRun(true);
    const gained = g.pointsGained;
    const after = a.SAVE.pts;
    // 重打一遍：不是首通，不发点
    g.finished = false; g.firstClear = false;
    a.finishRun(true);
    const after2 = a.SAVE.pts;

    a.SAVE.cleared = saved.cleared; a.SAVE.pts = saved.pts; a.SAVE.stats = saved.stats;
    g.stage = saved.stage; g.finished = saved.finished; g.firstClear = saved.first;
    return { before, after, gained, after2 };
  })()`);
  ok('首通第 1 关发 6 点', ptsTest.gained === 6 && ptsTest.after === ptsTest.before + 6, ptsTest);
  ok('重复通关不再发点', ptsTest.after2 === ptsTest.after, ptsTest);

  /* 2. 触摸：把待命区的 1 号拖进 0 号格 */
  await touchDrag(await benchPos(0), geo.slot0);
  ok('触摸拖放：格子 18 有人', await ev('!!window.__squad.slots[18]'));
  ok('触摸拖放：待命区 0 空了', await ev('window.__squad.bench[0] === null'));

  /* 2.1 准备阶段金币不涨：金币只有三源，没有「每秒基础收入」 */
  const coin0 = await ev('Math.floor(window.__squad.coins)');
  await wait(1200);
  const coin1 = await ev('Math.floor(window.__squad.coins)');
  ok('准备阶段金币不涨', coin1 === coin0, { coin0, coin1 });

  /* 2.2 点按移动：点待命位 → 点战场空地 → 单位放过去（不是只能拖） */
  await ev(`(() => {
    window.__squad.bench[0] = window.__squadApi.makeUnit(0, 1);
    return true;
  })()`);
  await click(await benchPos(0));
  const tapPicked = await ev('!!window.__squad.pick');
  await click(geo.slot6);
  ok('点按选中待命位', tapPicked);
  ok('点按：待命位 → 空地', await ev('!!window.__squad.slots[24]'));
  ok('点按：待命位清空', await ev('window.__squad.bench[0] === null'));

  /* 3. 鼠标：把 2 号拖进 12 号格（固定成 1×2 的霰弹兵，应该同时占 12 和 17） */
  await ev(`(() => {
    const a = window.__squadApi;
    window.__squad.bench[1] = a.makeUnit(1, 1);   // 1 = 霰弹兵（1×2）
    return true;
  })()`);
  await mouseDrag(await benchPos(1), geo.slot1);
  ok('鼠标拖放：格子 12 有人', await ev('!!window.__squad.slots[12]'));
  ok('大单位占两格（格子 12 和 17 是同一个单位）', await ev('!!window.__squad.slots[12] && window.__squad.slots[12] === window.__squad.slots[17]'));

  /* 4. 合成：把 3 号改成和格子 0 同兵种同星，再拖上去 */
  await ev(`(() => {
    const s = window.__squad;
    const a = window.__squadApi;
    const k = s.slots[18].kind;
    s.bench[2] = a.makeUnit(k, 1);
    return true;
  })()`);
  const beforeStar = await ev('window.__squad.slots[18].star');
  await touchDrag(await benchPos(2), geo.slot0);
  const afterStar = await ev('window.__squad.slots[18].star');
  ok('合成：星级 +1', afterStar === beforeStar + 1, { beforeStar, afterStar });
  ok('合成：待命区 2 清空', await ev('window.__squad.bench[2] === null'));
  ok('合成：记了次数', await ev('window.__squad.stats.merges') === 1);

  /* 4.5 点按合成：待命区放一个和场上同款，点它再点场上单位 → 合成（不用拖） */
  await ev(`(() => {
    const s = window.__squad, a = window.__squadApi;
    const u = s.slots[18];
    s.bench[2] = a.makeUnit(u.kind, u.star);
    return true;
  })()`);
  const tapBefore = await ev('window.__squad.slots[18].star');
  const tapBench = await benchPos(2);
  const tapSlot = geo.slot0;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tapBench.x, y: tapBench.y, button: 'left', clickCount: 1 }, sid);
  await wait(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tapBench.x, y: tapBench.y, button: 'left', clickCount: 1 }, sid);
  await wait(120);
  const picked = await ev('!!window.__squad.pick');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tapSlot.x, y: tapSlot.y, button: 'left', clickCount: 1 }, sid);
  await wait(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tapSlot.x, y: tapSlot.y, button: 'left', clickCount: 1 }, sid);
  await wait(140);
  const tapAfter = await ev('window.__squad.slots[18].star');
  ok('点按选中单位', picked);
  ok('点按合成：星级 +1', tapAfter === tapBefore + 1, { tapBefore, tapAfter });
  ok('点按合成：待命区清空', await ev('window.__squad.bench[2] === null'));

  /* 4.6 场上拖回待命区（原版回收），再拖回去 */
  await mouseDrag(geo.slot0, await benchPos(0));
  ok('场上拖回待命区', await ev('window.__squad.slots[18] === null && !!window.__squad.bench[0]'));
  await mouseDrag(await benchPos(0), geo.slot0);
  ok('待命区再拖回场上', await ev('!!window.__squad.slots[18]'));

  /* 4.7 待命区只是中转站：开战时清空 */
  await ev(`(() => { window.__squad.bench[2] = window.__squadApi.makeUnit(0, 1); return true; })()`);
  ok('开战前待命区有残留', await ev('!!window.__squad.bench[2]'));

  /* 5. 开战 */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geo.fight.x, y: geo.fight.y, button: 'left', clickCount: 1 }, sid);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geo.fight.x, y: geo.fight.y, button: 'left', clickCount: 1 }, sid);
  await wait(250);
  ok('点开战进入战斗', await ev('window.__squad.phase') === 'battle');
  ok('开战清空待命区', await ev('window.__squad.bench.every((u) => u === null)'));

  /* 5.1 战斗中没有战争顾问 → 金币不涨（三源里没有「基础收入」）
        注意：?fast=8 下真实 1 秒≈8 秒游戏时间，等太久第一波会被清掉，所以只等 250ms */
  const battleCoin0 = await ev('Math.floor(window.__squad.coins)');
  await wait(250);
  const battleCoin1 = await ev('Math.floor(window.__squad.coins)');
  ok('战斗中没有顾问不产币', battleCoin1 === battleCoin0, { battleCoin0, battleCoin1 });

  /* 6. 单位有生命：把一只厚血敌人贴到 2 星步枪跟前，验证「敌人围上来打人」
     横屏后敌人从右边来，所以贴在单位格子的右边缘 */
  const startWave = await ev('window.__squad.wave');
  await ev(`(() => {
    const s = window.__squad, a = window.__squadApi;
    const u = s.slots[18];
    if (!u) return false;
    const c = a.unitCenter(u);
    const r = a.unitRect(u);
    a.spawnEnemy();
    const e = s.enemies[s.enemies.length - 1];
    e.y = c.y;
    e.x = r.x + r.w + e.r - 6;    // 正好贴着格子右边缘
    e.hp = e.maxHp = 99999;       // 别被单位秒掉，撑到它出手
    e.__probe = true;
    return true;
  })()`);

  let advanced = false;
  let sawEnemy = false;
  let unitHurt = false;
  let unitDied = false;
  let sawDmgFloat = false;
  // 敌人多了（第 1 波 9 个）而且会围啃单位，一波可能要 40~60 秒，等够 60 秒
  for (let i = 0; i < 200; i++) {
    const st = await ev(`(() => {
      const s = window.__squad;
      const us = [...new Set(s.slots.filter(Boolean))];
      return {
        wave: s.wave, phase: s.phase, n: s.enemies.length + s.spawnLeft,
        hurt: us.some((u) => u.hp < u.maxHp),
        deaths: s.stats.deaths,
        floats: s.floats.length,
      };
    })()`);
    if (st.n > 0) sawEnemy = true;
    if (st.hurt) unitHurt = true;
    if (st.deaths > 0) unitDied = true;
    if (st.floats > 0) sawDmgFloat = true;
    if (st.phase === 'choose') {
      // 升级了三选一：测试里拿第一张，继续打
      await ev('window.__squadApi.chooseUpgrade(0)');
      await wait(80);
      continue;
    }
    if (unitHurt || unitDied) {
      // 探针用完了挪走，别把第 1 波卡死
      await ev(`(() => { const e = window.__squad.enemies.find((x) => x.__probe); if (e) e.dead = true; return true; })()`);
    }
    if (st.wave > startWave || st.phase === 'win' || st.phase === 'over') { advanced = true; break; }
    if (st.n === 0 && st.phase === 'prep') { advanced = true; break; }
    await wait(300);
  }
  ok('战斗里出现过敌人', sawEnemy);
  ok('战斗里出现伤害飘字', sawDmgFloat);
  ok('单位会掉血或阵亡（敌人会围上来打人）', unitHurt || unitDied, { unitHurt, unitDied });
  ok('波次推进或整局结束', advanced, await ev(`({ wave: window.__squad.wave, phase: window.__squad.phase, left: window.__squad.spawnLeft, n: window.__squad.enemies.length })`));

  /* 7. 每波结束自动免费刷新：待命区清空后强制结算一波，应该自己补候选，
        并把付费刷新计数归零（下一刷从 10 起价）。自动合成可能把重复的合掉，
        所以只断言「有候选 + 计数归零」，不硬断言恰好 3 个。 */
  await ev(`(() => {
    const s = window.__squad;
    s.bench.fill(null);
    s.phase = 'battle';
    // 故意塞残留子弹和尸体，验证清波后画面不留垃圾
    s.bullets.push({ x: 1, y: 1, vx: 0, vy: 0, life: 1, dmg: 1, hit: [], size: 1, star: 1, color: '#fff' });
    s.enemies.push({ x: 1, y: 1, hp: 1, maxHp: 1, dead: true });
    window.__squadApi.settleWave();
    return true;
  })()`);
  ok('清波后待命区自动补候选', await ev('window.__squad.bench.some(Boolean)'));
  ok('清波后付费刷新计数归零', await ev('window.__squad.refreshCount') === 0);
  ok('清波后直接回准备（三选一只跟升级）', await ev('window.__squad.phase') === 'prep');
  ok('清波后不留子弹/尸体', await ev('window.__squad.bullets.length === 0 && window.__squad.enemies.length === 0'));

  proc.kill();
}

main().then(() => {
  console.log(lines.join('\n'));
  console.log('');
  console.log(`RESULT pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((err) => {
  console.log(lines.join('\n'));
  console.error('测试跑挂了：', err && err.message ? err.message : err);
  process.exit(1);
});
