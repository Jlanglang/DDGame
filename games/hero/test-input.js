/* 豆豆勇者 · 横屏输入自检（真浏览器，零依赖：CDP over pipe）
   用法：node games/hero/test-input.js
   视口 844×390（手机横屏），坐标全部从 DOM 实测，不写死。
   验证：拖动移动、跳跃 / 攻击 / 技能按钮、键盘、暂停、无异常。
   从 D:\DP\.tools\hero-test.js 搬来（那份的默认地址还指着已冻结的 D:\DP\doudou-hero）。 */
const path = require('node:path');
const { launch, wait } = require('./test-lib');

const PAGE = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?debug=1&skipmenu=1';

async function main() {
  const t = await launch(PAGE);
  const { send, ev, errors } = t;

  const snap = () => ev(`(() => {
    const g = window.__g, p = g && g.player;
    return p ? {
      x: Math.round(p.x), y: Math.round(p.y),
      onGround: p.onGround, hp: Math.round(p.hp),
      attackT: +p.attackT.toFixed(3), skillCd: +p.skillCd.toFixed(2),
      state: g.state, kills: g.kills, enemies: g.enemies.length,
    } : null;
  })()`);
  const center = (sel) => ev(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
  })()`);

  const canvasRect = await ev(`(() => { const r = document.getElementById('game').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
  const atk = await center('#btnAtk');
  const jumpBtn = await center('#btnJump');
  const skill = await center('#btnSkill');
  console.log('舞台', JSON.stringify(canvasRect), '按钮', JSON.stringify({ atk, jumpBtn, skill }));

  const checks = [];
  const add = (name, ok, note) => {
    checks.push({ name, ok, note });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${note}`);
  };

  const s0 = await snap();
  console.log('初始', JSON.stringify(s0));

  // ---- 1. 拖动移动 ----
  const rightX = Math.round(canvasRect.x + canvasRect.w * 0.72);
  const leftX = Math.round(canvasRect.x + canvasRect.w * 0.12);
  const touchY = Math.round(canvasRect.y + canvasRect.h * 0.46);

  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rightX, y: touchY }] });
  await wait(600);
  const sRight = await snap();
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: leftX, y: touchY }] });
  await wait(600);
  const sLeft = await snap();
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(150);

  add('触摸向右移动', sRight.x > s0.x + 60, `x ${s0.x} → ${sRight.x}`);
  add('触摸向左移动', sLeft.x < sRight.x - 60, `x ${sRight.x} → ${sLeft.x}`);

  // ---- 2. 跳跃 ----
  const beforeJump = await snap();
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jumpBtn.x, y: jumpBtn.y }] });
  await wait(60);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(130);
  const midJump = await snap();
  add('跳跃按钮离地', midJump.y < beforeJump.y - 20 || !midJump.onGround,
    `y ${beforeJump.y} → ${midJump.y}, onGround=${midJump.onGround}`);
  await wait(900);

  // ---- 3. 攻击 ----
  const beforeAtk = await snap();
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: atk.x, y: atk.y }] });
  await wait(90);
  const midAtk = await snap();
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  add('攻击按钮触发', midAtk.attackT > 0 || midAtk.attackT !== beforeAtk.attackT, `attackT=${midAtk.attackT}`);

  // ---- 4. 技能 ----
  await wait(900);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: skill.x, y: skill.y }] });
  await wait(90);
  const midSkill = await snap();
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  add('技能按钮触发', midSkill.skillCd > 6, `skillCd=${midSkill.skillCd}`);
  await wait(2200);

  // ---- 5. 键盘 ----
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
  await wait(450);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
  const sKey = await snap();
  add('键盘 D 向右移动', sKey.x > midSkill.x + 40, `x ${midSkill.x} → ${sKey.x}`);

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await wait(90);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  const sSpace = await snap();
  add('空格跳跃', !sSpace.onGround || sSpace.y < 600, `y=${sSpace.y} onGround=${sSpace.onGround}`);
  await wait(700);

  // ---- 6. 暂停（P 键，界面上没有按钮） ----
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
  await wait(200);
  add('按 P 暂停', (await ev('__g.paused')) === true, 'paused=true');
  add('暂停遮罩可见', (await ev('!document.getElementById("pauseVeil").hidden')) === true, 'veil 可见');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
  await wait(150);
  add('再按 P 继续', (await ev('__g.paused')) === false, 'paused=false');

  // ---- 7. 无异常 ----
  add('无页面异常', errors.length === 0, errors.slice(0, 3).join(' | ') || 'ok');

  const rects = await ev(`({
    atk: +document.getElementById('btnAtk').getBoundingClientRect().width.toFixed(1),
    jump: +document.getElementById('btnJump').getBoundingClientRect().width.toFixed(1),
    skill: +document.getElementById('btnSkill').getBoundingClientRect().width.toFixed(1),
  })`);
  console.log('按钮 CSS 尺寸', JSON.stringify(rects), '（触摸目标应 ≥ 44）');

  const failed = checks.filter((c) => !c.ok);
  console.log(`RESULT ${failed.length === 0 ? 'PASS' : 'FAIL'} (${checks.length - failed.length}/${checks.length})`);
  t.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

