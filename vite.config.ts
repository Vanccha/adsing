import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': r('./engine'),
      '@data': r('./data'),
    },
  },
  test: {
    include: ['engine/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
