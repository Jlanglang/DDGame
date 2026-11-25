# 守护豆豆 · 锚点表
> 改这个游戏先读这一份。实测约 4800 行（含 CSS；旧文档写的 4150 已过时）。通用规则见根 AGENTS.md。

## 一句话
外星人从桥那头一排排压下来，豆豆自动开火、玩家只能左右拖；子弹打在「卡」上才算喂，桥头 9 血，8 波杂兵 + 第 9 波 BOSS。

## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| `game.js` | 1912 | 全部玩法：BAL / 波次 / 卡片 / 子弹 / 渲染 / 输入 / 暂停 |
| `index.html` + `style.css` | 51 / 364 | DOM（`#game` `#pause` `#hpFill` `#buffs` `#over`）+ 720:1600 舞台、`touch-action`、HUD 样式 |
| `headless.js` | 352 | 无渲染模拟器（假 DOM + 固定步长），`--bal` 覆盖 BAL |
| `test-input.js` / `wave-time.js` / `win-time.js` | 123 / 57 / 35 | 真浏览器输入；每波耗时；胜负时长 |
| `squad.js` 等子玩法文件 | 2450 起 | 编队玩法，见文末与 SQUAD.md |

## 状态机与主循环
- 状态在 `G`（`game.js:133`）：`G.state` **实际只有** `'playing' | 'over'`，`G.result` 为 `null | 'win' | 'lose'`。注释里的 `'upgrade'`（`game.js:134`）是旧版残留，`#upgrade` 永远不会显示。
- 启动 `reset()`（`game.js:1016`，定义在 `game.js:1016`）→ `startWave()`（`game.js:322`）→ `startNextWave()`（`game.js:496`）。
- 主循环 `frame()`：dt 上限 0.05s，再乘 `FAST`（`?fast=1..8`）；未暂停才 `update(step)`；击杀/BOSS 时 `G.hitstop` 把 `step` 压到 0.05 倍、按真实时间倒计（headless 也走 `frame()`，只是 `render()` 被剥掉，所以模拟计时会略长）。
- 每帧顺序：`updateSpawner`（`game.js:528`）→ `updateEnemies`（`game.js:620`）→ `updateCards`（`game.js:673`）→ `updatePlayer`（`game.js:545`）→ `updateBullets`（`game.js:761`）→ `updateParticles`（`game.js:925`）。失败在 `updateEnemies` 里直接 `return` 打断；击杀 BOSS 在 `hitEnemy` 里调 `win()` 当场判胜（本帧剩余子弹仍会走完）。
- 渲染 `render()`（`game.js:1093`）：地面 → 桥 → 路障 → 敌人 → 卡 → 子弹 → 玩家 → 粒子（卡在子弹/玩家之前画）。

## 想改什么 → 去哪
| 想改 | 去哪 |
|---|---|
| 数值平衡 | `BAL`（`game.js:37`）唯一入口，模拟器可 `--bal`，真实构建认 `window.__BALANCE`（`game.js:84`）；例外：玩家移速 660 硬编码在 `game.js:158` 和 `game.js:1038`，两处同改 |
| 每波人数 / 阵型 | `WAVE_SCHEDULE`（`game.js:262`）+ `formationCells`（`game.js:273`）+ 站位 `laneX`（`game.js:297`） |
| 波次推进 / 休息 / BOSS 登场 | `startNextWave`（`game.js:496`，`G.round > BAL.waves` 出 BOSS）、`updateSpawner`（`game.js:528`） |
| 出卡规则 / 权重 / 前两对固定 | `ensureCards`（`game.js:450`）、`spawnCard`（`game.js:399`）、`CARD_TYPES`（`game.js:107`） |
| 卡片数值范围 / 吃卡效果 | `cardRange`（`game.js:442`）、`applyCard`（`game.js:720`）、一次只吃一张在 `updateCards`（`game.js:673`） |
| 子弹命中 / 穿透 / 卡挡子弹 | `shoot`（`game.js:587`）、`updateBullets`（`game.js:761`）、`hitEnemy`（`game.js:823`） |
| 打击感 | `hitEnemy`：闪白（`liftHex` 提亮身体）、火花 `impactSparks`、该怪顿挫 `hitStun`、压扁回推、抛物线飘字 `spawnFloat`；**击杀** → `killFreeze` 顿帧 + 冲击环，**BOSS** → `bossFreeze` + 大环（2026-11-16）；无整屏震 |
| 画面（人 / 怪 / 卡 / 桥） | `stick`（`game.js:1401`）、`drawPlayer`（`game.js:1514`）、`drawEnemies`（`game.js:1554`）、`drawCards`（`game.js:1614`）、`drawBridge`（`game.js:1126`）、`drawBarricade`（`game.js:1215`） |
| 输入（触摸 / 鼠标 / 键盘） | `startDrag` `game.js:1822`、`moveDrag` `game.js:1838`、`endDrag` `game.js:1844`、`moveToClientX` `game.js:1813`；键盘 `game.js:1791` |
| HUD / 结算 / 存档 / 音效 | `syncHud`（`game.js:308`）、`syncBuffs`（`game.js:1711`）、`win` `game.js:988` / `lose` `game.js:1002`、暂停 `game.js:206`；**存档和音效都没有**（无 localStorage、无 WebAudio） |

## 数值都在哪（BAL，`game.js:37`）
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
- `node games/doudou/headless.js --runs 40 --policy feed` → 实测 wins 26/40、avgT 100.08s、avgWave 8.63（顿帧会让模拟计时略长；仍落在基线约 100s / 60~70% 内）。
- `node games/doudou/wave-time.js 16 feed`、`node games/doudou/win-time.js 40 feed`、`node games/doudou/test-squad.js`；调参先用 `--bal "{\"hpGrowth\":2.2}"` 覆盖，别改文件。

## 雷区
- 注释按 10 波写的：`game.js:453`、`wave-time.js:55` 把 `k===11` 当 BOSS；实际 `BAL.waves=8`，BOSS 是第 **9** 波，wave-time 输出里会显示成 `w9`。
- 伤害天花板只拦攻击卡（`game.js:663`）；`dmgAdd` 直接加（`game.js:657`），可以超过 `damageCap`。
- 子弹打卡的判定高度 ±48（`game.js:707`）与卡绘制高度 94（`game.js:1205`）是两处，改卡高要同步。
- headless 两处硬耦合：`headless.js:213` 靠字符串替换剥掉 `syncBuffs();\n    render();`（改 `frame` 顺序/缩进会静默失效）；feed 策略站位写死 138/582（`headless.js:202`），与 `BRIDGE`（`game.js:14`）/ `clampX`（`game.js:499`）重复，改桥宽要同步。
- 测试脚本硬编码：`wave-time.js:20` / `win-time.js:19` 解析 headless 文本日志（改日志格式会挂）；`test-input.js:99` 的 192/240 按 450 CSS 宽算（改舞台比例或初始位置会误报）。

## 子玩法 squad
入口 `index.html:15`（`squad.html`）。**两个文件**：`squad-data.js`（数值/兵种/稀有度/BOSS，纯数据）
+ `squad.js`（逻辑/渲染，独立 IIFE，`G.phase = prep | battle | choose | win | over`）。
`G` 状态里 `spawnLeft/bossKind` 管出怪；**跨局存档在 `doudou.squad.save.v4`**（最高关 / 已通关 / 点数 / 属性点 / 技能点 / 统计），
v3（等级点）/ v2 / v1 和旧 key `doudou.squad.lv` / `doudou.squad.stage` 只用于首次迁移。
它和经典模式互不影响。玩法 / 占格 / 养成 / 模拟结论**详见 SQUAD.md**，本篇不重复。

**强化点与存档（2026-11-20 v0.16：1 点 = 1 级，属性加点）**：
- `SAVE = { v:4, highest, cleared[5], pts, attrs[10]{dmg,hp,def}, mastery[10], stats }`；没有军功 / 商店 / 抽奖。
- `attrsOf(kind)` / `totalPointsOf(kind)`：每兵种三项已加点数；「等级」= 1 + 总点，只是展示名。
- `attrCap()`：本世界单兵总点上限，按已通关数查 `TUNE.attrCapByCleared`（4/8/12/16/20）；
  单项上限 `TUNE.attrCapEach`（每项 10 点）。
- `spendAttr(kind, stat)`：花 1 点加一项（`dmg` / `hp` / `def`）；点数不够、单项满、总点满都返回 false。
  攻击/血量每点 +`TUNE.attrPct`（20%）兵种基数；防御每点 +`TUNE.defPct`（2%）减伤，和工程师光环合计封顶 45%。
- `dmgMul / hpMul / defMul(kind)`：战斗公式吃这三条；`maxStarOf(kind)` 按总点：0 点 3 星、2 点 4 星、4 点 5 星。
- `finishRun(win)`：通关标记、首通发 `TUNE.pointsPerStage[stage-1]`（6/8/10/12/14）到 `SAVE.pts`、
  写统计、`refreshAttrs()`、`saveGame()`；`lose()` / 最后一波 `settleWave()` 调，`G.finished` 防重复。
- `ensureSave`：v3（spent 等级点）/v2/v1 → v4 迁移，老档等级点全折算成攻击点；cleared 截到 5 关。
- 面板左上 `SAVE_BTN` / `LOAD_BTN`：`exportSave()` 复制 JSON；`importSave()` →
  `ensureSave` → 换 `SAVE/HIGHEST` → `refreshAttrs` → `G.stage=HIGHEST` → `saveGame` → `restart`。
- 别混：`attrs[i]` 是**跨局属性点**（攻/血/防，总点上限 4–20），`G.level` 是每关的升级等级（上限 10）。

**竖屏定版（2026-11-20，已做）**：
- 舞台 `W=720, H=1440`（1:2），`squad.css` 覆盖 `style.css`：`width: min(100vw, 100dvh*0.5)`。
- **上 2/3 战场（0..960）+ 下 1/3 准备区（960..1440）**，`SPLIT_Y = 960`；
  上半是一整块（留给背景图），下半放金币 / 3 个待命位 / 按钮。
- 战场格子 **5 列 × 7 行**：`GRID`（`cols=5, rows=7, cell=56`，`x=16, y=284`）**占宽 280 ≈ 屏幕 40%**，街道 60%；
  初始只开**前排 3×3**（右侧、行居中），靠刷新抽到的「格子卡」往上下/左侧解锁（`G.open[]` / `resetOpen` / `placeCell`）。
  单位直径约 38、敌人 r18（直径 36），小 BOSS r26、大 BOSS r38。
- 下准备区：金币条 `COIN`（y=968）；3 个待命位 `BENCH`（190×200，y=1028，框最长边适配 `BENCH_FIT=160`）；
  刷新 / 开战按钮 `BTN`（y=1248，110 高）。没有基地血条；单位详情在养成面板的详情页里。
- 顶栏：倍速 `SPEED_BTN`（x=350）、养成 `PANEL_BTN`（x=470）、音效 `MUTE_BTN`（x=592）。
- 第一世界 5 关 × 15 波（`TUNE.stages/waves`，`TUNE.worldName='街区'`）；`G.stage` 当前关，`nextStage` 推进并落盘，`HIGHEST` 是已解锁最高关。
- 10 个英雄在 `squad-data.js` 的 `KINDS`，`unlock` 字段 = 第几关起可抽；`randomKind` / `rollUpgrades` 只出已解锁的。
- 辅助英雄光环：`countAux` 统计场上医务兵/工程师/战争顾问/鼓号手，`update` 里回血/产币，`unitRate` 吃鼓号手，`damageUnit` 吃工程师减伤。

**待命位（2026-11-20，替代卡片）**：
- `benchRects()` 返回 3 个待命位的命中区（整块可点/可拖）；`benchCenter()` 是展示中心。
- **不是卡片**：`drawBench()` 只画很淡的底板 + 虚线；单位由 render 用 `drawUnit(..., benchUnitScale(u), false)`
  画，**和战场完全同一套**（稀有度框 + 角标 + 枪管）；`benchUnitScale` 把框最长边适配到 160。
- 交战中（`G.phase === 'battle'`）待命位换成一条状态带。

**稀有度（2026-11-20）**：
- `RARITY` 在 `squad-data.js`；`rarityOf(star)` 取档；单位框在 `drawUnit()` 开头（半透明底 + 稀有度色描边 + shadowBlur 发光）。
- 角标 `drawRarityBadge()` 同时用在场上单位和待命位；星级越高框越粗、光越强。

**BOSS（2026-11-20）**：
- `squad-data.js` 的 `BOSS`：`minor.waves = [5,10,15]`（血×28、r26、armor 8%）、`major.wave = 20`（血×60、r38、armor 18%）。
- `startBattle()` 设 `G.bossKind` 并把 BOSS 计入 `spawnLeft`（BOSS 不占小兵名额）；`updateSpawn()` 在 `spawnLeft === 1` 时生成 BOSS 压轴。
- `spawnEnemy(bossKind)` 按 BOSS 参数放大血量/攻击/半径，`y` 在战场上随机（不是固定中排）；`drawEnemy()` 画外圈光环 + 头顶双角 + 加宽血条。
- 进度条上的 BOSS 波标记在 `drawHud()`；**漏怪即输在 `updateEnemies()`**（BOSS 也一样）。

**弹道、伤害数字与卡死兜底（2026-11-20）**：
- `fire()` 的瞄准角必须从**子弹出生点**（枪口）算，不是单位中心；只有霰弹兵（`id === 'shot'`）是真扇形，其余多弹道都瞄同一目标。
- `updateBullets()` 用**线段扫掠**（`distPointSeg`，上一帧 → 这一帧）判定命中，不是只看落点：
  敌人 r=18 时子弹一帧也能飞过去，点判定会整发打空——这是「只有子弹没伤害」的根因。
- 命中时 `addFloat()` 飘伤害数字（3 星金色 / 5 星更大，限流 48 条），溅射也飘。
- `update()` 里 `G.battleT > 90` 强制结算这一波，防止「打不中 / 医护回血打不死」导致永久卡在交战中。
- **倍速**：`frame()` 里战斗阶段按 `G.speed`（1/2/3）多跑几步固定步长，不改 dt，弹道不会穿透；
  `SPEED_BTN` 点击循环，准备阶段只改设置。
- `settleWave()` 开头清空 `bullets / bits / floats / rings / enemies`，回准备不留上一波的子弹和尸体。

**操作与刷新（对齐原版）**：
- 输入：`onDown/onMove/onUp` 用 10 CSS px 移动距离区分点击和拖拽。
  点按选中后，点空地/空格走 `drop()`——和拖拽**同一条落点逻辑**（吸附 / 合成 / 最近合法位），不再只支持拖。
- 倍速：`SPEED_BTN` 点击 `G.speed` 在 1/2/3 循环；`frame()` 只在战斗阶段多跑几步。
- 待命区自动合成：`autoMergeBench`，刷新/拖回后触发；`dropToBench` 支持「场上拖回」和「占用槽合成」。
- 待命区不保留：`startBattle` 里 `G.bench.fill(null)`（开战清空），`refresh` 换候选时也整批换掉。
- 刷新：`refreshPrice` = 10 + 次数×5（每波重置）；`refresh` 直接换掉整批候选（`benchCandidateCount` 给 2/3 个）。
  **每波结束自动免费刷一次**：`settleWave()` → `rollBench()`，并把 `refreshCount` 归零。
- 候选星级：`maxBenchStar()` 前 2 关只出 1 星；第 2 关起 2 星、第 4 关起 3 星（4/5 星只能合成）。
- 反馈不用整屏抖/闪：合成是本体闪白 + 扩散环（`G.rings`）+ 粒子；漏怪是基地线红脉冲（`G.baseHit`）+ 判负；敌人受击闪白 `e.hitT`。
- **金币只有三源**：战争顾问上场每秒 0.35（**只在 battle 阶段**，代码在 `update()` 里 gate）、清波 8+2n、词条里的金币。
  `TUNE.coinPerSec` 已删除；初始 25。**总额画在下半区 `drawCoinChip()`**。

**升级与词条（2026-11-20 v0.11）**：
- `G.level / G.xp / G.pendingLevels / G.levelFrom`：**每关重置**，上限 `TUNE.levelCap=20`；
  跨局的是兵种合成上限等级 `LV`（上限 10），两个别混。
- `killEnemy()` → `gainXP()`（小兵 +1、BOSS +5）；`xpNeed(lv) = 18 + lv×2`；
  升级时 `startChoice('battle')` 把 `phase` 切到 `choose`，战斗暂停；选完 `chooseUpgrade(i)` 回原阶段。
- `settleWave()` **不再弹三选一**，清波只回准备 + 免费刷新。
- 词条池 `AFFIX`（`squad-data.js`）：tier 1/2/3，`minLv` 1/5/10；`rollUpgrades()` 按
  `upgradeTierWeights()` 权重抽、同兵种同属性不重复；辅助位只出自己光环词条。
- `G.buff` 扩展了 `heal/armor/coin/haste`；`update()` / `unitRate` / `damageUnit` 都乘对应 buff。

**养成面板与详情页（2026-11-20 v0.11，v0.16 改三属性加点）**：
- `panelRows()` 2 列 × 5 行卡片（328×236）；`drawPanel()` 画立绘位（`previewUnit` + `drawUnit(..., bare)`）、
  名字 / 定位 / 技能 / `点 n/上限` / 可合星 / 生命 / 攻击 / 射程 / 攻速 / 专精进度。
- 点卡片 → `G.panelDetail = i` → `drawDetail()`：大立绘位、说明（`k.desc`，`wrapText`）、
  10 项属性表（`statCells`，含防御）、本体技能 + 4 个专精节点、底部**三个加点按钮**（攻击/血量/防御）。
- `detailRects()` 给 `back` + `attrs{dmg,hp,def}` 命中区；点属性按钮 → `spendAttr(G.panelDetail, stat)`，
  到总上限 / 单项满 / 点数不够时按钮变灰并给提示。
- 专精在 `squad-data.js` 的 `MASTERY`，**按兵种 id 一张表**，每张 4 个节点，等级固定 5/7/9/10：
  - 战斗位：步枪（攻速/伤害/射程/弹道）、霰弹（弹丸/伤害/射程/弹丸）、狙击（穿透/伤害/射程/穿透）、
    重炮（溅射/伤害/溅射/伤害）、激光（穿透/伤害/穿透/射程）、迫击炮（溅射/伤害/溅射/伤害）。
  - 辅助位：医务（治疗倍率）、工程师（减伤倍率，`damageUnit` 上限 45%）、
    顾问（产币倍率，`update()`）、鼓号（攻速光环倍率，`unitRate`）。
- `masteryOf(kind)` 读 `LV` 把节点汇总成统一形状（倍率 key 连乘、`pellets/pierce` 相加）；
  `unitDmg/unitRate/unitRange/fire` 吃战斗位，`update()`/`damageUnit` 吃辅助位光环。

**敌人尺寸与防御（2026-11-20 v0.11）**：
- 小兵 `r = TUNE.enemyR = 18`（直径 36，和单位本体同量级）；BOSS 用 `BOSS[].r`（26/38）。
- 每波数量 `12 + 波数×3.4`（第 15 波 63）；**难度不靠数量**。
- `spawnEnemy()` 算 `armor = min(40%, 0.4%×波数 + 1.5%×关卡 + BOSS 加成)`；
  `updateBullets()` / `splashDamage()` 扣血都乘 `(1 - armor)`，飘字显示实际伤害。


**单位生存（2026-11-20 第一步，已做）**：
- 血：`makeUnit` 存 `hp/maxHp`；`KINDS[].hp` × `(1+(星-1)×TUNE.unitHpStar)`；合成升星后 `refreshUnitHp` 回满。
- 敌人打人：`blockingUnit` 判断敌人是否压到单位的格子右侧；`updateEnemies` 里停下来每秒啃一口；`damageUnit` / `killUnit` 扣血、阵亡（直接 `vacate`，不回待命区）。
- 渲染：单位血条在 `drawUnit` 末尾；敌人啃食前扑 + 抓痕在 `drawEnemy`。
- 数值：`TUNE.unitHpStar / enemyAtk* / stageHpMul / stageAtkMul`；模拟器 `--tune` 可覆盖。
- 医护不自奶：医生不回自己的血，否则一群医生会互相回成打不死的铁王八（模拟踩过）。
