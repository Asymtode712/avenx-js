/**
 * @file packageSideEffects.test.js
 * @description Keeps package.json's sideEffects declaration aligned with lib/.
 *
 * External bundlers trust this metadata when deciding whether an unused module
 * can be dropped. A stale list can either retain unnecessary runtime code or,
 * worse, remove an install module whose top-level expression is required.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const libDir = path.join(rootDir, 'lib');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

/**
 * Recursively lists JavaScript files beneath a directory.
 * @param {string} dir - Directory to scan.
 * @returns {string[]} Absolute JavaScript file paths.
 */
function listJavaScriptFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

/**
 * Converts an absolute source file to the package.json sideEffects form.
 * @param {string} file - Absolute source file.
 * @returns {string} Package-relative POSIX path prefixed with ./.
 */
function manifestPath(file) {
  return `./${path.relative(rootDir, file).split(path.sep).join('/')}`;
}

/**
 * Finds modules that execute a bare expression at module scope.
 *
 * This intentionally matches the bundler's own conservative definition in
 * lib/bundler/treeshake.js: declarations are not treated as effects, while a
 * top-level ExpressionStatement is.
 * @returns {string[]} package.json-style paths.
 */
function deriveEffectfulModules() {
  return listJavaScriptFiles(libDir)
    .filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const ast = parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowHashBang: true,
      });
      return ast.body.some((node) => node.type === 'ExpressionStatement');
    })
    .map(manifestPath)
    .sort();
}

try {
  console.log('🧪 Testing package sideEffects metadata matches lib/...');

  assert.ok(Array.isArray(pkg.sideEffects), 'package.json sideEffects must use the array form');

  const declared = [...pkg.sideEffects].sort();
  const derived = deriveEffectfulModules();

  assert.deepStrictEqual(
    declared,
    derived,
    [
      'package.json sideEffects is out of sync with top-level expression statements in lib/.',
      `Declared: ${declared.join(', ') || '(none)'}`,
      `Derived: ${derived.join(', ') || '(none)'}`,
    ].join('\n'),
  );

  console.log(`  ✅ sideEffects lists all ${derived.length} effectful modules.`);
} catch (error) {
  console.error('❌ Package sideEffects metadata test failed:', error);
  process.exitCode = 1;
}
