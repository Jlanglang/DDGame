# 豆豆魔方 · 锚点表
> 改这个游戏先读这一份。约 2400 行代码。通用规则见根 AGENTS.md。
## 一句话
3×3 六面魔方：锁定拖层、解锁转视角、打乱后计时复原；渲染是 Canvas 2D 手写透视（三渲二）。
## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| game.js | 1072 | 全部渲染 + 输入 + 动画 + UI，改画面/手感只动这里 |
| cube-core.js | 259 | 纯函数：cubie 模型、90° 整数矩阵、复原判定、打乱、记法 |
| style.css / index.html | 360 / 77 | 720:1600 舞台缩放、`.pad`/`.tools`、胜利面板；6 个面按钮 `data-move`、工具行 `data-act`、`#time/#moves/#best/#hint/#win` |
| test-core.mjs | 198 | Node 逻辑测试 21 项 |
| test-input.js | 349 | 真浏览器输入测试 47 项（CDP over pipe），底座是同目录 `test-lib.js`(97) |
| thumbnail.png | — | 游戏库缩略图，无生成脚本；改了渲染要重做 |
## 逻辑核心 vs 渲染的分界
- **cube-core.js 只放纯函数**（Node `require` 可用）：`createCube` cube-core.js:111、`turn` cube-core.js:134、`rotMat` cube-core.js:101、`applyMat` cube-core.js:67、`invert` cube-core.js:147、`parseMove` cube-core.js:152、`stickerLayout` cube-core.js:162、`isSolved` cube-core.js:182、`scramble` cube-core.js:197、`stateKey` cube-core.js:227；常量 `FACES` cube-core.js:11、`FACE_UV` cube-core.js:21、`COLOR_HEX` cube-core.js:30、`MOVES` cube-core.js:44。
- **game.js 只做表现**：视角/投影、顶点生成、排序绘制、命中测试、手势、动画、HUD。数学（转法定义、复原判定）去 core；画面/手感别碰 core。`?debug` 接口在 game.js:951。
## 状态与主循环
**没有 `G` 对象**——状态全是 IIFE 闭包变量（game.js:140-161），改动前先核对 `__cube.state()`（game.js:953）读的是哪几个。
| 变量 | 行号（game.js） | 含义 |
|---|---|---|
| `cube` `phase` `elapsed` `moves` | 140-143 | 魔方本体 / `ready｜scramble｜play｜win` / 秒 / 步数 |
| `history` `queue` `spin` | 144-146 | 撤销栈 / 待播转动 / 当前动画，`kind: turn｜scramble｜drag｜settle` |
| `scrambleLeft` `playStart` `lastNow` `solutionStack` | 147-152 | 打乱剩余 / 计时起点 / 上帧时间 / 提示队列（队首=下一步） |
| `best` `locked` | 154-161 | `{t,m}` 存 `doudou-cube-best`；锁定=拖层、解锁=拖视角 |
| `yaw` `pitch` `cosY…`、`dragId` `drag`、`hitFaces` | 69-71, 664-665, 369 | 视角角与三角缓存（唯一入口 `setView`(80)）；单指追踪 `{mode:view｜layer｜none,hit,x0,y0,tangent,decided}`；上帧面片供 `hitTest`(611) |
`frame()` game.js:900：dt≤0.05 → 计时 → drag 限速追角 / 其余缓动 → 队列出队 `startTurn` → `updateHud` game.js:209 → `updateTrig` game.js:73 → `draw` game.js:590 → rAF。
## 想改什么 → 去哪
| 想改 | 去哪 |
|---|---|
| 拖动判成哪一层、哪个方向 | `pickLayer` game.js:619：`k = a × n` game.js:646、`layer = hit.cubie.pos[axisIdx]` game.js:656、方向符号 game.js:651-652、align 门槛 game.js:643 |
| 拖动开始判定的距离 | `DRAG_MIN` game.js:30 + `onMove` 里的平方比较 game.js:755 |
| 跟手换算 / 甩太快 | `PER90` game.js:33 + `setDragAngle` game.js:676（判定那一帧要立刻调用 game.js:761）；限速 `DRAG_SPEED` game.js:34 与 `frame` game.js:906-911 |
| 松手吸附 / 回弹 / 是否计步 | `settleDrag` game.js:701、`QUARTER` game.js:31、`finishSpin` game.js:237（`abs(to)<1e-6` 直接返回不转） |
| 动画时长与曲线 | `frame` game.js:914-920（easeOutCubic 走单步/吸附、easeInOutCubic 走打乱）、`TURN_SEC` game.js:28、`SCRAMBLE_SEC` game.js:29、`SETTLE_SEC` game.js:35 |
| 配色 / 明暗档次 | `COLOR_HEX` cube-core.js:30 + `shadeOf` game.js:373 + `LIGHT` game.js:39 |
| 初始视角 / 灵敏度 / 上下限 | `VIEW_YAW`/`VIEW_PITCH` game.js:25-26、`SENS` game.js:27、`setView` ±1.35 game.js:83、`toView` game.js:88 / `project` game.js:97 |
| 面 / 细条被画出来（剔除） | 背面 `VISIBLE_Z` game.js:528、面积 <2500 game.js:555、`thin`+内缩 game.js:577-578 |
| 内芯、地面阴影 | `drawCore` game.js:484 与 `CORE_HALF` game.js:481；`buildGround` game.js:458 与 `GROUND_*` game.js:452-455 |
| 提示文案与下一步 | `showHint` game.js:292、`moveText` game.js:286、`moveName` game.js:280、`recordSolutionMove` game.js:268、队列填充在 `shuffle` game.js:319 |
| 锁定/解锁行为 | `setLocked` game.js:203、`onDown` 分支 game.js:724-730（锁定时要求 `hit && phase==='play' && !spin && !queue.length`） |
| 计步 / 计时 / 最佳成绩 | `afterTurn` game.js:245、`undo` game.js:325（步数在这里手减）、`winGame` game.js:347、`BEST_KEY` game.js:65 |
| 按钮 / 键盘 / 布局 | 面按钮 index.html:35、左右半边判定 game.js:849-858、键盘 game.js:882、布局 style.css:180 |
## 数值都在哪
| 项 | 当前值 |
|---|---|
| 魔方位置/尺度 | `CX 360` `CY 700` game.js:20-21、`SIZE 0.96` game.js:24、`CORE_HALF 1.47` game.js:481 |
| 透视 | `CAM 11.5` game.js:22、`FOCAL 1630` game.js:23、近处钳位 `d<0.6` game.js:100 |
| 视角 | `VIEW_YAW -0.72` `VIEW_PITCH 0.48` game.js:25-26、`SENS 0.0056` game.js:27、pitch 限 `±1.35` game.js:83 |
| 动画秒 | `TURN_SEC 0.2` game.js:28、`SCRAMBLE_SEC 0.09` game.js:29、`SETTLE_SEC 0.17` game.js:35 |
| 手势/判定 | `DRAG_MIN 10` game.js:30、`PER90 120` game.js:33、`DRAG_SPEED 15` game.js:34、`QUARTER π/4` `HALF π/2` game.js:31-32；面内轴 `abs(dot)>0.5` game.js:629、探针 0.45 game.js:631、align 最小 0.35 game.js:643 |
| 剔除/内缩 | `VISIBLE_Z 0.01` game.js:36、面积 2500 game.js:555、`thin` 用 1500/1200 game.js:577、`inset 0.91+0.08*thin` game.js:578 |
| 光照/描边 | `LIGHT` game.js:39、三档 0.74/0.87/1 与 W 下限 0.92 game.js:375-378、描边 `#0b1018` 线宽 `min(1.8,边长*0.07)` game.js:444-445、高光 minEdge>14 game.js:433 |
| 其他 | `queue` 上限 12 game.js:303、打乱 20 步 game.js:316、进页面 420ms 自动打乱 game.js:947、最佳成绩键 `doudou-cube-best` game.js:65 |
## 测试
`node games/cube/test-core.mjs`（21 项，纯逻辑）/ `node games/cube/test-input.js`（47 项，真浏览器，靠 `?debug` 的 `window.__cube`）；后者校验「拖动中不计步」「45° 回弹」「顶排向右=U」，改手感必跑。
## 雷区
- **`drawCube` 两条铁律**：只画 `c.stickers[fi]` 非空的外表面（game.js:519-521，内侧面会抢排序露黑块）；转动中的层法线必须跟着 `spinMat` 转（game.js:526），否则背面剔除漏面、只剩顶面。
- **`pointermove` 里绝不能 `getBoundingClientRect()`**：rect 只在按下 game.js:717 和 resize game.js:131 刷新（game.js:121）。
- **贴纸用 `quadPath` 平涂+描边，别用 `arcTo`**：极扁四边形会拧成月牙（注释 game.js:414-415）。
- **面积剔除 2500 + `thin` 内缩**专治「贴纸碎片」（视角接近正对时侧面缩成 1~8px 细条）；渐变与地面阴影都预渲染（`HILIGHT` game.js:401、`groundLayer` game.js:458），每帧现场 `createLinearGradient` 会拖慢拖动。
