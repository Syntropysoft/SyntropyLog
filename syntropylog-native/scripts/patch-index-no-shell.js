/**
 * Post-build patch: replace NAPI-RS default isMusl() that uses execSync('which ldd')
 * with a version that uses only fs.existsSync and process.env.PATH (no shell).
 * Run after `napi build` so the published index.js never contains child_process.execSync.
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

if (!content.includes("require('child_process').execSync") && !content.includes('execSync')) {
  console.log('patch-index-no-shell: index.js already has no execSync, skip');
  process.exit(0);
}

// 1) Replace the execSync line with safe resolveLddPath() call
content = content.replace(
  /const lddPath = require\('child_process'\)\.execSync\('which ldd'\)\.toString\(\)\.trim\(\)/,
  'const lddPath = resolveLddPath();\n      if (!lddPath) return true'
);

// 2) Insert resolveLddPath() before "switch (platform)" so it's defined when isMusl() runs
const resolveLddPathBlock = `
/** Resolve path to ldd using PATH + fs.existsSync only (no subprocess). See syntropylog SECURITY.md. */
function resolveLddPath() {
  const candidates = ['/usr/bin/ldd']
  const pathEnv = process.env.PATH
  if (pathEnv) {
    for (const dir of pathEnv.split(':')) {
      if (dir) candidates.push(join(dir.trim(), 'ldd'))
    }
  }
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch (_) {}
  }
  return null
}

`;

content = content.replace(/\nswitch\s*\(\s*platform\s*\)/, resolveLddPathBlock + 'switch (platform)');

if (content.includes('execSync')) {
  console.error('patch-index-no-shell: execSync still present after patch');
  process.exit(1);
}

fs.writeFileSync(indexPath, content, 'utf8');
console.log('patch-index-no-shell: removed execSync from index.js, added resolveLddPath()');
