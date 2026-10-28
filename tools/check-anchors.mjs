// 校验各游戏 ANCHOR.md 里的 `文件.js:123` 行号引用是否真实存在（文件在、行号在范围内）
// 用法（仓库根）: node tools/check-anchors.mjs
// 退出码：0 = 全对，1 = 有引用失效（改了代码挪了行，顺手把 ANCHOR 修一下）
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const gamesDir = join(ROOT, 'games');
const games = readdirSync(gamesDir).filter(d => statSync(join(gamesDir, d)).isDirectory());

const REF = /([\w.\-]+\.(?:js|mjs|html|json|css)):(\d+)(?:-(\d+))?/g;
const lineCount = p => readFileSync(p, 'utf8').split('\n').length;

let bad = 0, total = 0, docs = 0;
for (const g of games) {
  const doc = join(gamesDir, g, 'ANCHOR.md');
  if (!existsSync(doc)) { console.log(`缺   ${g}/ANCHOR.md`); bad++; continue; }
  docs++;
  const text = readFileSync(doc, 'utf8');
  let n = 0;
  for (const m of text.matchAll(REF)) {
    const [full, file, a, b] = m;
    const p = join(gamesDir, g, file);
    total++; n++;
    if (!existsSync(p)) { console.log(`  X  ${g}: ${full} 文件不存在`); bad++; continue; }
    const hi = Number(b || a);
    const max = lineCount(p);
    if (hi > max) { console.log(`  X  ${g}: ${full} 超出行数（${file} 只有 ${max} 行）`); bad++; }
  }
  const note = n === 0 ? '  ← 全是 `函数(行号)` 裸行号，本脚本不覆盖，需人工/自检脚本核对' : '';
  console.log(`ok   ${g}/ANCHOR.md  ${text.split('\n').length} 行, ${n} 处行号引用${note}`);
}
console.log(`\n文档 ${docs} 份，行号引用 ${total} 处，问题 ${bad} 处`);
process.exit(bad ? 1 : 0);
