/* 本地 ComfyUI 出图：node tools/comfy-gen.mjs "提示词" out.png [工作流] [种子]
 *
 * 工作流默认 tools/comfy/sd15-512.json，必须是 ComfyUI「API 格式」导出，
 * 且含 {{prompt}}（必需）与 {{seed}}（可选）占位符。
 * 零依赖，只跟 http://127.0.0.1:8188 说话。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.COMFYUI_BASE || 'http://127.0.0.1:8188';
const here = path.dirname(fileURLToPath(import.meta.url));

const prompt = process.argv[2];
const out = process.argv[3];
const workflowPath = process.argv[4] || path.join(here, 'comfy', 'sd15-512.json');
const seed = Number(process.argv[5] ?? Math.floor(Math.random() * 4294967296));

if (!prompt || !out) {
  console.error('用法：node tools/comfy-gen.mjs "提示词" out.png [工作流] [种子]');
  process.exit(1);
}

const raw = fs.readFileSync(workflowPath, 'utf8').replace(/^\uFEFF/, ''); // 去掉 Windows 编辑器可能加的 BOM
if (!raw.includes('{{prompt}}')) {
  console.error('工作流里没有 {{prompt}} 占位符：', workflowPath);
  process.exit(1);
}
const workflow = JSON.parse(raw.replaceAll('{{prompt}}', JSON.stringify(prompt).slice(1, -1)));
const filled = JSON.parse(
  JSON.stringify(workflow, (k, v) => (v === '{{seed}}' ? seed : v)),
);

const post = await fetch(`${BASE}/prompt`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: filled }),
});
const submitted = await post.text();
if (!post.ok) {
  console.error('提交失败', post.status, submitted.slice(0, 800));
  process.exit(1);
}
const promptId = JSON.parse(submitted).prompt_id;
console.log('queued', promptId, 'seed', seed);

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
