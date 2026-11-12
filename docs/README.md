# docs/ —— 只放跨项目的东西

**项目文档跟着项目走**：每个游戏的玩法、数值、进度、素材清单都在 `games/<id>/docs/`，
和 `ANCHOR.md`、源码同目录。改哪个游戏就只看那个目录，别的游戏的文档不要读。

## 这里剩下什么

| 文件 | 谁在用 |
|---|---|
| [`角色设定.md`](角色设定.md) | 豆豆全系列（角色名、头身比、配色） |
| [`渲染规格.md`](渲染规格.md) | 2.5D 游戏通用验收（暗黑海岛现用） |
| [`游戏原型草图模板.md`](游戏原型草图模板.md) | 新游戏立项时填的一页纸 |
| `maps/` | 地图草图的通用输入/产物（配合 `tools/map-sketch.mjs`、`tools/map-net.mjs`） |

## 各项目的文档在哪

| 项目 | 文档目录 |
|---|---|
| 豆豆海岛幻想（darklegend） | [`games/darklegend/docs/`](../games/darklegend/docs/) —— 入口是 `STATUS.md` |
| 节奏豆豆（rhythm） | [`games/rhythm/docs/`](../games/rhythm/docs/) |
| 卡牌战斗 / 单机卡牌养成（cardfight） | [`games/cardfight/docs/`](../games/cardfight/docs/) |
| 豆豆捉外星人（catchalien） | [`games/catchalien/docs/`](../games/catchalien/docs/) |
| 其他游戏 | 暂无独立文档，看各自的 `games/<id>/ANCHOR.md` |

> 2026-11-12 从 `docs/` 平铺搬到各项目内（git mv，历史可追）。
