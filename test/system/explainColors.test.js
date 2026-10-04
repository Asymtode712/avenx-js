import assert from 'assert';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const cliPath = path.join(repoRoot, 'bin/avenx.js');

console.log('Testing avenx explain color handling...');

/**
 * Runs the CLI with a controlled color environment.
 * @param {string[]} args - CLI arguments.
 * @param {object} [options]
 * @param {object} [options.env] - Environment overrides.
 * @param {boolean} [options.tty] - Whether to simulate a TTY for the CLI.
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
function explain(args, { env = {}, tty = false } = {}) {
  const childEnv = { ...process.env };
  delete childEnv.NO_COLOR;
  delete childEnv.FORCE_COLOR;
  delete childEnv.TERM;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete childEnv[key];
    } else {
      childEnv[key] = value;
    }
  }

  if (!tty) {
    return spawnSync(process.execPath, [cliPath, 'explain', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: childEnv,
    });
  }

  const cliUrl = pathToFileURL(cliPath).href;
  const bootstrap = [
    `Object.defineProperty(process.stdout, 'isTTY', { value: true });`,
    `process.argv = [process.execPath, ${JSON.stringify(cliPath)}, 'explain', ...${JSON.stringify(args)}];`,
    `await import(${JSON.stringify(cliUrl)});`,
  ].join('\n');
  return spawnSync(process.execPath, ['--input-type=module', '-e', bootstrap], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: childEnv,
  });
}

function hasAnsi(text) {
  return text.includes('\u001b[');
}

try {
  const forced = explain(['AVX_W40'], { env: { FORCE_COLOR: '1' } });
  assert.strictEqual(forced.status, 0, forced.stderr);
  assert.ok(hasAnsi(forced.stdout), 'FORCE_COLOR enables explain colors even when stdout is piped');

  const disabled = explain(['AVX_W40', '--no-color'], {
    env: { FORCE_COLOR: '1' },
    tty: true,
  });
  assert.strictEqual(disabled.status, 0, disabled.stderr);
  assert.ok(!hasAnsi(disabled.stdout), '--no-color takes precedence over FORCE_COLOR');

  const dumbTerminal = explain(['AVX_W40'], { env: { TERM: 'dumb' }, tty: true });
  assert.strictEqual(dumbTerminal.status, 0, dumbTerminal.stderr);
  assert.ok(!hasAnsi(dumbTerminal.stdout), 'TERM=dumb disables explain colors on a TTY');

  const normalTerminal = explain(['AVX_W40'], { env: { FORCE_COLOR: '1' }, tty: true });
  assert.strictEqual(normalTerminal.status, 0, normalTerminal.stderr);
  assert.ok(hasAnsi(normalTerminal.stdout), 'colors remain enabled when explicitly forced');

  const json = explain(['AVX_W40', '--json'], { env: { FORCE_COLOR: '1' } });
  assert.strictEqual(json.status, 0, json.stderr);
  assert.ok(!hasAnsi(json.stdout), 'JSON output remains free of ANSI escapes');

  console.log('avenx explain color handling tests passed!');
} catch (error) {
  console.error('avenx explain color handling tests failed:');
  console.error(error);
  process.exit(1);
}
