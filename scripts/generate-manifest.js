/**
 * 扫描 assets/tiles/ 图池，生成关卡（含各模式独立关卡表，名称从第 1 关起）
 *
 * 用法: node scripts/generate-manifest.js
 * 图过大时: python scripts/optimize-tiles.py
 */

const fs = require('fs');
const path = require('path');
const { forPairs } = require('../js/difficulty.js');
const { MODES } = require('../js/modes.js');

const ROOT = path.join(__dirname, '..');
const TILES_DIR = path.join(ROOT, 'assets', 'tiles');
const OUTPUT = path.join(ROOT, 'levels.json');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

/** 单关最多几对（全模式上限） */
const MIN_PAIRS = 2;
const MAX_PAIRS_CAP = 20;

/** 不生成对数为 7 的倍数的关卡（7、14、21…） */
function shouldSkipPairs(pairs) {
  return pairs % 7 === 0;
}

function maxPairsForTiles(tileCount) {
  return Math.min(tileCount, MAX_PAIRS_CAP);
}

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
  return fs
    .readdirSync(TILES_DIR)
    .filter(isImageFile)
    .sort(naturalCompare)
    .map((f) => `assets/tiles/${f}`.replace(/\\/g, '/'));
}

/** 与全局关卡相同对数时使用相同图组 */
function pickImages(tiles, pairs) {
  const n = tiles.length;
  const start = (pairs - 1) % n;
  const picked = [];
  for (let i = 0; i < pairs; i++) {
    picked.push(tiles[(start + i) % n]);
  }
  return picked;
}

function buildLevelEntry(id, pairs, tiles) {
  const cfg = forPairs(pairs);
  return {
    id,
    name: `第 ${id} 关`,
    pairs,
    difficulty: cfg.difficulty,
    difficultyLabel: cfg.difficultyLabel,
    timeLimit: cfg.timeLimit,
    moveLimit: cfg.moveLimit,
    images: pickImages(tiles, pairs),
  };
}

/** 普通模式：2 对起，第 1~N 关 */
function buildNormalLevels(tiles) {
  const maxPairs = maxPairsForTiles(tiles.length);
  const levels = [];
  let id = 1;
  for (let pairs = MIN_PAIRS; pairs <= maxPairs; pairs++) {
    if (shouldSkipPairs(pairs)) continue;
    levels.push(buildLevelEntry(id, pairs, tiles));
    id += 1;
  }
  return levels;
}

/** 困难/挑战：从 minPairs 起，关卡名从第 1 关重新编号 */
function buildModeLevels(tiles, minPairs) {
  const maxPairs = maxPairsForTiles(tiles.length);
  const levels = [];
  let id = 1;
  for (let pairs = minPairs; pairs <= maxPairs; pairs++) {
    if (shouldSkipPairs(pairs)) continue;
    levels.push(buildLevelEntry(id, pairs, tiles));
    id += 1;
  }
  return levels;
}

function main() {
  console.log('扫描图池 assets/tiles/ ...');
  const tiles = scanTiles();

  if (tiles.length < MIN_PAIRS) {
    console.error(
      `错误: 图池至少需要 ${MIN_PAIRS} 张图。请运行 python scripts/slice-spritesheet.py 或往 assets/tiles/ 放图。`
    );
    process.exit(1);
  }

  const levels = buildNormalLevels(tiles);
  const modeLevels = {
    hard: buildModeLevels(tiles, MODES.hard.minPairs),
    challenge: buildModeLevels(tiles, MODES.challenge.minPairs),
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

  console.log(`  图池: ${tiles.length} 张，单关最多 ${MAX_PAIRS_CAP} 对`);
  const maxPairs = maxPairsForTiles(tiles.length);
  console.log(
    `  普通: ${levels.length} 关（${MIN_PAIRS}~${maxPairs} 对，跳过 7 的倍数）`
  );
  console.log(
    `  困难: ${modeLevels.hard.length} 关（${MODES.hard.minPairs} 对起，第 1 关起）`
  );
  console.log(
    `  挑战: ${modeLevels.challenge.length} 关（${MODES.challenge.minPairs} 对起，第 1 关起）`
  );
  console.log(`\n已生成 ${path.relative(ROOT, OUTPUT)}`);
  console.log(`已生成 ${path.relative(ROOT, dataJsPath)}（双击 HTML 可玩）`);
}

main();
