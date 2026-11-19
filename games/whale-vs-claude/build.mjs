// build.mjs — 把 src/ 模块内联成单文件 index.html（双击即玩）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const ORDER = ['core.js', 'level.js', 'enemies.js', 'player.js', 'fx.js', 'ui.js', 'game.js'];

const tplPath = path.join(root, 'src', 'template.html');
let tpl = fs.readFileSync(tplPath, 'utf8');

const parts = [];
for (const f of ORDER) {
  const p = path.join(root, 'src', f);
  if (!fs.existsSync(p)) {
    console.error(`[build] 缺少 ${p}`);
    process.exit(1);
  }
  const code = fs.readFileSync(p, 'utf8');
  if (code.includes('</script>')) {
    console.error(`[build] ${f} 里出现 </script>，会破坏内联`);
    process.exit(1);
  }
  parts.push(`<script>\n// ===== ${f} =====\n${code}\n</script>`);
}

if (!tpl.includes('<!--SCRIPTS-->')) {
  console.error('[build] template.html 缺少 <!--SCRIPTS--> 占位');
  process.exit(1);
}
tpl = tpl.replace('<!--SCRIPTS-->', parts.join('\n'));

const out = path.join(root, 'index.html');
fs.writeFileSync(out, tpl);
const kb = (Buffer.byteLength(tpl, 'utf8') / 1024).toFixed(1);
console.log(`[build] 写出 ${out} (${kb} KB, ${ORDER.length} 个模块)`);
