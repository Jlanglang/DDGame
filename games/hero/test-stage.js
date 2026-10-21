/* 豆豆勇者 · stage 自检（真浏览器，零依赖：CDP over pipe）
   用法：node games/hero/test-stage.js
   从 D:\DP\.tools\hero-stage.js 搬来，只把底座换成 ./test-lib.js，页面地址改成 __dirname。 */
const path = require('node:path');
const { launch, wait } = require('./test-lib');

const PAGE = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?debug=1&skipmenu=1';

(async () => {
  const t = await launch(PAGE);
  const send = t.send, ev = t.ev, errors = t.errors;

  const checks = [];

  const add = (name, ok, note) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${note}`); };

  // 传送门常驻，不用杀满
  await wait(300);
  const portal = await ev('__g.portal ? {x: __g.portal.x, to: __g.portal.to} : null');
  add('传送门常驻', !!portal && portal.x === 3040 && portal.to === 1, JSON.stringify(portal));

  // 一路向右跑到传送门
  await ev('__hero.keys.right = true;');
  let entered = false;
  for (let i = 0; i < 24; i++) {
    await wait(400);
    const s = await ev('({stage: __g.stage, x: Math.round(__g.player.x), fade: +__g.fade.toFixed(2), boss: !!__g.boss})');
    if (s.stage === 1) { entered = true; console.log('进入巢穴', JSON.stringify(s)); break; }
  }
  add('走到传送门后切到巢穴', entered, entered ? 'stage=1' : 'timeout');

  await ev('__hero.keys.right = false;');
  await wait(800);
  const s1 = await ev('({stage: __g.stage, cam: Math.round(__g.camX), boss: __g.boss ? {x: Math.round(__g.boss.x), hp: Math.round(__g.boss.hp)} : null, px: Math.round(__g.player.x), world: __g.worldW, platforms: __g.platforms.length, enemies: __g.enemies.length})');
  console.log('巢穴状态', JSON.stringify(s1));
  add('巢穴里生成了 BOSS', !!s1.boss && s1.boss.hp > 0, JSON.stringify(s1.boss));
  add('巢穴地图变小', s1.world === 1500 && s1.platforms === 2, `world=${s1.world}, platforms=${s1.platforms}`);
  add('巢穴不刷小怪', s1.enemies === 0, `enemies=${s1.enemies}`);

  add('无异常', errors.length === 0, errors.join(' | ') || 'ok');

  const failed = checks.filter((c) => !c.ok);
  console.log(`RESULT ${failed.length === 0 ? 'PASS' : 'FAIL'} (${checks.length - failed.length}/${checks.length})`);
  t.close();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
