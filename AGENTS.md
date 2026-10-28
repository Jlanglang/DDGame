# DDGame 项目规则

> 这是个**合集**仓库：每个游戏是一个独立目录，互相不 import、不共享代码、各自零构建。
>
> **"改这个功能该动哪个函数、哪个数值"全在各游戏的 `games/<id>/ANCHOR.md`。**
> 改哪个游戏就只读哪一份；不要通读别的游戏，也不要为了了解它去通读整个 `game.js`。
>
> 本文件只放三样东西：**通用规则 / 游戏索引 / 文档地图**。人设与语气按全局 `~/.dsh/AGENTS.md`，这里只放工程约定。

## 1. 工作目录与提交纪律

- 所有游戏改动都在 `D:\DDGame`。
  - GitHub：<https://github.com/Jlanglang/DDGame>
  - 线上：<https://jlanglang.github.io/DDGame/>
  - 推 `master` 自动部署（GitHub Pages）。
- `D:\DP\bridge-defense` 是旧副本，**已冻结**，不要再去改。
- 本地调试工具在 `D:\DP\.tools\`（不参与部署）。
- **先本地跑，确认后再提交**：改完 → 本地验证 → 告诉主人「改好了，本地可跑」→ **等主人确认** → 才 `git commit` / `git push`。
  - 默认**不自动 commit、不自动 push**，哪怕 SSH 通、哪怕改动很小。
  - 主人说「可以 / 提交吧 / 推吧」再动手；提交前先 `git status` 确认改动范围。
  - 没有可用 SSH 凭据时如实说明；不要改走 HTTPS，也不要把认证失败当网络问题反复重试。
- 提交信息用中文：改了什么、为什么。
- 新游戏放 `games/<id>/`。**先填 [`docs/游戏原型草图模板.md`](docs/游戏原型草图模板.md)**（一句话 + 七问 + 有地图就画格子草图），填完再写代码。
  然后做三件事：根 `index.html` 加一张卡、写一份 `games/<id>/ANCHOR.md`、在本文件第 2 节加一行。

## 2. 游戏索引（改之前先打开对应的 ANCHOR.md）

| 目录 | 游戏 | 类型 | 舞台 | 地图 | 自检 |
|---|---|---|---|---|---|
| `doudou` | 守护豆豆 | 塔防 / 射击 | 720×1600 | [ANCHOR](games/doudou/ANCHOR.md) | `test-input.js`、`headless.js --runs 40 --policy feed` |
| `wordtower` | 豆豆单词塔 | 塔防 / 单词 | 720×1600 | [ANCHOR](games/wordtower/ANCHOR.md) | `test-words.mjs`、`test-page.js`、`headless.js --runs 40 --acc 0.8` |
| `hero` | 豆豆勇者 | 横版动作 | **1280×720** | [ANCHOR](games/hero/ANCHOR.md) | `test-input.js`、`test-stage.js`、`test-save.js`、`test-shop.js` |
| `cube` | 豆豆魔方 | 益智 / 3D | 720×1600 | [ANCHOR](games/cube/ANCHOR.md) | `test-core.mjs`、`test-input.js` |
| `rhythm` | 节奏豆豆 | 节奏 / 音乐 | 720×1600 | [ANCHOR](games/rhythm/ANCHOR.md) | `test-core.mjs`、`test-input.js` |
| `darklegend` | 豆豆暗黑传奇 | 刷装 / 传奇 | 720×1600 | [ANCHOR](games/darklegend/ANCHOR.md) | `test-game.mjs`、`test-input.js`、`test-three.mjs`、`balance.mjs --check` |
| `catchalien` | 豆豆捉外星人 | 推理 | 720×1600 | [ANCHOR](games/catchalien/ANCHOR.md) | `test-logic.mjs` |
| `zombie` | 豆豆大战僵尸 | 放置 / 策略 | **1280×720** | [ANCHOR](games/zombie/ANCHOR.md) | `test-sim.js` |
| `cardfight` | 卡牌战斗 | 养成 / 策略 | 多页自适应 | [ANCHOR](games/cardfight/ANCHOR.md) | `test-combat.js` |
| `stickyfeet` | （three.js 实验，首页未挂） | — | — | [ANCHOR](games/stickyfeet/ANCHOR.md) | 无自动测试 |
| `roadtest` | 路网原型（首页未挂） | 实验 | 720×1280 | [ANCHOR](games/roadtest/ANCHOR.md) | `test-logic.mjs` |

自检命令一律在仓库根跑：`node games/<id>/<脚本>`。
**只跑这个游戏自己目录里的脚本**——别拿 A 游戏的测试去测 B 游戏，那种 PASS 比不测更糟。

## 3. 输入：PC + 手机触摸必须同时可用 ⚠️

**每个游戏都要在鼠标和触摸两种输入下验证，不能只测桌面。**
手机上「拖到一半断掉」几乎都是下面第一条没做。

- 画布加 `touch-action: none`；`html/body` 加 `overscroll-behavior: none`。
  否则手机浏览器会把拖动当成滚动 / 缩放，直接发 `pointercancel`。
- 用 Pointer Events：`pointerdown / pointermove / pointerup / pointercancel`，配合 `setPointerCapture`。
- **多指只认第一根**：记录 `pointerId`，其他手指的 down/move 直接忽略；
  `pointerup / pointercancel / lostpointercapture` 里按 id 清理。
- 触摸 / 笔按下即跟手（tap-to-move）；鼠标保持「按住拖」。
- 老浏览器没有 `PointerEvent` 时，用 `touchstart / touchmove / touchend` 兜底，
  监听要 `{ passive: false }` 且 `preventDefault()`，否则照样被滚动抢走。
- 坐标统一用 `getBoundingClientRect()` 换算回逻辑坐标（720×1600 或 1280×720）。
  但**不要放进 `pointermove`**：它强制同步布局，是拖动发涩的元凶；按下时缓存一次。
- 触摸目标 ≥ 44×44 CSS px；不要依赖 hover。
- 屏蔽长按菜单：`canvas.addEventListener('contextmenu', e => e.preventDefault())`。
- viewport 用 `maximum-scale=1,user-scalable=no`，全屏游戏避免误缩放。
- 手机地址栏会变，舞台尺寸优先用 `dvh`（保留 `vh` 作旧浏览器回退）。

不覆盖：真机的手势冲突（系统手势抢走拖动）——那条仍要主人真机确认。

## 4. 代码约定

- 竖屏 720×1600；**例外**：`hero`、`zombie` 是 1280×720 横屏，竖屏时提示「把手机横过来」（可跳过）。
- 双击 `index.html` 即可玩；零依赖、零构建（`darklegend` / `stickyfeet` 自带 `vendor/` 例外）。
- 中文 UI；大数字用万 / 亿。
- 所有美术程序化生成（或仓库现有素材），不引外部图片。
- 2.5D 画面必须遵守 [`docs/渲染规格.md`](docs/渲染规格.md)：
  45° 等距投影一致、每个立地物体脚下有椭圆接触阴影、统一色板与光源方向；
  角色 / 怪物 / NPC 用 2D 等距精灵，禁止用几何体拼生物；地面瓦片和阴影贴片用代码生成。
- 数值、节奏、曲线都要是**有名字的常量**（放各游戏的 `BAL` / `data.js`），别散在函数里写死。
- 改完先本地跑通 + 输入测试，再 commit / push（见第 1 节）。

## 5. 文档地图

| 位置 | 管什么 |
|---|---|
| `AGENTS.md`（本文件） | 通用规则 + 游戏索引 |
| `games/<id>/ANCHOR.md` | **单个游戏的地图**：文件职责、状态机、想改什么→去哪、数值在哪、测试、雷区 |
| `docs/游戏原型草图模板.md` | 立项用的一页纸：想法 → 七问 → 地图格子草图 → 验收清单 |
| `docs/maps/*.json` + `tools/map-sketch.mjs` | 地图草图（画格子）：改 json → 出 ASCII 图 + 连通性/步数/死路（`node tools/map-sketch.mjs docs/maps/field1.json`） |
| 手绘图 → 数据 | `python tools/trace-map.py 图.png out.segments.json 96`（认线）→ `node tools/map-net.mjs out.segments.json 6 8`（落格 + 补缝 + 算路口/死路/连通） |
| `docs/STATUS.md` | 暗黑传奇**唯一入口**：现在只做什么、什么冻结、下一步 |
| `docs/豆豆暗黑传奇-规则与任务.md` | 暗黑传奇玩法与数值，**决策以它为准** |
| `docs/渲染规格.md` | 2.5D 画面验收（第八节十项清单） |
| `docs/豆豆暗黑传奇-进度与完成度.md` | 暗黑传奇历史进度与教训（出问题才查） |
| `docs/节奏豆豆-*.md` | 节奏豆豆的玩法 / 结构 / 开发记录 / 五十关进度 |
| `docs/豆豆捉外星人.md`、`docs/单机卡牌养成-玩法.md`、`docs/卡牌战斗-豆包立绘提示词.md` | 对应游戏的玩法与美术说明 |
| `docs/角色设定.md` | 豆豆系列角色设定 |
| `games/doudou/SQUAD.md`、`games/hero/README.md`、`games/cardfight/README.md` | 各游戏自带的长说明 |
| `tmp/` | 临时文件，不参与部署 |

ANCHOR.md 里的行号会随代码漂移。**改完顺手修**，或跑 `node tools/check-anchors.mjs` 把 553 处 `文件:行号` 引用全量校一遍。

## 6. 改代码的姿势（省时间，也省主人的钱）

- 开工先读**这一个游戏**的 `ANCHOR.md`，按表定位；`grep` 命中后只读命中处 ±60 行。
- 只有「要加新系统」时才通读整个文件。调数值、改一处表现，都不值得通读上千行。
- **一个任务一个会话**；不要在同一个会话里连着改好几个游戏——上下文只增不减，
  最贵的从来不是读了多少字，而是每一轮都要把上一轮那一大坨重新交一遍。
- 卡住时先看 ANCHOR 的「雷区」和对应 `docs/`，再决定要不要扩大阅读范围。
