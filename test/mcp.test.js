// End-to-end over the MCP protocol: a scratch git repo, a fake kane-cli that replays
// real captured NDJSON, and the agent loop verify_changed -> last_failure -> fix -> rerun_failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '..', 'bin', 'kane-loop.js');

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'kane-loop-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  mkdirSync(join(dir, 'flows'));
  mkdirSync(join(dir, 'app'));
  writeFileSync(join(dir, 'flows', 'tip_split_test.md'), readFileSync(join(here, '..', 'flows', 'tip_split_test.md'), 'utf8').replace(/demo-app\/public\//g, 'app/'));
  writeFileSync(join(dir, 'flows', 'people_test.md'), '<!-- kane-loop covers: app/people.js -->\n## Add\nVerify 3 people.\n');
  cpSync(join(here, 'fixtures', 'output-tip_split'), join(dir, 'flows', 'output-tip_split'), { recursive: true });
  writeFileSync(join(dir, 'app', 'split.js'), 'export const share = (t, n) => t / n;\n');
  writeFileSync(join(dir, 'app', 'people.js'), 'export const people = [];\n');
  writeFileSync(join(dir, 'kane-loop.json'), JSON.stringify({ flowsDir: 'flows', kane: { bin: join(here, 'fake-kane.js'), headless: true } }));
  writeFileSync(join(dir, '.gitignore'), '.kane/\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return dir;
}

function client(cwd, env) {
  const child = spawn(process.execPath, [bin, 'mcp'], { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'] });
  const pending = new Map();
  let id = 0;
  createInterface({ input: child.stdout }).on('line', (l) => {
    const m = JSON.parse(l);
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  });
  const call = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
  return { call, close: () => child.kill() };
}

test('MCP: an agent closes the loop with kane-loop', async () => {
  const dir = scratchRepo();
  const argsLog = join(dir, 'args.log');
  writeFileSync(join(dir, 'app', 'split.js'), 'export const share = (t, n) => t / n + 6;\n'); // the regression

  let c = client(dir, { FAKE_KANE_FIXTURE: join(here, 'fixtures', 'tip_split_fail.ndjson'), FAKE_KANE_ARGS_LOG: argsLog });
  const init = await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'kane-loop');
  const tools = (await c.call('tools/list')).result.tools.map((t) => t.name);
  assert.deepEqual(tools, ['verify_changed', 'verify_flow', 'last_failure', 'rerun_failed', 'list_flows']);

  const plan = await c.call('tools/call', { name: 'list_flows', arguments: {} });
  assert.deepEqual(plan.result.structuredContent.selected, ['flows/tip_split_test.md']);

  const v = await c.call('tools/call', { name: 'verify_changed', arguments: {} });
  assert.equal(v.result.isError, true);
  const text = v.result.content[0].text;
  assert.match(text, /flows\/tip_split_test\.md: failed at step 2 "Add a 10% tip"/);
  assert.match(text, /people_test\.md: skipped/);
  assert.match(text, /\| \$33\.00 \| \$39\.00 \| ❌ \|/);
  assert.match(text, /\+export const share = \(t, n\) => t \/ n \+ 6;/, 'the culprit diff is in the report');
  const kaneArgs = JSON.parse(readFileSync(argsLog, 'utf8').trim());
  assert.deepEqual(kaneArgs.slice(0, 4), ['testmd', 'run', 'flows/tip_split_test.md', '--agent']);
  assert.ok(kaneArgs.includes('--no-adaptive-heal'));

  const lf = await c.call('tools/call', { name: 'last_failure', arguments: {} });
  assert.match(lf.result.content[0].text, /Kane caught a failure/);
  c.close();

  // the agent fixes the code; Kane now replays green
  writeFileSync(join(dir, 'app', 'split.js'), 'export const share = (t, n) => t / n;\n');
  c = client(dir, { FAKE_KANE_FIXTURE: join(here, 'fixtures', 'tip_split_pass.ndjson') });
  await c.call('initialize', {});
  const rr = await c.call('tools/call', { name: 'rerun_failed', arguments: {} });
  assert.equal(rr.result.isError, false);
  assert.match(rr.result.content[0].text, /kane-loop: passed/);
  assert.equal(existsSync(join(dir, '.kane', 'last-failure.md')), false, 'a green rerun clears the report');
  const again = await c.call('tools/call', { name: 'rerun_failed', arguments: {} });
  assert.match(again.result.content[0].text, /Nothing to rerun/);
  const bad = await c.call('tools/call', { name: 'verify_flow', arguments: {} });
  assert.equal(bad.result.isError, true);
  c.close();
});

test('CLI verify prints exactly one NDJSON summary on stdout', () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, 'app', 'split.js'), 'export const share = (t, n) => t / n + 6;\n');
  let out;
  try {
    execFileSync(process.execPath, [bin, 'verify'], { cwd: dir, env: { ...process.env, FAKE_KANE_FIXTURE: join(here, 'fixtures', 'tip_split_fail.ndjson') }, stdio: ['ignore', 'pipe', 'ignore'] });
    assert.fail('expected exit 1');
  } catch (err) {
    assert.equal(err.status, 1);
    out = err.stdout.toString().trim().split('\n');
  }
  assert.equal(out.length, 1);
  const s = JSON.parse(out[0]);
  assert.equal(s.type, 'kane_loop_summary');
  assert.equal(s.status, 'failed');
  assert.deepEqual(s.flows[0].expected_vs_seen, [{ check: "Each person's share shows \"$33.00\".", expected: '$33.00', seen: '$39.00' }]);
  assert.equal(s.last_failure, '.kane/last-failure.md');
});

test('a failed flow stays selected until it replays green, even after the diff is reverted', () => {
  const dir = scratchRepo();
  const run = (fixture) => {
    try {
      return JSON.parse(execFileSync(process.execPath, [bin, 'verify'], { cwd: dir, env: { ...process.env, FAKE_KANE_FIXTURE: join(here, 'fixtures', fixture) }, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    } catch (err) {
      return JSON.parse(err.stdout.toString());
    }
  };
  writeFileSync(join(dir, 'app', 'split.js'), 'export const share = (t, n) => t / n + 6;\n');
  assert.equal(run('tip_split_fail.ndjson').status, 'failed');
  execFileSync('git', ['checkout', 'app/split.js'], { cwd: dir });
  const s = run('tip_split_pass.ndjson');
  assert.equal(s.status, 'passed');
  assert.deepEqual(s.flows.map((f) => [f.flow, f.because]), [['flows/tip_split_test.md', ['failed last run']]]);
  assert.equal(run('tip_split_pass.ndjson').status, 'nothing_to_verify');
});
