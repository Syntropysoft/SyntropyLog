import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Enable global test functions like describe, it, beforeEach, etc.
    environment: 'node', // Or 'jsdom' if you need to simulate a browser
    include: ['tests/**/*.ts', 'test_integration/**/*.ts'], // Search for tests in both folders
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html', 'lcov'], // lcov is useful for Codecov and similar tools
      include: ['src/**/*.ts'], // Measures coverage on all .ts files in the src folder
      exclude: [
        // Exclude from coverage what is not relevant source code
        'src/**/{*.d.ts,*.test.ts,*.spec.ts}',
        'src/**/__tests__/**',
      ],
    },
    deps: {
      // Removed inline config to prevent TypeScript server issues
    },
  },
});
