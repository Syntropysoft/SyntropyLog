# Propiedad de tipos (types vs internal-types)

## Fuente única de verdad

- **`src/internal-types.ts`** es la fuente canónica de los tipos del framework. Aquí se definen `LogEntry`, `LoggerOptions`, `SerializationResult`, y el resto de tipos compartidos.
- **`src/types.ts`** es la superficie pública: solo re-exporta desde `internal-types` y define excepciones locales mínimas (`SerializableData`, re-export de `LogLevel`).

## Convención para evitar desvíos

1. **Añadir un tipo público:** definirlo en `internal-types.ts` y añadirlo al `import`/`export` de `types.ts`.
2. **Cambiar la forma de un tipo público:** editar solo `internal-types.ts`; `types.ts` no debe redefinir ni extender esos tipos.
3. **Excepciones en types.ts:** solo `SerializableData` (definido localmente como `unknown`) y el re-export de `LogLevel` desde `logger/levels`. El resto viene de `internal-types`.

## type-exports.ts (build 1.8)

`src/type-exports.ts` is the entry used by rollup-plugin-dts to generate `dist/index.d.ts`. It must list every value and type that should appear in the published declaration file.

**Rule:** Every export in `src/index.ts` must exist in `src/type-exports.ts` (same name and kind: value or type). When adding a new export to `index.ts`, add it to `type-exports.ts` so the generated `.d.ts` stays complete. The build uses `dist/types/type-exports.d.ts` as input (see `rollup.config.mjs`: `createDtsConfig('dist/types/type-exports.d.ts', 'dist/index.d.ts')`).
