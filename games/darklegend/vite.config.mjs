import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: '.',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 100000000,
  },
  // 端口要和 test-input.js / package.json 里的提示一致（都是 8183），别各写各的
  server: { port: 8183, strictPort: true, open: false },
});
