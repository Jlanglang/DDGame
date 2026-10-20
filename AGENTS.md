# DDGame 项目规则

> 改代码前先读这份。人设/语气按全局 `~/.dsh/AGENTS.md`，这里只放工程约定。

## 1. 工作目录

- 所有游戏改动都在 `D:\DDGame`。
  - GitHub：https://github.com/Jlanglang/DDGame
  - 线上：https://jlanglang.github.io/DDGame/
  - 提交到 `master` 就会自动部署（GitHub Pages）。
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

- 敌人血量 `10 × 1.19^(波数-1)`，速度 84 px/s，12 波 + BOSS（`bossMul` 6），刷新间隔 0.26s。
- 波次人数 `[10,11,12,13,14,15,16,17,18,20,22,24]`，同屏峰值 18 只左右。
- 每 6 只怪出 1 只金色精英：2.6 倍血、3 倍经验。
- 升级经验：`levelBase 5 + 等级 × 3`；小怪 1、精英 3、BOSS 25 → 一把约 10 级、拿到 9 张卡。
- 卡池 8 种：伤害/攻速/弹道/塔血/减速/点燃/穿透/暴击；每张卡绑一个 `buff` 标签，
  单词从 `words.js` 里按标签抽（等级越高越容易抽长词）。
- **卡片分级**（`GRADES`）：升级先掷等级，B 62% / A 28% / S 10%；
  B 只给 2 选 1、A 3 选 1、S 4 选 1，效果倍率 1 / 1.5 / 2.2（离散项按 `stepOf` 取 1/2/3 档）。
  卡的 `desc` 和 `apply` 都写成 `(mul)` 的函数，加新卡时两边一起给。
- **选卡 UI 的约定**：卡片外面只露中文（提示"我要哪张、这词我会不会拼"），
  点进去才看到挖空的是哪个字母（三个候选字母互不重复）；
  答对自动收面板，答错**不自动关**，补全整个词 + 弹「继续」按钮。
- 词库：小学常用词汇（`easy/mid/hard` 按 3-4 / 5-6 / 7-8 字母分档）。
- **一把 ≈2 分 45，胜率跟词汇量挂钩**：headless 120 局，认识 75% 的词赢 61%。
- 加词：往 `words.js` 三档里加 `{ w, zh, buff }`；新 `buff` 标签要同时在 `game.js` 的 `CARDS` 里配一张卡。
- 调参：`node D:\DP\.tools\headless-word.js --runs 120 --acc 0.75`（`--acc` = 模拟玩家的单词正确率，
  玩家决策已用局内种子，同一配置结果可复现，A/B 才比得准）。
