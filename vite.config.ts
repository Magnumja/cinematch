import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'web',
  envDir: '..',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: '127.0.0.1', fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true },
  test: {
    root: '.',
    include: ['core/**/*.test.ts', 'scripts/**/*.test.ts', 'web/src/**/*.test.{ts,tsx}'],
    // Testes de componente declaram `// @vitest-environment jsdom` no topo do arquivo.
    environment: 'node',
  },
});
