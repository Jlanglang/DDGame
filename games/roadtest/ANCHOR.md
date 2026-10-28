# 路网原型 · 锚点表

> **这是「手绘图 → 能走的地图」的试验场，不是正式游戏**，首页没挂。
> 目的只有一个：走两步，判断「6 格宽的路 + 45° 斜路 + 岔口」在手里是什么感觉。

## 一句话

把手绘的斜线路网（每段 6 格宽、线外全是山墙）落成格子地图，用摇杆 / WASD 走，
HUD 会记「走得几格、死几次」，按 `M` 看整张路网。

## 文件在哪

| 文件 | 行数 | 管什么 |
|---|---|---|
| `map.js` | ~95 | **生成物**，96×85 格子（`#` 山墙 / `=` 路面）+ 出生点；别手改 |
| `game.js` | ~430 | 逻辑 + 渲染 + 输入全在这：`RT`（纯函数，可测）+ `boot()` |
| `index.html` | 35 | 画布 + 两个 script |
| `test-logic.mjs` | ~90 | 无浏览器自检 9 项（连通 / 撞墙 / 撒怪 / 穿模） |

## 地图怎么来的（改图只走这条路）

```powershell
python tools/trace-map.py 手绘.png docs/maps/名.segments.json 96
node tools/map-net.mjs docs/maps/名.segments.json 6 8 --js games/roadtest/map.js
```

- 第 2 个参数 = 路宽格数，第 3 个 = 补缝容差（手画快了没接上的，8 格内自动接）。
- 重跑会打印：路面占比 / 路口数 / 死路数 / 连通 / 直径，并覆盖 `map.js`。

## 状态与主循环

- 没有 `state` 字符串，单场景：`G`（`game.js` 里 `boot()` 内部）持有
  `p` 玩家 / `mon` 怪 / `cam` 相机 / `hp` / `steps` / `walked` / `deaths` / `joy` / `keys` / `showMap`。
- `frame(now)` → `update(dt)`（输入 → 移动+碰撞 → 怪走位与碰到 → 回血 → 相机）→ `render()`。
- 渲染：整张地图先在 `mapLayer` 里以 8px/格 画成一张小图，再放大贴上屏幕（抹掉格子台阶）。

## 想改什么 → 去哪

| 想改 | 动哪 |
|---|---|
| 路宽（6 格 → 4 格） | **重新生成 map.js**，不是改 `CELL` |
| 格子看起来多大 | `CELL`（`game.js:5`），改小看得更远 |
| 玩家速度 | `SPEED`（`game.js:7`）250 px/s ≈ 5.7 格/秒 |
| 玩家体型 | `PLAYER_R`（`game.js:8`）17px ≈ 0.77 格 |
| 怪的数量 / 快慢 | `RT.makeMonsters(16, 7)` 与里面的 `spd` |
| 掉血 / 无敌时间 | `update()` 里 `G.hp -= 14` 与 `G.t - G.hurtAt > 0.8` |
| 摇杆手感 | `moveVec()` 里死区 `12`、满推 `70` |
| 配色 | `mapLayer` 里路面三档色 / 山体三档色 |
| 出生点 | `map.js` 的 `spawn`，或 URL `?at=33,25` |

## 测试

```powershell
node games/roadtest/test-logic.mjs     # 期望 RESULT pass=9 fail=0
```

截图（不开窗口）：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --window-size=720,1280 --virtual-time-budget=2500 --screenshot=D:\DDGame\tmp\a.png `
  "file:///D:/DDGame/games/roadtest/index.html?at=33,25"
```

## 雷区

- `map.js` 是生成物。手改会在下次重跑时被覆盖，改图请改 `segments.json` 再生成。
- `CELL` 和 `PLAYER_R` 是两套比例：路宽是「格」定死的，把 `CELL` 改小只是看得更远，不会让路变窄。
- 6 格宽 ≈ 7 个豆豆并排；两条 6 格斜路一相交，路口就是一块 ~12×12 格的空地——这是格子斜路的必然，不是 bug。
- 45° 斜路在格子上必然是楼梯边，只能靠插值抹平，别指望它变直。
