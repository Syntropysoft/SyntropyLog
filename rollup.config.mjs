import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
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
  terser({ format: { comments: false } }),
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
  {
    input: 'src/index.ts',
    output: [
      {
        file: './dist/index.cjs',
        format: 'cjs',
        sourcemap: false,
        inlineDynamicImports: true,
      },
      {
        file: './dist/index.mjs',
        format: 'esm',
        sourcemap: false,
        inlineDynamicImports: true,
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
