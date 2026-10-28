# 豆豆捉外星人 · 锚点表
> 改这个游戏先读这一份。约 2550 行代码（logic.js 1320 / style.css 436 / game.js 481 / test-logic.mjs 168 / characters.js 79 / index.html 61 / level-worker.js 11）。通用规则见根 AGENTS.md。

## 一句话
推理游戏：一栋楼每户只露"名字 + 门牌"，上门听住户说一条**必然为真**的事实（人数 / 一半 / 角落 / 相邻 / 朋友），推够了才敢点"抓外星人"；点错即结束，豆豆开局就已翻开。

## 文件在哪
| 文件 | 行数 | 管什么 |
|---|---|---|
| `logic.js` | 1320 | **纯逻辑**：生成（`place`/`generateOnce`/`generateLevel`）、推理器（`deduce`/`compileAtom`）、判定（`assess`）、全部中文话术（`clueLines`）。UMD 包装（:7），不碰 window/document（grep 0 命中），Node 里 `require` 可跑。 |
| `game.js` | 481 | 只做 DOM：拿 `window.CatchAlien`、发 Worker、画楼、点击、结算、URL 参数。 |
| `style.css` | 436 | 全部版式。**不是 720×1600 画布**，是自适应 DOM，`#stage` 宽 `min(100vw,480px)`（:35）、高 `100dvh`（:37）。 |
| `characters.js` | 79 | 名字 → 卡面/缩略图路径（`CHARACTER_CARDS`/`CHARACTER_THUMBS`/`CHARACTER_SPECIAL`），32 人 + 豆豆/外星人特写。 |
| `index.html` | 61 | 骨架：`#building`(:29)、`#modes`(:31)、`#win`/`#lose`(:36/:43)、`#loading`(:50)、三个 script(:57-59)。 |
| `level-worker.js` | 11 | 只一件事：Worker 里 `importScripts('logic.js')` 后调 `CatchAlien.generateLevel(band, seed)` 回传，生成不卡主线程。 |
| `test-logic.mjs` | 168 | 自检，见「测试」。 |

## 关卡数据怎么生成/存储
- **不存关卡**，每局按 `(band, seed)` 现场生成；同 seed 结果稳定（`mulberry32` logic.js:60，test :143 校验）。坐标 0 起（0 层 = 1 楼，logic.js:4），`key = "单元:楼层"`（:86-88）。
- 难度按栋轮转：`PATTERN`（:12）+ `bandFor`（:90），6 栋一轮。
- 链：`generateLevel`(:1301) → `generateOnce`(:1167) → `place`(:815 房型/外星人) → `assignNames`(:1241) → `protectFriends`(:1111 然然/坨坨不能是外星人) → 逐户挑一条能推进推理的线索(:1187-1236) → `strip`(:1269) 拍平。
- 成关校验 `fewestOpens >= openLimit`(:1307)：正常试 45 次(:1304)，不行就放宽成 `relaxed`(:1310-1315，换 `seed+1+i*997`)，全败 `throw '生成失败'`(:1316)。
- 关卡对象（`strip` :1283）：`units/floors/alienCount/alienKeys/doudouKey/chainKeys/chainKinds/cells/byKey`；每户 `{key, unit, floor, alien, role, name, speech:{scene, clue, atom}}`；只活在内存 `state.level`（game.js:114），`ready`/`prefetch` 预生成下一栋（game.js:14、:79）。**没有 localStorage**，刷新回第 1 栋；复现用 `?level=3&seed=123`（game.js:505）。

## 状态机与主循环
- **无页面切换**（单页 `#stage`），**也无主循环**：全文件无 `requestAnimationFrame`/`setInterval`，纯事件驱动，每步操作后 `render()`（game.js:157）整体刷 UI。
- `state`（game.js:111）= `{levelIndex, seed, level, opened, killed, mode}`；`mode` 只有 `'visit'|'kill'`（index.html:32-33）；开局 `opened:[doudouKey]`（game.js:115）。
- 一次操作：`onDoor`(:437) → `CA.assess`(:440) → 改 `opened`/`killed` → `render` → `applyFit`(:175) → `drawBuilding`(:283) → `fitBubbles`(:207) → `markHints`(:252) → 模式高亮(:169)。
- 输 = `#lose`(:441-448，`result.wrong` 区分"抓错/撞见"，**先 push 进 opened 再 render**)；赢 = `killed.length >= alienCount` 弹 `#win`(:465)。

## 想改什么 → 去哪
| 想改 | 函数 / 常量 |
|---|---|
| 房型、外星人个数、档位 | `BANDS`（logic.js:14；warm :15 / normal :22 / hard :29）、轮转 `PATTERN` :12 |
| 能抽到哪些线索 | `countAtoms`(:931 候选池)、`allowedAtoms`(:520 **按角色**：豆豆四向+行/列人数、同学只左右、路人指任意门)、`addLandmarkAtoms`(:1062 一半/两端/不相邻/四角) |
| 证词文案 | `clueLines`(:600 每种 atom 2~3 说法)、`groupWord`(:715)、`sceneLines`(:721)、`CHATTER`(:732)、`renderSpeech`(:768) |
| 推理强度 | `deduce`(:402 枚举全部组合投票)、`compileAtom`(:236 位运算编译)、`holdsMask`(:320) |
| 输赢 / 封门 | `assess`(logic.js:1328) + `onDoor`(game.js:437) |
| 最少开几户 | `openLimit`(:893 公式 :896)、`fewestOpens`(:1149)、校验 :1307 |
| 名字 / 身份 / 朋友 | `NAMES`(:38)、`KID_NAMES`(:41 同学优先小孩)、`FRIEND_NAMES`(:39)、`assignNames`(:1241)、`protectFriends`(:1111)、`ROLE_LABEL`(:52) |
| 卡面 / 头像 | `faceHtml`(game.js:402)、`characters.js`、`preloadCards`(game.js:129) |
| 布局 / 翻牌 / 提示闪烁 | `applyFit`(:175)、`layoutRows`(:187)、`fitBubbles`(:207)、`HINT_LEFT`(:251)+`markHints`(:252)；CSS 变量 style.css:134-152、`cardFlip` :436、`.door.is-hint` :303 |
| 换栋 / 下一栋 / 不卡顿 | `startLevel`(game.js:92)、`applyLevel`(:110)、`requestLevel`(:48)、`prefetch`(:79)、`level-worker.js` |

## 数值都在哪
| 数值 | 当前值 | 位置 |
|---|---|---|
| 外星人数 | `max(2, min(⌊单元×层/2⌋, 抽到的))` → **永远 ≥2**；档位 warm [2,2,2] / normal [2,2,3] / hard [3,4] | logic.js:822 / :18 / :25 / :32 |
| 房型 | warm [[3,3],[3,4],[4,3]] / normal [[4,4],[4,5],[3,5]] / hard [[4,5],[4,6]] | logic.js:17 / :24 / :31 |
| "一半是外星人"线索概率 | 0.5（把某条偶数长的行/列调成正好一半） | logic.js:832 |
| 最少翻牌 | ⌊单元×层/2⌋+1（9 户→5，24 户→13） | logic.js:896 |
| 同类线索上限 | 每种 atom ≤2 条；pair+meal 合计 ≤2 条 | logic.js:1216 / :1213 |
| 提示门数 / 气泡 / 缩放 | 3 扇；卡高 36%、3 行、最小 9px；`max(0.78,min(1,4.5/√n))`、gap 3/4/6px | game.js:251 / :227 / :177-178 |
| 兜底超时 / toast | 3500ms 弃 Worker 走主线程；3200ms | game.js:71 / :154 |

## 测试
`node games/catchalien/test-logic.mjs`（零依赖，Node 里 require logic.js —— test-logic.mjs:4）。24 seed × 3 档验：自动解能通关(:18)、豆豆永不是外星人、名字不重、好人 atom 为真、外星人不被点名、`fewestOpens>=openLimit`、同 seed 稳定(:143)；末尾验 `bandFor` 前 8 栋、朋友不是外星人也不是每栋都有(:166)、策略线索 ≥3 种、diag 占比 <22%(:173)。当前 `RESULT pass=736 fail=0`。改生成器/线索后只跑这个，不用开浏览器。

## 雷区
- `stampSvg`（game.js:385）定义了**没人调用**（死代码），别以为抓外星人有印章动效。
- `docs/豆豆捉外星人.md` 难度表已与代码漂移：文档写 hard 有 5×5、暖档"1 个外星人"；实际 hard 只有 `[[4,5],[4,6]]`(:31)，且 `Math.max(2,…)`(:822) 保证 **≥2**。改任一边先对齐。
- 加/改线索种类要**四处同步**：`compileAtom`(:236 推理)、`holdsMask`(:320 校验；`atomTrue` :574 也走它)、`clueLines`(:600 话术)、`test-logic.mjs:121` 白名单。漏一处就"生成失败"或测试红。
- `deduce` 是对全部组合枚举投票（`choose` :457），大户型+长链很慢，所以生成期把线索编译成位运算（注释 :441）。别改成逐格暴力。
- `file://` 双击时 Worker 可能不可用：`new Worker` 抛错或 3500ms 无回包就回主线程（game.js:19-31、:66-74），生成期会转圈；这 3500 别调小。
- `drawBuilding` 用 `units x floors @ seed` 当签名整片重建（game.js:293），同尺寸新楼靠 seed 参与签名才不残留旧人名。
- 触摸：全程原生 `click` + `touch-action: manipulation`（style.css:181），**无任何 pointer/touch 监听**。别给 `.door` 加 pointerdown/长按，会顶掉点击；双击缩放已由 viewport（index.html:5）+ `touch-action:none`（style.css:28）关掉。
- 名字池 32 ≥ 最大 24 户，不会重名；但然然/坨坨不是每栋都有。加名字时 `characters.js` 要补卡面，否则退化成 SVG 头像（`avatarSvg` game.js:337）。
