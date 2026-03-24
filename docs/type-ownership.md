# Type Ownership (types vs internal-types)

## Single Source of Truth

- **`src/internal-types.ts`** is the canonical source for all framework types. `LogEntry`, `LoggerOptions`, `SerializationResult`, and all other shared types are defined here.
- **`src/types.ts`** is the public surface: it only re-exports from `internal-types` and defines minimal local exceptions (`SerializableData`, re-export of `LogLevel`).

## Convention to Avoid Drift

1. **Adding a public type:** define it in `internal-types.ts` and add it to the `import`/`export` in `types.ts`.
2. **Changing the shape of a public type:** edit only `internal-types.ts`; `types.ts` must not redefine or extend those types.
3. **Exceptions in types.ts:** only `SerializableData` (defined locally as `unknown`) and the re-export of `LogLevel` from `logger/levels`. Everything else comes from `internal-types`.

## type-exports.ts (build 1.8)

`src/type-exports.ts` is the entry used by rollup-plugin-dts to generate `dist/index.d.ts`. It must list every value and type that should appear in the published declaration file.

**Rule:** Every export in `src/index.ts` must exist in `src/type-exports.ts` (same name and kind: value or type). When adding a new export to `index.ts`, add it to `type-exports.ts` so the generated `.d.ts` stays complete. The build uses `dist/types/type-exports.d.ts` as input (see `rollup.config.mjs`: `createDtsConfig('dist/types/type-exports.d.ts', 'dist/index.d.ts')`).
