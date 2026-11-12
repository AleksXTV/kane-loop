import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export const DEFAULTS = {
  flowsDir: 'flows',
  stateDir: '.kane',
  app: null, // { url, command, readyTimeoutMs }
  kane: { bin: 'kane-cli', headless: true, adaptiveHeal: false, timeoutS: 300, maxSteps: 20, extraArgs: [] },
  // Changed files matching these globs never trigger a replay (docs, the test suite of kane-loop itself...).
  ignore: [],
};

export function findRoot(start = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: start, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return start;
  }
}

export function loadConfig(root) {
  const file = join(root, 'kane-loop.json');
  const user = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const cfg = { ...DEFAULTS, ...user, kane: { ...DEFAULTS.kane, ...(user.kane || {}) } };
  if (process.env.KANE_LOOP_KANE_BIN) cfg.kane.bin = process.env.KANE_LOOP_KANE_BIN;
  cfg.root = root;
  return cfg;
}
