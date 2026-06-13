/**
 * FILE: tests/public-api-surface.test.ts
 * DESCRIPTION: Locks the PUBLIC API surface of the main entry point as a 1.0
 * semver contract. Unlike tests/index.test.ts (which snapshots runtime
 * `Object.keys`, i.e. VALUE exports only), this test parses src/index.ts
 * statically so it also captures TYPE-only exports — which are erased at runtime
 * and would otherwise change invisibly.
 *
 * Two guarantees:
 *  1. No `export *` wildcard — the surface must always be enumerable. A wildcard
 *     auto-publishes anything added to the re-exported module, which after 1.0
 *     means accidental breaking changes.
 *  2. The exact set of value + type exports is frozen via snapshot. Any add/remove
 *     trips this test, surfacing the change in the .snap diff at review time
 *     instead of breaking a user. Updating it (vitest -u) is a deliberate,
 *     reviewable semver decision.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));

function collectPublicSurface(): {
  values: string[];
  types: string[];
  wildcards: number;
} {
  const source = readFileSync(ENTRY, 'utf8');
  const sf = ts.createSourceFile(
    'index.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true
  );

  const values: string[] = [];
  const types: string[] = [];
  let wildcards = 0;

  const hasExportModifier = (node: ts.HasModifiers): boolean =>
    ts.canHaveModifiers(node) &&
    !!ts
      .getModifiers(node)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const stmt of sf.statements) {
    // `export { ... } from '...'` / `export type { ... } from '...'` / `export * from '...'`
    if (ts.isExportDeclaration(stmt)) {
      if (!stmt.exportClause) {
        wildcards++; // `export * from '...'`
        continue;
      }
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          if (stmt.isTypeOnly || el.isTypeOnly) types.push(el.name.text);
          else values.push(el.name.text);
        }
      }
      continue;
    }

    // Direct declarations (index.ts uses re-exports today, but guard the future).
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) values.push(d.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt)) &&
      stmt.name &&
      hasExportModifier(stmt)
    ) {
      values.push(stmt.name.text);
    } else if (
      (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) &&
      hasExportModifier(stmt)
    ) {
      types.push(stmt.name.text);
    }
  }

  return {
    values: [...new Set(values)].sort(),
    types: [...new Set(types)].sort(),
    wildcards,
  };
}

describe('Public API surface (src/index.ts) — 1.0 semver contract', () => {
  const surface = collectPublicSurface();

  it('has no wildcard re-exports (the surface must stay enumerable)', () => {
    expect(surface.wildcards).toBe(0);
  });

  it('locks the exact set of public value + type exports', () => {
    expect({ values: surface.values, types: surface.types }).toMatchSnapshot();
  });
});
