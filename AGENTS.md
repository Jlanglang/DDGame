# DDGame 项目规则

> 改代码前先读这份。人设/语气按全局 `~/.dsh/AGENTS.md`，这里只放工程约定。

## 1. 工作目录

- 所有游戏改动都在 `D:\DDGame`。
  - GitHub：https://github.com/Jlanglang/DDGame
  - 线上：https://jlanglang.github.io/DDGame/
  - 提交到 `master` 就会自动部署（GitHub Pages）。
- **先本地跑，确认后再提交**：改完 → 本地验证 → 告诉主人「改好了，本地可跑」→ **等主人确认** → 才 `git commit` / `git push`。
  - 默认**不自动 commit、不自动 push**，哪怕 SSH 通、哪怕改动很小。
  - 主人说「可以 / 提交吧 / 推吧」再动手；提交前先 `git status` 确认改动范围。
  - 没有可用 SSH 凭据时如实说明；不要改走 HTTPS，也不要把认证失败当网络问题反复重试。
- `D:\DP\bridge-defense` 是旧副本，**已冻结**，不要再去那里改。
- 新游戏放 `games/<id>/`，并在根目录 `index.html` 的游戏库里加一张卡。
- 本地调试工具在 `D:\DP\.tools\`（不参与部署）。

## 2. 输入：PC + 手机触摸必须同时可用 ⚠️

**每个游戏都要在鼠标和触摸两种输入下验证，不能只测桌面。**
手机上「拖到一半断掉」几乎都是下面第一条没做。

- 画布加 `touch-action: none`；`html/body` 加 `overscroll-behavior: none`。
  否则手机浏览器会把拖动当成滚动/缩放，直接发 `pointercancel`。
- 用 Pointer Events：`pointerdown / pointermove / pointerup / pointercancel`，
  配合 `setPointerCapture`。
- **多指只认第一根**：记录 `pointerId`，其他手指的 down/move 直接忽略；
  `pointerup/pointercancel/lostpointercapture` 里按 id 清理。
- 触摸/笔按下即跟手（tap-to-move）；鼠标保持「按住拖」。
- 老浏览器没有 `PointerEvent` 时，用 `touchstart/touchmove/touchend` 兜底，
  监听要 `{ passive: false }` 且 `preventDefault()`，否则照样被滚动抢走。
- 坐标统一用 `getBoundingClientRect()` 换算回 720×1600 逻辑坐标。
- 触摸目标 ≥ 44×44 CSS px；不要依赖 hover。
- 屏蔽长按菜单：`canvas.addEventListener('contextmenu', e => e.preventDefault())`。
- viewport 用 `maximum-scale=1,user-scalable=no`，全屏游戏避免误缩放。
- 手机地址栏会变，舞台尺寸优先用 `dvh`（保留 `vh` 作为旧浏览器回退）。

### 验证（测试脚本只认自己游戏目录里的）

**每个游戏目录自带测试，不要去别处跑别人的脚本。**
`D:\DP\.tools\input-test.js` 以前是"全局输入测试"，实际写死了 `games/doudou` 和 `__g`——
拿它去测别的游戏，只会得到一个"别的游戏"的 PASS，比不测更糟。已经搬回各游戏目录了。

| 游戏 | 命令 | 类型 |
|---|---|---|
| 豆豆魔方 `games/cube` | `node games/cube/test-core.mjs` | 逻辑（Node，21 项） |
| 豆豆魔方 `games/cube` | `node games/cube/test-input.js` | 真浏览器输入（47 项） |
| 暗黑传奇 `games/darklegend` | `node games/darklegend/test-game.mjs` | 逻辑（Node + DOM 桩） |
| 暗黑传奇 `games/darklegend` | `node games/darklegend/test-input.js` | 真浏览器输入 |
| 守护豆豆 `games/doudou` | `node games/doudou/test-input.js` | 真浏览器输入 |
| 守护豆豆 `games/doudou` | `node games/doudou/headless.js --runs 40 --policy feed` | 数值模拟（无渲染） |
| 守护豆豆 `games/doudou` | `node games/doudou/wave-time.js 16 feed` | 每波耗时 |
| 守护豆豆 `games/doudou` | `node games/doudou/win-time.js 40 feed` | 胜负时长 |
| 单词塔 `games/wordtower` | `node games/wordtower/headless.js --runs 40 --acc 0.8` | 数值模拟（无渲染） |
| 单词塔 `games/wordtower` | `node games/wordtower/test-words.mjs` | 词库自检（重复/长度/buff 覆盖） |
| 豆豆勇者 `games/hero` | `node games/hero/test-input.js` | 真浏览器输入（11 项） |
| 豆豆勇者 `games/hero` | `test-stage.js` / `test-save.js` / `test-shop.js` | 真浏览器流程（6 / 13 / 8 项） |

所有 `test-*.js` 都是**零依赖**的：用 Chrome 的 `--remote-debugging-pipe`
直接对话（fd 3 写、fd 4 读），**不用 ws、不起端口、不写临时文件**，
在真浏览器里发真实的 `Input.dispatchTouchEvent` / `dispatchMouseEvent` / `dispatchKeyEvent`。
输出 `RESULT ... pass=N fail=0`（或 `PASS (N/N)`）才算过。hero 的四个测试共用同目录的 `test-lib.js`。

模拟器（`headless.js`）只跑逻辑、不开浏览器，秒级跑完一局，用来做数值实验。

不覆盖：真机的手势冲突（`touch-action`、系统手势抢走拖动）——那条仍要主人真机确认。

## 3. 游戏约定

- 竖屏 720×1600；双击 `index.html` 即可玩；零依赖、零构建。
- 中文 UI；大数字用万/亿。
- 所有美术程序化生成（或仓库现有素材），不引外部图片。
- 改完先本地跑通 + 输入测试，再 commit / push。
- 提交信息用中文简述改了什么、为什么。

## 4. 现有关卡 / 玩法速查（守护豆豆）

- 自检：`node games/doudou/test-input.js`（真浏览器触摸拖动 + 鼠标拖动，输出 `RESULT pass=4 fail=0`）
- 敌人血量 `36 × 2.05^(波数-1)`；伤害上限 `65 × 1.45^(波数-1)`。
- 8 波杂兵，每波固定阵型（一字 / 长方形 / 倒三角 / 菱形），第 9 波 BOSS。
- 一把目标 **≈100 秒 + 胜率 60%**（headless 120 局：均值 96s，胜率 60.0%）。改波数/节奏前先跑模拟。
- 难度别靠加血拖时间（会同时拉长一把）；优先 `playerHp` 和 `gruntSpeed`，这两项不增加时长。
- 节奏全靠 `BAL` 里的 `gruntSpeed / waveGap / formationRowGap / bossSpeed / playerHp`，别写死。
- 前两对卡固定：攻速+弹道 / 攻速+伤害；初始攻速 5.5/s。
- 攻击卡 ÷30 起步、很稀有，是通关门票；没有攻击卡基本必输（120 局里 28 局没吃到，0 胜）。
- 桥头 9 点血；BOSS 过桥直接判负。
- 数值实验：`node games/doudou/headless.js --runs 40 --policy feed`。
- 看每波耗时：`node games/doudou/wave-time.js 16 feed`；看胜负时长：`node games/doudou/win-time.js 40 feed`。

## 5. 豆豆单词塔（games/wordtower）

**固定炮台 + 升级选卡 + 拼词拿卡**：塔不动，怪成群冲下来；击杀攒经验，升级时暂停弹三张卡，
点开一张把上面的单词补全才算拿到（答错这级就空过）。

- **无尽模式 200 波**：`waves 200`，每 20 波一只 BOSS（`bossMul 14`），第 200 波 BOSS 倒下算通关。
  典型一把 30 波左右，运气好能到 50+ 波（平衡实测见下）。
- 敌人血量 `10 × 1.105^(波数-1)`；**第 15 波后额外 ×1.2^(波数-15)**（`surgeFrom / surge`）。
  新卡池下只靠 1.105 会变成"清得动就永远不死"的无限磨，这一层是给后期封顶用的，别删。
  速度 84 px/s（随波数最高 +60%），刷新间隔 0.26s，人数 `8 + 波数×1.1`（40 封顶）。
- **怪物种类**（`TYPES` + `typeWeights`）：**解锁点必须早于典型死亡波数**，否则大部分玩家看不到新怪——
  精英 3 / 护甲 4 / 远程 5 / 分裂 6 / 奶妈 8 / 升级怪 10。
  `grunt` 普通 / `elite` 精英（2.6 血 3 经验）/ `armor` 减伤 45% 且挡穿透 /
  `ranged` 停在 620px 处朝塔开火 / `splitter` 死亡分裂 1~2 代 /
  `healer` 每 3 秒给 220px 内回 12% 血 / `leveler` 死亡**真的升 1 级**
  （以前只加一次选卡、等级不涨，是"连续弹升级、明明没升级"的元凶）。
- **倍速开关**：顶栏 `×1 / ×2 / ×4`（键盘 F 也切）。`frame()` 把 dt 乘倍速后仍按 1/60 定步长推进，
  所以 4× 也不会穿怪；选卡面板的停留时间按真实时间算，不受倍速影响。
- 升级经验：`levelBase 5 + 等级 × 3`；小怪 1、精英 3、BOSS 40。
  **每次升级进 `pendingQueue`**，选卡面板按队列顺序消费，标题显示这次到底升到几级；
  一次涨多级时提示"连续升 N 级，还有 N 次选卡"，不会再连弹同一个 Lv。
- 卡池 **15 种**：伤害/攻速/弹道/塔血/减速/点燃/穿透/暴击/溅射/连锁/定身/赏金/修复/暴伤/破甲。
  每张卡绑一个 `buff` 标签，单词从 `words.js` 按标签抽；`maxed` 的卡不再进卡池；
  三张里保证至少一张输出卡（`dmg / rate / split`），免得 15 张卡把伤害稀释光。
- **卡片分级**：面板固定三张，**每张自己掷 B/A/S**，效果倍率 1 / 1.5 / 2.2（离散项 `stepOf` 取 1/2/3 档）。
  掷等级的权重按波数走（`gradeWeights`）：1-4 波 B80/A20/S0 → 5-8 波 55/35/10 →
  9-14 波 35/40/25 → 15+ 波 20/40/40。卡的 `desc` 和 `apply` 都写成 `(mul)` 的函数。
  **词长跟等级绑定**：B→`easy`（3-4 字母）/ A→`mid`（5-6）/ S→`hard`（7-12），
  `wordForCard(buff, grade)` 按等级抽；不再用玩家等级决定词长。面板提示也写明这一点。
  **修复过**：以前同时有两个 `rollGrade`，后一个读 `GRADES[k].weight`（这个字段不存在），
  结果永远只出 B 卡——现在统一用 `gradeWeights`。改伤害卡时注意：S 卡的乘法加成很猛，
  `dmg` 已降到 `+10%×m` 仍是乘法，别再回到 `+22%×m`，实测会指数爆炸。
- **新词缀数值**（都在 `BAL` 里）：溅射 45%×m / 半径 72 / 上限 90%；连锁 `stepOf` 跳、最多 4 跳、
  每跳 65%；定身 9%×m、持续 0.6s、上限 25%；赏金经验 +25%×m（加法，上限 ×4）；
  修复每 18 秒回 `stepOf` 血（上限 12）；暴伤 +30%×m（上限 ×4）；破甲 12%×m（上限 80%）。
- **选卡 UI 的约定**：卡片外面只露中文（提示"我要哪张、这词我会不会拼"），
  点进去才看到挖空的是哪个字母（三个候选字母互不重复）；
  答对自动收面板，答错**不自动关**，补全整个词 + 弹「继续」按钮。
- 词库：**人教版 PEP 小学英语 1-6 年级**，**962 个单字**，`easy/mid/hard` 按 3-4 / 5-6 / 7-12 字母分档。
  `pep-1-6.json` 是覆盖基准（3-6 教材单字 + 一年级起点常用词；短语、缩写、2 字母词不进题库）。
  15 个 buff 每个 62~65 词；抽词避开本局最近 90 个词（`wordRecent`），同局基本不重复。
  `test-words.mjs` 会校验「教材表 ↔ 词库」一一对应，改词漏了会 FAIL。
- **年级难度**：顶栏按钮 `1-6 / 1-4 / 1-2`（键盘 `G` 也切），存在 `wordtower-grade`；
  `G.gradeMax` 只筛单词（`wordsWithBuff` 里 `w.grade <= gradeMax`），**不改怪物数值**。
  词库按年级标签统计：1-2 年级 238 词、1-4 年级 585 词、1-6 年级 962 词。
  低年级段如果 S 卡找不到够长的 hard 词，会按 `hard → mid → easy` 回退到该年级段内可用的词。
- **平衡实测**（headless，`surge 1.2`，`--max 900`，各 20~40 局）：

  | 认识词的比例 | 中位波数 | 最长 | 平均时长 | 平均等级 | 拿卡数 |
  |---|---|---|---|---|---|
  | 60% | 26 | 44 | 358s | 39 | 36 |
  | 75% | 26 | 49 | 364s | 40 | 38 |
  | 90% | 28 | 47 | 388s | 42 | 41 |

  6~7 分钟是 1× 的时长，玩家开 2× 就是 3 分钟多——倍速开关就是给这个曲线配的。
  注意：headless 的 `--acc` 对每个词独立同分布，**不区分词长**；所以表里正确率差距偏小。
  真机上 B/A/S 对应短/中/长词，S 卡更难拼，正确率高才敢拿 S 卡。
- 加词：`pep-1-6.json` 和 `words.js` 两处一起加（长度必须对得上档位），再跑
  `node games/wordtower/test-words.mjs`；新 `buff` 标签要同时在 `game.js` 的 `CARDS` 里配一张卡。
- 加怪物：在 `TYPES` 里加一条，再在 `typeWeights` 里按波数开放，行为写在 `updateEnemies` / `killEnemy`。
- 调参：`node games/wordtower/headless.js --runs 40 --acc 0.8 --max 1800`
  （`--acc` = 模拟玩家的单词正确率，`--max` = 单局最长秒数；玩家决策用局内种子，结果可复现）。
  快速 A/B 用 `--bal "{\"surge\":1.2}"` 覆盖 `BAL`，不用改文件。

## 6. 豆豆勇者（games/hero）

**横屏割草 + 单挑 BOSS，两张地图分开**（照冒险岛「野外图 → BOSS 图」的结构）。

- 舞台 **1280×720 横屏**（不是 720×1600）。手机竖屏会提示旋转，也可点「竖屏凑合玩」。
- **角色选择页**：启动先进 `G.state='menu'`，最多 6 个角色，存档在 `doudou-hero-slots-v2`
  （`{current, slots:[{name, save}]}`）；旧单档 `doudou-hero-save-v1` 自动迁移成「豆豆」。
  游戏内右上角「角色」回选择页；`?skipmenu=1` 跳过菜单（测试脚本用）。
- **安全区营地**在森林最左边（x<380）：帐篷、篝火、商人豆豆（x=200）。
  靠近 140px 显示商店入口，按 `E` / 点「🛒 商店」打开；打开时 `G.shopOpen` 暂停。
  安全区里缓慢回血（12/s），小怪不刷进来（生成点最小 x=430）。
- **图 1 蘑菇森林**：世界宽 3200，小怪**原地巡逻 + 靠近才追**：
  蘑菇在出生点 ±120 来回走、玩家进 300 才追；幽灵绕点飘、进 280 才追；树桩进 460 才吐种子。
- **传送门常驻**（森林 x=3040 → 巢穴；巢穴 x=70 → 森林），不用杀满，`G.portalLock` 防止进门立刻弹回。
- **图 2 蘑菇王巢穴**：世界宽 1500、只有 2 个平台、不刷杂兵；进图即生成 BOSS（x=820），
  冲撞 / 跳砸冲击波 / 召唤小蘑菇，45% 血进二阶段。
- 切图用黑幕淡入淡出（`G.fade`），全黑时调 `enterStage(n)` 换 `worldW` / `platforms` / 清场。
- 战斗：三段连击（第三段 ×1.8）、空中下劈、旋风斩（8s CD、0.72s 持续、每 0.13s 判定）。
- 血量：初始 200（不是 400），BOSS 34、小怪 12~18，站桩会被打死；护甲 +24 血、升级 +16 血。
- **金币实时入账**：拾取时直接 `SAVE.gold += value` 并写档，回安全区立刻能花；
  `G.runGold` 只用来算结算文案，`bankRun` 不再重复加金币。经验仍在结算时入账（死亡、重开都保留）。
- **药水**：存档 `potions`（上限 5，每局补到 3）；血量 <45% 自动喝，回 50，10 秒 CD，
  商店 25 金/瓶。HUD 在右上角金币下面。
- 操作：左下 **WASD 常驻方向键**（半透明，键盘按下也同步变亮），`W` 跳、`S` 下平台；
  右下攻击 / 跳 / 旋风；`J` 攻击、`K` 技能、`E` 商店、`P` 暂停。
  **界面上没有暂停按钮**（养成游戏不加暂停键），暂停只有 PC 的 P 键隐藏功能。
- 自检（真浏览器，零依赖，共用同目录 `test-lib.js`）：
  `node games/hero/test-input.js`（11 项输入）、`test-stage.js`（两图切换 6 项）、
  `test-save.js`（存档 13 项）、`test-shop.js`（商店/药水 8 项）。
- 调参在 `game.js` 顶部：`STAGE_W`、`PLATFORMS_FOREST` / `PLATFORMS_LAIR`、`ENEMY`、`BOSS`、
  `ATTACK_*`、`PORTAL_X`、`SHOP_X`。

## 7. 暗黑传奇（games/darklegend）

**主城 + 小世界房间 + 回合制刷宝**。规则和进度都在 `docs/` 里，改之前先读：

- `docs/豆豆暗黑传奇-规则与任务.md` —— 规则表（每条都有验收），**决策以它为准**
- `docs/豆豆暗黑传奇-进度与完成度.md` —— 当前进度、架构、测试覆盖、关键教训

- 自检：`node games/darklegend/test-game.mjs`（136 项逻辑）＋ `node games/darklegend/test-input.js`（真浏览器输入）
- 架构分层：`data` 表与常量 / `core` 纯公式 / `world` 地图 / `combat` 战斗判定 / `status` 状态 / `game` 编排
  —— 调数值只改 `data.js`，加状态只改 `status.js`，换地图只改 `world.js`
- **文档里有几处是实现历史遗留、还没对齐**（改之前先看进度文档的"还没做"）：
  双手槽未定；词缀系统没做只是占位显示"未鉴定"。背包已是 40 格（R10.1）；鞋子已做。药水已改为三档红/蓝（R10.9）。

## 8. 豆豆魔方（games/cube）

**3×3 六面魔方 + 手写 3D 渲染**（Canvas 2D 透视投影，零依赖）。魔方固定在屏幕中间，只转角度不挪位置。

- **锁定 / 解锁**（`locked`，默认锁定）：
  - **锁定 = 只转层**：拖魔方转层；**视角也锁死，拖空白不响应**（怎么拖都不会转视角）。
  - **解锁 = 只转视角**：整块画布都归视角，拖哪儿都不转层（底部按钮和键盘照常转层）。
  - 工具行「🔒 锁定 / 🔓 解锁」切换。默认锁定，一进来就能拖层；要看别的面先解锁。
  - 锁定状态下 `pickLayer` 判不出方向时**什么都不做**（等下一次 move 再试），绝不偷偷转视角。
- **拖动是跟手的**：锁定下按下一块、方向判定出来，那一层就**实时跟着手指转**（任意角度，`spin.kind='drag'`），
  **不松手就不算一步**；松手时转过 45°（`QUARTER`）才吸附到 ±90° 并计步，没转够就**回弹到 0**。
  换算：屏幕切向位移 `PER90`（120 逻辑 px）≈ 90°。按钮/打乱走同一个 `spin` 对象，只是 `from/to` 固定。
  - 手指停在哪，目标角度就定在哪（`targetAngle`）；显示角度在 frame 里按**最大角速度**追
    （`DRAG_SPEED`，15 rad/s ≈ 860°/s），甩得再快也要转 5~6 帧，不会一帧闪到 90°。
    判定成功的那一次 `pointermove` 位移也要立刻 `setDragAngle`，否则"一甩就停"会算出 0°（踩过）。
  - 松手时如果角度还在追，判定用 `targetAngle`，吸附动画从当前显示角度接着走。
- **提示**（工具行「提示」）：`solutionStack` 是从当前状态到复原的步骤队列，**队首是下一步**。
  打乱时用**打乱逆序**填满（这本身就是一条合法解法）；玩家每走一步，正好是队首就消掉，
  否则把它的逆压到队首。所以提示**永远有效**——跟着走一定能复原，乱转后会先提示撤销。
  显示成「U（上层顺时针）」这种中文记法。**不是最短解**（乱转后步数会变多），够用就行。
- 逻辑核心在 `cube-core.js`（纯函数，Node 里能 require）：
  cubie 用 `pos`（-1/0/1 整数坐标）+ `rot`（3×3 整数旋转矩阵）表示，转动只做 90° 的整数矩阵乘，
  不累积浮点误差。标准记法 `U D L R F B`（带 `'` 是逆时针）在 `MOVES` / `parseMove` 里。
- **复原判定按颜色**（`isSolved`：每个世界面 9 张贴纸同色），不按位置+朝向，所以整体转一下也算复原。
- **三渲二渲染**（`game.js`）：视图先绕 Y 转 yaw、再绕 X 转 pitch，透视投影到 720×1600；面按视图深度排序（painter）。
  - 亮度**只取三档**（顶亮 / 侧中 / 底下），色块平涂，不搞连续明暗。
  - 每张贴纸：平涂色块 + 顶部一条淡出的柔光 + **深色描边**（`#0b1018`）。圆角用 `fill + 圆头描边`，
    **不要用 `arcTo`**：极扁的四边形会拧成月牙。
  - **转动中的层，法线必须跟着旋转矩阵一起转**，否则背面剔除会漏面（踩过：转动的层只剩顶面）。
  - **只画外表面贴纸**（`stickers[fi]` 非空的），内侧面跳过：画了只会在转动时抢排序、露黑块。
  - **面积剔除**：投影面积 < 2500 逻辑 px² 的面不画。视角接近正对时侧面会缩成 1~8px 的细条，
    画出来就是"贴纸碎片"（踩过，主人截图里那种），这条专门治它。
  - 贴纸内缩 0.91；越扁的面内缩越少（`thin` 插值），免得细条裂开。
  - 内芯（边长 2.94 的深色立方体）先画，转动时从缝里看进去是实心塑料，不是背景洞。
- 拖动转层的判定：抓到的面法线 n + 屏幕拖动方向 → 面内世界轴 a；旋转轴 k = a × n，
  转哪一层由抓取 cubie 在 k 轴上的坐标决定，方向由 `k × 抓取点` 在 a 上的符号决定。
  中间层（坐标 0）也能转；方向推不出来时先不动，等手指再走一段重新判。
- 交互：拖魔方转层（锁定时）、拖空白转视角（解锁后）、pitch 限 ±77°；底部 6 个面按钮左右两半分别逆/顺时针；
  键盘 `U D L R F B`（Shift 逆）、`Z` 撤销、`Esc` 重置。
- 性能（手机拖动发涩先查这几处）：**画布 rect 缓存在按下时刷新一次**，`pointermove` 里绝不
  `getBoundingClientRect()`（那个强制同步布局，就是拖动手感的元凶）；地面阴影预渲染成离屏 canvas；
  面数按上面的规则砍到 ~40 个。
- 动画：按钮转动 200ms、松手吸附/回弹 170ms、打乱 90ms/步（20 步）。
  **单步和吸附用 `easeOutCubic`**（松手后顺势滑到位、收尾才减速，像有阻尼），打乱用 `easeInOutCubic`；
  进度用 `spin.start` 的绝对时间算，掉帧也不会把动画拖长。打乱完才开始计时，打乱不记步。
- 自检：`node games/cube/test-core.mjs`（21 项逻辑）、`node games/cube/test-input.js`（47 项真浏览器输入，
  含锁定拖层、解锁只转视角、拖动跟手不松手不算、45° 回弹、拖动方向、鼠标 + 触摸）。
- 调参都在 `game.js` 顶部：`CX/CY`（魔方位置）、`FOCAL/CAM`（透视）、`VIEW_YAW/PITCH`（初始视角）、
  `TURN_SEC/SCRAMBLE_SEC/SETTLE_SEC`、`DRAG_MIN`、`PER90`、`DRAG_SPEED`、`VISIBLE_Z`；配色在 `cube-core.js` 的 `COLOR_HEX`。
- 缩略图 `thumbnail.png` 是 900×563：用临时页面渲染后截图缩放来的，没有生成脚本（改了渲染要重做）。
