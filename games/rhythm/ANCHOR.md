# 节奏豆豆 · 锚点表
> 改这个游戏先读这一份。约 6700 行代码。通用规则见根 AGENTS.md。
## 一句话
跟着鼓点，在“东西碰上”的那一帧按一下；黄点只是提示。判定只认 AudioContext 时间轴（掉帧不掉判定），硬件延迟与玩家校准一起补。54 关，单关约 28–44 秒。
## 文件在哪
| 文件 | 行数* | 管什么 |
|---|---|---|
| `game.js` | 2772 | 编排：state 机、音频时钟、判定/输入、主循环、HUD、结算、资源加载。另有一套旧“纸片人”渲染兜底（`sideRig`，见雷区） |
| `rhythm-core.js` | 192 | **纯逻辑、无 DOM**：关卡表、谱面生成、判定窗口、评分、校准、`cuePose`；Node 可直接 require |
| `scenes.js` | 456 | **数据**：54 关 `SCENES`（名称/BPM/主题/visual 坐标）+ `PLAN` 节奏型 + 配乐风格 `M` + 主题色 `T` |
| `scene-draw.js` | 1600 | **扁平插画渲染**：房间背景（SVG 缓存 / `SCENERY` 兜底）、道具、角色、火花；SVG 房间只铺 y=300–1170 |
| `music.js` | 730 | **Web Audio**：采样与合成音色、总线压缩/混响、`buildTrack` 编曲、前瞻调度、判定音效；采样在 `audio/`（10 wav） |
| `index.html` / `style.css` | 67 / 380 | 三页结构 `#home` / `#calib` / `#result` + 页面外壳、选关卡片、结算样式 |
| `test-core.mjs` / `test-input.js` | 295 / 208 | 逻辑测试 / 真浏览器输入测试 |
| `assets/` | 95 svg + 2 png | 背景与道具 SVG；没有对应房间的关由 `SCENERY` 代码画 |
\* 行数按非空行计；下文行号是文件物理行号。
## 状态机与主循环
- `G.state`（`game.js:60`）：`home` → `cut`（`game.js:291`，等音频解锁；lead 2.4 s / 连关 0.45 s，`:294`）→ `play`（`:309`）→ `ready`（练习段到 `8*spb` 自动 suspend，`:597`；再按一下回 `play`，`:437`）；`calib`（`:362`）与 `result`（`:324`）是支线。`showScreen`（`:249`）只切 DOM。
- 主循环 `frame`（`game.js:2797`）：`dt=min(0.05,…)` → `update(dt)`（`:578`）→ `draw()`（`:667`）→ rAF。`update` 顺序：特效、按键回弹、判定文字寿命（`:579-592`）→ `play` 时先练习段门闸（`:597`）→ `reapMissed`（`:603`）→ `updatePose`（`:604`）→ `updateSection`（`:605`）→ `G.total+0.5` 结算（`:606`）；`calib` 只查超时（`:607`）。
- **判定不在帧里**：输入直接进 `onTap`（`game.js:434`）；`t=eventAudioTime(ev)-G.latency-G.offset/1000-G.startT`（`:446`），取最近未判定音符，`Core.judge`（`:455`），`far` 直接 return（`:456`）。窗口来自 `rhythm-core.js:24` 的 `WIN`（80/150/220 ms），`judge` 在 `:120`；漏拍在 `game.js:463` 扫，阈值 `WIN.miss+80`（`:467`）。
## 想改什么 → 去哪
| 想改 | 去哪 |
|---|---|
| 判定窗口 / 评级线 / 连击 | `rhythm-core.js:24` `WIN`、`:120` `judge`、`:128` `grade`、`:136` `tally`（good 算半分，`:146`） |
| 延迟校准与补偿 | `game.js:27` `CALIB_BEATS`、`:28` `CALIB_SPB`、`:350` `startCalib`、`:376` `calibTap`、`:391` `finishCalib`；算法 `rhythm-core.js:161`；应用在 `game.js:446` |
| 加关 / 改谱面节奏 | `scenes.js:262` `SCENES` 加一条 + `:394` `PLAN` 加一条（漏了在 `:475` 抛“缺句子”）；节奏型 `:65` `patternOf`、`:138` `CELL`；展开 `rhythm-core.js:81` `buildChart` |
| 场景道具 / 角色动作 / 动画 | `scenes.js:258` `V()` 的 `visual` 与 `:145-247` 辅助；`scene-draw.js:1591` `draw`、`:679` `drawThing`、`:512` `drawActor`；动作曲线 `game.js:480` `ENTER`、`:496` `propArrive`、`:555` `updatePose`、`rhythm-core.js:173` `cuePose` |
| 背景 / 素材 / 缓存 / 分辨率 | `scene-draw.js:1012` `SCENERY`、`:1531` `AI_ROOM`（仅 lift/kick）、`:1545` `roomCache`、`:1565` `drawRoomCached`；资源表 `game.js:2809` `ART`、`:2926` `loadAssets`、`:645` `resize` |
| 音乐 / 音效 / 判定反馈 | `music.js:612` `buildTrack`、`:27` `HOOKS`、`:42` `ANSWERS`、`:17` `SNARE_KIT`；每关风格 `scenes.js:39` `M`；反馈 `game.js:416` `applyJudge`、`music.js:585` `judgeSfx`、`:563` `clap` |
| HUD / 跑道 / 按钮 / 音符提示 | `game.js:2499` `drawHud`、`:2523` `drawLane`、`:2557` `drawBeats`、`:2570` `drawNotes`、`:2606` `drawRhythmButton`；按钮 `index.html:35` |
| 选关 / 混合 / 结算 / UI | `game.js:238` `setPlayMode`、`:264` `startGame`、`:314` `finish`；页面 `index.html:26`、`:45`、`:55` |
| 最佳评级 / 提示开关存档 | `game.js:25` `BEST_PREFIX`、`:26` `NOTES_KEY`、`:143` `loadBest`、`:147` `saveBest`、`:156` `loadShowNotes`、`:212` `renderLevels` |
| 输入（触摸 / 多指 / 键盘） | `game.js:2762` `bindInput`、`:434` `onTap`、`:107` `eventAudioTime`；键盘 Space/J/F 在 `:2782` |
## 数值都在哪
| 常量 | 当前值 | 位置 |
|---|---|---|
| 舞台 / 车道 / 命中线 | 720×1600 / `LANE_Y=1252` / `HIT_X=132` | `game.js:12-15` |
| 音符速度 / 节奏按钮 | `SPEED=360` px/s / 圆心 1430、半径 98 | `game.js:16-18` |
| 判定窗口 | perfect 80 / good 150 / miss 220 ms；漏拍再宽限 80（=300） | `rhythm-core.js:24`、`game.js:467` |
| 评级 | S：acc≥85% 且 miss+none=0；A ≥85%；B ≥70%；C ≥50%；其余 D；good 按 0.5 计 | `rhythm-core.js:128-146` |
| 校准 | 12 下 × 0.5 s（120 BPM）；丢前 2 下、中位数、样本 ≥3；`offset` 读档限 ±200 ms | `game.js:27-28`、`:125`、`rhythm-core.js:161` |
| 开局门闸 | lead 2.4 s（连关 0.45）；练习 2 小节不判定；到 `8*spb` 进 `ready` | `game.js:294`、`:597`、`rhythm-core.js:88` |
| 时长 / 规模 | `(bars+2)×4×60/bpm`；54 关实测 28.1–43.8 s；BPM 94–128（首页卡片“30 秒”是约数） | `rhythm-core.js:74`、`:65` |
| 音量 / 缓存 | master 0.8、压缩 -20 dB / ratio 5、makeup 1.34；`SCENE_SCALE≤1.5`、`PROP_MAX=384` | `music.js:127`、`:93-99`；`game.js:2913-2914` |
## 测试
`node games/rhythm/test-core.mjs`（464 项：关卡表/谱面/判定边界/评分/校准/cuePose）
`node games/rhythm/test-input.js`（30 项：选关/单指/多指/键盘/真按拍点/结算/下一关；需 Chrome 或 Edge）
本次实测：464/464、30/30 全过。

## 雷区
- **改谱面别改 `keep`**：`scenes.js:248` 的 `keep` 是旧谱面，`:473-478` 会用 `PLAN` 覆盖所有关；改它不生效。
- **提示死码**：`updateSection`（`game.js:616`）只在谱面出现 `'d'` 时给提示，但 54 关都没有 `d`（`test-core.mjs:33` 也断言了）；`drawSectionHint` 实际永不显示。
- **两套渲染**：`game.js:1507` 有 `visual` 就直接走 `SceneDraw.draw`；`:1147` 起的 `sideRig`/`drawSideDoll` 是旧兜底，别再改错层。
- **`rollBar` 不生效**：`game.js:306` 传 `G.lv.rollBar`，但 `Core.stage`（`rhythm-core.js:42-62`）不产出该字段；`music.js:688` 的军鼓滚奏分支永远不触发。
- **两层延迟**：`G.latency`（`music.js:219` 的 output/baseLatency）与 `G.offset`（玩家校准）是两回事，`game.js:446` 同时减；只改一个会整体偏。
- **空按不罚**：`onTap` 判 `far` 时直接 return（`game.js:456`），音符不消费、不记 miss；只有超过 300 ms 的漏拍才进 `none`（`:463`）。要改惩罚就在这里。

## 详见
- 玩法与数值：[玩法与实现](../../docs/节奏豆豆-玩法与实现.md) · [开发记录](../../docs/节奏豆豆-开发记录.md)
- 结构与关卡：[结构参考](../../docs/节奏豆豆-结构参考.md) · [五十关进度](../../docs/节奏豆豆-五十关进度.md)
