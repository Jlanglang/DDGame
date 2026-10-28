# 卡牌战斗 · 锚点表
> 改这个游戏先读这一份。约 3650 行（含 205 行测试）、4 个页面。通用规则见根 AGENTS.md。
## 一句话
横屏 1280×720 卡牌养成：主页选关/布阵 → 战斗页按 1–5 号位自动普攻，怒气满后手动排队（或开自动）→ 赢了解锁下一关；金币只用来升英雄等级。玩法设计详见 `docs/单机卡牌养成-玩法.md`，本目录细节详见 README.md。
## 页面与文件
| 页面/模块 | 文件 | 行数 | 管什么 |
|---|---|---|---|
| 主页 | index.html | 584 | 20 关列表/进度/出战队伍/布阵层；内联脚本从 :301 起 |
| 战斗 | battle.html | 887 | 舞台 SVG + HUD + 全部 CSS；DOM 在 :706-877 |
| 名册 | heroes.html | 183 | 12 英雄卡片、解锁态与排序；内联脚本从 :143 起 |
| 详情 | hero.html | 295 | `?id=xxx`、立绘/装备/升级按钮；内联脚本从 :203 起 |
| 模块 | battle.js | 589 | 战斗页编排：读阵容/关卡、建 DOM、回合定时器、怒气队列、结算 |
| 模块 | combat.js | 310 | 纯规则（Node 可 require）：选目标、strike、出手顺序、怒气队列 |
| 模块 | formation.js | 197 | 站位几何 + 英雄/怪物战斗数值 + 阵容/进度存档 |
| 模块 | levels.js | 81 | 20 关敌人排布 `RAW` 与成长倍率 |
| 模块 | economy.js | 94 | 金币、英雄等级、通关奖励 |
| 模块 | heroes.js | 163 | 12 英雄展示数据（品质/等级/脸/装备/解锁），不进战斗 |
## 状态机与主循环
没有 `state` 字符串、也没有 `requestAnimationFrame`；状态是 battle.js:68-77 的 `fighting` / `ended` / `round` / `timer`，渲染只在每次 step 后 `render()`（:175），动画由 CSS keyframes 播（battle.html:441-560）。
- 主循环 `step`（:466）顺序：`outcome` 早退 → `pullReady` 满怒入队 → 有队列先 `resolveRage` → 否则 `nextActor` 取号位最前未行动者 → 全动完清 `acted`、`round+1` → `applyStrike({type:'auto'})`。
- 未开战 `fighting=false`：点单位只选中并提示（battle.js:214）。
- 交战：`startBattle`（battle.js:481）→ `setInterval(step, 700/speed)`（:452-455），默认 700ms 一手。
- 结束：`finish`（:512）置 `ended=true`、停表、弹 `#endcard`；`again`（:494）复原快照重开。
## 想改什么 → 去哪
| 想改 | 动这里 |
|---|---|
| 伤害公式 | 普攻 `atk - def - guard`、最低 1（combat.js:166、:55）；技能倍率在 strike 各分支：狙击 ×3（:178）、横扫（:115/:128）、斩杀追击（:139） |
| 怒气 | 上限/获得/受伤换怒 combat.js:221-231；排队、自动、满怒提示 battle.js:328-358；同刻同号先我后敌（combat.js:257） |
| 队形/站位 | formation.js:14-27 常量 + `computeSlots`:75；battle.js:91-94 只取结果；布阵拖拽 index.html:491-561 |
| 角色数值 | 战斗认 formation.js:35 `HEROES`（可上阵仅 3 人，HERO_ORDER:54）；展示认 heroes.js:8 `HERO_DB`；加人要两处都写 |
| 关卡/敌人 | levels.js:9 `RAW`（怪物 + 号位 1–5）、:41 倍率、:7 章节名；入口 `battle.html?level=N`（battle.js:36） |
| 经济/升级 | economy.js:9-10 初始金币/上限、:56 升级价、:79 奖励；按钮 hero.html:252；主页显示 index.html:375 |
| 自动/倍速 | battle.js:562 自动怒气开关、:567 倍速 1→2→3；敌方永远自动（:355），我方只在开自动时（:340） |
| 加怒气技能 | combat.js:79 加 kind + formation.js:35-53 的 `rageSkill` + battle.js:360/370 文案 + :321 技能图 |
| 战斗 UI/特效 | battle.html:19 `#stage`、:55 格位、:76 `.unit`、:328 按钮、:359 日志；特效 battle.js:237-305；品质色 theme.css:16-42（详见 README.md） |
## 数值都在哪
| 常量 | 位置 | 当前值 |
|---|---|---|
| 怒气/防御/治疗 | combat.js:47-48、:221-223 | 上限 1000、普攻 +150、击杀 +300、受伤按掉血比例（:226）；`GUARD_DEF` 18、`HEAL_RATIO` 0.25 |
| 英雄 | formation.js:35-53 | 紫垣 20/200（攻/血）`guard`、极光 30/100 `back`（×3）、银翎 15/95 `execute` |
| 怪物 | formation.js:58-62 | 傀儡 14/160 `front-sweep`、史莱姆 10/90 `execute`、蝙蝠 12/80 `row-sweep` |
| 关卡成长 | levels.js:41 | 生命 ×(1+0.10×(id−1))、攻击 ×(1+0.06×(id−1))；20 关 4 章 |
| 经济 | economy.js:9-10、:56、:79 | 初始 500 金、上限 30 级；升级 30+lv×12；奖励 40+id×12 |
| 站位几何 | formation.js:14-27 | `BODY_H` 120 等常量都在这里；算法与数值表详见 README.md「站位规则」 |
## 存档
| 键 | 内容 | 默认/校验 |
|---|---|---|
| `cf.formation.v1` | `[{hero, slot}]`，slot 1–5 | 缺省紫垣2/极光3/银翎5；旧 `chixing` 并回 `yueguang`（formation.js:56、:112） |
| `cf.progress.v1` | `{cleared:[1..20]}` | 第 1 关默认开，过 N 关解锁 N+1（formation.js:145、:164） |
| `cf.gold.v1` | 金币（数字符串） | 缺省 500（economy.js:9、:12） |
| `cf.heroLv.v1` | `{heroId: lv}` 覆盖值 | 没记录时取 `HERO_DB[id].lv`（economy.js:37） |
## 测试
`node games/cardfight/test-combat.js` → 实跑 `RESULT pass=47 fail=0`。纯 Node（require combat.js），覆盖选目标/前后排/6 个技能/怒气队列/号位顺序。
## 雷区
- 战斗数值只认 formation.js 的 `HEROES`；`ECO.levelOf` 只影响显示，升级不涨 atk/hp（economy.js:56）。
- `heal-row`（月华治愈）有实现也有测试，但 `HEROES` 里没人带它，月光 `chixing` 不在可上阵表，游戏内触发不了。
- heroes.html 没引 levels.js，却在 :179 读 `CF.LEVELS.length`：抛 TypeError，进度文字停在“0 / 20”。
- battle.html 残留 `.layer-detail`/`.detail-*`/`.ragebar`/`.rtag`/`.info` 样式，既没有对应 DOM，战斗页也已取消详情（battle.js:79 是空函数）。
- levels.js:3 注释说“调 SLOT 里的 mult”，代码里没有 `SLOT`；倍率由 levels.js:41 公式生成。
- 布阵拖拽没做 `pointerId`/`setPointerCapture`/`pointercancel`（index.html:491-519），多指或系统手势会留下 ghost。
