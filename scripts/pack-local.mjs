#!/usr/bin/env node

/**
 * Pack the LOCAL build (dist + native Rust addon) into installable tarballs,
 * so a release candidate can be tested against real consumers (e.g. the
 * examples repo) BEFORE publishing to npm.
 *
 * Why tarballs and not `file:`/link: the package declares
 * `optionalDependencies: { "syntropylog-native": "workspace:*" }`, which npm
 * cannot resolve through a file: link — but `npm pack` of the (self-contained)
 * native package gives a tgz we can point that dep at with an absolute path.
 *
 * What it does:
 *   1. `npm pack` syntropylog-native  → .local-pack/syntropylog-native-<v>.tgz
 *   2. temporarily rewrite this package.json's syntropylog-native dep to
 *      `file:<abs native tgz>`, `npm pack`, then restore the original
 *      package.json byte-for-byte (restore runs even if pack fails)
 *   3. print how to point a consumer at the result
 *
 * Usage:
 *   npm run build && node scripts/pack-local.mjs
 *   node scripts/pack-local.mjs --skip-checks   # skip dist/addon freshness warnings
 *
 * It does NOT build: run `npm run build` first (and rebuild the addon if you
 * touched Rust — see syntropylog-native/). The script warns if dist looks
 * stale or missing.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeDir = path.join(repoRoot, 'syntropylog-native');
const outDir = path.join(repoRoot, '.local-pack');
const skipChecks = process.argv.includes('--skip-checks');

const pkgPath = path.join(repoRoot, 'package.json');
const originalPkg = fs.readFileSync(pkgPath, 'utf8'); // exact bytes, for restore

function npmPack(cwd) {
  const out = execFileSync('npm', ['pack', '--pack-destination', outDir], {
    cwd,
    encoding: 'utf8',
  });
  const name = out.trim().split('\n').pop();
  return path.join(outDir, name);
}

// --- sanity: is there something to pack? -----------------------------------
if (!skipChecks) {
  const distEntry = path.join(repoRoot, 'dist', 'index.cjs');
  if (!fs.existsSync(distEntry)) {
    console.error('❌ dist/index.cjs no existe — corré `npm run build` primero.');
    process.exit(1);
  }
  const addon = fs
    .readdirSync(nativeDir)
    .filter((f) => f.endsWith('.node'))
    .map((f) => path.join(nativeDir, f));
  if (addon.length === 0) {
    console.error('❌ No hay ningún *.node en syntropylog-native/ — compilá el addon primero.');
    process.exit(1);
  }
  const distTime = fs.statSync(distEntry).mtimeMs;
  const newestAddon = Math.max(...addon.map((f) => fs.statSync(f).mtimeMs));
  const dayMs = 24 * 60 * 60 * 1000;
  if (Date.now() - distTime > dayMs) {
    console.warn('⚠️  dist tiene más de 24h — ¿seguro que está al día? (--skip-checks para silenciar)');
  }
  if (Date.now() - newestAddon > 7 * dayMs) {
    console.warn('⚠️  El addon nativo más nuevo tiene más de 7 días. Si tocaste Rust, recompilá.');
  }
}

fs.mkdirSync(outDir, { recursive: true });

// --- 1. pack the (self-contained) native addon ------------------------------
console.log('📦 1/2 Empaquetando syntropylog-native...');
const nativeTgz = npmPack(nativeDir);
console.log(`     → ${nativeTgz}`);

// --- 2. pack syntropylog with the dep pointed at that tarball ---------------
console.log('📦 2/2 Empaquetando syntropylog (dep nativa → tarball local)...');
let mainTgz;
try {
  const pkg = JSON.parse(originalPkg);
  pkg.optionalDependencies['syntropylog-native'] = `file:${nativeTgz}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  mainTgz = npmPack(repoRoot);
} finally {
  fs.writeFileSync(pkgPath, originalPkg); // restore exact original bytes, always
}
console.log(`     → ${mainTgz}`);
console.log('     package.json restaurado ✔');

// -----------------------------------------------------------------------------
console.log(`
✅ Listo. Para probar contra un consumidor (ej. examples/22):

   cd ../syntropylog-examples/22-distributed-orders-kafka
   node update-version.mjs "file:${mainTgz}"
   npm install

Al instalarse, npm sigue el file: interno hacia el tarball nativo, así que
el addon Rust local queda incluido — es el build completo, como publicado.
Para volver a npm:  node update-version.mjs <version> && npm install
`);
