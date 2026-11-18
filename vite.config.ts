import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/web',
  // GitHub Pages serves a project site under /<repo>/ (set by .github/workflows/pages.yml).
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: { proxy: { '/api/': 'http://127.0.0.1:4242' } },
});
