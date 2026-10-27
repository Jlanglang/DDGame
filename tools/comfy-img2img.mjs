/* 本地 ComfyUI img2img：node tools/comfy-img2img.mjs "提示词" 输入图 输出.png [工作流] [denoise] [种子]
 *
 * 输入图必须已经在 ComfyUI 的 input 目录里（LoadImage 只读那儿）。
 * 工作流默认 tools/comfy/sd15-img2img.json，占位符：{{prompt}} {{image}} {{denoise}} {{seed}}
 * 零依赖，只跟 http://127.0.0.1:8188 说话。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.COMFYUI_BASE || 'http://127.0.0.1:8188';
const here = path.dirname(fileURLToPath(import.meta.url));

const prompt = process.argv[2];
const image = process.argv[3];
const out = process.argv[4];
const workflowPath = process.argv[5] || path.join(here, 'comfy', 'sd15-img2img.json');
const denoise = Number(process.argv[6] ?? 0.55);
const seed = Number(process.argv[7] ?? Math.floor(Math.random() * 4294967296));

if (!prompt || !image || !out) {
  console.error('用法：node tools/comfy-img2img.mjs "提示词" 输入图 输出.png [工作流] [denoise] [种子]');
  process.exit(1);
}

const raw = fs.readFileSync(workflowPath, 'utf8').replace(/^\uFEFF/, '');
for (const token of ['{{prompt}}', '{{image}}']) {
  if (!raw.includes(token)) {
    console.error(`工作流里没有 ${token} 占位符：`, workflowPath);
    process.exit(1);
  }
}

// 本地图路径 → 先传到 ComfyUI 的 input 目录；否则当成 input 里已有的文件名
async function resolveImage(ref) {
  if (!fs.existsSync(ref)) return ref;
  const abs = path.resolve(ref);
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase() || '.png';
  const fd = new FormData();
  fd.append('image', new Blob([buf], { type: ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png' }), path.basename(abs));
  fd.append('overwrite', 'true');
  const res = await fetch(`${BASE}/upload/image`, { method: 'POST', body: fd });
  if (!res.ok) {
    console.error('上传参考图失败', res.status, (await res.text()).slice(0, 300));
    process.exit(1);
  }
  const info = await res.json();
  const name = info.subfolder ? `${info.subfolder}/${info.name}` : info.name;
  console.log('uploaded', abs, '->', name);
  return name;
}

const imageName = await resolveImage(image);

let text = raw.replaceAll('{{prompt}}', JSON.stringify(prompt).slice(1, -1));
text = text.replaceAll('{{image}}', JSON.stringify(imageName).slice(1, -1));
text = text.replaceAll('"{{denoise}}"', String(denoise));
const workflow = JSON.parse(
  JSON.stringify(JSON.parse(text), (k, v) => (v === '{{seed}}' ? seed : v)),
);

const post = await fetch(`${BASE}/prompt`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: workflow }),
});
const submitted = await post.text();
if (!post.ok) {
  console.error('提交失败', post.status, submitted.slice(0, 800));
  process.exit(1);
}
const promptId = JSON.parse(submitted).prompt_id;
console.log('queued', promptId, 'denoise', denoise, 'seed', seed);

for (;;) {
  await new Promise((r) => setTimeout(r, 800));
  const res = await fetch(`${BASE}/history/${promptId}`);
  const hist = await res.json();
  const entry = hist[promptId];
  if (!entry) continue;
  if (entry.status?.status_str === 'error') {
    console.error('工作流报错：', JSON.stringify(entry.status.messages ?? entry.status).slice(0, 1200));
    process.exit(1);
  }
  const images = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? []);
  if (images.length === 0) continue;
  const img = images[0];
  const url = `${BASE}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder ?? '')}&type=${img.type ?? 'output'}`;
  const bin = await fetch(url);
  const buf = Buffer.from(await bin.arrayBuffer());
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log('saved', out, buf.length, 'bytes');
  break;
}
