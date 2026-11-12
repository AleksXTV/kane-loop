import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseFlow } from '../src/flows.js';
import { matches, selectFlows } from '../src/diffmap.js';
import { summarizeTestmd, testmdArgs } from '../src/kane.js';
import { recordedChecks, compareChecks } from '../src/expect.js';
import { renderFailure } from '../src/report.js';
import { scrub, redactArgs } from '../src/scrub.js';

const here = dirname(fileURLToPath(import.meta.url));
const events = (name) => readFileSync(join(here, 'fixtures', name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const TIP_FLOW = readFileSync(join(here, '..', 'flows', 'tip_split_test.md'), 'utf8');

test('parseFlow reads covers from the preamble and the H2 steps', () => {
  const f = parseFlow(TIP_FLOW, 'flows/tip_split_test.md');
  assert.equal(f.stem, 'tip_split');
  assert.equal(f.outputDir, 'flows/output-tip_split');
  assert.deepEqual(f.tags, ['split', 'tip']);
  assert.ok(f.covers.includes('demo-app/public/split.js'));
  assert.deepEqual(f.steps.map((s) => s.heading), ['Add a dinner paid by Ana', 'Add a 10% tip', 'Check the settle-up']);
  assert.match(f.steps[1].body, /Each person's share shows "\$33\.00"/);
});

test('parseFlow skips yaml step blocks', () => {
  const f = parseFlow('---\nurl: x\n---\n## One\n```yaml\ntimeout: 5\n```\nDo it.\n## Two\nVerify it.\n');
  assert.equal(f.steps.length, 2);
  assert.equal(f.steps[0].body, 'Do it.');
});

test('glob matching', () => {
  assert.ok(matches('src/cart/total.ts', 'src/cart/**'));
  assert.ok(matches('src/cart/total.ts', 'src/cart'));
  assert.ok(matches('src/a/b/c.css', '**/*.css'));
  assert.ok(matches('docs/README.md', '*.md'));
  assert.ok(!matches('src/cartography.ts', 'src/cart'));
  assert.ok(!matches('src/cart/x.ts', 'src/*.ts'));
});

test('selectFlows maps a diff to the flows that cover it', () => {
  const tip = parseFlow(TIP_FLOW, 'flows/tip_split_test.md');
  const people = parseFlow('<!-- kane-loop covers: demo-app/public/index.html -->\n## A\nVerify.', 'flows/add_people_test.md');
  const open = parseFlow('## A\nVerify.', 'flows/anything_test.md'); // no covers -> any change
  const r = selectFlows([tip, people, open], ['demo-app/public/split.js', 'flows/output-tip_split/Result.md', 'README.md'], ['*.md']);
  assert.deepEqual(r.selected.map((s) => s.flow.path), ['flows/tip_split_test.md', 'flows/anything_test.md']);
  assert.deepEqual(r.selected[0].because, ['demo-app/public/split.js']);
  assert.deepEqual(r.skipped.map((s) => s.flow.path), ['flows/add_people_test.md']);
  // Kane's own artifacts never trigger a replay
  assert.equal(selectFlows([open], ['flows/output-x/Result.md', '.kane/last-run.json']).selected.length, 0);
  // editing a flow replays that flow
  assert.deepEqual(selectFlows([tip, people], ['flows/add_people_test.md']).selected.map((s) => s.flow.path), ['flows/add_people_test.md']);
});

test('summarizeTestmd on a real failing replay (captured from kane-cli 0.10.3)', () => {
  const r = summarizeTestmd(events('tip_split_fail.ndjson'), 'evidence: view locally with `kane-cli evidence serve /x/y.evidence`', 1);
  assert.equal(r.status, 'failed');
  assert.equal(r.replayed, 3);
  assert.equal(r.authored, 0);
  assert.deepEqual(r.steps.map((s) => s.status), ['passed', 'failed']);
  assert.equal(r.failure.stepIndex, 2);
  assert.equal(r.failure.heading, 'Add a 10% tip');
  assert.equal(r.failure.reason, 'assertion_failed: @ step 4');
  assert.equal(r.failure.seen.each_person_share_value_check, '$39.00');
  assert.equal(r.failure.verdict.family, 'application_issue');
  assert.match(r.failure.bug.one_liner, /\$39\.00 each instead of \$33\.00/);
  assert.equal(r.evidence, '/x/y.evidence');
  assert.ok(r.credits > 0 && r.credits < 10, 'only the triage costs credits on a replay');
});

test('summarizeTestmd on a real green replay costs 0 credits', () => {
  const r = summarizeTestmd(events('tip_split_pass.ndjson'), '', 0);
  assert.equal(r.status, 'passed');
  assert.equal(r.failure, null);
  assert.equal(r.credits, 0);
  assert.equal(r.replayed, 3);
});

test('summarizeTestmd reports a run that never started', () => {
  const r = summarizeTestmd([{ type: 'error', message: 'not authenticated' }], 'Error: not authenticated', 2);
  assert.equal(r.status, 'not_started');
  assert.deepEqual(r.errors, ['not authenticated']);
});

test('expected vs seen joins recorded checks with replayed values', () => {
  const checks = recordedChecks(join(here, 'fixtures'), 'output-tip_split', 2);
  assert.deepEqual(checks.map((c) => c.expected), ['$99.00', '$33.00']);
  const cmp = compareChecks(checks, { total_value_check: '$99.00', each_person_share_value_check: '$39.00' });
  assert.deepEqual(cmp.map((c) => c.ok), [true, false]);
  assert.equal(cmp[1].seen, '$39.00');
});

test('renderFailure produces an actionable report', () => {
  const flow = parseFlow(TIP_FLOW, 'flows/tip_split_test.md');
  const result = summarizeTestmd(events('tip_split_fail.ndjson'), '', 1);
  const checks = compareChecks(recordedChecks(join(here, 'fixtures'), 'output-tip_split', 2), result.failure.seen);
  const md = renderFailure({ flow, result, checks, because: ['demo-app/public/split.js'], diff: '-a\n+b', screenshot: '.kane/failure-tip_split.png' });
  assert.match(md, /Failing step:\*\* 2 of 3: "Add a 10% tip"/);
  assert.match(md, /\| \$33\.00 \| \$39\.00 \| ❌ \|/);
  assert.match(md, /Per-person share ignores three-person split/);
  assert.match(md, /```diff\n-a\n\+b\n```/);
  assert.match(md, /Fix the application code/);
});

test('credentials never leak into args shown or text written', () => {
  process.env.LT_USERNAME = 'someone@example.com';
  process.env.LT_ACCESS_KEY = 'LT_secret_key_123';
  const args = testmdArgs('flows/a_test.md', { headless: true, adaptiveHeal: false, timeoutS: 60 });
  assert.ok(args.includes('--no-adaptive-heal') && args.includes('--headless') && args.includes('--agent'));
  const shown = redactArgs(args).join(' ');
  assert.ok(!shown.includes('someone@example.com') && !shown.includes('LT_secret_key_123'));
  assert.equal(scrub('user someone@example.com key LT_secret_key_123'), 'user <redacted> key <redacted>');
  delete process.env.LT_USERNAME;
  delete process.env.LT_ACCESS_KEY;
});
