/**
 * 扫描 assets/tiles/ 图池，生成关卡（普通 3 / 困难 8 / 挑战 10 关）
 *
 * 用法: node scripts/generate-manifest.js
 */

const fs = require('fs');
const path = require('path');
const { MODE_PLANS, LEVELS_PER_MODE, buildModeLevels } = require('../js/difficulty.js');
const { assignRarityByIndex } = require('../js/rarity.js');

const ROOT = path.join(__dirname, '..');
const TILES_DIR = path.join(ROOT, 'assets', 'tiles');
const OUTPUT = path.join(ROOT, 'levels.json');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function isImageFile(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}

function scanTiles() {
  if (!fs.existsSync(TILES_DIR)) {
    return [];
  }
  const files = fs
    .readdirSync(TILES_DIR)
    .filter(isImageFile)
    .sort(naturalCompare);
  return files.map((f, i) => ({
    src: `assets/tiles/${f}`.replace(/\\/g, '/'),
    rarity: assignRarityByIndex(i, files.length),
  }));
}

function main() {
  console.log('扫描图池 assets/tiles/ ...');
  const tiles = scanTiles();

  if (tiles.length < 1) {
    console.error('错误: 图池至少需要 1 张图。');
    process.exit(1);
  }

  const levels = buildModeLevels('normal');
  const modeLevels = {
    hard: buildModeLevels('hard'),
    challenge: buildModeLevels('challenge'),
  };

  const manifest = { tiles, levels, modeLevels };

  fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2), 'utf8');

  const dataJsPath = path.join(ROOT, 'js', 'levels-data.js');
  const dataJs =
    '/* 自动生成，支持双击 index.html 离线游玩 */\n' +
    'window.LEVELS_DATA = ' +
    JSON.stringify(manifest) +
    ';\n';
  fs.writeFileSync(dataJsPath, dataJs, 'utf8');

  const counts = { A: 0, R: 0, SR: 0, SSR: 0 };
  tiles.forEach((t) => counts[t.rarity]++);
  console.log(`  图池: ${tiles.length} 张（A${counts.A} R${counts.R} SR${counts.SR} SSR${counts.SSR}）`);
  Object.entries(MODE_PLANS).forEach(([id, plan]) => {
    const n = LEVELS_PER_MODE[id] ?? plan.pairsByStage.length;
    console.log(`  ${id}: ${plan.pairsByStage.join(' → ')} 对（${n} 关）`);
  });
  console.log(`\n已生成 ${path.relative(ROOT, OUTPUT)}`);
  console.log(`已生成 ${path.relative(ROOT, dataJsPath)}`);

  const { execSync } = require('child_process');
  try {
    execSync('node scripts/validate-encoding.js', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

main();
