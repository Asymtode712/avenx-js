import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { analyzeStats, runStats } from '../../bin/commands/stats.js';
import { buildModel } from '../../bin/commands/atlas.js';
import { logger } from '../../lib/core/runtime/AvenxLogger.js';

// `avenx stats` builds the project's model, which reports every diagnostic,
// and then parses each template again to measure its size. That second pass
// used to report everything a second time.

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avenx-stats-diagnostics-'));

/**
 * Runs `fn` and returns the warnings it logged.
 * @param {Function} fn - The work to run.
 * @returns {string[]} The logged warnings.
 */
function captureWarnings(fn) {
  const warnings = [];
  const originalWarn = logger.warn;
  logger.warn = (...args) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    logger.warn = originalWarn;
  }
  return warnings;
}

/**
 * Counts the warnings carrying a diagnostic code.
 * @param {string[]} warnings - Logged warnings.
 * @param {string} code - A diagnostic code such as 'AVX_W03'.
 * @returns {number} How many there are.
 */
function count(warnings, code) {
  return warnings.filter((w) => w.includes(`[${code}]`)).length;
}

console.log('🧪 Testing that avenx stats reports each diagnostic once...');

try {
  fs.mkdirSync(path.join(TEST_DIR, 'src', 'pages'), { recursive: true });
  // One undeclared template reference: exactly one AVX_W03.
  fs.writeFileSync(path.join(TEST_DIR, 'src', 'pages', 'home.page.js'), '<state x="" />\n\n<div><p>{{ nope }}</p></div>\n');

  const fakeCli = { baseDir: TEST_DIR, config: { srcDir: 'src' } };

  const fromBuild = captureWarnings(() => buildModel(fakeCli));
  assert.strictEqual(count(fromBuild, 'AVX_W03'), 1, 'the compiler should report the undeclared reference once');

  let data;
  const fromStats = captureWarnings(() => {
    data = analyzeStats(fakeCli);
  });
  assert.strictEqual(count(fromStats, 'AVX_W03'), 1, 'stats should report the undeclared reference once');
  assert.strictEqual(fromStats.length, fromBuild.length, 'stats should report the same diagnostics as the compiler');

  // The measurement pass still runs: the page's template is still measured.
  const home = data.items.find((item) => item.file === 'src/pages/home.page.js');
  assert.ok(home, 'the page should be listed');
  assert.ok(home.rawTemplateBytes > 0, 'the raw template should still be measured');
  assert.ok(home.compiledTemplateBytes > 0, 'the compiled template should still be measured');

  // --json output stays parseable and carries the same count.
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  let fromJson;
  try {
    fromJson = captureWarnings(() => runStats(fakeCli, ['--json']));
  } finally {
    console.log = originalLog;
  }
  assert.doesNotThrow(() => JSON.parse(logs.join('\n')), 'stats --json should print valid JSON');
  assert.strictEqual(count(fromJson, 'AVX_W03'), 1, 'stats --json should report the undeclared reference once');

  console.log('✅ avenx stats reports each diagnostic once');
} catch (err) {
  console.error('❌ Unit test failed:', err);
  process.exit(1);
} finally {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
