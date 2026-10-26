/* Hy-Image-3.5-preview 调用：node tools/hy-image.mjs "提示词" out.png [宽x高] */
import fs from 'node:fs';

const KEY_FILE = 'D:/DDGame/txt.lang';
const ENDPOINT = 'https://tokenhub.tencentmaas.com/v1/wand/hunyuan-image/v35-generation';

function readKey() {
  if (process.env.TENCENT_TOKENHUB_KEY) return process.env.TENCENT_TOKENHUB_KEY;
  try {
    const s = fs.readFileSync(KEY_FILE, 'utf8');
    const m = s.match(/Bearer\s+([A-Za-z0-9_.\-]+)/);
    return m && m[1];
  } catch {
    return null;
  }
}

const key = readKey();
if (!key) {
  console.error('没有 API Key：设置 TENCENT_TOKENHUB_KEY，或在 txt.lang 里放 Bearer');
  process.exit(1);
}

const prompt = process.argv[2];
const out = process.argv[3];
const size = process.argv[4] || '1024x1024';
if (!prompt || !out) {
  console.error('用法：node tools/hy-image.mjs "提示词" out.png [宽x高]');
  process.exit(1);
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'hy-image-v3.5-preview',
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    size,
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error('HTTP', res.status);
  console.error(text.slice(0, 800));
  process.exit(1);
}

let data;
try {
  data = JSON.parse(text);
} catch {
  console.error('不是 JSON：', text.slice(0, 500));
  process.exit(1);
}

const img = data.choices?.[0]?.delta?.image;
if (!img || !img.url) {
  console.error('没拿到图片：', text.slice(0, 500));
  process.exit(1);
}

const r = await fetch(img.url);
if (!r.ok) {
  console.error('下载失败：', r.status);
  process.exit(1);
}
const buf = Buffer.from(await r.arrayBuffer());
fs.writeFileSync(out, buf);
console.log('saved', out, buf.length, 'bytes', img.width + 'x' + img.height);
