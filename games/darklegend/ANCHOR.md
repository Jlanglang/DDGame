# 豆豆暗黑传奇 · 锚点表
> 改这个游戏先读这一份：23 个源文件、约 13700 行（JS/HTML/CSS/MJS；另有 8 个 .py 生成器不参与运行）。先看 `docs/STATUS.md` 定做什么，玩法数值以 `docs/豆豆暗黑传奇-规则与任务.md` 为准，画面验收看 `docs/渲染规格.md` §八；本表只记「改这个 → 动哪几个函数」，不重复文档。**2026-10-29 起只剩 3D（WebGL），2D Canvas 渲染整条已删除。**

## 一句话
主城 24×24 + 14 个房间（`ROOMS`）的回合制刷宝：走一格 = 一回合，由 `after()` 排下一拍；装备落地成袋、走上去才捡；画面是 three.js **mir 俯视透视**（yaw0° / pitch55° / fov32 / zoom1.70，竖向≈20 格；WebGL），没有 2D 回退；旧等距用 `?cam=iso`。

## 文件分层
| 文件 | 行数 | 层 | 管什么 |
|---|---|---|---|
| `src/data.js` | 394 | data | 全部表与常量（`DL.DATA`），无逻辑 |
| `src/core.js` | 108 | core | 纯公式：成长、装备区间、等级差查表 |
| `src/world.js` | 229 | world | `genHub` `genRoom` `genTerrain`、`bfs`、`canStep` |
| `src/overworld.js` | 139 | world | 128×128 野外 + `caveMap`（`applyOverworld` 用；现在恒启用） |
| `src/combat.js` | 134 | combat | `playerDamage` `enemyDamage` `halfMoonCells` `decide` `nextStep` |
| `src/status.js` | 170 | status | `DEFS` + `apply` `tick` `onHit` `canAct` `list` |
| `src/game.js` | 4478 | game | 编排 + 全部 DOM 绑定（2D 绘制已删，分段见下） |
| `src/render-three.js` | ~1710 | 3D | mir 俯视场景：地面分块/立牌/接触阴影/排序/迷你图/拾取；**唯一画面**；相机开关 `?cam=`（默认 mir，iso 保留） |
| `src/hd-draw.js` 738 + `src/iso-ground.js` 338 + `src/three-pick.js` 60 | — | 3D 素材 | **立牌真身**（PNG 素材清空后全走它）：`heroSheet` `npc` `mob` `house` `rock` `caveMouth` `flora` `townProp` / 菱形地面 `paint`(217) / 屏幕→格射线 |
| `src/iso-art.js` ~2157 | — | 3D 地面 | **地面材质真身**：10 种材质画法、`groundSheet`（`cutSea` 时海不进覆盖层，靠海岸距铺沙）、`coastField`（弯曲岸距）、`seaSheet`（验收台旧海面）、`seaMask`（海/池塘）、`shoreline`（池塘岸线）、崖壁 `cliff`/`cliffHeight`；验收台 `asset-bench.html`（⑥ 整张 vs 分块） |
| `src/sfx.js` | 227 | audio | `SFX` 音名表(186) + WebAudio/WAV 兜底，`MUTE_KEY`(8) |
| `src/main.js` | — | shell | 唯一 ESM 入口，按脚本旧顺序 import |
| `index.html` 335 + `style.css` 1316 | — | shell | HUD/DOM 与布局。开发页只留一行 `<script type="module" src="./src/main.js">`；双击入口是 `dist/index.html` |
| 测试 5 件 | 2159 | test | test-game 1468 / test-input 187 / balance 173 / test-three 71 / check-assets 57 |
| `gen-*.py` 8 个 | — | 素材 | 生成 `assets/**` 的老管线；**产出已被清空**（2026-10-29），新素材按 `docs/立牌统一规格.md` 重出 |

## game.js 4478 行的分段地图
| 行区间 | 段 | 关键函数（行号） |
|---|---|---|
| 1–312 | 骨架 | `P` 初始(211)、全部 `let` 状态(246)、`useOverworld`(314)、`uiOpen`(315) |
| 313–736 | 野外/主城/房间/刷怪 | `applyOverworld`319 `genHub`359 `spawnRoomMobs`403 `enterRoom`454 `leaveRoom`499 `spawnBossInRoom`585 `tryRoomRespawn`628、精英/稀有保底 690/707 |
| 737–940 | 敌/装备生成 | `isCrush`737 `makeEnemy`744 `rollRarity`782 `makeEquip`790 `eqReqLv`853 `rollDropSlot`876 |
| 941–1602 | 装备链 + 面板气泡 | `addToBag`941 `equipFromBag`964 `sellFromBag`990 `depositFromBag`1017 `sellBagByRarity`1059 `eqCellHtml`1186 `showEqTip`1311 `renderChar`1410 `updateTips`1510 |
| 1603–1791 | HUD/交互/存读档 | `syncHud`1603 `interactTarget`1645 `tryInteract`1662 `save`1707 `load`1734 |
| 1792–2195 | 战斗+试炼+技能书 | `engage`1792 `strike`1798 `kill`1811 `rollTrialTask`1928 `turnInTrial`1971 `renderTrial`2074 `rollSkillBookDrop`2129 |
| 2196–2464 | 掉落/袋/挂机 | `rollDrop`2196 `rollKillEquipDrops`2206 `dropBag`2247 `pickupBag`2269 `setAutoFarm`2351 `autoTakeBag`2395 |
| 2465–2637 | 怪回合/状态/生死 | `enemiesTurn`2465 `bossTrick`2509 `tickStatuses`2527 `die`2554 `revive`2579 `win`2594 |
| 2638–2832 | **回合时钟（改节奏只动这里）** | `after`2638（DoT→MP/CD→怪行动→`turn++`→存盘→下一拍）`farmStepTo`2723 `autoStep`2752 |
| 2833–3228 | 技能/动作/移动/门 | `startClockTimer`2833 `attack`2874 `halfMoon`2891 `fireSword`2905 `drink`2923 `act`2957 `promptDoor`3005 `move`3045（撞怪=攻击）`walk`3193 |
| 3229–3489 | 输入 | `handleCellClick`3229（唯一点地/点怪入口，3D 反算格子后回调）`bindDpad`3425 `onKey`3457 |
| 3490–4147 | 商店/仓库 + DOM 绑定 | `ensureShopCatalog`3490 `refreshShop`3563 `refreshStash`3586 `buyPotion`3628 `buy`3670、`bind`3734（所有按钮/遮罩/音效门） |
| 4148–4302 | 地形/道具生成（3D 场景数据） | `themeNow`4148 `isBorder`4156 `walkableNear`4160 `refreshTerrain`4173 `buildProps`4196 |
| 4305–4478 | 启动/调试出口 | 引导 4305、`ThreeBridge`4344、`window.__dl`4386（`?debug`） |

## 想改什么 → 去哪
| 想改 | 动这几个 |
|---|---|
| 怪血/攻/防/经验/金币 | `game.js makeEnemy`(744) + `data.js GRADE`(137)；**同步 `balance.mjs`(29–50)** |
| 玩家成长/升级曲线 | `data.js GROWTH`(385) → `core.js maxHp/atkRange/needExp`(63–76) |
| 掉落概率/保底 | `data.js DROP`(166) `RESPAWN`(61)；`game.js rollDrop`(2196) `rollKillEquipDrops`(2206) |
| 装备底材/属性倍率 | `data.js EQUIP_BASES`(219) `EQUIP_STAT_MUL`(326)；`game.js makeEquip`(790) |
| 词缀（M2 冻结但在跑） | `game.js makeEquip`(843) 掷 affix、`core.js affixMult`(35) 已计入伤害，UI 占位 `affixSlot`(933) |
| 房间 / 地图 / 主城 | `data.js ROOMS`(349) `THEME_OF_ROOM`(14)；`world.js genRoom`(126) `genHub`(92)；`game.js enterRoom`(454) |
| 战斗判定（伤害/范围） | `combat.js playerDamage`(20) `halfMoonCells`(35)；`game.js strike`(1798) `halfMoon`(2891) |
| 怪 AI / BOSS 出招 | `data.js AI`(126)；`combat.js decide`(77)；`game.js enemiesTurn`(2465) `bossTrick`(2509) |
| 状态（毒/烧/眩晕/麻痹） | `status.js DEFS`(24) `apply`(61) `tick`(87)；`game.js tickStatuses`(2527) |
| 棋盘/墙掩码/图集（已无） | 2D 删掉后 `tiles.js`、`assets.js` 也删了；地面走 `iso-art.js`，立牌走 `hd-draw.js` |
| 3D 画面 | `render-three.js rebuildRoom`(1034) `buildGround`(547) `addPlate`(394) `makeChunk`(426)/`syncChunks`(502)/`pumpChunks`(483)（地面分块）`addEnemy` `addProp` `tick`(1242)；`iso-ground.js paint`(217) |
| 地面块大小 / 驻留半径 | `render-three.js` 的 `CHUNK_CELLS`(16 格) 与 `KEEP_R`(2)；改完用 `asset-bench.html` ⑥ 对拍 + `?stats=1` 看帧时间 |
| 主角外观 / 攻击动作 | `render-three.js heroFrame`(85) 切 `hd-draw.heroSheet` 的 4×5 图集（4 向 × 待机/走路 2 帧/攻击 1 帧 + 倒地）；身高 `HERO_H`(466)。**PNG 立牌已清空**，新图回来后在 `rebuildRoom` 里按 key 换回 |
| 走路插值（A5） | `game.js`：`beginWalkStep`/`snapWalkVis`/`walkStepVis`；桥 `ThreeBridge.step()`；`render-three.js` tick 里 hero+look 跟 `vis`（换图/复活 `snapWalkVis`）。逻辑仍整格跳，只改画面 |
| 3D 崖壁（边缘山脊 / 野外孤石） | `render-three.js buildCliffs` / `addCliffSprite`（只往 `map=1` 的格子立，不会走穿）、`paintTex` 按「主题+变体+高度档」缓存；全部走 `iso-art.js` 程序化崖壁 |
| 3D 地面材质（草地/石板/水/海/岸线） | `iso-art.js`：`paintGrass` `paintSlab` `paintWater` `paintSea` `shoreline` `seaMask` `groundSheet` `coastField`；海面在 `render-three.js` `addSeaMesh`（着色器，盖在沙上，`SEA_Y`）；改完看南岸和 `asset-bench.html` |
| 地面分块（大图流式加载） | `iso-art.js groundSheet` 的 `rect`/`margin`（块 + 1 格出血再裁）；对拍看 `asset-bench.html` ⑥（?margin=0 可关出血看反例）；块管理器在 `render-three.js`（`CHUNK_CELLS` 16 格 / `KEEP_R` 2） |
| 崖壁精灵（AI 图，已清空） | `iso-art.js setCliffSprites` / `cliffFoot`；图 `assets/iso/processed/cliff1..3.png` **已删**；重出图看 `docs/瓦片清单.md` §一·五 v4（img2img + `key-magenta.py`） |
| **立牌口径（3D 素材 + 2.5D 固定视角）** | `docs/立牌统一规格.md`：五条硬规则 + 出图 prompt + 五条验收。入库 `tools/ingest-3d.py 原图.png 输出.png --world 2.15`（按色相抠洋红、剥烘死的影子、去水印、缩到 2.5× 屏高）。对拍：`bench-scene.html`（光/影/地八根滑杆，立牌已换程序化占位） |
| 音效 / 存档 | `sfx.js SFX`(186)+`play`(197)、调用点 game 982/1858；`game.js save`(1707) `load`(1734)、`SAVE_KEY`(22) |
| 鼠标 / 手机触摸 | `game.js handleCellClick`(3229) `bindDpad`(3425)；3D 点击入口 `render-three.js pointer`(1130)（小地图区域已挡）；CSS 222 |

## 数值都在哪（全在 data.js）
| 表（行） | 关键字段 | 谁用 |
|---|---|---|
| `GROWTH` 385 | baseHp/hpPerLv/baseAtk/baseDef/expBase/expRate | `core.maxHp/atkRange/needExp`(63–76) |
| `MON` 77 + `BOSS` 92 + `GRADE` 137 | lv/aggro/ai/atkMin/atkMax/gold；品级 hp/atk/lvAdd/exp/p | `makeEnemy`(744) `poolMon`(565) |
| `DROP` 166 + `RARITY` 156 | c/b/a/s、elite/rare/boss、potion；mult/letter/color | `rollDrop`(2196) `rollKillEquipDrops`(2206) `makeEquip`(790) |
| `EQUIP_BASES` 219 + `EQUIP_STAT_MUL` 326 | ilvl/name、atk/def/hp 倍率 | `makeEquip`(790) |
| `POTIONS` 177 + `SHOP` 338 + `BOOK_SHOP` 55 | tiers.amount、redMul/blueMul、price | `buyPotion`(3628) `buy`(3670) `buyBook`(3549) |
| `RESPAWN` 61 + `ROOM_ENTER_SLACK` 348 | normalDelayMs/elitePityMax/rarePityMax/bossDefaultCd | `tryRoomRespawn`(628) `canEnterRoom`(444) |
| `CRUSH` 146 + `EXP_GAP` 372 + `GOLD_GAP_NORMAL` 376 | 碾压级差、等级差倍率 | `isCrush`(737) `kill`(1811) |
| `TRIAL` 113 + `AI` 126 | rewardPct/collectNeed/orbPct；leash/passiveChase/bossStunP | `rollTrialTask`(1928) `decide`(77) |
| `THEME_OF_ROOM` 14 + `ZONE_FLOOR` 379 | 视觉主题、地面色 | `themeNow`(4148)、`iso-ground.themeOf`(54) |

## 画面：只有 3D（WebGL）
- `render-three.js wanted()` 恒 true（只要求浏览器有 WebGL）；`?engine=canvas`、`?engine=three` 都不再生效。
- `boot()`(1148) 用 `#view3d` 建 WebGL 渲染器（`powerPreference: high-performance`），每帧 `tick()`(913) 从 `ThreeBridge`（game.js 4344）读状态；点击 `pointer`(1130) 只算格子再回调 `B.clickCell` → `handleCellClick`，不复制寻路/战斗。
- 双击能跑的是 `dist/index.html`（`npm run build` 打出来的单文件）。源码 `index.html` 和验收台要 `npm run dev`（http://localhost:8183）。贴图仍是程序化画布，不从本地 PNG 上传纹理。
- 调试参数：`?quality=low` `?shot=wide`(zoom 0.55) `?stats=1` `?chunk=0`(关掉地面分块) `?cam=mir|iso|diag45|diag45p|up45|now`(切相机，默认 mir) `?room=<id>`(需带 shot) `?debug`。

## 测试
| 命令 | 现状 |
|---|---|
| `node games/darklegend/test-game.mjs` | 360 项（Node+DOM 桩）；`import ./src/game.js`（不带 overworld，和改前的加载集合一致） |
| `node games/darklegend/test-input.js` | 真 Chrome `http://localhost:8183/?debug`，8 项：3D 已启动、点小地图不动、点地走、点怪掉血。先 `npm run dev` |
| `node games/darklegend/test-three.mjs` / `check-assets.mjs` | 515 项射线往返（不开 WebGL）/ 只剩瓦片 4 张 PNG 头（tiles-cave + terrain×3，已不被运行时加载，留着等重建） |
| `node games/darklegend/balance.mjs --check` | 超范围 exit 1；**当前就有 1 红**（30 级装备占攻 23.6%，目标 35–65），不是你改坏的 |

## 雷区
- **源码是 ESM。** 双击只能开 `dist/index.html`。源码 `index.html` 和 `asset-bench.html` / `bench-scene.html` / `light-test.html` 要开发服务器。`package.json` 不要写 `"type": "module"`，否则 `test-input.js` 的 `require` 会崩。
- **three 钉死 `0.170.0`（REVISION 170）。** 这是原 `vendor/three.iife.js` 的版本。STATUS §七 的光照结论是在这份上量的。不要装 latest，也不要换 major。`src/tile-plate.js` 调用时读 `global.THREE`，`render-three.js` 会把这一份赋上去。不要再放回第二份 three。
- `balance.mjs` **复制**了 `makeEnemy`/装备公式（29–50 行注释自认）；改公式不同步它，体检就是假的。
- 测试不覆盖渲染：`test-game.mjs` 不加载 `render-three` / `hd-draw` / `iso-ground` / `overworld`，改立牌/地面只能肉眼 + 截图（`?shot=wide`）。
- **没有 2D 回退了**：3D 起不来就只剩一条"这个浏览器开不了 WebGL"的提示。调渲染别再指望 `?engine=canvas`。
- `hd-draw.js` 是立牌唯一来源（`heroSheet` `npc` `mob` `house` `rock` `caveMouth` `flora` `townProp` 全在 render-three 里用），改它就是改画面。`mob` 只画了鸡/稻草人/野狗/野猪四种，其余怪用 emoji 立牌占位（`glyphCanvas`）。
- 3D 视口是 16:9（`three-pick.js` 的 `VIEW_W/H = 1280×720`）：**竖屏手机上是上下留黑边的横条 + "请横屏游玩"**；要改竖屏视锥得同时动 `three-pick` / `clampLook` / 点击反算。
- 新弹窗必须登记进 `uiOpen()`(315)，否则 `after`/`walk`/挂机在背后继续跑；加存档字段要 `save`(1707)+`load`(1734) 成对改，`v:4`(1712) 是手写的。
- 地面分块（`groundSheet` 的 `rect`）：`px` 必须按**整张地图**算（`MAX_SIDE/max(cols,rows)`），
  按块算会让各块 px 不同、纹理拼不上；`brick` 与小 `slab` 是按**画布**从头排砖的（只有 `big:true`
  的大石板按格对齐），大图分块会错缝——真要在大图用，先改成按格锚定。
- 地面分块的三个坑（都实测踩过，见 `docs/STATUS.md` §七）：①按格锚定的笔触必须减窗口原点
  （`stampBlob`/`detailOnOverlay`/`shoreEdge`）；②低频色斑必须按整张图撒（`blobSpace`），
  否则缝上一条 3% 调子台阶；③块没补上时露的是底衬纯色 `PALETTES[theme].base`，不是天空蓝。
  块大小 24 格会在 GC 上出 340ms 尖峰，16 格稳（均 79 / 峰 138）。
- **相机默认 = mir（已定稿）**：偏航 0° + 俯角 55° + 透视 fov32 + **zoom 1.70**（地面 midV ≈ **竖向 20 格**，横向约 28 格）。`?cam=iso` 才是旧斜角 45° + 俯角 30° + 正交（2:1 菱形）。
  改偏航/俯角/zoom 时**必须同时**动三样：① 立牌（`billboard()` 里按 `CAM.yaw` 转，否则斜看压扁）；
  ② 地面分块（斜角时视野是四边形，按"玩家周围 3×3"会在屏幕角露底衬，见 `viewQuad`）；③ 一屏格数（`BASE_DIST` / ortho 的 `halfH` / 透视的 `dist/zoom`）。
  验画面用**整张截图**：`Page.captureScreenshot` 带 `clip` 会抓到 WebGL 未保留帧的残影，会误报"地上有洞"。
- 文档滞后两处：规则文档第 55 行仍把"双手槽是否回来"列为待定（实际 `EQUIP_SLOTS` 已有 glovesL/R，data.js 205）；词缀 R8 属 M2 冻结但代码已在掷 `affix` 并计算，只界面写"未鉴定"。
- 冻结/未做只查文档：3D 低模、实时光照、连续世界、词缀、多区域 → `docs/STATUS.md` §四；A1–A7 与 B 类美术缺口 → `docs/豆豆暗黑传奇-进度与完成度.md` §还没做。
