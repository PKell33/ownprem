import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'cobertura'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        // Global thresholds - baseline from current coverage
        // These prevent overall coverage from decreasing
        lines: 30,
        functions: 24,
        branches: 30,
        statements: 30,
        // Higher thresholds for critical paths
        'src/pages/Login/**/*.{ts,tsx}': {
          lines: 50,
          functions: 50,
          branches: 45,
          statements: 50,
        },
        'src/components/ErrorBoundary.tsx': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        'src/components/QueryError.tsx': {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95,
        },
        'src/components/Modal.tsx': {
          lines: 75,
          functions: 75,
          branches: 55,
          statements: 75,
        },
      },
    },
  },
});
