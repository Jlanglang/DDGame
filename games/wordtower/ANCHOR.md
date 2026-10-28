# 豆豆单词塔 · 锚点表
> 改这个游戏先读这一份，40~60 行定位到函数/常量。约 3630 行代码（不含 style.css 的 786 行）。通用规则见根 AGENTS.md。

## 一句话
固定炮台塔防：怪沿桥压下来，击杀升级 → 三选一 → 补全单词才拿卡；卡 B/A/S 对应短/中/长词，100 波通关、每 20 波 BOSS。

## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| `game.js` | 1940 | 全部玩法：`BAL`、卡池、波次、战斗、渲染、HUD、两页切换 |
| `words.js` | 1032 | `window.WORD_BANK`：easy 370 / mid 358 / hard 234，共 962 词；`pep-1-6.json`（4812 行）是教材基准 |
| `headless.js` | 231 | 无渲染模拟器（假 DOM + 1/60 定步），靠 `?debug` 暴露的 `__g/__api` 驱动 |
| `test-page.js` / `test-words.mjs` | 174 / 139 | 真浏览器两页流程 18 项 / 词库自检 22 项 |
| `index.html` | 113 | 两页 DOM：`#home` `index.html:14` / `#battle` `index.html:47`；选卡 `index.html:77`、拼词 `index.html:84`、结算 `index.html:96` |
| `style.css` | 786 | 720×1600 舞台 `style.css:34`、选卡 `style.css:274`、拼词 `style.css:454`、主页 `style.css:619` |

## 状态机与主循环
| 项 | 锚点 |
|---|---|
| 状态变量 | `G.state` game.js:271：`home` / `playing` / `over`；另有 `G.paused`、`G.cards.open` 两层闸门 |
| 页面迁移 | 主页→战斗 `startBattle()` game.js:1832 → `reset()` game.js:1259；战斗→结算 `win()` game.js:1237 / `lose()` game.js:1248；结算/退出→主页 `exitBattle()` game.js:1840 → `showHome()` game.js:1820（切 `#home/#battle` 的 `hidden`）；存档 `bestWave()` game.js:1789、`saveBestWave()` game.js:1793（键 `wordtower-best-wave`） |
| 主循环 | `frame()` game.js:1844：home 直接早退（game.js:1846）→ dt 截 0.05、×`speed` → 按 1/60 定步跑 `update()`（game.js:1851-1858） |
| 每帧顺序 | `update()` game.js:1320：待选卡 → `updateSpawner` → `updateEnemies` → `updateTower` → `updateBullets` → `updateEnemyBullets` → `updateRegen` → `updateParticles` |
| 暂停/选卡 | `setPaused()` game.js:1309（`G.cards.open` 时拒绝，game.js:1310）；选卡答对停留 `G.cards.hold` 在帧尾按真实时间走（game.js:1864）；`render()` game.js:1872 |

## 想改什么 → 去哪
| 想改 | 锚点 |
|---|---|
| 大部分数值 | `BAL` game.js:21（主数值表；`globalThis.__BALANCE` 可覆盖，game.js:66；headless 的 `--bal` 走这里；怪种/卡系数另有内联） |
| 怪物种类/权重/外观 | `TYPES` game.js:72＋`typeWeights()` game.js:83（第 3/4/5/6/8/10 波解锁）；行为 `updateEnemies()` game.js:943、`killEnemy()` game.js:916；配色 `TYPE_COLOR` game.js:1475、图标 `TYPE_ICON` game.js:1486 |
| 波次/人数/BOSS | `enemyHp()` game.js:749、`waveCount()` game.js:107（8+floor(波×1.1)，40 封顶）、`startWave()` game.js:754、`spawnBoss()` game.js:808、`updateSpawner()` game.js:819（清场→BOSS→下一波） |
| 卡池/等级/词长 | `CARDS` game.js:159（`desc/apply/maxed` 都收 `(m)`；dmg 是乘法 1+0.1×m，别调大）、保底输出卡 `CORE_CARDS` game.js:561、`pickOffer()` game.js:564；`GRADES` game.js:116（倍率 1/1.5/2.2）、`gradeWeights()` game.js:138、`rollGrade()` game.js:145、`stepOf()` game.js:157（1/2/3 档）、`GRADE_TIER` game.js:472、`wordForCard()` game.js:502（S 卡缺 hard 时 hard→mid→easy 回退） |
| 选卡 UI/拼词 | `openCards()` game.js:592、`renderCardPanel()` game.js:611、`buildOption()` game.js:533（挖空+候选）、`pickCard()` game.js:671（字号阶梯 game.js:683）、`answerLetter()` game.js:702、`closeCards()` game.js:732 |
| 词库/年级难度 | `words.js:13`；`GRADE_RANGES` game.js:123、`storedRange()` game.js:129、`wordsWithBuff()` game.js:475、`setGrade()` game.js:1811（战斗中拒绝 game.js:1812）；按钮 `index.html:33`（键 `wordtower-grade-range`）；年级范围 585/743/962 词，难度只筛词不改怪；同局避重 `wordRecent` 90 词（game.js:529） |
| 升级/经验 | `levelUp()` game.js:451、`addExp()` game.js:458；`pendingQueue` game.js:286 由 `openCards()` game.js:594 消费；曲线 `expNext = levelBase + 等级×levelStep`（game.js:453） |
| 渲染/HUD | `render()` game.js:1365（顺序 game.js:1371-1379：背景→桥→怪→闪电→塔→弹→敌弹→粒子→飘字）；`resize()` game.js:1354（DPR≤2）；背景 game.js:1382、桥 game.js:1400、怪 game.js:1494、塔 game.js:1625、子弹 game.js:1697；HUD `syncHud()` game.js:398、`syncStats()` game.js:414 |
| 倍速/输入 | `SPEEDS [1,2,4]` game.js:1770、`cycleSpeed()` game.js:1779、`applySpeed()` game.js:1774、`?fast=4` game.js:1771、F 键 game.js:1898；按钮全走 `click`（game.js:1880-1899），键盘只有 F/空格/P，没有 pointer/drag |

## 数值都在哪
| 组 | 字段＝当前值 |
|---|---|
| 塔/弹/坐标 | `towerHp 10`、`damage 9`、`rate 2.2`、`shots 1`、`bulletSpeed 1000`（game.js:22-27）；`BRIDGE 96~624`、`TOWER_Y 1180`、`SPAWN_Y 250`（game.js:13-15）；漏怪 -1 血、BOSS 漏了直接输（game.js:999-1006） |
| 怪/波/通关 | `hpBase 10`、`hpGrowth 1.11`、`speed 84`、`spawnGap 0.26`、`waveGap 0.8`、`surgeFrom 999`、`waves 100`、`bossEvery 20`、`bossMul 14`、`bossSpeed 30`（game.js:29-39）；怪速随波 +0.5%/波、封顶 +60%（game.js:767；100 波约 +49.5%） |
| 经验/等级 | `expGrunt 1`、`expElite 3`（两者未引用）、`expBoss 40`、`levelBase 5`、`levelStep 3`（game.js:41-45） |
| 上限/词缀 | `buffRate .35`、`buffBurn .35`、`buffCrit .1`、`rateMax 8`、`shotsMax 5`、`burnMax 3`、`slowMax 3`、`splashRange 72`、`splashMax .9`、`chainRange 190`、`chainMax 4`、`chainFalloff .65`、`stunMax .25`、`regenEvery 18`（game.js:49-65） |
| 怪种专属 | `armor .45`、`ranged stopY 620/2s`、`healer 3s·220px·12%`、`splitter 35%×2`、`leveler 升 1 级`（`makeEnemy()` game.js:764、`updateEnemies()` game.js:943、`killEnemy()` game.js:916） |

## 测试
| 命令 | 管什么 |
|---|---|
| `node games/wordtower/headless.js --runs 40 --acc 0.8` | 数值模拟；`--max 3000`（默认 600）、`--grade 3-4`、`--bal "{\"hpGrowth\":1.12}"` |
| `node games/wordtower/test-words.mjs` | 词库 22 项：档位/重复/年级/PEP 教材一一对应/buff |
| `node games/wordtower/test-page.js` | 真浏览器两页流程 18 项（需 Chrome/Edge，页面带 `?debug`） |

## 雷区
- `surgeFrom: 999` 是**故意关掉** surge（game.js:31）；调低会让 100 波中后期直接崩，别当遗漏。
- `damageRaw()` game.js:1056 专供溅射/连锁，避免递归；改成 `hitEnemy()` 会无限套娃。
- 加怪要同时改 `TYPES`＋`typeWeights`；`boss` 不在 `TYPES`（`makeEnemy()` game.js:765 用 grunt 兜底，`spawnBoss()` game.js:808 再覆写）；`leveler` 死时直接 `levelUp()`（game.js:934），别走 `addExp`；护甲怪 `armor` 会强制终止子弹（game.js:1042），穿透也穿不过。
- `test-words.mjs:20` 用正则 `/buff:\s*'([a-z]+)'/g` 从 game.js 抓卡池；`headless.js:122` 按精确字符串删 `render();`——乱添 `buff: '...'` 字面量会污染卡池校验，改 `frame()` 结尾会让补丁失配（模拟器开始跑渲染）。
- 看着能改其实没用：`BAL.buffDmg`、`BAL.buffSlow`、`BAL.expGrunt`、`BAL.expElite` 无引用；主页「模式」按钮无 JS（`index.html:25`，只有 `data-mode`）；新塔属性只加 `newTower()` 不会进 HUD，还要改 `syncStats()` 的 rows（game.js:416-432，缓存键在 game.js:434）。
