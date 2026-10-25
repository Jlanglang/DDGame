/* 豆豆魔方 · 真浏览器输入测试
   用法：node games/cube/test-input.js

   零依赖：Chrome 的 --remote-debugging-pipe 直接对话（fd 3 写、fd 4 读），
   不装 ws、不起端口、不写临时文件。
   覆盖：按钮顺时针/逆时针、鼠标拖动转层、触摸拖动转层、拖空白转视角、
   撤销 / 重置 / 正视角、打乱动画、复原判定与胜利面板、键盘。
*/
const path = require('node:path');
const fs = require('node:fs');
const { launch, wait } = require('./test-lib.js');

const lines = [];
let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    lines.push('  PASS ' + name);
  } else {
    fail++;
    lines.push('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
  }
}

const url = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?debug';

async function main() {
  const t = await launch(url, { width: 450, height: 1000, dsf: 2 });
  const st = () => t.ev('window.__cube.state()');
  const mouse = (type, x, y) => t.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', clickCount: 1,
  });
  async function click(x, y) {
    await mouse('mousePressed', x, y);
    await mouse('mouseReleased', x, y);
    await wait(60);
  }
  async function pressButton(sel, ratio = 0.8) {
    const r = await t.ev(`(function(){var b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()`);
    await click(r.x + r.w * ratio, r.y + r.h / 2);
  }

  await t.ev('try { localStorage.clear(); } catch (e) {}');

  /* 1. 启动 */
  ok('页面加载出 __cube', await t.ev('!!window.__cube'));
  const s0 = await st();
  ok('初始是复原状态', s0.solved === true, s0);
  ok('初始步数 0', s0.moves === 0, s0.moves);
  ok('初始处于 ready', s0.phase === 'ready', s0.phase);
  ok('初始是锁定状态（可拖层）', s0.locked === true, s0.locked);

  /* 2. 打乱按钮 */
  await pressButton('[data-act=shuffle]');
  const s1 = await st();
  ok('点「打乱」进入打乱中', s1.phase === 'scramble', s1.phase);
  await wait(2300);
  const s2 = await st();
  ok('打乱动画结束后可玩', s2.phase === 'play', s2);
  ok('打乱后不是复原状态', s2.solved === false, s2.solved);
  ok('打乱不计步数', s2.moves === 0, s2.moves);

  /* 3. 面按钮：顺时针 / 逆时针 */
  await pressButton('[data-move=U]', 0.8);
  await wait(320);
  const s3 = await st();
  ok('点 U 右半（顺时针）步数 +1', s3.moves === 1, s3.moves);
  ok('U 之后仍未复原', s3.solved === false, s3.solved);

  await pressButton('[data-move=U]', 0.1);
  await wait(320);
  const s4 = await st();
  ok('点 U 左半（逆时针）步数 +1', s4.moves === 2, s4.moves);

  /* 4. 锁定 = 可以拖层：锁定时拖魔方就是转层 */
  await t.ev('__cube.reset()');
  await t.ev('__cube.play()');
  await wait(120);
  const lockPoint = await t.ev('__cube.screenOf([0, 1, 1], 4)');
  const lockBefore = await st();
  await mouse('mousePressed', lockPoint.x, lockPoint.y);
  for (let i = 1; i <= 4; i++) {
    await mouse('mouseMoved', lockPoint.x + i * 16, lockPoint.y);
    await wait(16);
  }
  await mouse('mouseReleased', lockPoint.x + 64, lockPoint.y);
  await wait(320);
  const lockAfter = await st();
  ok('锁定时拖魔方能转层',
    lockAfter.moves === lockBefore.moves + 1,
    { moves: [lockBefore.moves, lockAfter.moves] });
  ok('锁定按钮显示 🔒', String(await t.ev('document.getElementById("lockBtn").textContent')).indexOf('🔒') >= 0);

  /* 4.2 锁定时视角也锁死：拖空白什么都不发生 */
  const blankBefore = await st();
  await mouse('mousePressed', 60, 200);
  for (let i = 1; i <= 4; i++) {
    await mouse('mouseMoved', 60 + i * 16, 200);
    await wait(16);
  }
  await mouse('mouseReleased', 60 + 64, 200);
  await wait(120);
  const blankAfter = await st();
  ok('锁定时拖空白不转视角',
    Math.abs(blankAfter.yaw - blankBefore.yaw) < 0.001 &&
    Math.abs(blankAfter.pitch - blankBefore.pitch) < 0.001,
    { before: [blankBefore.yaw, blankBefore.pitch], after: [blankAfter.yaw, blankAfter.pitch] });

  /* 4.5 解锁 = 转视角：这时候拖魔方也只动镜头 */
  await pressButton('[data-act=lock]');
  const unlocked = await st();
  ok('点「锁定」解锁成视角模式', unlocked.locked === false, unlocked.locked);
  ok('解锁按钮显示 🔓', String(await t.ev('document.getElementById("lockBtn").textContent')).indexOf('🔓') >= 0);

  await t.ev('__cube.reset()');
  await t.ev('__cube.play()');
  await wait(120);
  const viewPoint = await t.ev('__cube.screenOf([0, 1, 1], 4)');
  const viewBefore = await st();
  await mouse('mousePressed', viewPoint.x, viewPoint.y);
  for (let i = 1; i <= 4; i++) {
    await mouse('mouseMoved', viewPoint.x + i * 16, viewPoint.y);
    await wait(16);
  }
  await mouse('mouseReleased', viewPoint.x + 64, viewPoint.y);
  await wait(200);
  const viewAfter = await st();
  ok('解锁后拖魔方只转视角、不转层',
    viewAfter.moves === viewBefore.moves && Math.abs(viewAfter.yaw - viewBefore.yaw) > 0.1,
    { moves: [viewBefore.moves, viewAfter.moves], yaw: [viewBefore.yaw, viewAfter.yaw] });

  /* 锁回去，后面的拖动测试要在转层模式 */
  await pressButton('[data-act=lock]');
  ok('再点一次回到锁定（可拖层）', (await st()).locked === true);

  /* 5. 鼠标拖动转层：复原状态下抓顶排前面，向右推 */
  await t.ev('__cube.reset()');
  await t.ev('__cube.play()');
  await t.ev('__cube.setView(-0.72, 0.48)');
  await wait(120);
  const p0 = await t.ev('__cube.screenOf([0, 1, 1], 4)');
  ok('拿得到顶排前面中心点的屏幕坐标', !!p0 && p0.x > 0, p0);
  const before = await st();
  const beforeCubies = await t.ev('__cube.cubies()');
  await mouse('mousePressed', p0.x, p0.y);
  await wait(40);
  for (let i = 1; i <= 4; i++) {
    await mouse('mouseMoved', p0.x + i * 16, p0.y);
    await wait(16);
  }
  await mouse('mouseReleased', p0.x + 64, p0.y);
  await wait(320);
  const afterMouse = await st();
  ok('鼠标拖动魔方转了一层', afterMouse.moves === before.moves + 1, { before: before.moves, after: afterMouse.moves });

  /* 顶排（y=1）向右拖 = U：顶层的 cubie 应该按 (x,1,z) → (z,1,-x) 走，其他层不动 */
  const afterCubies = await t.ev('__cube.cubies()');
  let isU = true;
  for (let i = 0; i < beforeCubies.length; i++) {
    const b = beforeCubies[i].pos;
    const a = afterCubies[i].pos;
    if (b[1] === 1) {
      if (a[0] !== b[2] || a[1] !== 1 || a[2] !== -b[0]) isU = false;
    } else if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) {
      isU = false;
    }
  }
  ok('拖动方向正确（顶排向右 = U）', isU);

  /* 5.5 跟手：拖动中不松手不算转动，松手才结算 */
  await t.ev('__cube.reset()');
  await t.ev('__cube.play()');
  await wait(100);
  const dragPoint = await t.ev('__cube.screenOf([0, 1, 1], 4)');
  const beforeDrag = await st();
  await mouse('mousePressed', dragPoint.x, dragPoint.y);
  for (let i = 1; i <= 4; i++) {
    await mouse('mouseMoved', dragPoint.x + i * 16, dragPoint.y);
    await wait(20);
  }
  const midDrag = await st();
  const midSpin = await t.ev('__cube.animInfo()');
  ok('拖动中不松手不算转动',
    midDrag.moves === beforeDrag.moves && midDrag.solved === beforeDrag.solved,
    { moves: midDrag.moves, solved: midDrag.solved });
  ok('拖动中那一层已经跟着手指转了',
    !!midSpin && midSpin.kind === 'drag' && Math.abs(midSpin.angle) > 0.3, midSpin);
  await mouse('mouseReleased', dragPoint.x + 64, dragPoint.y);
  await wait(320);
  const afterDrag = await st();
  ok('松手后才完成这一步', afterDrag.moves === beforeDrag.moves + 1, afterDrag.moves);

  /* 5.6 拖动不够就回弹 */
  await t.ev('__cube.reset()');
  await t.ev('__cube.play()');
  await wait(100);
  const bobPoint = await t.ev('__cube.screenOf([0, 1, 1], 4)');
  const beforeBob = await st();
  await mouse('mousePressed', bobPoint.x, bobPoint.y);
  await mouse('mouseMoved', bobPoint.x + 14, bobPoint.y);
  await wait(40);
  await mouse('mouseReleased', bobPoint.x + 14, bobPoint.y);
  await wait(320);
  const afterBob = await st();
  ok('拖动不够（不到 45°）就回弹，不算一步', afterBob.moves === beforeBob.moves, afterBob.moves);
  ok('回弹后没有残留的转动', (await t.ev('__cube.animInfo()')) === null, 'spin');

  /* 5. 触摸拖动转层 */
  await t.ev('__cube.reset()');
  await t.ev('__cube.scramble(8)');
  await wait(120);
  const p1 = await t.ev('__cube.screenOf([0, 0, 1], 4)');
  const beforeTouch = await st();
  await t.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p1.x, y: p1.y }] });
  await wait(40);
  for (let i = 1; i <= 4; i++) {
    await t.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p1.x + i * 16, y: p1.y }] });
    await wait(16);
  }
  await t.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(320);
  const afterTouch = await st();
  ok('触摸拖动魔方转了一层', afterTouch.moves === beforeTouch.moves + 1, { before: beforeTouch.moves, after: afterTouch.moves });

  /* 6. 解锁后拖空白转视角 */
  await pressButton('[data-act=lock]');
  ok('需要转视角时先解锁', (await st()).locked === false);
  const view0 = await st();
  await t.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: 200 }] });
  await wait(40);
  for (let i = 1; i <= 5; i++) {
    await t.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60 + i * 20, y: 200 }] });
    await wait(16);
  }
  await t.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(120);
  const view1 = await st();
  ok('解锁后拖空白改变视角 yaw', Math.abs(view1.yaw - view0.yaw) > 0.2, { a: view0.yaw, b: view1.yaw });
  ok('拖空白没有转层', view1.moves === view0.moves, { a: view0.moves, b: view1.moves });
  await pressButton('[data-act=lock]');   // 锁回去，后面的按钮/键盘测试不受影响

  /* 7. 正视角 */
  await pressButton('[data-act=view]');
  const view2 = await st();
  ok('「正视角」把 yaw 拉回默认', Math.abs(view2.yaw - (-0.72)) < 0.01, view2.yaw);

  /* 8. 撤销 */
  await t.ev('__cube.reset()');
  await t.ev('__cube.scramble(8)');
  await wait(100);
  await pressButton('[data-move=R]', 0.8);
  await wait(300);
  const m1 = await st();
  await pressButton('[data-act=undo]');
  await wait(300);
  const m2 = await st();
  ok('撤销把步数减回去', m1.moves === 1 && m2.moves === 0, { m1: m1.moves, m2: m2.moves });

  /* 9. 重置 */
  await pressButton('[data-act=reset]');
  const r1 = await st();
  ok('重置后回到复原状态', r1.solved === true, r1);
  ok('重置后步数清零', r1.moves === 0, r1.moves);
  ok('重置后回到 ready', r1.phase === 'ready', r1.phase);

  /* 10. 键盘 */
  await t.ev('__cube.scramble(8)');
  await wait(100);
  const k0 = await st();
  await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'u', code: 'KeyU', windowsVirtualKeyCode: 85 });
  await t.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'u', code: 'KeyU', windowsVirtualKeyCode: 85 });
  await wait(320);
  const k1 = await st();
  ok('键盘 U 也能转层', k1.moves === k0.moves + 1, { a: k0.moves, b: k1.moves });

  /* 11. 做完最后一步 → 胜利面板 */
  await t.ev(`(function () {
    var seq = __cube.scramble(10);
    for (var i = seq.length - 1; i >= 0; i--) {
      __cube.applyTurn({ axis: seq[i].axis, layer: seq[i].layer, dir: -seq[i].dir });
    }
    __cube.apply("U'");
  })()`);
  const near = await st();
  ok('摆成只差 U 一步的状态', near.solved === false, near.solved);
  await pressButton('[data-move=U]', 0.8);
  await wait(360);
  const won = await st();
  ok('最后一步之后判定复原', won.solved === true, won.solved);
  ok('弹出胜利面板', await t.ev('document.getElementById("win").hidden === false'), 'hidden');
  const winSub = await t.ev('document.getElementById("winSub").textContent');
  ok('胜利面板显示用时和步数', /\d/.test(winSub) && winSub.indexOf('步') >= 0, winSub);

  /* 12. 再来一局 */
  await click(...(await t.ev(`(function(){var b=document.getElementById('winAgain').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];})()`)));
  await wait(2200);
  const again = await st();
  ok('「再打乱一局」重新开始', again.phase === 'play' && again.solved === false, again);

  /* 13. 提示：打乱逆序就是现成解法，提示永远有效 */
  async function keyTurn(name) {
    const k = name[0].toLowerCase();
    const shift = name.endsWith("'");
    const code = 'Key' + name[0].toUpperCase();
    const vk = name[0].toUpperCase().charCodeAt(0);
    const mods = shift ? 8 : 0;
    await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await t.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
  }

  await t.ev('__cube.reset()');
  await t.ev('__cube.scramble(8)');
  await wait(100);
  const firstHint = await t.ev('__cube.hintMove()');
  ok('打乱后给出合法提示', /^[UDLRFB]'?$/.test(String(firstHint)), firstHint);
  await pressButton('[data-act=hint]');
  const hintText = await t.ev('document.getElementById("hint").textContent');
  ok('点「提示」显示下一步', String(hintText).indexOf('下一步') >= 0, hintText);

  let hintSteps = 0;
  while (hintSteps < 40) {
    const m = await t.ev('__cube.hintMove()');
    if (!m) break;
    await keyTurn(m);
    await wait(260);
    hintSteps++;
  }
  const hintDone = await st();
  ok('跟着提示一路能复原', hintDone.solved === true, { steps: hintSteps, solved: hintDone.solved });
  ok('走完后提示队列清空', (await t.ev('__cube.stackLen()')) === 0);

  await wait(200);
  ok('整局没有页面异常', t.errors.length === 0, t.errors.slice(0, 3));

  t.close();
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
