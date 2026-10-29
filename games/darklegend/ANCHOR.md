# 豆豆海岛幻想 · 锚点表
> 改这个游戏先读这一份：**16 个 `src/*.js` 11686 行 + 页面 1660 行 + 测试 2052 行 ≈ 15360 行**（另有 8 个 .py 生成器不参与运行）。先看 `docs/STATUS.md` 定做什么，玩法数值以 `docs/豆豆暗黑传奇-规则与任务.md` 为准，画面验收看 `docs/渲染规格.md` §八；本表只记「改这个 → 动哪几个函数」，不重复文档。**2026-10-29 起只剩 3D（WebGL），2D Canvas 渲染整条已删除。行号已于 2026-10-29 对 `src/` 全量校准。**

## 一句话
主城 24×24 + 14 个房间（`ROOMS`）的回合制刷宝：走一格 = 一回合，由 `after()` 排下一拍；装备落地成袋、走上去才捡；画面是 three.js **mir 俯视透视**（yaw0° / pitch55° / fov32 / zoom1.70，竖向≈20 格；WebGL），没有 2D 回退；旧等距用 `?cam=iso`。

## 文件分层
| 文件 | 行数 | 层 | 管什么 |
|---|---|---|---|
| `src/data.js` | 393 | data | 全部表与常量（`DL.DATA`），无逻辑 |
| `src/core.js` | 107 | core | 纯公式：成长、装备区间、等级差查表 |
| `src/world.js` | 321 | world | `genHub` `genRoom` `genTerrain`、`bfs`（朝目标排序）、`tightenPath`（视线拉直）、`canStep` |
| `src/overworld.js` | 182 | world | **128×128 整图 + 陆地约 96×96**（`ISLAND_R`(17)=48 + 正弦湾；`CITY` 31×31 居中 = 安全区）+ **城外野怪**（`placeFieldMobs`(105)：1~5 级鸡/稻草人/野狗 40 只，只站草地、离城 ≥3 格、离出生点 ≥6 格；**鸡在南墙外、野狗在北墙外、稻草人四条边随机**）+ `caveMap`（`applyOverworld` 用；现在恒启用） |
| `src/combat.js` | 133 | combat | `playerDamage` `enemyDamage` `halfMoonCells` `decide` `nextStep` |
| `src/status.js` | 169 | status | `DEFS` + `apply` `tick` `onHit` `canAct` `list` |
| `src/game.js` | 4715 | game | 编排 + 全部 DOM 绑定（2D 绘制已删，分段见下） |
| `src/render-three.js` | 2069 | 3D | mir 俯视场景：地面分块/立牌/接触阴影/排序/迷你图/拾取/帧率角标；**唯一画面**；相机开关 `?cam=`（默认 mir，iso 保留） |
| `src/hd-draw.js` 737 + `src/iso-ground.js` 481 + `src/three-pick.js` 60 | — | 3D 素材 | **立牌真身**（PNG 素材清空后全走它）：`heroSheet` `npc` `mob` `house` `rock` `caveMouth` `flora` `townProp` / 菱形地面 `paint`(369) / 屏幕→格射线 |
| `src/iso-art.js` 2174 | — | 3D 地面 | **地面材质真身**：10 种材质画法、`groundSheet`（`cutSea` 时海不进覆盖层，靠海岸距铺沙；可传整图 `coast`+`coastPx` 只裁块）、`coastField`（弯曲岸距）、`cropCanvas`、`seaSheet`（验收台旧海面）、`seaMask`（海/池塘）、`shoreline`（池塘岸线）、崖壁 `cliff`/`cliffHeight`；验收台 `asset-bench.html`（⑥ 整张 vs 分块） |
| `src/sfx.js` | 226 | audio | `SFX` 音名表 + WebAudio/WAV 兜底，`MUTE_KEY` |
| `src/main.js` 19 + `src/namespace.js` 5 | — | shell | `main.js` 是唯一 ESM 入口，按脚本旧顺序 import；`namespace.js` 建 `DL` 命名空间 |
| `index.html` 325 + `style.css` 1335 | — | shell | HUD/DOM 与布局。左上角常驻 `#fps` 帧率角标（1 秒窗口）；开发页只留一行 `<script type="module" src="./src/main.js">`；双击入口是 `dist/index.html`（928 KB 单文件） |
| 测试 5 件 | 2052 | test | test-game 1582 / test-input 191 / balance 159 / test-three 63 / check-assets 57 |
| `gen-*.py` 8 个 | — | 素材 | 生成 `assets/**` 的老管线；**产出已被清空**（2026-10-29），新素材按 `docs/立牌统一规格.md` 重出 |

## game.js 4715 行的分段地图
| 行区间 | 段 | 关键函数（行号） |
|---|---|---|
| 1–458 | 骨架 | `P` 初始(187)、全部 `let` 状态(230)、`useOverworld`(454)、`uiOpen`(421) |
| 459–879 | 野外/主城/房间/刷怪 | `applyOverworld`459 `genHub`500 `spawnRoomMobs`545 `enterRoom`596 `leaveRoom`642 `spawnBossInRoom`728 `tryRoomRespawn`771、精英/稀有保底 `elitePityMax`(799)/`rarePityMax`(800) |
| 880–1083 | 敌/装备生成 | `isCrush`880 `makeEnemy`887 `rollRarity`925 `makeEquip`933 `eqReqLv`996 `rollDropSlot`1019 |
| 1084–1745 | 装备链 + 面板气泡 | `addToBag`1084 `equipFromBag`1107 `sellFromBag`1133 `depositFromBag`1160 `sellBagByRarity`1202 `eqCellHtml`1329 `showEqTip`1454 `renderChar`1553 `updateTips`1653 |
| 1746–1934 | HUD/交互/存读档 | `syncHud`1746 `interactTarget`1788 `tryInteract`1805 `save`1850 `load`1877 |
| 1935–2338 | 战斗+试炼+技能书 | `engage`1935 `strike`1941 `kill`1954 `rollTrialTask`2071 `turnInTrial`2114 `renderTrial`2217 `rollSkillBookDrop`2272 |
| 2339–2607 | 掉落/袋/挂机 | `rollDrop`2339 `rollKillEquipDrops`2349 `dropBag`2390 `pickupBag`2412 `setAutoFarm`2494 `autoTakeBag`2538 |
| 2608–2782 | 怪回合/状态/生死 | `enemiesTurn`2608 `bossTrick`2652 `tickStatuses`2670 `die`2697 `revive`2722 `win`2738 |
| 2783–2978 | **回合时钟（改节奏只动这里）** | `after`2783（DoT→MP/CD→怪行动→`turn++`→存盘→下一拍）`farmStepTo`2868 `autoStep`2898 |
| 2979–3388 | 技能/动作/移动/门 | `startClockTimer`2979 `attack`3020 `halfMoon`3037 `fireSword`3051 `drink`3069 `act`3103 `promptDoor`3151 `move`3191（撞怪=攻击）`walk`3343 |
| 3389–3679 | 输入 | `handleCellClick`3389（唯一点地/点怪入口，3D 反算格子后回调）`bindDpad`3615 `onKey`3647 |
| 3680–4338 | 商店/仓库 + DOM 绑定 | `ensureShopCatalog`3680 `refreshShop`3753 `refreshStash`3776 `buyPotion`3818 `buy`3860、`bind`3924（所有按钮/遮罩/音效门） |
| 4339–4570 | 地形/道具生成（3D 场景数据） | `themeNow`4339 `isBorder`4347 `walkableNear`4351 `refreshTerrain`4364 `buildProps`4421 |
| 4571–4715 | 启动/调试出口 | `ThreeBridge`4571、`window.__dl`4614（`?debug`） |

## 想改什么 → 去哪
| 想改 | 动这几个 |
|---|---|
| 怪血/攻/防/经验/金币 | `game.js makeEnemy`(887) + `data.js GRADE`(136)；**同步 `balance.mjs`(29–50)** |
| 玩家成长/升级曲线 | `data.js GROWTH`(384) → `core.js maxHp/atkRange/needExp`(63–76) |
| 掉落概率/保底 | `data.js DROP`(165) `RESPAWN`(60)；`game.js rollDrop`(2339) `rollKillEquipDrops`(2349) |
| 装备底材/属性倍率 | `data.js EQUIP_BASES`(218) `EQUIP_STAT_MUL`(325)；`game.js makeEquip`(933) |
| 词缀（M2 冻结但在跑） | `game.js makeEquip`(933) 掷 affix、`core.js affixMult`(34) 已计入伤害，UI 占位 `affixSlot`(1076) |
| 房间 / 地图 / 主城 | `data.js ROOMS`(348) `THEME_OF_ROOM`(13)；`world.js genRoom`(219) `genHub`(185)；`game.js enterRoom`(596) |
| 城外野怪分布 / 密度 | `overworld.js placeFieldMobs`(110)：`plans` 里 `n` 是只数、`d0/d1` 是离城墙的距离（格）、`side` 是边（north 北 / south 南 / any 四条边随机）；只站草地、彼此隔 5 格。死掉 8 秒后原地重生（`game.js respawnField`(2587)，玩家离 >6 格才刷） |
| 战斗判定（伤害/范围） | `combat.js playerDamage`(19) `halfMoonCells`(34)；`game.js strike`(1941) `halfMoon`(3037) |
| 怪 AI / BOSS 出招 | `data.js AI`(125)；`combat.js decide`(76)；`game.js enemiesTurn`(2608) `bossTrick`(2652) |
| 状态（毒/烧/眩晕/麻痹） | `status.js DEFS`(23) `apply`(60) `tick`(86)；`game.js tickStatuses`(2670) |
| 棋盘/墙掩码/图集（已无） | 2D 删掉后 `tiles.js`、`assets.js` 也删了；地面走 `iso-art.js`，立牌走 `hd-draw.js` |
| 3D 画面 | `render-three.js rebuildRoom`(1424) `buildGround`(918) `addPlate`(610) `makeChunk`(644)/`syncChunks`(776)/`pumpChunks`(708)（地面分块）`addEnemy` `addProp` `tick`(1668)；`iso-ground.js paint`(369) |
| 地面块大小 / 驻留圈 | `render-three.js` 的 `CHUNK_CELLS`(52)=**8 格**（块大小=走路手感的开关：16 格单块 30~42ms 会顿，8 格 2~15ms 不顿）；驻留不是单独常量，是 `syncChunks`(776) 里 `addBox(keep, …, -1, …, +1)` 把视野块再外扩 1 圈；改完用 `asset-bench.html` ⑥ 对拍 + `?stats=1` 看帧时间 |
| 主角外观 / 攻击动作 | `render-three.js heroFrame`(330) 切 `hd-draw.heroSheet` 的 4×5 图集（4 向 × 待机/走路 2 帧/攻击 1 帧 + 倒地）；身高 `HERO_H`(1137)。**PNG 立牌已清空**，新图回来后在 `rebuildRoom` 里按 key 换回 |
| 走路插值（A5） | `game.js`：`beginWalkStep`/`snapWalkVis`/`walkStepVis`/`walkVisPos`/`walkLine`；桥 `ThreeBridge.step()`；`render-three.js` tick 里 hero+look 跟 `vis`（换图/复活 `snapWalkVis`）。逻辑仍整格跳，只改画面 |
| **点地走成楼梯 / S 形** | 两层：① `world.js` `bfs`(147) → `tightenPath`(130) 用 `lineWalk`(84) 视线拉直，折点存进 `path.pts`；② `game.js` 的 `walkLine` 让画面沿 `pts` 之间的**真直线**走（逻辑仍一格一拍）。只拉直路径不够——八向网格的缓斜线永远是「斜一步、直一步」，贴着格心画就是蛇形。**别再退回「横一步+竖一步」的两格合并** |
| 3D 崖壁（边缘山脊 / 野外孤石） | `render-three.js buildCliffs` / `addCliffSprite`（只往 `map=1` 的格子立，不会走穿）、`paintTex` 按「主题+变体+高度档」缓存；全部走 `iso-art.js` 程序化崖壁 |
| 3D 地面材质（草地/石板/水/海/岸线） | `iso-art.js`：`paintGrass` `paintSlab` `paintWater` `paintSea` `shoreline` `seaMask` `groundSheet` `coastField`；海面在 `render-three.js` `addSeaMesh`（着色器，盖在沙上，`SEA_Y`）；改完看南岸和 `asset-bench.html` |
| **浅水偏亮 / 海水颜色** | `render-three.js` `SEA_FRAG` 上方那组常量：`SEA_SHALLOW`（岸边水色）`SEA_SHORE_ALPHA`（越小越透沙、越亮）`SEA_CAUSTIC_SHORE/DEEP`（岸纹强度）`SEA_FOAM_ALPHA`；带宽在 `iso-art.js`：`SHALLOW_TILES`(3.8) 浅水、`SAND_TILES`(6.6) 沙带 |
| 地面分块（大图流式加载） | `iso-art.js groundSheet` 的 `rect`/`margin`（块 + 1 格出血再裁）；对拍看 `asset-bench.html` ⑥（?margin=0 可关出血看反例）；块管理器在 `render-three.js`（`CHUNK_CELLS`(52) 16 格 + `syncChunks`(776) 外扩 1 圈） |
| 崖壁精灵（AI 图，已清空） | `iso-art.js setCliffSprites` / `cliffFoot`；图 `assets/iso/processed/cliff1..3.png` **已删**；重出图看 `docs/瓦片清单.md` §一·五 v4（img2img + `key-magenta.py`） |
| **立牌口径（3D 素材 + 2.5D 固定视角）** | `docs/立牌统一规格.md`：五条硬规则 + 出图 prompt + 五条验收。入库 `tools/ingest-3d.py 原图.png 输出.png --world 2.15`（按色相抠洋红、剥烘死的影子、去水印、缩到 2.5× 屏高）。对拍：`bench-scene.html`（光/影/地八根滑杆，立牌已换程序化占位） |
| 音效 / 存档 | `sfx.js SFX`(185)+`play`(196)、调用点 game 1084/1960；`game.js save`(1850) `load`(1877)、`SAVE_KEY`(28) |
| 鼠标 / 手机触摸 | `game.js handleCellClick`(3389) `bindDpad`(3615)；3D 点击入口 `render-three.js pointer`(1899)（小地图区域已挡）；CSS 222 |

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
- `boot()`(1816) 用 `#view3d` 建 WebGL 渲染器（`powerPreference: high-performance`），每帧 `tick()`(1566) 从 `ThreeBridge`（game.js 4523）读状态；点击 `pointer`(1899) 只算格子再回调 `B.clickCell` → `handleCellClick`，不复制寻路/战斗。左上角 `#fps` 角标在 `tick()` 末尾按 1 秒窗口刷新（`?stats=1` 另有详情面板）。
- 双击能跑的是 `dist/index.html`（`npm run build` 打出来的单文件）。源码 `index.html` 和验收台要 `npm run dev`（http://localhost:8183）。贴图仍是程序化画布，不从本地 PNG 上传纹理。
- **打包是手动的**：改完源码只跑测试 + `npm run dev` 目视验证，**不要自动 `npm run build`**、不要动 `dist/`。主人说「打包 / 构建」再打，产物跟那一次提交一起走（`dist/index.html` 是 ~1MB 单文件，每改一次就重打会让 diff 暴涨）。
- 调试参数：`?quality=low` `?shot=wide`(zoom 0.55) `?shot=map`(zoom 0.3，整座岛) `?stats=1` `?chunk=0`(关掉地面分块) `?cam=mir|iso|diag45|diag45p|up45|now`(切相机，默认 mir) `?room=<id>`(需带 shot) `?debug`。
- 地图尺寸 / 陆地大小：`overworld.js` 的 `N`=128 是**整图**，`ISLAND_R`(17)=48 决定**陆地约 96×96**（再往外到图边都是海），`CITY_HALF`(14)=15 是城内 **31×31 的安全区**（2026-10-29 从 41 缩到 3/4；城外那圈自动变回草地，野怪能刷到离墙 3 格）；改完确认出生点、铺子、三个门都还落在可走格上。

## 测试
| 命令 | 现状 |
|---|---|
| `node games/darklegend/test-game.mjs` | **387 项**（Node+DOM 桩）；`import ./src/game.js`（不带 overworld，和改前的加载集合一致） |
| `node games/darklegend/test-input.js` | 真 Chrome `http://localhost:8183/?debug`，8 项：3D 已启动、点小地图不动、点地走、点怪掉血。先 `npm run dev` |
| `node games/darklegend/test-three.mjs` / `check-assets.mjs` | 515 项射线往返（不开 WebGL）/ 只剩瓦片 4 张 PNG 头（tiles-cave + terrain×3，已不被运行时加载，留着等重建） |
| `node games/darklegend/balance.mjs --check` | 超范围 exit 1；**当前就有 1 红**（30 级装备占攻 23.6%，目标 35–65），不是你改坏的 |

## 雷区
- **源码是 ESM。** 双击只能开 `dist/index.html`。源码 `index.html` 和 `asset-bench.html` / `bench-scene.html` / `light-test.html` 要开发服务器。`package.json` 不要写 `"type": "module"`，否则 `test-input.js` 的 `require` 会崩。
- **three 钉死 `0.170.0`（REVISION 170）。** 这是原 `vendor/three.iife.js` 的版本。STATUS §七 的光照结论是在这份上量的。不要装 latest，也不要换 major。`src/tile-plate.js` 调用时读 `global.THREE`，`render-three.js` 会把这一份赋上去。不要再放回第二份 three。
- `balance.mjs` **复制**了 `makeEnemy`/装备公式（29–50 行注释自认）；改公式不同步它，体检就是假的。
- 测试不覆盖渲染：`test-game.mjs` 不加载 `render-three` / `hd-draw` / `iso-ground` / `overworld`，改立牌/地面只能肉眼验收（默认交主人看，不主动截图；主人要图时再用 `?shot=wide`）。
- **没有 2D 回退了**：3D 起不来就只剩一条"这个浏览器开不了 WebGL"的提示。调渲染别再指望 `?engine=canvas`。
- `hd-draw.js` 是立牌唯一来源（`heroSheet` `npc` `mob` `house` `rock` `caveMouth` `flora` `townProp` 全在 render-three 里用），改它就是改画面。`mob` 只画了鸡/稻草人/野狗/野猪四种，其余怪用 emoji 立牌占位（`glyphCanvas`）。
- 3D 视口是 16:9（`three-pick.js` 的 `VIEW_W/H = 1280×720`）：**竖屏手机上是上下留黑边的横条 + "请横屏游玩"**；要改竖屏视锥得同时动 `three-pick` / `clampLook` / 点击反算。
- 新弹窗必须登记进 `uiOpen()`(361)，否则 `after`/`walk`/挂机在背后继续跑；加存档字段要 `save`(1850)+`load`(1877) 成对改，`v:4`(1814) 是手写的。
- 地面分块（`groundSheet` 的 `rect`）：`px` 必须按**整张地图**算（`MAX_SIDE/max(cols,rows)`），
  按块算会让各块 px 不同、纹理拼不上；`brick` 与小 `slab` 是按**画布**从头排砖的（只有 `big:true`
  的大石板按格对齐），大图分块会错缝——真要在大图用，先改成按格锚定。
- 地面分块的三个坑（都实测踩过，见 `docs/STATUS.md` §七）：①按格锚定的笔触必须减窗口原点
  （`stampBlob`/`detailOnOverlay`/`shoreEdge`）；②低频色斑必须按整张图撒（`blobSpace`），
  否则缝上一条 3% 调子台阶；③块没补上时露的是底衬纯色 `PALETTES[theme].base`，不是天空蓝。
  块大小 = 走路手感：**16 格单块 30~42ms（一次掉 68ms 帧，能明显感到顿）→ 8 格 2~15ms（走 26 格 0 次 >25ms）**，
  代价是常驻块数变多（默认视角 22 块 ≈ 20MB 贴图，`?shot=map` 会到 240 块）；块大省 draw call，但单次卡顿更明显。
- **海岸距场（`coastField`）别按块算**：一块的 `chamfer` + 逐像素噪声是 15~30ms，海边的块一生成立刻掉帧。
  现在 `buildGround` 按整图算一次（128×128 用 **12px/格**，约 0.2s；32px 要 1.56s 太贵），
  存进 `gSea`：① 地面块传 `coast/coastPx` 只裁一块再缩放；② 海面着色器共用同张贴图、UV 走地图比例；
  ③ 图外那圈海用同一个 shader 铺四条（否则 `?shot=map` 能看见一条硬边）。
- 大图 `px` 走 `4096/max(cols,rows)` 封顶（128×128 → 32px）；`chunkPx` 再小也不会让单块更轻太多，
  别为了清晰度把 128×128 调回 48px——单块会回到 60~90ms。
- **相机默认 = mir（已定稿）**：偏航 0° + 俯角 55° + 透视 fov32 + **zoom 1.70**（地面 midV ≈ **竖向 20 格**，横向约 28 格）。`?cam=iso` 才是旧斜角 45° + 俯角 30° + 正交（2:1 菱形）。
  改偏航/俯角/zoom 时**必须同时**动三样：① 立牌（`billboard()` 里按 `CAM.yaw` 转，否则斜看压扁）；
  ② 地面分块（斜角时视野是四边形，按"玩家周围 3×3"会在屏幕角露底衬，见 `viewQuad`）；③ 一屏格数（`BASE_DIST` / ortho 的 `halfH` / 透视的 `dist/zoom`）。
  验画面用**整张截图**：`Page.captureScreenshot` 带 `clip` 会抓到 WebGL 未保留帧的残影，会误报"地上有洞"。
- 文档滞后两处：规则文档第 55 行仍把"双手槽是否回来"列为待定（实际 `EQUIP_SLOTS` 已有 glovesL/R，data.js 201）；词缀 R8 属 M2 冻结但代码已在掷 `affix` 并计算，只界面写"未鉴定"。
- 冻结/未做只查文档：3D 低模、实时光照、连续世界、词缀、多区域 → `docs/STATUS.md` §四；A1–A7 与 B 类美术缺口 → `docs/豆豆暗黑传奇-进度与完成度.md` §还没做。
- **点地走路别按格子折线画**：逻辑仍是一格一拍，但画面位置由 `walkLine` 决定——沿
  `bfs` 拉直后的 `path.pts`（起点/拐点/终点）之间的真直线匀速走，`walkStepVis` 里
  `u = (done-1+t)/total` 按弧长取点。贴着格心画的话，八向网格的缓斜线永远是「斜一步、直一步」，
  看着就是楼梯或蛇形。手动按方向键会 `stopWalk` 接管，别让两条走法打架。
