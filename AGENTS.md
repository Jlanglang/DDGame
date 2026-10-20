# DDGame 项目规则

> 改代码前先读这份。人设/语气按全局 `~/.dsh/AGENTS.md`，这里只放工程约定。

## 1. 工作目录

- 所有游戏改动都在 `D:\DDGame`。
  - GitHub：https://github.com/Jlanglang/DDGame
  - 线上：https://jlanglang.github.io/DDGame/
  - 提交到 `master` 就会自动部署（GitHub Pages）。
- **AI 只做本地 `git commit`，不执行 `git push`**。推送由主人手动完成：
  当前环境没有可用的 GitHub 凭据，`push` 会卡在认证上。
  改完 → 本地验证 → commit → 告诉主人「已本地提交，请推送」。
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

### 验证

```powershell
node D:\DP\.tools\input-test.js
```

无头 Chrome 模拟触摸（450×1000、touch emulation）和鼠标，检查 `__g.player.x`：
触摸从 300 拖到 120 应落在 192 附近，鼠标从 350 拖到 150 应落在 240 附近。
输出 `RESULT touch=PASS mouse=PASS` 才算过。

## 3. 游戏约定

- 竖屏 720×1600；双击 `index.html` 即可玩；零依赖、零构建。
- 中文 UI；大数字用万/亿。
- 所有美术程序化生成（或仓库现有素材），不引外部图片。
- 改完先本地跑通 + 输入测试，再 commit / push。
- 提交信息用中文简述改了什么、为什么。

## 4. 现有关卡 / 玩法速查（守护豆豆）

- 敌人血量 `36 × 2.05^(波数-1)`；伤害上限 `65 × 1.45^(波数-1)`。
- 8 波杂兵，每波固定阵型（一字 / 长方形 / 倒三角 / 菱形），第 9 波 BOSS。
- 一把目标 **≈100 秒 + 胜率 60%**（headless 120 局：均值 96s，胜率 60.0%）。改波数/节奏前先跑模拟。
- 难度别靠加血拖时间（会同时拉长一把）；优先 `playerHp` 和 `gruntSpeed`，这两项不增加时长。
- 节奏全靠 `BAL` 里的 `gruntSpeed / waveGap / formationRowGap / bossSpeed / playerHp`，别写死。
- 前两对卡固定：攻速+弹道 / 攻速+伤害；初始攻速 5.5/s。
- 攻击卡 ÷30 起步、很稀有，是通关门票；没有攻击卡基本必输（120 局里 28 局没吃到，0 胜）。
- 桥头 9 点血；BOSS 过桥直接判负。
- 数值实验：`node D:\DP\.tools\headless.js --runs 40 --policy feed`。
- 看每波耗时：`node D:\DP\.tools\wave-time.js 16 feed`；看胜负时长：`node D:\DP\.tools\win-time.js 40 feed`。

## 5. 豆豆单词塔（games/wordtower）

**固定炮台 + 升级选卡 + 拼词拿卡**：塔不动，怪成群冲下来；击杀攒经验，升级时暂停弹三张卡，
点开一张把上面的单词补全才算拿到（答错这级就空过）。

- **无尽模式 200 波**：`waves 200`，每 20 波一只 BOSS（`bossMul 14`），第 200 波 BOSS 倒下算通关。
  典型一把 20 波左右，运气好能到 50+ 波（平衡实测见下）。
- 敌人血量 `10 × 1.105^(波数-1)`，速度 84 px/s，刷新间隔 0.26s，人数 `8 + 波数×1.1`（40 封顶）。
- **怪物种类**（`TYPES` + `typeWeights`）：**解锁点必须早于典型死亡波数**，否则大部分玩家看不到新怪——
  精英 3 / 护甲 4 / 远程 5 / 分裂 6 / 奶妈 8 / 升级怪 10。
  `grunt` 普通 / `elite` 精英（2.6 血 3 经验）/ `armor` 减伤 45% 且挡穿透 /
  `ranged` 停在 620px 处朝塔开火 / `splitter` 死亡分裂 1~2 代 /
  `healer` 每 3 秒给 220px 内回 12% 血 / `leveler` 死亡直接升 1 级。
- **倍速开关**：顶栏 `×1 / ×2 / ×4`（键盘 F 也切）。`frame()` 把 dt 乘倍速后仍按 1/60 定步长推进，
  所以 4× 也不会穿怪；选卡面板的停留时间按真实时间算，不受倍速影响。
- 升级经验：`levelBase 5 + 等级 × 3`；小怪 1、精英 3、BOSS 40。
- 卡池 8 种：伤害/攻速/弹道/塔血/减速/点燃/穿透/暴击；每张卡绑一个 `buff` 标签，
  单词从 `words.js` 里按标签抽（等级越高越容易抽长词）。
- **卡片分级**：面板固定三张，**每张自己掷 B/A/S**，效果倍率 1 / 1.5 / 2.2（离散项 `stepOf` 取 1/2/3 档）。
  掷等级的权重按波数走（`gradeWeights`）：1-4 波 B80/A20/S0 → 5-8 波 55/35/10 →
  9-14 波 35/40/25 → 15+ 波 20/40/40。卡的 `desc` 和 `apply` 都写成 `(mul)` 的函数。
- **选卡 UI 的约定**：卡片外面只露中文（提示"我要哪张、这词我会不会拼"），
  点进去才看到挖空的是哪个字母（三个候选字母互不重复）；
  答对自动收面板，答错**不自动关**，补全整个词 + 弹「继续」按钮。
- 词库：小学常用词汇（`easy/mid/hard` 按 3-4 / 5-6 / 7-8 字母分档）。
- **平衡实测**（headless，各 20~40 局，`--max 1800`）：

  | 认识词的比例 | 中位波数 | 最长 | 平均时长 | 平均等级 | 拿卡数 |
  |---|---|---|---|---|---|
  | 60% | 16 | 93 | 403s | 23 | 40 |
  | 75% | 23 | 86 | 501s | 28 | 52 |
  | 90% | 28 | 87 | 514s | 27 | 56 |

  8 分钟是 1× 的时长，玩家开 2× 就是 4 分钟——倍速开关就是给这个曲线配的。
- 加词：往 `words.js` 三档里加 `{ w, zh, buff }`；新 `buff` 标签要同时在 `game.js` 的 `CARDS` 里配一张卡。
- 加怪物：在 `TYPES` 里加一条，再在 `typeWeights` 里按波数开放，行为写在 `updateEnemies` / `killEnemy`。
- 调参：`node D:\DP\.tools\headless-word.js --runs 40 --acc 0.8 --max 1800`
  （`--acc` = 模拟玩家的单词正确率，`--max` = 单局最长秒数；玩家决策用局内种子，结果可复现）。

## 6. 豆豆勇者（games/hero）

**横屏割草 + 单挑 BOSS，两张地图分开**（照冒险岛「野外图 → BOSS 图」的结构）。

- 舞台 **1280×720 横屏**（不是 720×1600）。手机竖屏会提示旋转，也可点「竖屏凑合玩」。
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
  右下攻击 / 跳 / 旋风；`J` 攻击、`K` 技能、`E` 商店、`P` 暂停。手机也可拖屏移动。
- 自检：`hero-test.js`（10 项输入）、`hero-stage.js`（两图切换 6 项）、
  `hero-save.js`（存档 13 项）、`hero-shop.js`（商店/药水 8 项）。
- 调参在 `game.js` 顶部：`STAGE_W`、`PLATFORMS_FOREST` / `PLATFORMS_LAIR`、`ENEMY`、`BOSS`、
  `ATTACK_*`、`PORTAL_X`、`SHOP_X`。
