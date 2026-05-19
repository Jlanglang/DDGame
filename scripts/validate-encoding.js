/**
 * 校验关键文本文件 UTF-8 与 HTML 完整性，防止乱码/标签损坏导致页面打不开。
 * 用法: node scripts/validate-encoding.js
 * 退出码: 0 通过，1 失败
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const CHECKS = [
  {
    file: 'index.html',
    required: ['<meta charset="UTF-8">', '豆豆大挑战', '快速开始', '再玩一次', '</html>'],
    forbidden: ['<motion', '</motion>', '????'],
  },
  {
    file: 'js/modes.js',
    required: ['普通', '困难', '挑战'],
    forbidden: ['????'],
  },
];

const BROKEN_TAG_PATTERNS = [
  /(?<!<)\/title>/i,
  /(?<!<)\/button>/i,
  /(?<!<)\/h1>/i,
  /(?<!<)\/div>/i,
  /(?<!<)\/span>/i,
];

const MOJIBAKE_RE = /[\uFFFD]|(?:\?{4,})/;

function readUtf8(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    return { ok: false, errors: [`文件不存在: ${rel}`] };
  }
  const buf = fs.readFileSync(abs);
  const text = buf.toString('utf8');
  if (text.includes('\uFFFD')) {
    return { ok: false, errors: [`${rel}: 含 Unicode 替换符 U+FFFD（编码损坏）`] };
  }
  return { ok: true, text, abs };
}

function validateFile(spec) {
  const read = readUtf8(spec.file);
  if (!read.ok) return read.errors;
  const errors = [];
  const { text } = read;

  for (const s of spec.required || []) {
    if (!text.includes(s)) {
      errors.push(`${spec.file}: 缺少必需内容「${s}」`);
    }
  }

  for (const s of spec.forbidden || []) {
    if (text.includes(s)) {
      errors.push(`${spec.file}: 含禁止内容「${s}」`);
    }
  }

  if (MOJIBAKE_RE.test(text)) {
    errors.push(`${spec.file}: 疑似乱码（连续 ? 或替换符）`);
  }

  if (spec.file.endsWith('.html')) {
    for (const re of BROKEN_TAG_PATTERNS) {
      if (re.test(text)) {
        errors.push(`${spec.file}: 疑似残缺 HTML 标签（${re}）`);
      }
    }
  }

  return errors;
}

function main() {
  const allErrors = [];
  for (const spec of CHECKS) {
    allErrors.push(...validateFile(spec));
  }

  if (allErrors.length) {
    console.error('编码/HTML 校验失败:\n');
    allErrors.forEach((e) => console.error('  -', e));
    console.error('\n修复建议: 运行 node scripts/fix-index-html.js 或按 .cursor/rules/encoding-and-html.mdc 操作');
    process.exit(1);
  }

  console.log('编码/HTML 校验通过');
}

main();
