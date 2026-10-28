# stickyfeet · 锚点表
> 改这个游戏先读这一份。约 1587 行代码（不含 vendor：main.js 1393 + index.html 194）。
## 一句话（什么游戏/实验，能不能玩）
3D「黏脚走路」原型：小人两条腿是软绳，脚钉在地上、身体走开就把腿越拉越长（HUD 显示「后腿拉到 x 倍」）。任务链 = 捡斧子 → 砍树（每棵 2 下）→ 捡 6 根木头 → 到左边木桩点「建房子」。
能玩：双击 `index.html` 即可（本地 UMD three、贴图全 `CanvasTexture` 程序生成、无外部请求，需 WebGL）。无存档、无音效。three.js 用法：`WebGLRenderer` + Lambert/Basic 材质 + 程序化几何（球/柱/锥/环）+ 手写 `BufferGeometry` 软绳 + `Raycaster` 点选 + PCFSoft 阴影；**没有** GLTF / 骨骼动画 / OrbitControls / 后处理（`main.js:44`、`441`、`515`）。
## 现状（首页没挂 / 有无入口 / 有无测试 —— 只写有证据的）
| 项 | 证据 |
|---|---|
| 首页没挂 | 根 `index.html` 只有 9 张卡（doudou/wordtower/hero/cube/rhythm/darklegend/catchalien/zombie/cardfight），全文搜 `sticky` 零匹配 |
| 有独立入口 | 本目录 `index.html` 完整可开；但没有 thumbnail.png，也没被任何卡引用。标题写「黏脚走路原型」（`index.html:6`），能玩；是否「废弃实验」代码没写，待确认 |
| 无测试 | 目录仅 3 个文件（`index.html` / `main.js` / `vendor/three.min.js`），无 `test-*`、无 `.json` |
## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| `main.js` | 1393 | 全部逻辑：渲染、角色、走路、斧子、砍树、盖房、输入、相机 |
| `index.html` | 194 | 页面骨架 + HUD/按钮 DOM + 内联 CSS；`?v=21` 引入 main.js |
| `vendor/three.min.js` | 7（压缩，669,884 字节） | 第三方 three.js；首行自述「r150+ 弃用此 build」，版本号待确认（`index.html:190` 注释写 r160.1） |
## 状态机与主循环
**状态变量（没有字符串状态机）**：
- `job`：`null | {type:'take'} | {type:'chop',tree} | {type:'build'}`，声明 `main.js:170`，赋值 426/431/658，推进 `updateJob` `927`
- `held`：`null | 'axe'`（`main.js:300`）；`quest = {wood, built}`（`main.js:168`）
- `hop.grounded`（`36`）、`foot.planted`（`477`）、`demoWalk`（`30`）、`presetIndex`（`28`）
主循环 `frame()` `main.js:1066`，末尾 `requestAnimationFrame(frame)` `1349`，启动 `1352-1353`。
每帧顺序：dt `1067` → job `1071` → 求方向 `1076` → 位移+圆形边界 `1110` → 朝向/速度 `1127` → 跳跃 `1137` → 双脚迈步/落地 `1164` → 髋高与拉伸 `1217` → 身体/头/手摆姿 `1236` → 每脚软绳+手臂 `1251` → 尘团 `1296` → 斧/木头/树/任务 UI `1310` → 脚下阴影 `1315` → 相机 `1318` → 灯跟随 `1341` → HUD 文本 `1344` → render `1348`。
## 想改什么 → 去哪
| 想改 | 去哪 |
|---|---|
| 走路「黏」手感（腿多长才迈步、迈多高） | `PRESETS` `main.js:22-26`；迈步判定 `1207-1213`；软绳粗细 `radiusAt` `565` |
| 角色外形/表情/手臂 | 身体与头 `229-268`；`makeArm` `270-298`；配色 `79-93` |
| 斧子拿起/丢下/握持朝向 | `gripAxe` `365` / `releaseAxe` `376` / `placeHeldAxe` `358` / `updateAxe` `399` |
| 砍树、掉木头、捡木头 | `strike` `874` / `spawnLog` `858` / `updateLogs` `977` |
| 盖房子任务与 HUD 文案 | `placeHouse` `891` / `refreshQuest` `1034` / `refreshActions` `1022` / `index.html:145-149` |
| 点地面走、点物体交互（含触摸） | 画布指针 `748-811` / `aim` `695` / `interactHit` `688` / `pointerNDC` `681` |
| 相机角度/远近/跟随 | `cam` `512` / `clampCam` `705` / `nudgeCam` `710` / 每帧 `1318-1339` |
| 场景摆件（地面、树、菜、云） | 地面 `104-117` / `makeTree` `121`（4 棵在 `139-142`）/ `veggie` `174` / `cloud` `193` |
## 数值都在哪
| 常量/数值 | 当前值 | 位置 |
|---|---|---|
| 腿骨架 | `BASE_HIP 0.68` / `SOCKET_DROP 0.2` / `FOOT_Y 0.06` / `REST 0.44` | `main.js:13-16` |
| 走路/边界/绳 | `SPEED 1.8` / `LIMIT 9.15`（圆盘半径）；绳 `POINT_COUNT 12` 段 × `RADIAL 8` 边，半径 0.072→0.055 | `17-20`、`566` |
| 三档黏度 | 普通 `release .72 / swing .2 / arc .13`；黏脚 `1.25 / .1 / .045`；太黏 `1.95 / .14 / .03`，默认第 2 档 | `22-28` |
| 任务/位置/跳跃 | `WOOD_NEED 6`、树 `hp 2`；木桩 `-2.5/1.7`、斧子 `-1.2/0.45`；起跳 `5.6`、重力 `16` | `167`、`133`、`144-145`、`301-302`、`1141`、`1145` |
| 相机 | `yaw π / pitch 0.42 / dist 3.6`；夹取 pitch `0.12~1.35`、dist `1.7~9` | `512`、`706-707` |
## 测试
无自动测试（目录无 `test-*`，根 `AGENTS.md` 测试表也没这个游戏）。手动验：双击 `games/stickyfeet/index.html` → 点「拿」捡斧子 → 点树砍 2 下 → 走近木头自动捡够 6 根 → 走到左前木桩点「建房子」；`?autowalk` 可自动来回走（`main.js:11`），控制台 `window.__sticky` 是调试口（`1355-1392`）。
## 雷区
- `setPointerCapture` 全包在 try/catch，注释「合成事件没有捕获」（`726/755/777`；`731-733` 释放捕获另注「已经松开」）：脚本发合成 PointerEvent 时捕获会失败，属已知，不是坏了。
- HUD 木头数写死 `/6`（`1045/1052/1060-1061`）：改 `WOOD_NEED` 必须同步改这几处文案。
- `index.html:192` 带 `?v=21` 缓存参数：改完 `main.js` 要 bump 版本号才看得到效果。
- `const clock` 在 `520` 才声明，`updateAxe`（`406`）已用到它；只因 `updateAxe` 只在 `frame` 里跑才安全。同理站着不动时脚目标点取 `hitPoint`（`1211`），它只由 `aim()` 射线写，没点过屏幕前是 (0,0,0)，脚会往原点挪——现状如此，不是 bug。
