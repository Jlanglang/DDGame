/* 豆豆勇者 · shop 自检（真浏览器，零依赖：CDP over pipe）
   用法：node games/hero/test-shop.js
   从 D:\DP\.tools\hero-shop.js 搬来，只把底座换成 ./test-lib.js，页面地址改成 __dirname。 */
const path = require('node:path');
const { launch, wait } = require('./test-lib');

const PAGE = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?debug=1&skipmenu=1';

(async () => {
  const PAGE_FRESH = PAGE + '&fresh=1';   // 开局清档，测试才有确定性
  const t = await launch(PAGE_FRESH);
  const send = t.send, ev = t.ev, errors = t.errors;

  const checks = [];

  const add = (name, ok, note) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${note}`); };

  // 走到商人旁边
  await ev('__g.player.x = 200; __save.gold = 500; __hero.keys.left = false; __hero.keys.right = false;');
  await wait(300);
  add('靠近商人出现商店提示', (await ev('!document.getElementById("shopTip").hidden')) === true, 'shopTip 可见');

  // 点提示开商店
  await ev('document.getElementById("shopTip").click()');
  await wait(200);
  add('商店打开并暂停', (await ev('__g.shopOpen')) === true, 'shopOpen=true');

  // 买药水
  const beforePot = await ev('JSON.stringify({p: __save.potions, g: __save.gold})');
  await ev('document.getElementById("shopPotion").click()');
  await wait(150);
  const afterPot = await ev('JSON.stringify({p: __save.potions, g: __save.gold})');
  console.log('买药水', beforePot, '→', afterPot);
  add('买药水扣钱加库存', JSON.parse(afterPot).p > JSON.parse(beforePot).p && JSON.parse(afterPot).g < 500, afterPot);

  // 关闭商店
  await ev('document.getElementById("shopClose").click()');
  await wait(200);
  add('关闭商店恢复游戏', (await ev('__g.shopOpen')) === false, 'shopOpen=false');

  // 自动喝药：血量压到 25%
  const potionsBefore = await ev('__save.potions');
  await ev('__g.player.hp = __g.player.maxHp * 0.25; __g.player.potionCd = 0;');
  await wait(350);
  const afterHeal = await ev('JSON.stringify({hp: Math.round(__g.player.hp), max: Math.round(__g.player.maxHp), potions: __save.potions, cd: +__g.player.potionCd.toFixed(1)})');
  console.log('自动喝药', afterHeal);
  const ah = JSON.parse(afterHeal);
  add('低血量自动喝药', ah.potions === potionsBefore - 1 && ah.hp > ah.max * 0.25, afterHeal);
  add('喝药进入 10 秒 CD', ah.cd > 8, `cd=${ah.cd}`);

  // CD 中再压血，不应该再喝
  const potionsMid = await ev('__save.potions');
  await ev('__g.player.hp = __g.player.maxHp * 0.2;');
  await wait(350);
  const noDouble = await ev('__save.potions');
  add('CD 中不会连喝', noDouble === potionsMid, `potions=${noDouble}`);

  add('无异常', errors.length === 0, errors.join(' | ') || 'ok');

  const failed = checks.filter((c) => !c.ok);
  console.log(`RESULT ${failed.length === 0 ? 'PASS' : 'FAIL'} (${checks.length - failed.length}/${checks.length})`);
  t.close();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
