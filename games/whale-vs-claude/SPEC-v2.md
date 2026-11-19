# 鲸鱼娘大战 Claude v2 — 开发契约（SPEC）

> 给子智能体：**先完整读完本文件**。你只负责自己那一个模块文件，不要改别人的文件。
> 主智能体负责 core.js / game.js / build.mjs / 集成。

## 1. 产品目标（已与主人确认）

- 2D 俯视坦克大战，换皮：玩家=鲸鱼娘，敌人=Claude 娘，子弹=饭团，老巢=大白饭。
- **一局完整流程 5–8 分钟**：3 关递进，每关有开头/波次/收尾，第 3 关有 BOSS，通关有结算。
- 每关结束（第 1、2 关后）出现**三选一强化**，第 3 关结算后直接终局。
- 交付：`index.html` 单文件双击即玩（build 内联），源码在 `src/` 拆模块。
- 保留现有四方向人物贴图（`whale-girl*.png` / `claude-buddy*.png`）。
- 键盘 + 手机触控双端；程序化音效（WebAudio，可静音）。
- 手感铁律：**不做全屏震屏/屏闪**。反馈只用：目标闪白、局部粒子、飘字、击毁顿帧、音效。

## 2. 工程约定

- 每个 src 文件是**浏览器全局脚本**，IIFE 风格，不 import/export：

```js
(function (root) {
  'use strict';
  const WV = root.WV = root.WV || {};
  // ... 挂 WV.XXX
})(typeof window !== 'undefined' ? window : globalThis);
```

- 不依赖 DOM 的模块（level/enemies）必须能在 Node 里直接加载运行；依赖 canvas 的（player/fx/ui）所有 DOM 访问必须 `typeof document !== 'undefined'` 保护。
- 不引用其它模块文件，只通过 `WV.*` 调用（加载顺序由 build 保证：core → level → enemies → player → fx → ui → game）。
- 每写完必须 `node --check <你的文件>` 通过。
- **不 commit / push / build 最终 index.html / 不截图**。

## 3. 尺寸与基础常量（core.js 提供）

```
TILE=40, COLS=15, ROWS=15, MAP_W=600, MAP_H=600, HUD_W=200, W=800, H=600
EMPTY=0, BRICK=1, STEEL=2, DINNER=3, WATER=4
DX=[0,1,0,-1], DY=[-1,0,1,0]   // 0上 1右 2下 3左
```

core.js 还提供：
- `WV.aabb(ax,ay,aw,ah,bx,by,bw,bh)` → bool
- `WV.clamp(v,min,max)`
- `WV.tileAt(px,py)` → tile 类型；出界返回 -1
- `WV.blockedForTank(x,y,w,h)` → bool（BRICK/STEEL/DINNER/WATER/出界都算挡）
- `WV.damageTileAt(px,py,power)` → `{ type, destroyed }`（power>=1 破 BRICK；power>=2 破 STEEL；DINNER 不在这里处理）
- `WV.loadSprites()` / `WV.drawCharacter(kind,cx,cy,dir,alpha)` / `WV.assets`
- `WV.rand()`（0..1，可被测试替换）

## 4. 全局游戏状态 G（game.js 维护，所有模块读）

```js
G = {
  mode: 'title'|'intro'|'play'|'clear'|'upgrade'|'result',
  level: 0|1|2,              // 0-based
  levelName: '', theme: {bg, brick, steel, water, accent, accent2},
  grid: number[15][15],
  dinner: {x,y,w:80,h:80},   // 像素坐标，2x2 格
  spawners: [{x,y}],         // 敌人出生点像素坐标（3 个）
  player, enemies: [], bullets: [],
  waveIndex, waveSizes: [], spawnedInWave, totalKillsForLevel, enemiesLeft,
  score, kills, time, levelTime,
  upgrades: [],              // 已拿的强化 id
  cardChoices: [],           // 当前三选一 [{id,name,desc,icon}]
  boss: null, bossMaxHp:0, bossHp:0,
  result: {win, msg},
  muted: false, paused: false, hitstop: 0,
}
```

## 5. 各模块接口（必须严格实现）

### 5.1 `src/level.js`（负责人：level）

```js
WV.Levels = [level1, level2, level3];
WV.buildGrid(levelIndex) -> number[15][15]   // 深拷贝，返回新网格
```

level 对象：
```js
{
  id: 1, name: '浅滩', theme: {...},
  map: [ 15 个长度 15 的字符串 ],   // '.'空 'b'砖 's'钢 'H'老巢 'w'水
  enemyQuota: 12,                    // 本关敌人数
  waveSizes: [4,4,4],                // 波次，和 = enemyQuota
  hasBoss: false,
  playerSpawn: {x, y},               // 像素坐标，坦克左下角
  dinner: {x, y, w:80, h:80},        // 像素坐标
  spawners: [{x,y},{x,y},{x,y}],     // 像素坐标（坦克左上角）
}
```

设计要求：
- 第 1 关「浅滩」：开阔、砖块稀疏，一屏能看懂；敌人 12，3 波。
- 第 2 关「暗流」：水 + 砖混合，形成窄道；敌人 15，3 波。
- 第 3 关「要塞」：钢墙多、通道窄；敌人 12 + BOSS。
- 老巢固定在底部中央 2×2 格（col 7-8, row 13-14），四周围砖。
- 玩家出生点在老巢左侧（约 col 5-6, row 13-14）。
- 三个敌人出生点：顶部 (col 0-1), (col 7), (col 13-14) 附近，出生格必须空。
- **必须满足**：玩家出生点能走到老巢、三个出生点都能走到老巢/地图中部；不许出现完全封闭的连通块。
- 地图不能把老巢的行/列完全堵死。

自带一个 `node` 自检脚本思路（不用交文件，自己跑）：BFS 从玩家出生点出发，必须能到达三个出生点；否则改地图。

### 5.2 `src/enemies.js`（负责人：enemies）

```js
WV.EnemyTypes = {
  grunt:  { hp:1, speed:72,  fireMin:1.1, fireMax:2.2, bulletSpeed:280, dmg:1, score:100, radius:17 },
  scout:  { hp:1, speed:108, fireMin:1.8, fireMax:2.8, bulletSpeed:300, dmg:1, score:120, radius:15 },
  heavy:  { hp:3, speed:50,  fireMin:1.4, fireMax:2.4, bulletSpeed:260, dmg:2, score:200, radius:18 },
  sniper: { hp:2, speed:64,  fireMin:2.2, fireMax:3.0, bulletSpeed:360, dmg:1, score:180, radius:16 },
  boss:   { hp:40, speed:46, fireMin:0.9, fireMax:1.3, bulletSpeed:300, dmg:2, score:1500, radius:24 },
};
WV.Enemies = {
  spawn(G, kind, px, py) -> e,        // 创建并 push 到 G.enemies，返回
  update(G, dt) -> void,              // 驱动全部敌人：移动+转向+开火+受击闪烁计时
  damage(G, e, dmg) -> bool,          // 扣血；死返回 true（由 game.js 处理计分/掉落）
  pickSpawn(G) -> {x,y},              // 挑一个不撞墙不撞坦克的出生点
  bossPattern(G, e) -> void,          // BOSS 弹幕/召唤
};
```

敌人对象字段（game.js 会读）：
```js
{ kind, x, y, w:34, h:34, dir, speed, hp, maxHp, fireCd, flash, isBoss, score, radius }
```

行为要求：
- 每 0.5–1.5s 重新决策一次方向：60% 概率朝老巢、40% 朝玩家，但每步都要防撞墙；撞墙立即换向；**不许长期贴墙抖动**。
- 开火：到间隔且前方无友军/无墙时发射。子弹 push 到 `G.bullets`：
  `{x,y,dx,dy,speed,owner:'enemy',dmg,power:1或2,life}`
- heavy 的子弹 power=2（可破钢），其余 1。
- BOSS：hp 40，分两阶段（hp>50% / <=50%）：阶段 1 三向扇形弹，阶段 2 三向 + 每 8s 召唤 2 个 grunt；在场上缓慢换位，不追玩家。
- 敌人之间不互相阻挡得太死（允许重叠一点也行，但不能卡住）。

### 5.3 `src/player.js`（负责人：player）

```js
WV.Player = {
  create(G) -> player,
  update(G, dt) -> void,      // 读 WV.input；移动/转向/开火/无敌计时/道具
  hit(G) -> void,             // 受击：无敌则忽略；否则掉命 + 重生/判负
  applyUpgrade(G, id) -> void,
  attachTouch(G) -> void,     // 绑定 canvas 触控（虚拟方向 + 开火）
};
WV.UPGRADES = [
  { id:'power', name:'火力强化', desc:'子弹速度 +20%，射速 +15%', icon:'🔥' },
  { id:'pierce', name:'穿甲弹', desc:'子弹可击穿一个敌人', icon:'🎯' },
  { id:'speed', name:'轻装', desc:'移动速度 +15%', icon:'🐟' },
  { id:'life', name:'加餐', desc:'生命 +1（上限 5）', icon:'🍚' },
  { id:'shield', name:'护盾', desc:'受击后无敌时间 +0.8s', icon:'🛡' },
  { id:'rapid', name:'连射', desc:'开火间隔 -20%', icon:'⚡' },
  { id:'double', name:'双发', desc:'同向并排发射两发饭团', icon:'🍙' },
  { id:'bomb', name:'重炮弹', desc:'子弹威力 +1，可破钢墙', icon:'💥' },
];
```

玩家对象：
```js
{ x,y,w:34,h:34, dir, speed:150, cd:0, fireRate:0.32, lives:3, invuln:0,
  isPlayer:true, bulletSpeed:280, bulletPower:1, pierce:0, shieldTime:0,
  doubleShot:false, alive:true }
```

- 键盘：方向键/WASD 移动（四方向，不斜走），Space/J 开火（按住连发，间隔 fireRate）。
- 触控：左下 132px 区域虚拟方向（按下即定方向，Pointer Events + setPointerCapture，只认第一根手指）；右下 96px 圆形开火键（按住连发）。触控目标 ≥44px。`touch-action:none` 在 canvas CSS 里已有。
- 受击：`WV.Player.hit(G)` 里若 invuln>0 直接返回；否则 lives--，`WV.audio.play('playerHit')`，无敌 2s；lives<=0 → 由 game.js 判负（hit 返回 false 表示死）。
- 开火：push `{x,y,dx,dy,speed:bulletSpeed,owner:'player',dmg:1,power:bulletPower,pierce,life}` 到 G.bullets；`WV.audio.play('shoot')`。
- 子弹从车头前方 18px 处出生。

### 5.4 `src/fx.js`（负责人：fx）

```js
WV.FX = {
  burst(G, x, y, color, n, speed),   // 粒子
  float(G, x, y, text, color),       // 飘字
  hitstop(G, sec),                   // 顿帧：设置 G.hitstop = max(G.hitstop, sec)
  update(G, dt),                     // 粒子/飘字推进
  draw(G, ctx),                      // 粒子/飘字渲染
};
WV.audio = {
  init(),            // 首次用户交互后调用；无 AudioContext 时静默降级
  play(name),        // 名字见下
  toggle(),          // 切静音，返回 muted
  get muted(),       // 只读
};
```

音效名（必须全实现，合成音即可）：
`shoot, ricochet, hit, kill, explode, playerHit, powerup, card, start, win, lose, boss`
- 全部 WebAudio 振荡器/噪声合成，零外部文件。
- 静音状态存 `localStorage('wvc-muted')`，读不到就 false。

粒子/飘字数据结构自定，但 `G.particles` / `G.floats` 数组由 game.js 创建并可被 FX 使用。

### 5.5 `src/ui.js`（负责人：ui）

```js
WV.UI = {
  draw(G, ctx),                  // 按 G.mode 分派
  hitTest(mx, my, G),            // 返回 {action, index} 或 null
};
```

action 取值：`start` / `card`（index 0-2）/ `restart` / `mute` / `resume`。

绘制要求：
- 游戏区之外右侧 200px HUD：关卡名、剩余敌人/总数、命、分数、已拿强化图标、静音按钮（右上角 44×44 点击区）、操作提示（小字）。
- `title`：标题「鲸鱼娘大战 Claude」+ 副标题「3 关 · 5 分钟」+ 开始提示（点击/回车）。
- `intro`：关卡名 + 一句话目标，淡入。
- `clear`：本关通过 + 分数 + 短暂停留（game.js 控制）。
- `upgrade`：半透明遮罩 + 3 张卡（每张 150×190），鼠标/手指点选，也支持 1/2/3 键。
- `result`：胜/负 + 分数 + 用时 + 「再来一局」按钮。
- 字体用系统字体 + 中文；不要依赖外部字体。
- 所有按钮命中区 ≥44px。用 `ctx.measureText` 居中，注意 canvas 800×600。

HUD 的「静音」点击区必须在 `hitTest` 返回 `mute`，任何模式下都生效。

## 6. game.js（主智能体负责，模块作者知情即可）

- 固定步长 60Hz；`step()` 内部：`G.time += dt`，按 mode 分派；play 模式：player → enemies → bullets → 规则判定。
- 子弹：子步进防穿透；碰墙调 `WV.damageTileAt`；碰敌方坦克 → `WV.Enemies.damage`；碰玩家 → `WV.Player.hit`；敌我子弹对撞互相消失；DINNER 被击中 → 判负。
- 波次：每关按 `waveSizes` 出怪，同屏上限 4（BOSS 关 3 + BOSS）；敌人清空且波次出完 → 关卡通过。
- 掉命重生：在出生点、2s 无敌；不够命 → `result` 负。
- 三选一：第 1、2 关通过后进 `upgrade`，随机 3 张不重复，选完进下一关 `intro`。
- 测试钩子：`window.__WV = { G, step, reset, start, tick(n), state() }`，供 Node 自动化测试。

## 7. 验收线（主智能体+验收代理执行）

1. `node --check` 全部 src 文件通过。
2. Node 自动对局：用 bot 打 3 局，全部正常结束，无 NaN/越界/卡死；至少 2 局通关；单局 240–540 秒（虚拟时间）。
3. headless Chrome 实跑 20s：无报错、fps ≥ 55、截图里能看见玩家/敌人/老巢/HUD。
4. 触控逻辑代码审查：Pointer Events、setPointerCapture、多指只认第一根、≥44px。
5. 视觉：贴图四方向正确，无全屏震/闪。
