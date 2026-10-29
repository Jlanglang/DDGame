# 豆豆暗黑传奇 · 上 Vite 迁移计划

> **给 Cursor / 任何 AI 执行的施工单。** 逐阶段做，每阶段有验收、有回滚点。
> 目标：ESM + Vite + HMR，**产物仍是单文件 HTML，双击可跑**。
> 铁律：**玩法、数值、画面逻辑一行不改。** 只动模块边界和加载方式。
> 衍生纪律：**每个阶段做完停下来报告，不要自动 commit / push**（见 `AGENTS.md` §1）。

---

## 一、目标 / 非目标

| 做 | 不做 |
|---|---|
| 15 个 `<script>` → 1 个 ESM 入口 | 不改任何函数体、数值、DOM 结构 |
| Vite dev（HMR）+ build（单文件） | 不引入 TypeScript（可选，见 §九） |
| 测试从 `vm.runInContext` 切到 `import` | 不改 360 / 515 条断言的**断言内容** |
| 产物 `dist/index.html` 双击可跑 | 不动其他 10 个游戏 |
| 文档同步（ANCHOR / STATUS / AGENTS / 首页） | 不顺手修 `balance.mjs` 那 1 红 |

**最终形态**

```
开发：npm run dev          → http://localhost:8183  （HMR）
交付：npm run build        → dist/index.html        （双击可跑，单文件）
线上：games/darklegend/dist/                        （推 master 自动部署）
```

---

## 二、已测绘的现状（执行前先核对，对不上就停）

### 2.1 加载方式

`games/darklegend/index.html` **320–334 行**，15 个传统 `<script src>`，无一处 `type="module"`：

```
data.js · core.js · world.js · overworld.js · combat.js · status.js · sfx.js
vendor/three.iife.js · three-pick.js · hd-draw.js · iso-ground.js · iso-art.js
tile-plate.js · render-three.js · game.js
```

### 2.2 包裹方式（14 个文件完全统一）

```js
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  /* ... 函数体 ... */
  DL.Core = { /* ... */ };
})(typeof window !== 'undefined' ? window : globalThis);
```

**例外**：`game.js` 是 `(() => { ... })();`，无参数，从 `window.DL` 取数据。

### 2.3 命名空间（这是全项目的"模块注册表"）

| 挂载点 | 来源 |
|---|---|
| `DL.DATA` | `data.js` |
| `DL.Core` | `core.js` |
| `DL.Sfx` | `sfx.js` |
| `DL.ThreePick` | `three-pick.js` |
| `DL.ThreeView` | `render-three.js` |
| `DL.ThreeBridge` | `game.js`（给渲染层读） |
| `window.__dl` | `game.js`（`?debug` 下挂，**测试的 API 契约**） |

### 2.4 测试对全局的依赖

| 测试 | 加载方式 | 取对象 |
|---|---|---|
| `test-game.mjs` 360 项 | `vm.runInContext` 依次跑 7 个文件 + `game.js` | `sandbox.window.__dl` |
| `test-three.mjs` 515 项 | `vm.runInNewContext` 只跑 `three-pick.js` | `ctx.DL.ThreePick` |
| `test-input.js` 8 项 | 真 Chrome，`file://...?debug` + `--allow-file-access-from-files` | 页面内 `window.__dl` |
| `balance.mjs` | 复制了 `makeEnemy` / 装备公式 | **已知 1 红，不是坏事** |

> **关键结论：360 项断言全部走 `dl.xxx()`，只要 `window.__dl` 还在，断言一条不用改。**

### 2.5 已知事实

- `vendor/` 只有 `three.iife.js`，**没有 `examples/jsm`**（后处理 / GLTF 都没有，本计划不引入）
- `render-three.js` 的地面分块**已经做完了**：`CHUNK_CELLS = 16`、`KEEP_R = 2`、空闲帧补块、远处释放、`?chunk=0` 开关
- 首页链接：根 `index.html` 第 294 行 `<a class="card" href="games/darklegend/?engine=three">`（`?engine=` 已失效）
- `test-input.js` 是 **CommonJS**（`require`），**不能**被 `"type": "module"` 扫到

---

## 三、总策略：保留 `DL` 命名空间，只换模块边界

**不要重写架构。** `DL` 本身是个好东西（模块注册表），保留它。迁移只是把"IIFE 假装模块"换成"真 ESM"：

```js
// 改前
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  /* ... body ... */
})(typeof window !== 'undefined' ? window : globalThis);

// 改后（body 一个字不动）
import { DL } from './namespace.js';
const global = globalThis;
/* ... body 原样 ... */
```

**`const global = globalThis;` 这一行是关键**：文件体里散布的 `global.location`、`global.THREE` 等引用全部原样有效，不用逐个改。

**改动量**：每个文件删 3 行、加 2 行。14 个文件。

---

## 四、阶段

### P0 · 存基线（必做，15 分钟）

```powershell
# 仓库根
node games/darklegend/test-game.mjs      # 期望 360 pass
node games/darklegend/test-three.mjs     # 期望 515 pass
node games/darklegend/test-input.js      # 期望 8 pass（要本机 Chrome）
node games/darklegend/balance.mjs --check # 期望 exit 1（已知 1 红）
```

把四个结果抄进本次会话的开头。**改完全部重跑，数字必须一致**（`balance` 仍是 1 红）。

**验收**：四行数字记录下来。

---

### P1 · 探测 three 版本 → 换 npm 包

**这一步不能猜。** 先探 `vendor` 里那份的实际版本：

新建 `tmp/probe-three-version.mjs`：

```js
import fs from 'node:fs';
const s = fs.readFileSync('games/darklegend/vendor/three.iife.js', 'utf8');
const m = s.match(/REVISION\s*[:=]\s*['"]([0-9]+)/);
console.log(m ? m[1] : 'NOT FOUND');
```

```powershell
node tmp/probe-three-version.mjs
```

**决策规则**（严格遵守）：

| 探测结果 | 动作 |
|---|---|
| 得到数字 `N` | `npm i three@0.N.0` —— **绝不装 latest** |
| `NOT FOUND` | **停**，报告主人，不要继续 |
| 有数字但 npm 上无该版本 | 取**小于等于 N 的最近版本**，并在报告里写明 |

**为什么必须对齐**：STATUS §七 记过——新版 three 的 `intensity` 物理单位变了，`AmbientLight 2.6 + DirectionalLight 4.2` 才等于贴图原色。跨 major 换版本，整屏光照会塌。

`render-three.js` 里查一遍 THREE 的引用方式：

```powershell
Select-String -Path games\darklegend\render-three.js -Pattern 'global\.THREE|window\.THREE|THREE\s*=' | Select-Object -First 5
```

- 若是 `const THREE = global.THREE;` → 删掉，换 `import * as THREE from 'three';`
- 若文件体直接用 `THREE.xxx`（靠全局）→ 只需在顶部加 `import * as THREE from 'three';`（模块绑定会遮蔽全局）

**验收**：`npm ls three` 显示版本 = `0.N.0`；`tmp/probe-three-version.mjs` 与 `node -e "console.log(require('three').REVISION)"` 结果一致。

---

### P2 · 建工程骨架（不动源代码）

新增 4 个文件：

**`games/darklegend/package.json`**（★ 注意：**不要写 `"type": "module"`**，否则 `test-input.js` 的 `require` 会崩）

```json
{
  "name": "darklegend",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node test-game.mjs && node test-three.mjs"
  },
  "dependencies": {
    "three": "0.XXX.0"
  },
  "devDependencies": {
    "vite": "^7.0.0",
    "vite-plugin-singlefile": "^2.0.0"
  }
}
```

**`games/darklegend/vite.config.mjs`**（★ 必须是 `.mjs`，不能是 `.js`）

```js
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: '.',
  base: './',                 // ★ 关键：相对路径，双击 file:// 才找得到资源
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 100000000,  // 单文件必需
  },
  server: { port: 8183, open: false },
});
```

**`games/darklegend/src/package.json`**（★ 让 Node 把 `src/*.js` 当 ESM，而根目录的 `.js` 仍是 CJS）

```json
{ "type": "module" }
```

**`games/darklegend/src/namespace.js`**

```js
/* DL 命名空间（模块注册表）。
   保留它是为了让 `window.__dl`、渲染层桥、以及全部既有测试继续有效。 */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
export const DL = (globalThis.DL = globalThis.DL || {});
```

```powershell
cd games\darklegend
npm install
```

**验收**：`npm ls` 无报错；`src/namespace.js` 存在；`node --input-type=module -e "import('./src/namespace.js')"` 能跑。

---

### P3 · 14 个文件 ESM 化（核心步骤）

**把源文件移进 `src/`**（`vendor/` 一起移进去或留在原地并调整 import 路径——建议 `src/vendor/three.iife.js` **删掉**，改用 npm 包）：

```
games/darklegend/src/
  namespace.js  data.js  core.js  world.js  overworld.js  combat.js  status.js  sfx.js
  three-pick.js  hd-draw.js  iso-ground.js  iso-art.js  tile-plate.js
  render-three.js  game.js
  main.js   ← P4 新建
```

**改动模板（14 个文件同款）**

```js
// 头部：删这 3 行
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
// 换成：
import { DL } from './namespace.js';
const global = globalThis;

// 尾部：删这 1 行
})(typeof window !== 'undefined' ? window : globalThis);
// 换成：空行
```

推荐用脚本批量改，再逐个核对 diff：

```js
// tmp/esmify.mjs —— 只在仓库根跑：node tmp/esmify.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'games/darklegend';
const FILES = ['data.js','core.js','world.js','overworld.js','combat.js','status.js',
  'sfx.js','three-pick.js','hd-draw.js','iso-ground.js','iso-art.js','tile-plate.js',
  'render-three.js'];

const HEAD = /\(function \(global\) \{\r?\n\s*'use strict';\r?\n\s*const DL = \(global\.DL = global\.DL \|\| \{\}\);\r?\n/;
const TAIL = /\r?\n\}\)\(typeof window !== 'undefined' \? window : globalThis\);\s*$/;
const NEW_HEAD = "import { DL } from './namespace.js';\nconst global = globalThis;\n";

for (const f of FILES) {
  const p = path.join(DIR, f);
  let s = fs.readFileSync(p, 'utf8');
  if (!HEAD.test(s)) { console.log('SKIP(header not matched):', f); continue; }
  if (!TAIL.test(s))  { console.log('SKIP(tail not matched):', f); continue; }
  s = s.replace(HEAD, NEW_HEAD).replace(TAIL, '\n');
  fs.writeFileSync(p, s);
  console.log('OK', f);
}
```

**`game.js` 单独处理**（它没有 `global` 参数）：

```js
// 头：删 `(() => {` 和 `'use strict';`
import { DL } from './namespace.js';
import './data.js';
import './core.js';
import './world.js';
import './overworld.js';
import './combat.js';
import './status.js';
import './sfx.js';

// 原来这行
const D = (window.DL && window.DL.DATA) || {};
// 改成
const D = DL.DATA;
// 尾部：删最后一行的 `})();`
```

> `game.js` 里其他 `window.xxx`（`window.__dl`、`window.addEventListener`）**不要动** —— Node 测试会挂 `globalThis.window = globalThis`。

**验收**

```powershell
cd games\darklegend
# 每个文件应该只剩 import/export，没有 IIFE 包裹
Select-String -Path src\*.js -Pattern '^\}\)\(typeof window' 
# 期望：无输出

# 语法自检
node --check src\core.js
```

> ⚠️ 此时旧测试**必然挂**（`vm.runInContext` 读不懂 `import`）。这是预期，P4 立刻修。

---

### P4 · 入口 + index.html

**`games/darklegend/src/main.js`**

```js
/* 唯一入口：按依赖顺序 import，扫一眼就知道谁依赖谁。 */
import { DL } from './namespace.js';
import './data.js';
import './core.js';
import './world.js';
import './overworld.js';
import './combat.js';
import './status.js';
import './sfx.js';
import './three-pick.js';
import './hd-draw.js';
import './iso-ground.js';
import './iso-art.js';
import './tile-plate.js';
import './render-three.js';
import './game.js';

// 调试出口保持不变
if (typeof window !== 'undefined' && window.__dl) window.__dl.DL = DL;
```

**`games/darklegend/index.html`**：删掉 320–334 那 15 行 `<script>`，换成一行

```html
<script type="module" src="./src/main.js"></script>
```

> ⚠️ `type="module"` 在 `file://` 下不工作 —— **这个 index.html 从此只用于 `npm run dev`**。双击可跑的版本是 P6 产出的 `dist/index.html`。

**验收**

```powershell
cd games\darklegend
npm run dev
# 浏览器开 http://localhost:8183/?debug
```

- 3D 主城能显示、能点地走、能打怪
- Console 无报错
- 改 `data.js` 里任意一个常量，页面**自动热更新**（HMR 生效）

---

### P5 · 测试切 import

**目标：断言一条不改，只改加载器。**

**`test-game.mjs`**（改 1–103 行 → 大约 40 行）

```js
import fs from 'node:fs';           // 保留（读源码做快照用）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* ---- DOM 桩：先挂到 globalThis ---- */
const noop = () => {};
// ……（原 13–64 行的 ctxStub / makeEl / storage 原样保留）……

globalThis.window = globalThis;
globalThis.document = documentStub;
globalThis.localStorage = localStorageStub;
globalThis.location = { search: '?debug', href: 'file:///darklegend/index.html' };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = noop;
globalThis.setInterval = (() => { let n = 0; return () => ++n; })();
globalThis.setTimeout = (() => { let n = 0; return () => ++n; })();
globalThis.clearInterval = noop;
globalThis.clearTimeout = noop;
globalThis.innerWidth = 720;
globalThis.innerHeight = 1120;
globalThis.devicePixelRatio = 1;

/* ---- 加载游戏（动态 import，必须在桩之后） ---- */
try {
  await import('./src/game.js');
} catch (err) {
  console.error('加载游戏脚本失败：', err && err.stack ? err.stack : err);
  process.exit(1);
}
const dl = globalThis.window.__dl;
```

> **要点**
> 1. 动态 `await import()` 必须在装完桩之后（`game.js` 顶层会立刻碰 `document`）
> 2. `sandbox.window.__dl` → `globalThis.window.__dl`，**断言区（104 行以后）一个字不用改**
> 3. `vm` 相关 import 和 `vm.runInContext` 那 8 行全删

**`test-three.mjs`**（改 1–12 行）

```js
globalThis.window = globalThis;
const { ThreePick } = await import('./src/three-pick.js');
const P = ThreePick;
```

> `three-pick.js` 现在是 `DL.ThreePick = {...}` 挂命名空间。若想更干净，在文件尾部加 `export const ThreePick = DL.ThreePick;` —— 二选一，**建议加 export**，测试更好读。

**`test-input.js`**：只改一行 URL

```js
// 原
const url = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?debug';
// 改
const url = 'http://localhost:8183/?debug';
```

同时**删掉** chrome 参数里的 `'--allow-file-access-from-files'`（不再需要）。

> 需要先 `npm run dev` 起着，测试才能跑。在计划里接受这个前置条件。

**验收**

```powershell
node games/darklegend/test-game.mjs   # 360 pass
node games/darklegend/test-three.mjs  # 515 pass
# 起 dev server 后
node games/darklegend/test-input.js   # 8 pass
```

**数字必须与 P0 完全一致。** 任何一条 FAIL 都停，不许改断言去迁就代码。

---

### P6 · build → 单文件 → 双击验证

```powershell
cd games\darklegend
npm run build
```

**检查 `dist/` 里只有 `index.html`**（没有 `assets/*.js`，没有 `assets/*.css`）。若有，说明 `viteSingleFile()` 没生效。

**双击验证（必做，这条不能省）**

1. 资源管理器里双击 `D:\DDGame\games\darklegend\dist\index.html`
2. 期望：3D 主城能显示、能玩、Console 无 CORS 报错
3. 再带调试参数双击：`dist/index.html?debug`

**如果双击白屏**，按顺序查：

| 症状 | 原因 | 修法 |
|---|---|---|
| Console 报 `Failed to load module script` | HTML 里还有 `type="module"` | singlefile 没生效，查插件 |
| 报 `Cross-origin` / 纹理丢失 | `base` 不是 `'./'` | 改 `vite.config.mjs` |
| 一片黑但无报错 | WebGL 在 file:// 下被禁 | 查 `render-three.js` 的 `wanted()` 分支 |
| 贴图糊/缺失 | three 版本换了，canvas 纹理编码变了 | 回 P1 对齐版本 |

---

### P7 · 部署与文档同步

**7.1 首页链接**

`index.html` 第 294 行：

```html
<!-- 原 -->
<a class="card" href="games/darklegend/?engine=three">
<!-- 改 -->
<a class="card" href="games/darklegend/dist/">
```

**7.2 文档**

| 文件 | 改什么 |
|---|---|
| `games/darklegend/ANCHOR.md` | 文件分层表加 `src/` 前缀；**"雷区"加一条：源码用 ESM，双击只能开 `dist/index.html`**；测试命令更新 |
| `docs/STATUS.md` | 加一条轮次：`1m 工程化`；性能/测试数字更新 |
| `AGENTS.md` | 第 2 节表格加注「darklegend 例外：Vite 工程化，产物在 `dist/`」；第 4 节「零构建」加例外说明 |
| `games/darklegend/package.json` 的 `test` 脚本 | 补 `test-input.js` 前置说明 |

**7.3 `dist/` 进不进 git**

| 方案 | 优 | 劣 |
|---|---|---|
| **提交 `dist/`**（建议先这样） | 推 master 即上线，零 CI | 每次构建产生 ~2MB 单文件 diff |
| GitHub Actions 构建部署 | 干净 | 多一套 CI，调试链路变长 |

**先提交 `dist/`**，等真嫌 diff 大了再上 Actions。

**7.4 提交纪律**

**不要自动 commit / push。** 全部阶段跑完、主人验收通过后，按 `AGENTS.md`：
`git status` 确认范围 → 中文提交信息（改了什么、为什么）→ 等主人说"推吧"。

---

## 五、雷区（踩过的，别重踩）

| # | 坑 | 后果 | 对策 |
|---|---|---|---|
| 1 | `package.json` 写了 `"type": "module"` | `test-input.js` 的 `require` 直接崩 | **不写**；用 `src/package.json` 局部声明 |
| 2 | `vite.config.js` 用 `.js` 扩展名 | 被当 CJS 解析，`import` 报错 | 必须 `.mjs` |
| 3 | 忘了 `const global = globalThis;` | 文件体里 `global.location` 全炸 | 模板里带上 |
| 4 | three 装 latest | 光照/色彩空间全变，整屏发灰 | P1 严格对齐 `REVISION` |
| 5 | `base` 不是 `'./'` | `dist/index.html` 双击白屏 | 配置里写死 |
| 6 | 动态 import 早于 DOM 桩 | `game.js` 顶层碰 `document` 崩 | 桩先挂 `globalThis`，再 `await import()` |
| 7 | 改了断言去迁就代码 | 测试变成假绿 | **禁止**。断言是契约 |
| 8 | 顺手修 `balance.mjs` 那 1 红 | 范围失控 | 那 1 红是已知的，不修 |
| 9 | 保留 `src/vendor/three.iife.js` 又 `import 'three'` | 两份 three，`instanceof` 全假 | 删掉 vendor 那份 |
| 10 | `index.html` 还留着旧的 15 个 `<script>` | 双份加载，状态打架 | 删干净 |

---

## 六、禁止事项

1. **不许改函数体。** 本计划只动模块边界。要改逻辑另开任务。
2. **不许改断言。** 360 / 515 / 8 三个数字只能不变或上升。
3. **不许装 latest three。**
4. **不许动其他 10 个游戏。**
5. **不许自动 commit / push。**
6. **不许在同一个会话里顺手加功能**（粒子、后处理、新玩法都不在这个任务里）。
7. **不许删 `window.__dl`** —— 那是测试和调试的唯一入口。

---

## 七、回滚

| 阶段 | 回滚方式 |
|---|---|
| P1 之后 | `git checkout games/darklegend/vendor/three.iife.js`，删 `node_modules`，恢复 script 标签 |
| P3 之后 | `git checkout games/darklegend/*.js`（源文件没删，只是移进 `src/`，可 `git mv` 回来） |
| P6 之后 | `dist/` 直接删，不影响源码 |

**建议**：P2 开始前打一个 tag / 分支，比如 `git checkout -b vite-migration`。整个迁移在分支上做，主人验收通过再合。

---

## 八、验收总表

| 阶段 | 检查 | 期望 |
|---|---|---|
| P0 | 四套测试 | 360 / 515 / 8 / balance 1 红 |
| P1 | `npm ls three` | `0.N.0` 与 vendor `REVISION` 一致 |
| P2 | `npm install` | 无报错 |
| P3 | `grep '^})(typeof window'` | 无输出 |
| P4 | `npm run dev` + 改常量 | 页面热更新 |
| P5 | 三套测试 | **数字与 P0 一致** |
| P6 | 双击 `dist/index.html` | 能玩、无 CORS |
| P7 | 首页链接 + 四份文档 | 全部更新 |

---

## 九、可选（不阻塞，做完再说）

- **JSDoc 类型**：源文件加 `// @ts-check` + `/** @type {PlayerState} */`，VSCode 立刻有字段名检查，**不建 `.ts`、不改构建**。性价比最高的一步。
- **`vite-plugin-singlefile` 之外再加 `manualChunks`**：现在不需要（单文件）。
- **GitHub Actions**：等 `dist/` diff 真碍事了再上。
- **`three/examples/jsm`**：本计划**不引入**后处理 / GLTF。要引入另开任务（用 esbuild 打 IIFE 也行）。

---

## 附：一句话给 Cursor

> 按 P0 → P7 顺序做，**每阶段做完停下报告数字**。只动模块边界，不动逻辑，不改断言，不装 latest three，不 commit。数字对得上就继续，对不上就停。
