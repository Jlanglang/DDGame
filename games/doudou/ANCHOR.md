# 守护豆豆 · 锚点表
> 改这个游戏先读这一份。实测约 4800 行（含 CSS；旧文档写的 4150 已过时）。通用规则见根 AGENTS.md。

## 一句话
外星人从桥那头一排排压下来，豆豆自动开火、玩家只能左右拖；子弹打在「卡」上才算喂，桥头 9 血，8 波杂兵 + 第 9 波 BOSS。

## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| `game.js` | 1460 | 全部玩法：BAL / 波次 / 卡片 / 子弹 / 渲染 / 输入 / 暂停 |
| `index.html` + `style.css` | 51 / 364 | DOM（`#game` `#pause` `#hpFill` `#buffs` `#over`）+ 720:1600 舞台、`touch-action`、HUD 样式 |
| `headless.js` | 352 | 无渲染模拟器（假 DOM + 固定步长），`--bal` 覆盖 BAL |
| `test-input.js` / `wave-time.js` / `win-time.js` | 123 / 57 / 35 | 真浏览器输入；每波耗时；胜负时长 |
| `squad.js` 等子玩法文件 | 1822 起 | 编队玩法，见文末与 SQUAD.md |

## 状态机与主循环
- 状态在 `G`（`game.js:111`）：`G.state` **实际只有** `'playing' | 'over'`，`G.result` 为 `null | 'win' | 'lose'`。注释里的 `'upgrade'`（`game.js:112`）是旧版残留，`#upgrade` 永远不会显示。
- 启动 `reset()`（`game.js:1453`，定义在 `game.js:836`）→ `startWave()`（`game.js:288`）→ `startNextWave()`（`game.js:454`）。
- 主循环 `frame()`（`game.js:1316`）：dt 上限 0.05s，再乘 `FAST`（`?fast=1..8`，`game.js:1314`）；未暂停才 `update(dt)`（`game.js:885`）。
- 每帧顺序：`updateSpawner`（`game.js:486`）→ `updateEnemies`（`game.js:558`）→ `updateCards`（`game.js:598`）→ `updatePlayer`（`game.js:503`）→ `updateBullets`（`game.js:686`）→ `updateParticles`（`game.js:788`）。失败在 `updateEnemies` 里直接 `return` 打断；击杀 BOSS 在 `hitEnemy` 里调 `win()` 当场判胜（本帧剩余子弹仍会走完）。
- 渲染 `render()`（`game.js:909`）：地面 → 桥 → 路障 → 敌人 → 卡 → 子弹 → 玩家 → 粒子（卡在子弹/玩家之前画）。

## 想改什么 → 去哪
| 想改 | 去哪 |
|---|---|
| 数值平衡 | `BAL`（`game.js:27`）唯一入口，模拟器可 `--bal`，真实构建认 `window.__BALANCE`（`game.js:62`）；例外：玩家移速 660 硬编码在 `game.js:133` 和 `game.js:857`，两处同改 |
| 每波人数 / 阵型 | `WAVE_SCHEDULE`（`game.js:228`）+ `formationCells`（`game.js:239`）+ 站位 `laneX`（`game.js:263`） |
| 波次推进 / 休息 / BOSS 登场 | `startNextWave`（`game.js:454`，`G.round > BAL.waves` 出 BOSS）、`updateSpawner`（`game.js:486`） |
| 出卡规则 / 权重 / 前两对固定 | `ensureCards`（`game.js:408`）、`spawnCard`（`game.js:357`）、`CARD_TYPES`（`game.js:85`） |
| 卡片数值范围 / 吃卡效果 | `cardRange`（`game.js:400`）、`applyCard`（`game.js:645`）、一次只吃一张在 `updateCards`（`game.js:598`） |
| 子弹命中 / 穿透 / 卡挡子弹 | `shoot`（`game.js:526`）、`updateBullets`（`game.js:686`）、`hitEnemy`（`game.js:748`） |
| 画面（人 / 怪 / 卡 / 桥） | `stick`（`game.js:1019`）、`drawPlayer`（`game.js:1076`）、`drawEnemies`（`game.js:1117`）、`drawCards`（`game.js:1203`）、`drawBridge`（`game.js:934`）、`drawBarricade`（`game.js:986`） |
| 输入（触摸 / 鼠标 / 键盘） | `startDrag` `game.js:1368`、`moveDrag` `game.js:1384`、`endDrag` `game.js:1390`、`moveToClientX` `game.js:1362`；键盘 `game.js:1338` |
| HUD / 结算 / 存档 / 音效 | `syncHud`（`game.js:274`）、`syncBuffs`（`game.js:1270`）、`win` `game.js:808` / `lose` `game.js:822`、暂停 `game.js:170`；**存档和音效都没有**（无 localStorage、无 WebAudio） |

## 数值都在哪（BAL，`game.js:27`）
| 字段 | 值 | 字段 | 值 |
|---|---|---|---|
| `playerHp` 桥头血 | 9 | `waves` 杂兵波数 | 8 |
| `hpBase` / `hpGrowth` | 36 / 2.05 | `bossMul` | 10 |
| `gruntSpeed` / `bossSpeed` | 86 / 42 | `waveGap` / `waveGapFirst` | 0.8 / 1.4 |
| `baseRate` / `rateStep` / `rateMaxTier` | 5.5 / 0.2 / 40 | `dmgBase` / `dmgCapBase` / `dmgCapGrowth` | 12 / 65 / 1.45 |
| `cardCd` / `cardSpeed` | 14 / 230 | `noAtkBefore` | 3 |
| `atkMin` / `atkMax` / `shotsMin` / `shotsMax` | -29 / 12 / -24 / 5 | `weights` | dmgAdd 48、rateMul 25、shots 15、dmgMul 12 |

## 测试
- `node games/doudou/test-input.js` → 期望 `RESULT pass=4 fail=0`（触摸 192 / 鼠标 240 逻辑 px）。
- `node games/doudou/headless.js --runs 40 --policy feed` → 实测 wins 27/40、avgT 96.61s、avgWave 8.63（基线约 100s / 60~70%）。
- `node games/doudou/wave-time.js 16 feed`、`node games/doudou/win-time.js 40 feed`、`node games/doudou/test-squad.js`；调参先用 `--bal "{\"hpGrowth\":2.2}"` 覆盖，别改文件。

## 雷区
- 注释按 10 波写的：`game.js:453`、`wave-time.js:55` 把 `k===11` 当 BOSS；实际 `BAL.waves=8`，BOSS 是第 **9** 波，wave-time 输出里会显示成 `w9`。
- 伤害天花板只拦攻击卡（`game.js:663`）；`dmgAdd` 直接加（`game.js:657`），可以超过 `damageCap`。
- 子弹打卡的判定高度 ±48（`game.js:707`）与卡绘制高度 94（`game.js:1205`）是两处，改卡高要同步。
- headless 两处硬耦合：`headless.js:213` 靠字符串替换剥掉 `syncBuffs();\n    render();`（改 `frame` 顺序/缩进会静默失效）；feed 策略站位写死 138/582（`headless.js:202`），与 `BRIDGE`（`game.js:14`）/ `clampX`（`game.js:499`）重复，改桥宽要同步。
- 测试脚本硬编码：`wave-time.js:20` / `win-time.js:19` 解析 headless 文本日志（改日志格式会挂）；`test-input.js:99` 的 192/240 按 450 CSS 宽算（改舞台比例或初始位置会误报）。

## 子玩法 squad
入口 `index.html:15`（`squad.html`）。`squad.js` 独立 IIFE：`G.phase = prep | battle | win | over`（`squad.js:123`），数值全在 `TUNE`（`squad.js:69`），跨局等级存 `doudou.squad.lv`（`squad.js:97`）。
它和经典模式互不影响。玩法 / 占格 / 养成 / 模拟结论**详见 SQUAD.md**，本篇不重复。
