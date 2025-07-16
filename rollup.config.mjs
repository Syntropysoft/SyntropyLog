import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import dts from 'rollup-plugin-dts';
import { builtinModules } from 'node:module';
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
];

// Common plugins for all JavaScript bundles.
const jsPlugins = [
  resolve(),
  commonjs(),
  typescript({ 
    tsconfig: './tsconfig.rollup.json',
    sourceMap: true,
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
      file: `${baseOutputName}.cjs`,
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: `${baseOutputName}.mjs`,
      format: 'esm',
      sourcemap: true,
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
  external: [...Object.keys(pkg.peerDependencies || {}), 'events'],
});

// Export an array with all build configurations.
export default [
  // --- JavaScript Bundles ---
  createEntryConfig('src/index.ts', './dist/index'),
  createEntryConfig('src/doctor.ts', './dist/doctor'),
  createEntryConfig('src/http/index.ts', './dist/http/index', {
    treeshake: false,
  }),
  createEntryConfig('src/brokers/index.ts', './dist/brokers/index', {
    treeshake: false,
  }),
  createEntryConfig('src/testing/index.ts', './dist/testing/index', {
    treeshake: false,
  }),

  // --- Type Declaration Bundles (.d.ts) ---
  createDtsConfig('dist/types/type-exports.d.ts', 'dist/index.d.ts'),
  createDtsConfig('dist/types/http/index.d.ts', 'dist/http/index.d.ts'),
  createDtsConfig(
    'dist/types/brokers/index.d.ts',
    'dist/brokers/index.d.ts',
  ),
  createDtsConfig(
    'dist/types/testing/index.d.ts',
    'dist/testing/index.d.ts',
  ),
];
