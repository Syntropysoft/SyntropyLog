import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import dts from 'rollup-plugin-dts';
import { builtinModules } from 'node:module';
import path from 'path';
// --- THE FIX IS HERE ---
// Use the new, standard `with` syntax for JSON imports.
// This is compatible with modern Node.js versions (including 20 and 22).
import pkg from './package.json' with { type: 'json' };

// List of external dependencies that should not be bundled.
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.optionalDependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  // Force external for problematic transitive dependencies
  'type-detect',
];

// Common plugins for main bundle (minify to reduce CJS/ESM size)
const mainJsPlugins = [
  resolve(),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.rollup.json',
    sourceMap: false,
  }),
  json(),
];

// Plugins for testing bundle (no minify for easier debugging)
const jsPlugins = [
  resolve(),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.rollup.json',
    sourceMap: false,
  }),
  json(),
];

// ESM: createRequire is already provided by SerializationManager.ts in the bundle; do not inject a duplicate intro.

// Base configuration for each entry point.
const createEntryConfig = (
  inputFile,
  baseOutputName,
  options = {},
) => ({
  input: inputFile,
  output: [
    {
      dir: path.dirname(baseOutputName),
      entryFileNames: path.basename(baseOutputName) + '.cjs',
      format: 'cjs',
      sourcemap: false,
    },
    {
      dir: path.dirname(baseOutputName),
      entryFileNames: path.basename(baseOutputName) + '.mjs',
      format: 'esm',
      sourcemap: false,
    },
  ],
  plugins: jsPlugins,
  external,
  ...options,
});

// Base configuration for each type declaration entry point.
const createDtsConfig = (inputFile, outputName) => ({
  input: inputFile,
  output: [{ file: outputName, format: 'es' }],
  plugins: [dts()],
  external: [
    ...Object.keys(pkg.peerDependencies || {}),
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
});

// Export an array with all build configurations.
export default [
  // --- JavaScript Bundles (minified) ---
  // inlineDynamicImports: false so Redis stays in a separate chunk; main bundle stays small when redis is unused.
  {
    input: 'src/index.ts',
    output: [
      {
        dir: 'dist',
        format: 'cjs',
        sourcemap: false,
        entryFileNames: '[name].cjs',
        chunkFileNames: 'chunks/[name]-[hash].cjs',
      },
      {
        dir: 'dist',
        format: 'esm',
        sourcemap: false,
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
      },
    ],
    plugins: mainJsPlugins,
    external,
  },

  createEntryConfig('src/testing/index.ts', './dist/testing/index', {
    treeshake: false,
    external: [...external, 'vitest'],
  }),

  // --- Type Declaration Bundles (.d.ts) ---
  createDtsConfig('dist/types/type-exports.d.ts', 'dist/index.d.ts'),
  createDtsConfig(
    'dist/types/testing/index.d.ts',
    'dist/testing/index.d.ts',
  ),
];
