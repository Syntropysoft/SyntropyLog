import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // To avoid having to import describe, it, etc. from 'vitest'
    environment: 'node', // Or 'jsdom' if you need to simulate a browser
    include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'], // Search for tests only in the 'tests' folder
    exclude: ['test_integration/**'],
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
      inline: ['nock'], // Note: this is for more specific cases
    },
  },
});
