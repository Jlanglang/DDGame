# 豆豆勇者 · 锚点表
> 改这个游戏先读这一份。game.js 2846 行，舞台 1280×720 横屏；玩法/操作详见 README.md，通用规则见根 AGENTS.md。
## 一句话
森林割草攒经验 → 营地商店整备 → 森林尽头传送门 → 巢穴单挑蘑菇王；两张图共用一套角色存档。

## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| `game.js` | 2846 | 全部逻辑：常量、存档、战斗、AI、BOSS、渲染、输入、主循环 |
| `index.html` | 157 | 舞台/HUD/商店/结算/角色选择/竖屏提示的 DOM |
| `style.css` | 1010 | 1280×720 布局；按钮和字号靠 `--u` 跟随舞台缩放 |
| `test-lib.js` | 96 | 四个测试共用的 CDP-over-pipe 启动/等待工具 |
| `test-input.js` / `test-stage.js` / `test-save.js` / `test-shop.js` | 133 / 46 / 97 / 64 | 真浏览器输入 / 切图 / 存档 / 商店 |

## 状态机与主循环
- `G.state`：`menu` / `play` / `win` / `lose`。启动默认 `play`，无 `?skipmenu=1` 时在 `game.js:2832` 切 `menu`；回选择页在 `game.js:858`，重开回 `play` 在 `game.js:354`。`G.paused`、`G.shopOpen`、非 `play` 时 `update` 只跑 `updateFx`（`game.js:1231`）。
- 主循环 `frame`（`game.js:2801`）：`update(dt*FAST)` → 按住攻击连段 → `syncHUD` / `syncSkill` → `render` → rAF；`dt` 上限 0.033，`?fast=1~6` 在 `game.js:2799`。
- 每帧顺序（`update`，`game.js:1230`）：输入→计时→玩家物理→营地/喝药→相机→刷怪→传送门→小怪→弹幕→BOSS→掉落→特效。
- 切图 `G.fade`（`game.js:1243`）：`startTransition` 把 `fadeDir=1`；每帧 `G.fade += fadeDir*rawDt*2.4`；到 1 时 `enterStage(pendingStage)` 并反向；到 0 停。单程约 0.42s，全黑时切图后淡入。

## 想改什么 → 去哪
| 想改什么 | 先动这里 | 备注 |
|---|---|---|
| 难度 / 血量 / 伤害 | `ENEMY` `game.js:66`、`BOSS` `game.js:72`、`statsOf` `game.js:232` | 玩家成长公式在 `statsOf`，局内升级在 `gainExp` `game.js:589` |
| 三段连击 / 下劈 | `attack` `game.js:443`、`doAttackHit` `game.js:1379`、`ATTACK_*` `game.js:32` | 第三段 ×1.8；空中额外下劈在 `game.js:1391` |
| 旋风斩 | `castSkill` `game.js:479`、`doSkillHit` `game.js:1396`、`SKILL_*` `game.js:36` | 半径 158；每 0.13s 判定在 `game.js:1305` |
| 跳跃 / 平台 | `jump` `game.js:461`、`moveBody` `game.js:898`、`PLATFORMS_*` `game.js:47,59` | 单向平台；`S` 下穿由 `keys.down` 控制 |
| 小怪 AI / 刷怪 | `updateEnemies` `game.js:1462`、`spawnWave` `game.js:990`、`spawnPoint` `game.js:931` | 仇恨 300/280/460，蘑菇巡逻 ±120；安全区 x<430 不刷 |
| BOSS 行为 / 阶段 | `bossPickAttack` `game.js:1098`、`updateBoss` `game.js:1134`、`bossShockwaves` `game.js:1120` | 冲撞 400/500，冲击波 26 伤害，45% 血二阶段 |
| 地图 / 传送门 | `STAGE_W` `game.js:22`、`enterStage` `game.js:1021`、`startTransition` `game.js:1013` | 森林 3200 → 巢穴 1500；门在 3040/70，进图锁 0.6s |
| 营地 / 商店 | `SHOP_X` `game.js:44`、`drawCamp` `game.js:1843`、`openShop` `game.js:752`、`refreshShop` `game.js:733` | 靠近 140px 出现；营地 x<380 回 12/s |
| 存档 / 角色 / 等级 | `SLOT_KEY` `game.js:158`、`loadSlots` `game.js:177`、`defaultSave` `game.js:160`、`bankRun` `game.js:612` | 6 槽、旧档迁移、`?fresh=1` 清档；金币拾取即写档 |
| 操作 / 触摸 | `keys/pointer` `game.js:2613`、`onDown` `game.js:2685`、dpad `game.js:2629`、按钮 `game.js:2749` | 画布拖动只认第一根手指；按钮在 DOM 层各自响应 |
| HUD / 结算 / 画面 | `syncHUD` `game.js:2560`、`win` `game.js:633`、`lose` `game.js:645`、`refreshGrow` `game.js:663`、`render` `game.js:2449`、`drawPlayer` `game.js:1942`、`drawBoss` `game.js:2252` | 菜单 `showChars` `game.js:855`；相机 `game.js:1349`；缩放 `game.js:1664` |

## 数值都在哪
| 常量 / 位置 | 当前值 / 说明 |
|---|---|
| `W,H,GROUND_Y` / `STAGE_W` `game.js:16,22` | 1280×720，地面 y=600；地图宽 `[3200,1500]`；`WORLD_W` 只用于背景铺树 |
| `PORTAL_X / LAIR_PORTAL_X / SHOP_X` `game.js:42` | 3040 / 70 / 200 |
| `MOVE_SPEED / JUMP_V / JUMP2_V / GRAV` `game.js:24` | 470 / 950 / 820 / 2100 |
| `ATTACK_DUR / ATTACK_MUL / ATTACK_REACH` `game.js:32` | `[0.26,0.28,0.36]` / `[1,1.18,1.8]` / `[150,158,196]` |
| `SKILL_CD / SKILL_TIME / MAX_ALIVE` `game.js:36` | 8s / 0.72s / 7 只；刷怪间隔 1.3~2.2s（`game.js:997`） |
| `ENEMY / BOSS` `game.js:66,72` | 小怪 46~110hp、12~18dmg；BOSS 2200hp / 34dmg / 260exp |
| `statsOf / weaponCost / armorCost` `game.js:232,248` | 初始 200hp、28atk；每级 +16hp/+3atk；武器每级 +5 攻、护甲每级 +24 血、药水 25 金 |

## 存档结构
`localStorage['doudou-hero-slots-v2'] = { current, slots: [{ name, save }] }`，最多 6 槽，`name` 截 8 字。
`save` 字段（`defaultSave` `game.js:160`）：`v, exp, gold, weapon, armor, potions, sp, atkSp, hpSp, clears, best`。旧键 `doudou-hero-save-v1` 自动迁移；金币拾取即写档，经验/技能点在 `bankRun` 入账。

## 测试
- 测试：`node games/hero/test-input.js`（11 项）、`node games/hero/test-stage.js`（6 项）、`node games/hero/test-save.js`（13 项）、`node games/hero/test-shop.js`（8 项），均为真浏览器零依赖。

## 雷区
- 金币拾取时已实时入账，`bankRun` 明确不再加金币（`game.js:624`）；在结算里再写 `SAVE.gold +=` 会双倍。
- `WORLD_W` 只喂背景树和地面点（`game.js:19,1686,1692`）；真正地图宽是 `G.worldW` ← `STAGE_W`（`game.js:1023`），只改 `WORLD_W` 不会改图。
- BOSS 用 `moveBody(..., true)` 穿过平台（`game.js:1189`）；改成 `false` 会让跳砸落在浮空平台上，冲击波位置也会不对。
- 传送门 `G.portalLock` 0.6s（`game.js:1039`），关商店也锁 0.4s（`game.js:765`）；删掉会进门立刻弹回。
- 画布拖动指针只认第一根（`game.js:2614,2687`）；按下角色左侧 26px 外会置 `keys.left`（`game.js:2695`），dpad/按钮是 DOM 层，不经过画布（`game.js:2677`）。
- `index.html:110` 的「生命 400」和 `index.html:115` 的「+20 血」是静态旧文案，会被 `refreshGrow`（`game.js:663`）覆盖；别照静态 HTML 调数值。
