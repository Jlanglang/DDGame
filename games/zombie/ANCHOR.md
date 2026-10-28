# 豆豆大战僵尸 · 锚点表
> 改这个游戏先读这一份。约 2300 行（含测试/样式）。通用规则见根 AGENTS.md。

## 一句话
5 行 9 列草坪（1280×720 **横屏**，竖屏会弹「把手机横过来」可跳过）：点卡 → 点空格种豆豆，阳光不够 / 冷却中 / 格子已占都放不下，守住前院 3 波。

## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| data.js | 220 | 纯数据：`LAYOUT` 格子几何、`CARDS` 卡表、`ZOMBIES`、`LEVEL`（三波+阳光），以及点击命中 `cellAt` / `hitPacket` / `hitShovel` |
| sim.js | 518 | **无渲染模拟**，Node 可 `require`：全部玩法规则、波次、伤害。导出 `createMatch / step / useAt / preview / collectSun / sunAt / spawnZombie` |
| game.js | 1015 | 渲染 + 输入 + 主循环 + `mode` 状态机；**一条玩法规则都不写**，全调 `Sim` |
| index.html | 54 | 静态骨架（**不是单片**）：`#game` canvas + 标题/结束/横屏三层 veil + 三个 script（data→sim→game，index.html:50） |
| style.css | 212 | 16:9 舞台自适应（`--u` 单位）、横屏提示、按钮 ≥44px |
| test-sim.js | 268 | Node 自检 36 项，含一个真打到赢的 bot |

## 状态机与主循环
- `mode`：`'title' | 'play' | 'end'`（game.js:21；切在 `startPlay` game.js:85 / `openEnd` game.js:93）；`match.result`：`null | 'win' | 'lose'`
- `match.phase`：`'prelude' | 'spawning' | 'between'`（sim.js:44 初值 prelude）；`match.selected`：`null / 卡 id / 'shovel'`；`waveIndex` 从 -1 起（sim.js:43）
- 主循环 `frame(now)`（game.js:964）：`Sim.step` → `takeEvents()`（game.js:235，事件变浮字/横幅/震屏）→ 结束倒计时 → `render()`（game.js:908）
- `Sim.step` 把 dt 切成 ≤0.05s 子步（sim.js:500）；`stepOnce` 顺序（sim.js:474）：计时+卡 CD → 天降阳光 → `stepPlants` → `stepPeas` → `stepSuns` → `stepZombies` → `stepMowers` → `checkDoors` → 清尸体 → `stepWaves`
- 波次：`phaseT` 归零 → `beginWave`（sim.js:279）把 `spawns` 按 `after` 塞进 queue；queue 空且无存活僵尸 → 下一波；最后一波 → `win`（sim.js:465-470）
- 点击优先级 `onDown`（game.js:138）：阳光（44px 内）→ 卡片 → 铲子 → 格子；右键 / Esc 放下卡（game.js:140、205）

## 想改什么 → 去哪
| 想改 | 动哪 |
|---|---|
| 植物数值（花费/冷却/血量/伤害/射速/炸范围） | data.js:32 `CARDS`；行为只在 `stepPlants` 分支：`sunEvery` sim.js:299、`fuse` sim.js:306、`arm` sim.js:314、`shot` sim.js:318 |
| 僵尸数值（血量/速度/咬伤/频率） | data.js:91 `ZOMBIES`；啃咬+减速在 `stepZombies`（sim.js:380），进门判负 `checkDoors`（sim.js:433） |
| 波次/开场节奏/阳光起步 | data.js:102 `LEVEL`（`waves[].delay`、`spawns[].after`）；推进逻辑 `stepWaves`（sim.js:448） |
| 放置规则与失败文案 | `plant` sim.js:83 / `preview` sim.js:133 / `pickCard` sim.js:56；失败 `reason` 字符串直接被 UI toast（game.js:152） |
| 阳光经济 | 天降 data.js:106-107 + sim.js:481-489；花产 sim.js:299-304；拾取半径 sim.js:162；入账 `collectSun` sim.js:167 |
| 渲染（草坪/房子/僵尸/卡槽） | game.js:588 `drawLawn`、:669 `drawHouse`、:756 `drawBank`、:771 `drawPacket`、:447 `drawZombie`、:297 `drawPlant`；绘制顺序在 `render` game.js:908 |
| 点击手感（悬停/提示/血条） | `drawHover` game.js:836、`showToast` game.js:80、`hpBar` game.js:518、`drawPills` game.js:857 |
| 格子/卡槽尺寸 | data.js:13 `LAYOUT`；改完 `test-sim.js:35` 的对齐断言会先报错，这是好事 |

## 数值都在哪
| 表 | 位置 | 关键字段 = 当前值 |
|---|---|---|
| `CARDS` | data.js:32 | cost 50/100/50/25/175/150（sun/pea/wall/mine/ice/cherry）；cd 5/6/15/16/8/24；hp 300/300/4000/300/300/300；pea shot dmg 22 · interval 1.4 · speed 360；ice slow 3.2；mine arm 14 · boom 1800；cherry fuse 0.85 · boom 1800；sun sunEvery 10 |
| `ZOMBIES` | data.js:91 | normal 200/24/36/0.5、cone 570/24/36/0.5、bucket 1280/24/36/0.5（hp / speed / bite / biteEvery） |
| `LEVEL` | data.js:102 | startSun 150、sunValue 25、sunFallEvery 7.5、firstSun 3.5；三波 delay 16/11/12，spawns 3/5/10 只（第三波 `flag:true`，含 1 只 bucket） |
| `LAYOUT` | data.js:13 | W1280 H720 ROWS5 COLS9 LAWN_X290 COL_W106 ROW_H144 BANK_W112 PACKET_H90 SIDE_W36 |
| 散装数值（不在表里，改要进函数） | — | 割草机 560 px/s（sim.js:423）、减速 ×0.5（sim.js:405）、阳光寿命 14/16s（sim.js:151）、爆炸 ±1 行 ±1 列（sim.js:254-270）、僵尸出场 x=L.W+28（sim.js:184）、啃咬 reach 28 / behind 34（sim.js:231-232） |

## 测试
`node games/zombie/test-sim.js` → 当前 `RESULT pass=36 fail=0 bot=189.9s`。
bot 在 test-sim.js:207 `botAct`，用真实规则自动打完一整局；改数值后它若输了会打印波次/植物/僵尸局面。
不覆盖渲染与真机输入（本目录没有浏览器测试）。

## 雷区
- sim.js:7 注释：种失败**阳光不扣、卡还拿在手里**——`plant` 里先判后扣，别把扣费挪到判断前。
- sim.js:10 / :229：僵尸只走本行，只啃「嘴边这一株」（reach 28 / behind 34），身后的豆豆不挡路。
- sim.js:428：割草机只割扫过的那段，门开后新进门的僵尸要再撞一次才判负（`checkDoors` sim.js:433 兜底）。
- data.js:99：`delay` 第一波从开局算、之后从上一波清完算；`after` 才是相对开波。
- game.js:18 `?fast=` 只快进 sim，所有 UI 计时都除回 FAST（game.js:979、984），新增计时器要照做。
- `CARDS` 顺序 = 卡槽顺序 = 键盘 1-6 = `match.cards` 下标（game.js:208、data.js:178）；换顺序会同时挪卡和快捷键。
