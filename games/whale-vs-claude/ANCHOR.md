# 鲸鱼娘大战 Claude · 锚点表
> 改这个游戏先读这一份。单文件 `index.html`（约 118 KB，内联 7 个模块），源码在 `src/`；**改源码后跑 `node build.mjs` 重新内联**，别直接改 index.html。

## 一句话
800×600 横屏俯视坦克大战：鲸鱼娘守底部「大白饭」，3 关递进（24 / 24 / 16 敌 + BOSS），关间三选一强化，一局约 5–9 分钟。

## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| `src/core.js` | 279 | 常量（15×15、TILE 40、800×600）、AABB、地形碰撞/破坏、四方向贴图加载与绘制、地图渲染（砖/钢/水/大白饭/蒸汽） |
| `src/level.js` | 194 | 三关地图（`Levels`）、`buildGrid` 深拷贝、主题色、出生点/老巢/敌人生成点 |
| `src/enemies.js` | 500 | `EnemyTypes` 五种数值、生成/选点、AI 决策与撞墙换向、开火、BOSS 两阶段、卡住保护 |
| `src/player.js` | 437 | 玩家创建/移动/开火/受击/无敌、8 张强化卡 `UPGRADES`、`attachTouch` 触控 |
| `src/fx.js` | 390 | 粒子/飘字/顿帧、WebAudio 12 个程序化音效、静音存档 |
| `src/ui.js` | 726 | HUD、标题、关卡开场、强化三选一、通关/失败结算、`hitTest` |
| `src/game.js` | 629 | 状态机、固定步长主循环、子弹、波次、击杀结算、关间切换、输入、`?play/?level/?tick/?boss` 测试钩子 |
| `src/template.html` | 30 | canvas 骨架 + CSS（`touch-action:none`、`overscroll-behavior:none`） |
| `build.mjs` | 40 | 按顺序把 7 个模块内联进 `index.html` |
| `test-auto.mjs` | — | Node 无头对局：3 局无敌 bot 通关 + 普通难度参考局 |
| `SPEC-v2.md` | — | 开发契约（接口、验收线），改架构前先读 |

## 状态机与主循环
- `G.mode`：`'title' | 'intro' | 'play' | 'clear' | 'upgrade' | 'result'`（game.js:36 附近 `loadLevel` 切换）。
- 主循环：`requestAnimationFrame` → `loop()` → 固定步长 `step(1/60)`；`G.hitstop > 0` 时跳过逻辑只冻结帧。
- `step` 的 play 分支顺序（game.js:174 前）：玩家 → 敌人 → 子弹 → 敌我子弹对撞 → 玩家/敌人分离 → 粒子 → 波次 → 通关判定。
- 关卡：`loadLevel(i)` 重置网格/玩家/敌人/波次/大白饭 3 点血；`?level=2` 可直接进第三关。
- 波次：`updateWaves`（game.js:111）按 `waveSizes` 填队列，同屏上限 4（BOSS 在场 3），每 1s 刷一个；小怪队列空后 BOSS 登场并回满 5 命。
- 关间：`levelClear`（game.js:309）→ `clear` 停留 2s → 第 1/2 关后 `enterUpgrade`（game.js:323）三选一 → 下一关；第 3 关后 `result(true)`。

## 想改什么 → 去哪
| 想改 | 动哪 |
|---|---|
| 敌人血量/速度/射速/弹速 | `src/enemies.js` 顶部 `EnemyTypes`（grunt/scout/heavy/sniper/boss） |
| BOSS 血量、阶段、弹幕 | `EnemyTypes.boss` + `bossPattern`（阶段 1 单发、阶段 2 两向扇形、最多召唤 2 次） |
| 每关敌人数量/波次 | `src/level.js` 的 `enemyQuota` / `waveSizes`（第 3 关 `hasBoss:true`） |
| 地图地形 | `src/level.js` 每关 `map`（15 行 ×15 字符：`.`空 `b`砖 `s`钢 `H`老巢 `w`水） |
| 玩家速度/射速/初始命 | `src/player.js` 顶部 `BASE_SPEED / BASE_FIRE_RATE / BASE_LIVES / BASE_BULLET_SPEED` |
| 强化卡池与效果 | `src/player.js` 的 `WV.UPGRADES` + `applyUpgrade`；抽卡在 game.js `enterUpgrade` |
| 刷怪节奏/同屏上限 | `src/game.js` `updateWaves` 的 `G.spawnCd = 1.0`、`MAX_ALIVE` |
| 大白饭血量 | `src/game.js` `loadLevel` 里 `G.dinnerHp = 3` |
| 音效 | `src/fx.js` `WV.audio`（12 个名字，全部振荡器+噪声合成） |
| UI 文案/布局 | `src/ui.js`（HUD 在 600–800 区域；卡片 150×190） |

## 数值都在哪
| 表 | 位置 | 关键值 |
|---|---|---|
| `EnemyTypes` | enemies.js 顶部 | grunt 1血/70速/2.1–3.6s；scout 1/100/3.0–4.2s；heavy 3/48/2.5–4.0s；sniper 2/62/3.4–4.6s；boss 20血/46速/2.2–2.8s，弹速 210 |
| 关卡 | level.js | 第1关 24 敌 6 波；第2关 24 敌 6 波；第3关 16 敌 4 波 + BOSS |
| 玩家 | player.js | 速度 150、射速 0.28s、弹速 300、初始 4 命、上限 5 |
| 老巢 | game.js | 3 点血，每关重置；BOSS 登场回满 5 命 |
| 刷怪 | game.js | 同屏 4（BOSS 3）、间隔 1.0s、BOSS 出现时清队列 |

## 测试
`node games/whale-vs-claude/test-auto.mjs` → 3 局无敌 bot 必须 3/3 通关、单局 200–660 秒、三局走完 3 关；另跑一局普通难度作参考（不卡退出码）。
渲染/手感不覆盖，真机由主人验收。headless 截图要加 `--run-all-compositor-stages-before-draw`，URL 加 `?play=1&tick=600` 推 10 秒再截。

## 雷区
- **别把老巢四周改回纯砖**：敌人会隔半张地图拆墙，13 秒偷家。现在是钢墙 + 3 点血，只有 heavy/BOSS 的 power 2 能破。
- **敌人开火前有 260px 目标判定**（`aheadHasTarget`）：删掉会变成隔屏乱射。
- **BOSS 弹幕是 `noDinner` 且破墙力降 1**：否则 BOSS 会顺手拆家。
- **玩家自己的子弹不扣老巢血**（game.js 的 DINNER 分支判 `owner==='player'` 跳过）：拿重炮弹卡时玩家能打穿自家钢墙，别把这行删了。
- **`separatePlayer` 推开玩家前必须查 `blockedForTank`**：否则会把玩家推进砖里卡死。
- **穿透弹命中后要沿弹道推出 14px**：不然下一帧重复命中同一个敌人。
- **BOSS 召唤物有 `e.summoned` 标记**，击杀时不减 `enemiesLeft`，否则 HUD 剩余数错。
- 跨关继承玩家属性时记得带上 `doubleLevel`，否则双发会退回两发。
- `src/` 是唯一真相，`index.html` 是 build 产物；改完必须 `node build.mjs`。
