import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The nestjs subpath imports from bare 'syntropylog' (KNOWN-ISSUES #1 fix).
      // Tests must resolve it to src, never to a (possibly missing/stale) dist —
      // the Release job runs the pre-commit suite before any build exists.
      syntropylog: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true, // Enable global test functions like describe, it, beforeEach, etc.
    environment: 'node', // Or 'jsdom' if you need to simulate a browser
    // 20s, not the 5s default: tests/type-exports.test.ts dynamically imports the whole
    // public surface, so vite compiles the source tree inside the test while 57 other files
    // compete for workers. It needs well over 8s on a loaded dev machine (CI, less
    // contended, made it under 5s) — a flake about machine load, not about the assertion.
    // Still bounded, so a genuine hang fails instead of running forever.
    testTimeout: 20000,
    // Unit tests only; integration tests run via: pnpm run test:integration
    include: ['tests/**/*.{test,spec}.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'istanbul', // or 'v8'
      reporter: ['text', 'json', 'html', 'lcov'], // lcov is useful for Codecov and similar tools
      include: ['src/**/*.ts'], // Measures coverage on all .ts files in the src folder
      exclude: [
        // Exclude from coverage what is not relevant source code
        'src/**/{*.d.ts,*.test.ts,*.spec.ts}',
        'src/**/__tests__/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 75,
        statements: 90,
      },
    },
    deps: {
      // Removed inline config to prevent TypeScript server issues
    },
  },
});
