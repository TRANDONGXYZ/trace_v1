import { defineConfig } from 'vite';

export default defineConfig(({ mode, command }) => ({
  define: { __TRACE_CLOUD_AI__: JSON.stringify(command === 'build' || mode !== 'ollama') },
  server: { proxy: { '/api/ai': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  preview: { proxy: { '/api/ai': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
}));
