# 豆豆暗黑传奇 · 锚点表
> 改这个游戏先读这一份：21 文件、约 12800 行（JS/HTML/CSS，不含 5 个 .py 生成器）。先看 `docs/STATUS.md` 定做什么，玩法数值以 `docs/豆豆暗黑传奇-规则与任务.md` 为准，画面验收看 `docs/渲染规格.md` §八；本表只记「改这个 → 动哪几个函数」，不重复文档。行号 2026-10-28 实测（docs 里的旧行数已过期）。

## 一句话
主城 24×24 + 14 个房间（`ROOMS`）的回合制刷宝：走一格 = 一回合，由 `after()` 排下一拍；装备落地成袋、走上去才捡；画面默认 three.js 正交 2.5D，`?engine=canvas` 回 2D。

## 文件分层
| 文件 | 行数 | 层 | 管什么 |
|---|---|---|---|
| `data.js` | 404 | data | 全部表与常量（`DL.DATA`），无逻辑 |
| `core.js` | 108 | core | 纯公式：成长、装备区间、等级差查表 |
| `world.js` | 229 | world | `genHub` `genRoom` `genTerrain`、`bfs`、`canStep` |
| `overworld.js` | 139 | world | 3D 专用 128×128 野外 + `caveMap`（仅 `applyOverworld` 用） |
| `combat.js` | 134 | combat | `playerDamage` `enemyDamage` `halfMoonCells` `decide` `nextStep` |
| `status.js` | 170 | status | `DEFS` + `apply` `tick` `onHit` `canAct` `list` |
| `game.js` | 5135 | game | 编排 + 2D 绘制 + 全部 DOM 绑定（分段见下） |
| `render-three.js` | 1275 | 3D | 正交场景：地面/立牌/接触阴影/排序/迷你图/拾取 |
| `hd-draw.js` 738 + `iso-ground.js` 338 + `three-pick.js` 60 | — | 3D 素材 | 程序化精灵（本目录只 render-three 用 4 处）/ 菱形地面 `paint`(217) / 屏幕→格射线 |
| `iso-art.js` ~1560 | — | 3D 地面 | **地面材质真身**：9 种材质画法、`groundSheet`（整张图一次画完）、`seaMask`（海/池塘）、`shoreline`（岸线）、崖壁 `cliff`/`cliffHeight`；验收台 `asset-bench.html` |
| `tiles.js` 134 + `assets.js` 61 | — | 2D | 瓦片图集坐标与墙掩码 / PNG 切片加载，缺图退 emoji |
| `sfx.js` | 227 | audio | `SFX` 音名表(186) + WebAudio/WAV 兜底，`MUTE_KEY`(8) |
| `index.html` 336 + `style.css` 1316 | — | shell | HUD/DOM 与布局；脚本顺序 320–334，`touch-action:none`(222) |
| 测试 5 件 | 2014 | test | test-game 1507 / test-input 175 / balance 173 / test-three 71 / check-assets 88 |
| `gen-*.py` 5 个 | 2014 | 素材 | 生成 `assets/**`，不参与运行 |

## game.js 5135 行的分段地图
| 行区间 | 段 | 关键函数（行号） |
|---|---|---|
| 1–315 | 骨架 | `P` 初始(211)、全部 `let` 状态(246)、`visible()` 恒 true(314)、`uiOpen`(315) |
| 317–786 | 主城/房间/刷怪 | `applyOverworld`363 `genHub`405 `spawnRoomMobs`451 `enterRoom`502 `leaveRoom`549 `spawnBossInRoom`635 `tryRoomRespawn`678、精英/稀有保底 740/757 |
| 787–960 | 敌/装备生成 | `isCrush`787 `makeEnemy`794 `rollRarity`832 `makeEquip`840 `eqReqLv`903 `rollDropSlot`926 |
| 961–1620 | 装备链 + 面板气泡 | `addToBag`991 `equipFromBag`1014 `sellFromBag`1040 `depositFromBag`1067 `sellBagByRarity`1109 `eqCellHtml`1236 `showEqTip`1361 `renderChar`1460 `updateTips`1560 |
| 1621–1840 | HUD/交互/存读档 | `syncHud`1653 `interactTarget`1695 `tryInteract`1712 `save`1757 `load`1784 |
| 1840–2245 | 战斗+试炼+技能书 | `engage`1842 `strike`1848 `kill`1861 `rollTrialTask`1978 `turnInTrial`2021 `renderTrial`2124 `rollSkillBookDrop`2179 |
| 2246–2500 | 掉落/袋/挂机 | `rollDrop`2246 `rollKillEquipDrops`2256 `dropBag`2297 `pickupBag`2319 `setAutoFarm`2401 `autoTakeBag`2439 |
| 2509–2683 | 怪回合/状态/生死 | `enemiesTurn`2509 `bossTrick`2553 `tickStatuses`2571 `die`2598 `revive`2623 `win`2639 |
| 2684–2878 | **回合时钟（改节奏只动这里）** | `after`2684（DoT→MP/CD→怪行动→`turn++`→存盘→下一拍）`farmStepTo`2769 `autoStep`2798 |
| 2879–3272 | 技能/动作/移动/门 | `attack`2920 `halfMoon`2937 `fireSword`2951 `drink`2969 `act`3003 `promptDoor`3051 `move`3092（撞怪=攻击）`walk`3241 |
| 3275–3549 | 输入 | `onPointer`3275 → `handleCellClick`3289（唯一点地/点怪入口）`bindDpad`3485 `onKey`3517 |
| 3550–4213 | 商店/仓库 + DOM 绑定 | `ensureShopCatalog`3550 `refreshShop`3623 `refreshStash`3646 `buyPotion`3688 `buy`3730、`bind`3794（所有按钮/遮罩/音效门） |
| 4214–4934 | 相机/地形/道具 + 2D 绘制 | `camTarget`4214 `refreshTerrain`4258 `buildProps`4282 `drawMap`4543 `drawEntities`4696 `drawMinimap`4871 `draw`4850 |
| 4935–5135 | 启动/调试出口 | 引导 4935、图集加载 4971、`ThreeBridge`4998、`window.__dl`5041（`?debug`） |

## 想改什么 → 去哪
| 想改 | 动这几个 |
|---|---|
| 怪血/攻/防/经验/金币 | `game.js makeEnemy`(794) + `data.js GRADE`(147)；**同步 `balance.mjs`(29–50)** |
| 玩家成长/升级曲线 | `data.js GROWTH`(395) → `core.js maxHp/atkRange/needExp`(63–76) |
| 掉落概率/保底 | `data.js DROP`(176) `RESPAWN`(71)；`game.js rollDrop`(2246) `rollKillEquipDrops`(2256) |
| 装备底材/属性倍率 | `data.js EQUIP_BASES`(229) `EQUIP_STAT_MUL`(336)；`game.js makeEquip`(840) |
| 词缀（M2 冻结但在跑） | `game.js makeEquip`(893) 掷 affix、`core.js affixMult`(35) 已计入伤害，UI 占位 `affixSlot`(983) |
| 房间 / 地图 / 主城 | `data.js ROOMS`(359) `THEME_OF_ROOM`(24)；`world.js genRoom`(126) `genHub`(92)；`game.js enterRoom`(502) |
| 战斗判定（伤害/范围） | `combat.js playerDamage`(20) `halfMoonCells`(35)；`game.js strike`(1848) `halfMoon`(2937) |
| 怪 AI / BOSS 出招 | `data.js AI`(136)；`combat.js decide`(77)；`game.js enemiesTurn`(2509) `bossTrick`(2553) |
| 状态（毒/烧/眩晕/麻痹） | `status.js DEFS`(24) `apply`(61) `tick`(87)；`game.js tickStatuses`(2571) |
| 2D 画面 | `game.js draw`(4850) `drawMap`(4543) `drawEntities`(4696)；`tiles.js` `assets.js`（**不是 hd-draw**） |
| 3D 画面 | `render-three.js rebuildRoom`(771) `buildGround`(350) `addEnemy`(607) `tick`(923)；`iso-ground.js paint`(217) |
| 3D 地面材质（草地/石板/水/海/岸线） | `iso-art.js`：`paintGrass` `paintSlab` `paintWater` `paintSea` `shoreline` `seaMask` `groundSheet`；改完看 `asset-bench.html` 1:1 |
| 崖壁精灵（AI 图） | `iso-art.js setCliffSprites` / `cliffFoot`；图在 `assets/iso/processed/cliff1..3.png`；重出图看 `docs/瓦片清单.md` §一·五 v4（img2img + `key-magenta.py`） |
| 音效 / 存档 | `sfx.js SFX`(186)+`play`(197)、调用点 game 1032/1908；`game.js save`(1757) `load`(1784)、`SAVE_KEY`(32) |
| 鼠标 / 手机触摸 | `game.js onPointer`(3275) `handleCellClick`(3289) `bindDpad`(3485)；CSS 222 |

## 数值都在哪（全在 data.js）
| 表（行） | 关键字段 | 谁用 |
|---|---|---|
| `GROWTH` 395 | baseHp/hpPerLv/baseAtk/baseDef/expBase/expRate | `core.maxHp/atkRange/needExp`(63–76) |
| `MON` 87 + `BOSS` 102 + `GRADE` 147 | lv/aggro/ai/atkMin/atkMax/gold；品级 hp/atk/lvAdd/exp/p | `makeEnemy`(794) `poolMon`(615) |
| `DROP` 176 + `RARITY` 166 | c/b/a/s、elite/rare/boss、potion；mult/letter/color | `rollDrop`(2246) `rollKillEquipDrops`(2256) `makeEquip`(840) |
| `EQUIP_BASES` 229 + `EQUIP_STAT_MUL` 336 | ilvl/name、atk/def/hp 倍率 | `makeEquip`(840) |
| `POTIONS` 187 + `SHOP` 348 + `BOOK_SHOP` 65 | tiers.amount、redMul/blueMul、price | `buyPotion`(3688) `buy`(3730) `buyBook`(3609) |
| `RESPAWN` 71 + `ROOM_ENTER_SLACK` 358 | normalDelayMs/elitePityMax/rarePityMax/bossDefaultCd | `tryRoomRespawn`(678) `canEnterRoom`(492) |
| `CRUSH` 156 + `EXP_GAP` 382 + `GOLD_GAP_NORMAL` 386 | 碾压级差、等级差倍率 | `isCrush`(787) `kill`(1861) |
| `TRIAL` 123 + `AI` 136 | rewardPct/collectNeed/orbPct；leash/passiveChase/bossStunP | `rollTrialTask`(1978) `decide`(77) |
| `TILEMAP` 15 + `THEME_OF_ROOM` 24 + `ZONE_FLOOR` 389 | 视觉主题、地面色 | `themeNow`(4229)、`iso-ground.themeOf`(54) |

## 两条渲染路怎么选
- **默认就是 3D**：`render-three.js wanted()`(48) 只在 `?engine=canvas` 或 `file://` 下返回 false；`?engine=three` 已不是开关（写了照样走 3D）；`file://` 双击打开 = 2D（WebGL 纹理被 CORS 拦）。
- 3D：`boot()`(1151) 藏 `#game`、建 `#view3d`，每帧 `tick()`(923) 从 `ThreeBridge`（game.js 4998）读状态；点击 `pointer`(1138) 只算格子再回调 `B.clickCell`（1146）→ `handleCellClick`，不复制寻路/战斗。
- 2D：`draw()`(4850) 见 `ThreeView.active()` 直接 return；否则 `drawMap`/`drawEntities` + 图集/PNG，缺图退 emoji(4706)。调试参数：`?engine=canvas` `?quality=low` `?shot=wide`(zoom 0.55) `?stats=1` `?room=<id>`(需带 shot) `?debug`。

## 测试
| 命令 | 现状 |
|---|---|
| `node games/darklegend/test-game.mjs` | 388 项（Node+DOM 桩）；只加载 data/core/world/tiles/combat/status/sfx/game |
| `node games/darklegend/test-input.js` | 真 Chrome `file://...?debug`，6 项：点地走、点怪掉血 |
| `node games/darklegend/test-three.mjs` / `check-assets.mjs` | 515 项射线往返（不开 WebGL）/ 图集 PNG 头（`--all` 卡 29 张） |
| `node games/darklegend/balance.mjs --check` | 超范围 exit 1；**当前就有 1 红**（30 级装备占攻 23.6%，目标 35–65），不是你改坏的 |

## 雷区
- `balance.mjs` **复制**了 `makeEnemy`/装备公式（29–50 行注释自认）；改公式不同步它，体检就是假的。
- 测试不覆盖渲染：`test-game.mjs` 不加载 `render-three` / `hd-draw` / `iso-ground` / `overworld` / `assets`，改这些只能肉眼 + 上面那串 URL 参数验。
- 3D 下 `draw()` 早退(4851)：**2D 画面和 2D 小地图的修正在默认模式看不见**，先加 `?engine=canvas`。
- `hd-draw.js` 只被 render-three 调用 4 处（`heroSheet` 115、`mob` 1011、`rock` 746、`caveMouth` 764），其余导出无调用点；2D 人物走 `assets.js`，别改错文件。
- `visible()` 恒 true(314)，`seen` 只喂小地图；新弹窗必须登记进 `uiOpen()`(315)，否则 `after`/`walk`/挂机在背后继续跑；加存档字段要 `save`(1757)+`load`(1784) 成对改，`v:4`(1762) 是手写的。
- 文档滞后两处：规则文档第 55 行仍把"双手槽是否回来"列为待定（实际 `EQUIP_SLOTS` 已有 glovesL/R，data.js 215）；词缀 R8 属 M2 冻结但代码已在掷 `affix` 并计算，只界面写"未鉴定"。
- 冻结/未做只查文档：3D 低模、实时光照、2D Canvas 继续开发、连续世界、词缀、多区域 → `docs/STATUS.md` §四；A1–A7 与 B 类美术缺口 → `docs/豆豆暗黑传奇-进度与完成度.md` §还没做。
