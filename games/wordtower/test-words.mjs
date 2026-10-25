/* 豆豆单词塔 · 词库自检（零依赖）
   ------------------------------------------------------------
   node games/wordtower/test-words.mjs
   检查：档位长度、重复词、buff 是否和 game.js 的卡池对得上、
        每个 buff 至少有多少词。加词之后先跑这个，再跑 headless。 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(DIR, 'words.js'), 'utf8'), ctx);
const bank = ctx.window.WORD_BANK || {};

const gameSrc = fs.readFileSync(path.join(DIR, 'game.js'), 'utf8');
const cardBuffs = new Set(
  [...gameSrc.matchAll(/buff:\s*'([a-z]+)'/g)].map((m) => m[1])
);

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);
  if (ok) pass += 1; else fail += 1;
};

const tiers = { easy: [3, 4], mid: [5, 6], hard: [7, 12] };
const seen = new Map();
const seenGrade = new Map();
const stats = {};
const gradeStats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
let total = 0;
const badTier = [];
const badWord = [];
const badZh = [];
const badGrade = [];
const dup = [];

check('词库存在且分三档',
  !!bank && ['easy', 'mid', 'hard'].every((t) => Array.isArray(bank[t])));

for (const tier of Object.keys(tiers)) {
  const [lo, hi] = tiers[tier];
  for (const entry of bank[tier] || []) {
    total += 1;
    if (!entry || typeof entry.w !== 'string' || typeof entry.zh !== 'string' || !entry.zh) {
      badWord.push(`${tier}:${JSON.stringify(entry)}`);
      continue;
    }
    const w = entry.w;
    if (!/^[A-Z]+$/.test(w)) badWord.push(`${tier}:${w}`);
    if (w.length < lo || w.length > hi) badTier.push(`${tier}:${w}(${w.length})`);
    if (entry.zh.length > 10) badZh.push(`${tier}:${w}=${entry.zh}`);
    if (!Number.isInteger(entry.grade) || entry.grade < 1 || entry.grade > 6) {
      badGrade.push(`${tier}:${w}=${entry.grade}`);
    } else {
      gradeStats[entry.grade] += 1;
      seenGrade.set(w, entry.grade);
    }

    if (seen.has(w)) dup.push(`${w}(${seen.get(w)}/${entry.buff})`);
    else seen.set(w, entry.buff);

    stats[entry.buff] ??= { easy: 0, mid: 0, hard: 0, total: 0 };
    stats[entry.buff][tier] += 1;
    stats[entry.buff].total += 1;
  }
}

check('每个词都是大写字母 + 中文', badWord.length === 0, badWord.slice(0, 5).join(' '));
check('单词长度和档位一致', badTier.length === 0, badTier.slice(0, 5).join(' '));
check('中文提示不超过 10 字', badZh.length === 0, badZh.slice(0, 5).join(' '));
check('每个词都有 1-6 年级标签', badGrade.length === 0, badGrade.slice(0, 5).join(' '));
check('没有重复单词', dup.length === 0, dup.slice(0, 5).join(' '));
check('词量够用（≥300）', total >= 300, `total=${total}`);

const bandRange = (min, max) => Object.entries(gradeStats)
  .filter(([g]) => Number(g) >= min && Number(g) <= max)
  .reduce((s, [, n]) => s + n, 0);
check('3-4 年级词量（≥500）', bandRange(3, 4) >= 500, `n=${bandRange(3, 4)}`);
check('3-5 年级词量（≥700）', bandRange(3, 5) >= 700, `n=${bandRange(3, 5)}`);
check('3-6 年级词量（≥900）', bandRange(3, 6) >= 900, `n=${bandRange(3, 6)}`);
check('1-2 年级单词已并入 3 年级', bandRange(1, 2) === 0, `n=${bandRange(1, 2)}`);

// 教材词表 ↔ 词库：两边必须一一对应，防止以后改词漏掉教材覆盖
const pep = JSON.parse(fs.readFileSync(path.join(DIR, 'pep-1-6.json'), 'utf8'));
const pepWords = new Set(pep.map((e) => String(e.w).toUpperCase()));
const bankWords = new Set(seen.keys());
const missing = [...pepWords].filter((w) => !bankWords.has(w));
const extra = [...bankWords].filter((w) => !pepWords.has(w));
check('覆盖教材词表 pep-1-6.json', missing.length === 0, missing.slice(0, 8).join(' '));
check('词库没有教材表外的词', extra.length === 0, extra.slice(0, 8).join(' '));
check('教材词量（≥900）', pepWords.size >= 900, `pep=${pepWords.size}`);

const pepGrade = new Map(pep.map((e) => [String(e.w).toUpperCase(), e.grade]));
const gradeMismatch = [...seenGrade].filter(([w, g]) => pepGrade.get(w) !== g);
check('年级标签和 pep-1-6.json 一致', gradeMismatch.length === 0,
  gradeMismatch.slice(0, 8).map(([w, g]) => `${w}=${g}/${pepGrade.get(w)}`).join(' '));

const unknownBuff = Object.keys(stats).filter((b) => !cardBuffs.has(b));
check('词库 buff 都有对应卡', unknownBuff.length === 0, unknownBuff.join(' '));

const emptyBuff = [...cardBuffs].filter((b) => !stats[b]);
check('每张卡都有词可抽', emptyBuff.length === 0, emptyBuff.join(' '));

const thin = [...cardBuffs].filter((b) => (stats[b]?.total || 0) < 15);
check('每个 buff 至少 15 个词', thin.length === 0,
  thin.map((b) => `${b}=${stats[b]?.total || 0}`).join(' '));

const thinEasy = [...cardBuffs].filter((b) => (stats[b]?.easy || 0) < 3);
check('每个 buff 至少有 3 个短词', thinEasy.length === 0,
  thinEasy.map((b) => `${b}=${stats[b]?.easy || 0}`).join(' '));

const thinMid = [...cardBuffs].filter((b) => (stats[b]?.mid || 0) < 3);
check('每个 buff 至少有 3 个中词', thinMid.length === 0,
  thinMid.map((b) => `${b}=${stats[b]?.mid || 0}`).join(' '));

const thinHard = [...cardBuffs].filter((b) => (stats[b]?.hard || 0) < 3);
check('每个 buff 至少有 3 个长词', thinHard.length === 0,
  thinHard.map((b) => `${b}=${stats[b]?.hard || 0}`).join(' '));

const band3Buff = {};
for (const tier of Object.keys(tiers)) {
  for (const entry of bank[tier] || []) {
    if (entry && entry.grade === 3) band3Buff[entry.buff] = (band3Buff[entry.buff] || 0) + 1;
  }
}
const thinBand = [...cardBuffs].filter((b) => (band3Buff[b] || 0) < 5);
check('每个 buff 在 3 年级至少 5 个词', thinBand.length === 0,
  thinBand.map((b) => `${b}=${band3Buff[b] || 0}`).join(' '));

console.log('---');
console.log(`词数 ${total}，卡池 ${cardBuffs.size} 种，buff 覆盖 ${Object.keys(stats).length} 种`);
console.table(stats);
console.log(fail ? `RESULT fail=${fail}` : `RESULT pass=${pass} fail=0`);
process.exitCode = fail ? 1 : 0;
