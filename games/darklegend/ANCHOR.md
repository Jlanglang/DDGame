# 豆豆海岛幻想 · 锚点表
> 改这个游戏先读这一份：**18 个 `src/*.js` 12937 行 + 页面 1660 行 + 测试 2052 行 ≈ 16649 行**（另有 8 个 .py 生成器不参与运行）。先看 `docs/STATUS.md` 定做什么，玩法数值以 `docs/豆豆暗黑传奇-规则与任务.md` 为准，画面验收看 `docs/渲染规格.md` §八；本表只记「改这个 → 动哪几个函数」，不重复文档。**2026-10-29 起只剩 3D（WebGL），2D Canvas 渲染整条已删除。行数已于 2026-10-30 按 `src/` 重算。**

## 一句话
主城 24×24 + 14 个房间（`ROOMS`）的回合制刷宝：走一格 = 一回合，由 `after()` 排下一拍；装备落地成袋、走上去才捡；画面是 three.js **mir 俯视透视**（yaw0° / pitch55° / fov32 / zoom1.70，竖向≈20 格；WebGL），没有 2D 回退；旧等距用 `?cam=iso`。

## 文件分层
| 文件 | 行数 | 层 | 管什么 |
|---|---|---|---|
| `src/data.js` | 394 | data | 全部表与常量（`DL.DATA`），无逻辑 |
| `src/core.js` | 107 | core | 纯公式：成长、装备区间、等级差查表 |
| `src/world.js` | 326 | world | `genHub` `genRoom`（`size` 直接是最终格数，不再 ×2.2）`genTerrain`、`bfs`（朝目标排序）、`tightenPath`（视线拉直）、`canStep` |
| `src/overworld.js` | 328 | world | **128×128 整图 + 陆地约 96×96**（`ISLAND_R`(17)=48 + 正弦湾；`CITY` 31×31 居中 = 安全区）+ **城外野怪**（`placeFieldMobs`(110)：1~5 级鸡/稻草人/野狗 47 只，只站草地、离城 ≥3 格、离出生点 ≥6 格、彼此隔 `FIELD_GAP`(108)=5 格；**鸡铺满南野（墙根到沙滩边）、野狗在北墙外、稻草人四条边随机**，三边都靠 `SHORE_BAND`(109) 在贴海那圈先留几只）+ **南岸渔屋 + 椰子树**（`findBeachHut`(250) 定屋、`placeBeachPalms`(271) 在屋边撒 5 棵椰子；这两样是岛上仅有的道具）+ `caveMap`（`applyOverworld` 用；现在恒启用） |
| `src/combat.js` | 133 | combat | `playerDamage` `enemyDamage` `halfMoonCells` `decide` `nextStep` |
| `src/status.js` | 169 | status | `DEFS` + `apply` `tick` `onHit` `canAct` `list` |
| `src/game.js` | 4786 | game | 编排 + 全部 DOM 绑定（2D 绘制已删，分段见下）；**启动段包在 `startGame()`(4548) 里**，由单实例守卫决定开不开 |
| `src/render-three.js` | 2167 | 3D | mir 俯视场景：地面分块/立牌/接触阴影/排序/迷你图/拾取/帧率角标；**唯一画面**；相机开关 `?cam=`（默认 mir，iso 保留）；**草地细节层** `addGrassDetail`（屏幕级草叶 shader，见「想改什么」）；**海岛地标**（渔屋 / 椰子树）走 `addProp` 的 `beachHut`/`palm` 分支 |
| `src/hd-draw.js` 942 + `src/iso-ground.js` 481 + `src/three-pick.js` 60 | — | 3D 素材 | **立牌真身**（PNG 素材清空后全走它）：`heroSheet` `npc` `mob` `house` `beachHut` `palm` `rock` `caveMouth` `flora` `townProp` / 菱形地面 `paint`(369) / 屏幕→格射线 |
| `src/iso-art.js` | 2293 | — | 3D 地面 | **地面材质真身**：10 种材质画法、`groundSheet`（`cutSea` 时海不进覆盖层，靠海岸距铺沙；可传整图 `coast`+`coastPx` 只裁块）、`coastField`（弯曲岸距）、`sandMask`（沙带遮罩，整图一次、块里裁）、`cropCanvas`、`seaSheet`（验收台旧海面）、`seaMask`（海/池塘）、`shoreline`（池塘岸线）、崖壁 `cliff`/`cliffHeight`；验收台 `asset-bench.html`（⑥ 整张 vs 分块） |
| `src/sfx.js` | 226 | audio | `SFX` 音名表 + WebAudio/WAV 兜底，`MUTE_KEY` |
| `src/main.js` 18 + `src/boot.js` 9 + `src/namespace.js` 5 | — | shell | `main.js` 是唯一 ESM 入口，按依赖顺序 import；**`boot.js` 必须排在 `game.js` 前**——它先建单实例守卫，`game.js` 才按 `DL.SingleTab` 决定开不开局；`namespace.js` 建 `DL` 命名空间 |
| `src/single-tab.js` | 316 | shell | **单实例守卫**：同一个存档只许一个页面在跑。BroadcastChannel ping/pong（判死活，不受后台计时器节流）+ localStorage 心跳锁（兜底）。`createSingleTab()` → `ready` / `role` / `onLost`；抢不到锁只显示遮罩，另一个页面关掉后自动接管；`save()`/`after()` 里有 `isLost()` 早退兜底 |
| `index.html` 326 + `style.css` 1336 | — | shell | HUD/DOM 与布局。左上角常驻 `#fps` 帧率角标（1 秒窗口）；开发页只留一行 `<script type="module" src="./src/main.js">`；双击入口是 `dist/index.html`（928 KB 单文件） |
| 测试 5 件 | 2080 | test | test-game 1605 / test-input 192 / balance 160 / test-three 64 / check-assets 58 |
| `gen-*.py` 8 个 | — | 素材 | 生成 `assets/**` 的老管线；**产出已被清空**（2026-10-29），新素材按 `docs/立牌统一规格.md` 重出 |

## game.js 4786 行的分段地图
| 行区间 | 段 | 关键函数（行号） |
|---|---|---|
| 1–458 | 骨架 | `P` 初始(187)、全部 `let` 状态(230)、`useOverworld`(454)、`uiOpen`(421) |
| 459–879 | 野外/主城/房间/刷怪 | `applyOverworld`460 `genHub`501 `spawnRoomMobs`546 `enterRoom`597 `leaveRoom`643 `spawnBossInRoom`729 `tryRoomRespawn`772、精英/稀有保底 `elitePityMax`(800)/`rarePityMax`(801) |
| 880–1083 | 敌/装备生成 | `isCrush`881 `makeEnemy`888 `rollRarity`926 `makeEquip`934 `eqReqLv`997 `rollDropSlot`1020 |
| 1084–1745 | 装备链 + 面板气泡 | `addToBag`1085 `equipFromBag`1108 `sellFromBag`1134 `depositFromBag`1161 `sellBagByRarity`1203 `eqCellHtml`1330 `showEqTip`1455 `renderChar`1554 `updateTips`1654 |
| 1746–1936 | HUD/交互/存读档 | `syncHud`1747 `interactTarget`1789 `tryInteract`1806 `save`1851 `load`1880 |
| 1937–2340 | 战斗+试炼+技能书 | `engage`1938 `strike`1944 `kill`1957 `rollTrialTask`2074 `turnInTrial`2117 `renderTrial`2220 `rollSkillBookDrop`2275 |
| 2341–2609 | 掉落/袋/挂机 | `rollDrop`2342 `rollKillEquipDrops`2352 `dropBag`2393 `pickupBag`2415 `setAutoFarm`2497 `autoTakeBag`2541 |
| 2610–2784 | 怪回合/状态/生死 | `enemiesTurn`2611 `bossTrick`2655 `tickStatuses`2673 `die`2700 `revive`2725 `win`2741 |
| 2785–2981 | **回合时钟（改节奏只动这里）** | `after`2786（DoT→MP/CD→怪行动→`turn++`→存盘→下一拍）`farmStepTo`2872 `autoStep`2902 |
| 2982–3391 | 技能/动作/移动/门 | `startClockTimer`2983 `attack`3024 `halfMoon`3041 `fireSword`3055 `drink`3073 `act`3107 `promptDoor`3155 `move`3195（撞怪=攻击）`walk`3347 |
| 3392–3684 | 输入 | `handleCellClick`3393（唯一点地/点怪入口，3D 反算格子后回调）`bindDpad`3620 `onKey`3652 |
| 3685–4341 | 商店/仓库 + DOM 绑定 | `ensureShopCatalog`3686 `refreshShop`3759 `refreshStash`3782 `buyPotion`3824 `buy`3866、`bind`3930（所有按钮/遮罩/音效门） |
| 4342–4537 | 地形/道具生成（3D 场景数据） | `themeNow`4345 `isBorder`4353 `walkableNear`4357 `refreshTerrain`4370 `buildProps`4427 |
| 4538–4733 | 启动/调试出口 | `startGame`4548（整段启动都在里面）、`ThreeBridge`4589、`window.__dl`4625（`?debug`）、单实例门 4732（`DL.SingleTab.ready` 通过才 `startGame()`） |

## 想改什么 → 去哪
| 想改 | 动这几个 |
|---|---|
| 怪血/攻/防/经验/金币 | `game.js makeEnemy`(888) + `data.js GRADE`(136)；**同步 `balance.mjs`(29–50)** |
| 玩家成长/升级曲线 | `data.js GROWTH`(384) → `core.js maxHp/atkRange/needExp`(63–76) |
| 掉落概率/保底 | `data.js DROP`(165) `RESPAWN`(60)；`game.js rollDrop`(2342) `rollKillEquipDrops`(2352) |
| 装备底材/属性倍率 | `data.js EQUIP_BASES`(218) `EQUIP_STAT_MUL`(325)；`game.js makeEquip`(934) |
| 词缀（M2 冻结但在跑） | `game.js makeEquip`(934) 掷 affix、`core.js affixMult`(34) 已计入伤害，UI 占位 `affixSlot`(1076) |
| 房间 / 地图 / 主城 | `data.js ROOMS`(349) `THEME_OF_ROOM`(13)；**野外图 = 128×128 整图 + 中间 72×72 陆地 + 四周海**（`ROOMS` 的 `size` 就是陆地边长，`world.js genRoom`(219) 不再 ×2.2、陆地里不放障碍；海/沙滩在 `game.js refreshTerrain`(4372) 按 map=1 上色，陆地外 → terrain 3、靠海两圈 → 4；洞窟 44/48 保持）；`world.js genHub`(185)；`game.js enterRoom`(597) |
| 城外野怪分布 / 密度 | `overworld.js placeFieldMobs`(110)：`plans` 里 `n` 是只数、`d0/d1` 是离城墙的距离（格，**d1=99 = 一直铺到草地边缘**，别再写死 12 那种数）、`side` 是边（north 北 / south 南 / any 四条边随机）、`shore` 是先在海边留几只；深度上限由 `edgeCells` 按列量（碰到沙滩/海就停），贴海判定 `SHORE_BAND`(109)=2 格；只站草地、彼此隔 `FIELD_GAP`(108)=5 格。死掉 8 秒后原地重生（`game.js respawnField`(2590)，玩家离 >6 格才刷） |
| 战斗判定（伤害/范围） | `combat.js playerDamage`(19) `halfMoonCells`(34)；`game.js strike`(1944) `halfMoon`(3041) |
| 怪 AI / BOSS 出招 | `data.js AI`(125)；`combat.js decide`(76)；`game.js enemiesTurn`(2611) `bossTrick`(2655) |
| 状态（毒/烧/眩晕/麻痹） | `status.js DEFS`(23) `apply`(60) `tick`(86)；`game.js tickStatuses`(2673) |
| 棋盘/墙掩码/图集（已无） | 2D 删掉后 `tiles.js`、`assets.js` 也删了；地面走 `iso-art.js`，立牌走 `hd-draw.js` |
| 3D 画面 | `render-three.js rebuildRoom`(1456) `buildGround`(946) `addPlate`(634) `makeChunk`(671)/`syncChunks`(804)/`pumpChunks`(736)（地面分块）`addEnemy` `addProp` `tick`(1700)；`iso-ground.js paint`(369) |
| 地面块大小 / 驻留圈 | `render-three.js` 的 `CHUNK_CELLS`(52)=**8 格**（块大小=走路手感的开关：16 格单块 30~42ms 会顿，8 格不顿）；驻留不是单独常量，是 `syncChunks`(804) 里 `addBox(keep, …, -1, …, +1)` 把视野块再外扩 1 圈；改完用 `asset-bench.html` ⑥ 对拍 + `?stats=1` 看帧时间 |
| **走路一顿一顿 / 掉帧** | 先看是不是地面分块在生成：`render-three.js makeChunk`(671) → `iso-art.js groundSheet`(1759)。**一块的正常预算 ≤6ms**（165Hz 一帧才 6.06ms）：2026-10-29 实测老路 16~26ms/块、走路每 0.3s 掉 4~7 帧；病根是沙带「每块 getImageData×3 + 逐像素覆盖」。现在改成整图沙带遮罩 `sandMask`(2152)（`buildGround` 里和 `gSea` 一起建，16×16 格外的块只 drawImage 裁一块）→ 3.5~5.7ms/块。另有 `turfTileCached`(317 附近) 草皮砖缓存、`seaMask`(1636) 按地形数组缓存。**再动这几处先量**：`tmp/bench-ground.mjs`（各变体耗时）、`tmp/fps-probe.mjs`（走 8 段路看长帧）、`tmp/diff-ground.mjs`（老路/新路逐像素差，用来确认没改画面） |
| 主角外观 / 攻击动作 | `render-three.js heroFrame`(354) 切 `hd-draw.heroSheet` 的 4×5 图集（4 向 × 待机/走路 2 帧/攻击 1 帧 + 倒地）；身高 `HERO_H`(1169)。**PNG 立牌已清空**，新图回来后在 `rebuildRoom` 里按 key 换回 |
| 走路插值（A5） | `game.js`：`beginWalkStep`/`snapWalkVis`/`walkStepVis`/`walkVisPos`/`walkLine`；桥 `ThreeBridge.step()`；`render-three.js` tick 里 hero+look **硬跟** `vis`（没有相机缓动，所以 `vis` 一跳镜头就抖；换图/复活 `snapWalkVis`）。逻辑仍整格跳，只改画面 |
| **点地走成楼梯 / S 形** | 两层：① `world.js` `bfs`(147) → `tightenPath`(130) 用 `lineWalk`(84) 视线拉直，折点存进 `path.pts`；② `game.js` 的 `walkLine` 让画面沿 `pts` 之间的**真直线**走（逻辑仍一格一拍）。只拉直路径不够——八向网格的缓斜线永远是「斜一步、直一步」，贴着格心画就是蛇形。**别再退回「横一步+竖一步」的两格合并** |
| **连点换目标 / 镜头抖** | `game.js` `walk`(3361)：折线带 `ks`（每个折点对应的格数，`s = done-1+stepProgress()`），`pointOnSteps` 按格数在段内插值——画面和逻辑同一拍，拐点不跳。换目标时 `pts[0]` 换成**当前画面位置**（`walkStepVis()`，格数取负数 `s0`），并跳过格心 `P` 直接连下一个拐点：否则新折线从格心起算，画面会横跳 0.2~0.7 格（`done=0` 时还会切回逐格插值，两套模型对不上）。`stopWalk` 把折线位置接进 `walkVis`，键盘接管/撞怪也不会弹回格心 |
| 3D 崖壁（边缘山脊 / 野外孤石） | `render-three.js buildCliffs` / `addCliffSprite`（只往 `map=1` 的格子立，不会走穿）、`paintTex` 按「主题+变体+高度档」缓存；全部走 `iso-art.js` 程序化崖壁 |
| 3D 地面材质（草地/石板/水/海/岸线） | `iso-art.js`：`paintGrass` `paintSlab` `paintWater` `paintSea` `shoreline` `seaMask` `groundSheet` `coastField`；海面在 `render-three.js` `addSeaMesh`（着色器，盖在沙上，`SEA_Y`）；改完看南岸和 `asset-bench.html` |
| **草地风格（2026-10-30 定稿：一片绿 + 零星点缀）** | **只走贴图** `iso-art.js paintGrass`：底色 = `PALETTES.field.base`，上面只有 ① 很淡的大块明暗（`softBlob`，alpha 0.03~0.06）② alpha 0.13 的绒纹（`turfTile`，384px 砖）③ **每约 80 格一颗**小草（`GRASS_CLUMP_P`=0.012、`GRASS_R`=0.18）④ ~1/120 格一朵小白花、~1/80 格一块小石。**不要屏幕级草叶层**（试过 shader 版：满屏冒草、发脏，主人两次否掉）。要调疏密只动 `GRASS_CLUMP_P` 和 ④ 里那两个概率 |
| **城内地砖颜色（2026-10-30 改成沙色）** | 地砖本身没动：`overworld.js` 的 `inCity` 仍是 31×31 整片 `terrain=1`，`render-three.js` 仍是 `style:{path:'slab'}` + `addPlate`(657) 叠 `slabSheet` 一格一块（`TILES_PLATE`(76) 默认开，`?tiles=flat` 退回平铺）。改的只是**配色**，全在 `iso-art.js`：① 砖面 `paintSlabFace` 的 `base` 由灰石色换成 `mix(T.path, T.cream, 0.16)` 的暖沙色再分四档深浅；② 缝 `paintSlabBig` / `slabSheet` 用 `mix(T.soilLo, T.mudLo, 0.55)`（别再回到 `mix(T.mudLo,T.ink,…)` 的黑褐缝）；③ 脏斑/砂砾/磕边改暖土色，不用 `ink`。另有一个没启用的 `sandroad` 材质（整片沙地，`paintSandRoad`(642)）留着备用，`style.path` 换成 `'sandroad'` 就能切回沙地 |
| **浅水偏亮 / 海水颜色** | `render-three.js` `SEA_FRAG` 上方那组常量：`SEA_SHALLOW`（岸边水色）`SEA_SHORE_ALPHA`（越小越透沙、越亮）`SEA_CAUSTIC_SHORE/DEEP`（岸纹强度）`SEA_FOAM_ALPHA`；带宽在 `iso-art.js`：`SHALLOW_TILES`(3.8) 浅水、`SAND_TILES`(6.6) 沙带 |
| **水面动画（涌动 / 浪脊 / 碎沫 / 岸纹）** | 全在 `render-three.js` `SEA_FRAG` 的 ①–⑤ 段，`uTime` 由 `tick()`(1700) 每帧灌：① 慢涌改海面色、② 沿岸距推的浪脊、③ 碎沫跟涌浪舔沙（只动亮暗、`alpha` 仍按 `d`，不会露底衬）、④ 两层岸纹反向漂、⑤ 浪尖反光。**速度就是那几个 `uTime * X` 系数**：0 = 静止；④ 原来只有 0.07（1 秒走 0.03 格），看着像静态图，现在 0.55/0.40。碎沫宽度用 `fd` 的 `0.55` 摆幅，浪脊粗细看 `smoothstep(0.88, 0.995, …)` |
| 地面分块（大图流式加载） | `iso-art.js groundSheet`(1759) 的 `rect`/`margin`（块 + 1 格出血再裁）；对拍看 `asset-bench.html` ⑥（?margin=0 可关出血看反例）；块管理器在 `render-three.js`（`CHUNK_CELLS`(52) **8 格** + `syncChunks`(804) 外扩 1 圈）。海/沙两块传 `coast`+`coastPx` 和 `sandMask`，三者必须同尺寸（都由 `buildGround` 的 `gSea` 出） |
| 崖壁精灵（AI 图，已清空） | `iso-art.js setCliffSprites` / `cliffFoot`；图 `assets/iso/processed/cliff1..3.png` **已删**；重出图看 `docs/瓦片清单.md` §一·五 v4（img2img + `key-magenta.py`） |
| **立牌口径（3D 素材 + 2.5D 固定视角）** | `docs/立牌统一规格.md`：五条硬规则 + 出图 prompt + 五条验收。入库 `tools/ingest-3d.py 原图.png 输出.png --world 2.15`（按色相抠洋红、剥烘死的影子、去水印、缩到 2.5× 屏高）。对拍：`bench-scene.html`（光/影/地八根滑杆，立牌已换程序化占位） |
| **海岛渔屋 / 椰子树（沙滩那两样地标）** | ① 屋子落点 `overworld.js findBeachHut`(250)：只收「沙滩格 + 身后一格是草地」的格子，`HUT_MIN_D`(248)=30 离城中心最少格数、`HUT_AXIS`(249)=16 离中轴最远格数。② 椰子树 `placeBeachPalms`(271)：离屋 `PALM_R`(270)=14 以内、由近到远取 `PALM_N`(268)=5 棵、彼此隔 `PALM_GAP`=4 格、离屋 ≥3 格。③ 外观 `hd-draw.js palm`(537) / `beachHut`(623)，配色常量 `PALM`/`HUT`。④ 立起来在 `render-three.js addProp`（`beachHut`/`palm` 共用一个分支），高度 `HUT_H`(1220)=**4.1**（≈1.9 人，门洞 57.8% 全高 ≈ 2.4 格）、`PALM_H`(1199)=**7.3**（≈3.4 人）。**量高度的尺子只有一把：人 = 2.15**；`hd-draw` 两张画布画完都过 `trim()` 裁到内容外框，否则留白会让立牌"看着变小"——2026-10-30 就是这么踩的一次 |
| **画内透视（屋子的斜边、顶面往哪退）** | `hd-draw.js` 顶部 `ART_YAW`(57)=0 / `ART_PITCH`(58)=34：`isoBox`(63) 和 `gable`(89) 的 `dx/dy` 不再硬写 `0.62d/0.36d`（那是俯角 35° **偏航 45°**），改成按相机算的 `dx=d·sin(yaw)`、`dy=d·cos(yaw)·sin(pitch)`。**34° = 相机 55° − 立牌后仰 21°**，改 `TILT` 必须同步改 `ART_PITCH`。偏航 0 时右侧面侧对相机、自然消失，屋顶进深改成"整块三角上移 dy"。`?art=old` 切回旧画法对照（纹理有缓存，只在重画时生效） |
| **立牌像纸片 / 被压扁（视角）** | 根因是几何：板面竖直、相机 55° 俯视 → 竖直面被投影压掉 `cos55≈0.57`，地面却按 `sin55≈0.82` 显示，所以人和房子比脚下格子矮胖、顶面永远看不见。`render-three.js billboard`(409) 的 `TILT`(384)：**默认 0.6**（2026-10-30 主人拍板），板面绕**底边**后仰 `0.6×(90°−pitch)=21°`。② 后仰会把投影从 `cos55≈0.574` 抬高（全开 1.0 时是 `cos20≈0.940`，屏幕高 1.63 倍，主人当场看出「人看起来大不少」），所以 `tiltScale`(402) 按两个投影系数的商 **等比**缩回去——0.6 档是 `0.574/0.829≈0.692`（屏幕高不变、宽收 31%）——开关前后屏幕尺寸一致，不再是压扁，只是变小一号。`?tilt=0` 旧观感、`?tilt=1` 最"正"、`?tilt=0.6` 是默认；`?pscale=1.15` 可在补偿后再放大微调。**改高度常量时画面必须是同一个 tilt 状态**，否则等于换了一把尺子 |
| 音效 / 存档 | `sfx.js SFX`(185)+`play`(196)、调用点 game 1085/1963；`game.js save`(1851) `load`(1880)、`SAVE_KEY`(28) |
| 鼠标 / 手机触摸 | `game.js handleCellClick`(3393) `bindDpad`(3620)；3D 点击入口 `render-three.js pointer`(1931)（小地图区域已挡）；CSS 222 |
| **多开页面 / 单实例守卫** | `src/single-tab.js`（新文件，整份）；入口 `src/boot.js` 先建好 `DL.SingleTab`；`game.js` 启动段包在 `startGame()`(4548)、文件末尾的门(4732) 拿到锁才开局；`save`(1851)/`after`(2786)/`handleCellClick`(3393)/`onKey`(3652) 头部都有 `isLost()` 早退。刷新走 `sessionStorage` 的 `prevSelfId` 快速接管；判定窗口：`FRESH_MS`(8000) 心跳过期、`PING_WAIT_MS`(350)、`RETRY_MS`(600)。**别退回「只靠 localStorage 时间戳」**——后台标签的计时器会被节流，得靠 BroadcastChannel 的 ping/pong 判活 |

## 数值都在哪（全在 data.js）
| 表（行） | 关键字段 | 谁用 |
|---|---|---|
| `GROWTH` 384 | baseHp/hpPerLv/baseAtk/baseDef/expBase/expRate | `core.maxHp/atkRange/needExp`(63–76) |
| `MON` 76 + `BOSS` 91 + `GRADE` 136 | lv/aggro/ai/atkMin/atkMax/gold；品级 hp/atk/lvAdd/exp/p | `makeEnemy`(887) `poolMon`(708) |
| `DROP` 165 + `RARITY` 155 | c/b/a/s、elite/rare/boss、potion；mult/letter/color | `rollDrop`(2339) `rollKillEquipDrops`(2349) `makeEquip`(933) |
| `EQUIP_BASES` 218 + `EQUIP_STAT_MUL` 325 | ilvl/name、atk/def/hp 倍率 | `makeEquip`(933) |
| `POTIONS` 176 + `SHOP` 337 + `BOOK_SHOP` 54 | tiers.amount、redMul/blueMul、price | `buyPotion`(3818) `buy`(3860) `buyBook`(3739) |
| `RESPAWN` 60 + `ROOM_ENTER_SLACK` 347 | normalDelayMs/elitePityMax/rarePityMax/bossDefaultCd | `tryRoomRespawn`(771) `canEnterRoom`(586) |
| `CRUSH` 145 + `EXP_GAP` 371 + `GOLD_GAP_NORMAL` 375 | 碾压级差、等级差倍率 | `isCrush`(880) `kill`(1954) |
| `TRIAL` 112 + `AI` 125 | rewardPct/collectNeed/orbPct；leash/passiveChase/bossStunP | `rollTrialTask`(2071) `decide`(76) |
| `THEME_OF_ROOM` 13 + `ZONE_FLOOR` 378 | 视觉主题、地面色 | `themeNow`(4339)、`iso-ground.themeOf`(53) |

## 画面：只有 3D（WebGL）
- `render-three.js wanted()` 恒 true（只要求浏览器有 WebGL）；`?engine=canvas`、`?engine=three` 都不再生效。
- `boot()`(1950) 用 `#view3d` 建 WebGL 渲染器（`powerPreference: high-performance`），每帧 `tick()`(1700) 从 `ThreeBridge`（game.js 4572）读状态；点击 `pointer`(1931) 只算格子再回调 `B.clickCell` → `handleCellClick`，不复制寻路/战斗。左上角 `#fps` 角标在 `tick()` 末尾按 1 秒窗口刷新（`?stats=1` 另有详情面板）。
- 双击能跑的是 `dist/index.html`（`npm run build` 打出来的单文件）。源码 `index.html` 和验收台要 `npm run dev`（http://localhost:8183）。贴图仍是程序化画布，不从本地 PNG 上传纹理。
- **打包是手动的**：改完源码只跑测试 + `npm run dev` 目视验证，**不要自动 `npm run build`**、不要动 `dist/`。主人说「打包 / 构建」再打，产物跟那一次提交一起走（`dist/index.html` 是 ~1MB 单文件，每改一次就重打会让 diff 暴涨）。
- 调试参数：`?quality=low` `?shot=wide`(zoom 0.55) `?shot=map`(zoom 0.3，整座岛) `?stats=1` `?chunk=0`(关掉地面分块) `?cam=mir|iso|diag45|diag45p|up45|now`(切相机，默认 mir) `?room=<id>`(需带 shot) `?debug`。
- 地图尺寸 / 陆地大小：`overworld.js` 的 `N`=128 是**整图**，`ISLAND_R`(17)=48 决定**陆地约 96×96**（再往外到图边都是海），`CITY_HALF`(14)=15 是城内 **31×31 的安全区**（2026-10-29 从 41 缩到 3/4；城外那圈自动变回草地，野怪能刷到离墙 3 格）；改完确认出生点、铺子、三个门都还落在可走格上。

## 测试
| 命令 | 现状 |
|---|---|
| `node games/darklegend/test-game.mjs` | **390 项**（Node+DOM 桩）；`import ./src/game.js`（不带 overworld，和改前的加载集合一致） |
| `node games/darklegend/test-input.js` | 真 Chrome `http://localhost:8183/?debug`，8 项：3D 已启动、点小地图不动、点地走、点怪掉血。先 `npm run dev` |
| `node games/darklegend/test-three.mjs` / `check-assets.mjs` | 515 项射线往返（不开 WebGL）/ 只剩瓦片 4 张 PNG 头（tiles-cave + terrain×3，已不被运行时加载，留着等重建） |
| `node games/darklegend/test-single-tab.js` | 真 Chrome 开两个标签，14 项：第二个被拦（无 `__dl`、有遮罩）、关掉第一个后自动接管、刷新不把自己锁住。先 `npm run dev`；末尾可传 URL（如 `file:///…/dist/index.html?debug`）测双击版 |
| `node games/darklegend/balance.mjs --check` | 超范围 exit 1；**当前就有 1 红**（30 级装备占攻 23.6%，目标 35–65），不是你改坏的 |

## 雷区
- **源码是 ESM。** 双击只能开 `dist/index.html`。源码 `index.html` 和 `asset-bench.html` / `bench-scene.html` / `light-test.html` 要开发服务器。`package.json` 不要写 `"type": "module"`，否则 `test-input.js` 的 `require` 会崩。
- **three 钉死 `0.170.0`（REVISION 170）。** 这是原 `vendor/three.iife.js` 的版本。STATUS §七 的光照结论是在这份上量的。不要装 latest，也不要换 major。`src/tile-plate.js` 调用时读 `global.THREE`，`render-three.js` 会把这一份赋上去。不要再放回第二份 three。
- `balance.mjs` **复制**了 `makeEnemy`/装备公式（29–50 行注释自认）；改公式不同步它，体检就是假的。
- 测试不覆盖渲染：`test-game.mjs` 不加载 `render-three` / `hd-draw` / `iso-ground` / `overworld`，改立牌/地面只能肉眼验收（默认交主人看，不主动截图；主人要图时再用 `?shot=wide`）。
- **没有 2D 回退了**：3D 起不来就只剩一条"这个浏览器开不了 WebGL"的提示。调渲染别再指望 `?engine=canvas`。
- `hd-draw.js` 是立牌唯一来源（`heroSheet` `npc` `mob` `house` `rock` `caveMouth` `flora` `townProp` 全在 render-three 里用），改它就是改画面。`mob` 只画了鸡/稻草人/野狗/野猪四种，其余怪用 emoji 立牌占位（`glyphCanvas`）。
- 3D 视口是 16:9（`three-pick.js` 的 `VIEW_W/H = 1280×720`）：**竖屏手机上是上下留黑边的横条 + "请横屏游玩"**；要改竖屏视锥得同时动 `three-pick` / `clampLook` / 点击反算。
- 新弹窗必须登记进 `uiOpen()`(361)，否则 `after`/`walk`/挂机在背后继续跑；加存档字段要 `save`(1851)+`load`(1880) 成对改，`v:4`(1858) 是手写的。
- **单实例守卫的三个坑（2026-10-29 加的）**：① `dist/index.html` 是单文件，`vite-plugin-singlefile` 会把动态 `import()` 内联成**同步执行**——「用 `.then()` 包住游戏加载」在开发页有效、双击版拦不住。所以启动段整段包进 `startGame()`(4548)，由 `game.js` 自己看 `DL.SingleTab.ready` 决定开不开；`src/boot.js` 必须排在 `game.js` 前先建守卫。② 后台标签的 `setInterval` 会被节流到 1 分钟，**光靠 localStorage 心跳会把还活着的后台页误判成已关闭**，判活得靠 BroadcastChannel 的 ping/pong；切回前台（`visibilitychange`/`pageshow`）要重新核对锁归谁——手机上一个标签冻久了会被别的页面接管，回来就该让位（显示"本页已经把存档交出去了"）。③ **刷新会踩死锁**：卸载时可能先 `pagehide`（删锁）再补一个 `visibilitychange(hidden)`（又把锁写回去），新页面读到新鲜锁就以为"另一个页面在跑"，白等 8 秒。现在 `released` 标志一置上就禁写；并且 `sessionStorage` 里存着上一轮的 id（`prevSelfId`），刷新时只要锁属于上一轮的自己就直接接管（`fastTried` 保证只抢一次，复制标签页那一类会退回正常排队）。
- 地面分块（`groundSheet` 的 `rect`）：`px` 必须按**整张地图**算（`MAX_SIDE/max(cols,rows)`），
  按块算会让各块 px 不同、纹理拼不上；`brick` 与小 `slab` 是按**画布**从头排砖的（只有 `big:true`
  的大石板按格对齐），大图分块会错缝——真要在大图用，先改成按格锚定。
- 地面分块的三个坑（都实测踩过，见 `docs/STATUS.md` §七）：①按格锚定的笔触必须减窗口原点
  （`stampBlob`/`detailOnOverlay`/`shoreEdge`）；②低频色斑必须按整张图撒（`blobSpace`），
  否则缝上一条 3% 调子台阶；③块没补上时露的是底衬纯色 `PALETTES[theme].base`，不是天空蓝。
  块大小 = 走路手感：**16 格单块 30~42ms（一次掉 68ms 帧，能明显感到顿）→ 8 格 2~15ms（走 26 格 0 次 >25ms）**，
  ※这组数是「沙带遮罩」之前量的；现在 8 格单块 **3.5~5.7ms**（遮罩 + 草皮砖缓存 + `seaMask` 缓存，`tmp/bench-ground.mjs` 可复现），
  代价是常驻块数变多（默认视角 22 块 ≈ 20MB 贴图，`?shot=map` 会到 240 块）；块大省 draw call，但单次卡顿更明显。
- **海岸距场（`coastField`）别按块算**：一块的 `chamfer` + 逐像素噪声是 15~30ms，海边的块一生成立刻掉帧。
  现在 `buildGround` 按整图算一次（128×128 用 **12px/格**，约 0.25s；32px 要 1.56s 太贵），
  存进 `gSea`：① 地面块传 `coast/coastPx` 只裁一块再缩放；② 海面着色器共用同张贴图、UV 走地图比例；
  ③ 图外那圈海用同一个 shader 铺四条（否则 `?shot=map` 能看见一条硬边）。
  **换房间那一下的 ~0.4s 硬冻就是它**（房间 56 格时 `fieldPx` 到 27，整图算一次 250ms 级）：
  它是一次性的，不是掉帧；嫌长就把 `fieldPx` 的 1536 上限调小，或挪到 idle 里生成。
- 沙带同理走整图：`sandMask(coast)` 把岸距场压成一张 alpha 图（沙=不透明），块里只 `drawImage` 裁一块。
  **两者必须同一张、同尺寸**（都从 `gSea.canvas` 出，`coastPx` 也一致），否则沙带会整体错位；
  没有海（`fieldWet` 假）时 `gSea` 为 null，自动退回逐像素老路。
- 大图 `px` 走 `4096/max(cols,rows)` 封顶（128×128 → 32px）；`chunkPx` 再小也不会让单块更轻太多，
  别为了清晰度把 128×128 调回 48px——单块会回到 60~90ms。
- **相机默认 = mir（已定稿）**：偏航 0° + 俯角 55° + 透视 fov32 + **zoom 1.70**（地面 midV ≈ **竖向 20 格**，横向约 28 格）。`?cam=iso` 才是旧斜角 45° + 俯角 30° + 正交（2:1 菱形）。
  改偏航/俯角/zoom 时**必须同时**动三样：① 立牌（`billboard()` 里按 `CAM.yaw` 转，否则斜看压扁）；
  ② 地面分块（斜角时视野是四边形，按"玩家周围 3×3"会在屏幕角露底衬，见 `viewQuad`）；③ 一屏格数（`BASE_DIST` / ortho 的 `halfH` / 透视的 `dist/zoom`）。
  验画面用**整张截图**：`Page.captureScreenshot` 带 `clip` 会抓到 WebGL 未保留帧的残影，会误报"地上有洞"。
- 文档滞后两处：规则文档第 55 行仍把"双手槽是否回来"列为待定（实际 `EQUIP_SLOTS` 已有 glovesL/R，data.js 201）；词缀 R8 属 M2 冻结但代码已在掷 `affix` 并计算，只界面写"未鉴定"。
- 冻结/未做只查文档：3D 低模、实时光照、连续世界、词缀、多区域 → `docs/STATUS.md` §四；A1–A7 与 B 类美术缺口 → `docs/豆豆暗黑传奇-进度与完成度.md` §还没做。
- **点地走路别按格子折线画**：逻辑仍是一格一拍，但画面位置由 `walkLine` 决定——沿
  `bfs` 拉直后的 `path.pts`（起点/拐点/终点）之间的真直线走。贴着格心画的话，八向网格的缓斜线
  永远是「斜一步、直一步」，看着就是楼梯或蛇形。手动按方向键会 `stopWalk` 接管，别让两条走法打架。
- **画面折线的参数别退回 u=(done-1+t)/total 按弧长取**：`pts` 的折点是按格数拉出来的，
  按弧长铺会把「斜段/直段长度不同」变成拐点处的一跳（`u` 与格数对不上），而且换目标时
  `done=0` 会掉回逐格插值——两套模型在同一个格子里能差 0.2~0.7 格。相机是硬跟 `vis` 的，
  这一跳就是主人说的「镜头抖」。现在走 `ks`（格数）+`pointOnSteps`，起点是当时的画面位置。
  改完用假时钟连点验证：`step()` 逐帧位移应当 ≤ 一格的正常速度（约 0.09 格/16ms，斜线 0.13），
  不能出现单帧 >0.2 的位移或来回反转。
