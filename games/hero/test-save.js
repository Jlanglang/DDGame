/* 豆豆勇者 · save 自检（真浏览器，零依赖：CDP over pipe）
   用法：node games/hero/test-save.js
   从 D:\DP\.tools\hero-save.js 搬来，只把底座换成 ./test-lib.js，页面地址改成 __dirname。 */
const path = require('node:path');
const { launch, wait } = require('./test-lib');

const PAGE = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?debug=1&skipmenu=1';

(async () => {
  const PAGE_FRESH = PAGE + '&fresh=1';   // 开局清档，测试才有确定性
  const t = await launch(PAGE_FRESH);
  const send = t.send, ev = t.ev, errors = t.errors;

  const checks = [];

  const add = (name, ok, note) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${note}`); };

  const s0 = await ev('JSON.stringify(__save)');
  console.log('初始存档', s0);
  add('初始存档为空', JSON.parse(s0).exp === 0 && JSON.parse(s0).weapon === 0, s0);

  // 直接进 BOSS 图，把 BOSS 血量压低，追着砍
  await ev(`(() => {
    __hero.enterStage(1);
    __g.boss.hp = 10;
    setInterval(() => {
      const b = __g.boss;
      if (!b) return;
      const dx = b.x - __g.player.x;
      __hero.keys.right = dx > 40;
      __hero.keys.left = dx < -40;
    }, 80);
    setInterval(() => __hero.attack(), 160);
    return 'ok';
  })()`);

  let won = false;
  for (let i = 0; i < 40; i++) {
    await wait(250);
    if (await ev('__g.state') === 'win') { won = true; break; }
  }
  add('击败 BOSS 触发结算', won, won ? 'state=win' : 'timeout');

  await ev('__hero.keys.right = false; __hero.keys.left = false;');
  const after = await ev('JSON.stringify({save: __save, gainedExp: __g.gainedExp, gainedGold: __g.gainedGold, gainedSp: __g.gainedSp})');
  console.log('结算后', after);
  const a = JSON.parse(after);
  add('经验入账', a.save.exp > 0 && a.gainedExp > 0, `exp=${a.save.exp}`);
  add('金币入账', a.save.gold > 0 && a.gainedGold > 0, `gold=${a.save.gold}`);
  add('技能点入账', a.save.sp > 0, `sp=${a.save.sp}`);

  const growText = await ev('document.getElementById("growStats").textContent');
  add('整备面板显示属性', /Lv\.\d+/.test(growText), growText);

  // 给足金币，试买武器
  await ev('__save.gold = 500; __refreshGrow();');
  const beforeBuy = await ev('JSON.stringify({gold: __save.gold, weapon: __save.weapon})');
  await ev('document.getElementById("buyWeapon").click()');
  await wait(150);
  const afterBuy = await ev('JSON.stringify({gold: __save.gold, weapon: __save.weapon})');
  console.log('买武器', beforeBuy, '→', afterBuy);
  add('买武器扣钱升级', JSON.parse(afterBuy).weapon === 1 && JSON.parse(afterBuy).gold < 500, afterBuy);

  // 分配技能点
  const spBefore = await ev('__save.sp');
  await ev('document.getElementById("spAtk").click()');
  await wait(150);
  const spAfter = await ev('JSON.stringify({sp: __save.sp, atkSp: __save.atkSp})');
  console.log('分配技能点', spBefore, '→', spAfter);
  add('技能点加到攻击', JSON.parse(spAfter).atkSp === 1 && JSON.parse(spAfter).sp === spBefore - 1, spAfter);

  // 重开：玩家属性应该按存档提升
  await ev('document.getElementById("again").click()');
  await wait(400);
  const p = await ev('JSON.stringify({atk: __g.player.atk, maxHp: __g.player.maxHp, level: __g.player.level, state: __g.state})');
  console.log('重开后玩家', p);
  const pp = JSON.parse(p);
  add('重开后攻击提升', pp.atk >= 28 + 5 + 2, p);
  add('重开后等级保留', pp.level >= 2, p);

  // 刷新页面：存档还在（注意别带 fresh=1，那会主动清档）
  await send('Page.navigate', { url: PAGE });
  await wait(500);
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__g')) break; await wait(100); }
  const reloaded = await ev('JSON.stringify({weapon: __save.weapon, atkSp: __save.atkSp, exp: __save.exp})');
  console.log('刷新后存档', reloaded);
  add('刷新后存档保留', JSON.parse(reloaded).weapon === 1 && JSON.parse(reloaded).atkSp === 1, reloaded);
  const p2 = await ev('__g.player.atk');
  add('刷新后属性仍提升', p2 >= 28 + 5 + 2, `atk=${p2}`);

  add('无异常', errors.length === 0, errors.join(' | ') || 'ok');

  const failed = checks.filter((c) => !c.ok);
  console.log(`RESULT ${failed.length === 0 ? 'PASS' : 'FAIL'} (${checks.length - failed.length}/${checks.length})`);
  t.close();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
