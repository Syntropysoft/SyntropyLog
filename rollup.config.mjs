import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import dts from 'rollup-plugin-dts';
import { builtinModules } from 'node:module';
import pkg from './package.json' assert { type: 'json' };

// Lista de dependencias externas que no deben ser incluidas en el bundle.
// Incluye las dependencias de producción, las de pares y los módulos nativos de Node.js.
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`), // Para imports con prefijo 'node:'
];

// Plugins comunes para todos los bundles de JavaScript.
const jsPlugins = [
  resolve(),
  commonjs(),
  json(),
  typescript({ tsconfig: './tsconfig.rollup.json' }),
];

// Configuración base para cada punto de entrada.
const createEntryConfig = (inputFile, baseOutputName) => ({
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
});

// Configuración base para cada punto de entrada de tipos.
const createDtsConfig = (inputFile, outputName) => ({
  input: inputFile,
  output: [{ file: outputName, format: 'es' }],
  plugins: [dts()],
});

// Exportamos un array con todas las configuraciones de build.
export default [
  // --- Bundles de JavaScript ---
  createEntryConfig('src/index.ts', './dist/index'),
  createEntryConfig('src/doctor.ts', './dist/doctor'),
  createEntryConfig('src/http.ts', './dist/http'),

  // --- Bundles de Declaración de Tipos (.d.ts) ---
  createDtsConfig('dist/types/index.d.ts', 'dist/index.d.ts'),
  createDtsConfig('dist/types/http.d.ts', 'dist/http.d.ts'),
];
