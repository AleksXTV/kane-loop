// The loop: changed files -> affected flows -> headless Kane replay -> report.

import { join, basename } from 'node:path';
import { loadFlows, parseFlow } from './flows.js';
import { readFileSync, existsSync } from 'node:fs';
import { changedFiles, selectFlows, diffFor } from './diffmap.js';
import { ensureApp } from './app.js';
import { runKane, testmdArgs, objectiveArgs, summarizeTestmd, summarizeRun } from './kane.js';
import { recordedChecks, compareChecks } from './expect.js';
import { renderFailure, keepScreenshot, writeState, stateDir, readFailedFlows } from './report.js';
import { scrub } from './scrub.js';
import { writeFileSync } from 'node:fs';

// testmd runs copy the sealed pack into <repo>/.testmuai/evidence/; prefer that stable, relative path.
function projectEvidence(cfg, pack) {
  if (!pack) return null;
  const local = join('.testmuai', 'evidence', basename(pack));
  return existsSync(join(cfg.root, local)) ? local : pack;
}

const icon = { passed: '✓', failed: '✗', skipped: '–' };

function progress(log) {
  return (ev) => {
    if (ev.type === 'test_md_step_start') log(`    step ${ev.step_index} "${ev.heading}" ...`);
    else if (ev.type === 'test_md_step_end') log(`    step ${ev.step_index} ${icon[ev.status] || ev.status} ${ev.status} (${ev.duration_s}s)`);
    else if (ev.type === 'test_md_bug_verdict') log(`    Kane triage: ${ev.bug_title} (${ev.family}, ${ev.severity})`);
  };
}

export function plan(cfg, { base = 'HEAD', all = false, flowPaths = null } = {}) {
  const flows = loadFlows(cfg.root, cfg.flowsDir);
  if (flowPaths?.length) {
    const wanted = flowPaths.map((p) => p.replace(/^\.\//, ''));
    const selected = wanted.map((p) => ({ flow: flows.find((f) => f.path === p) || parseFlow(readFileSync(join(cfg.root, p), 'utf8'), p), because: ['requested'] }));
    return { changed: [], selected, skipped: flows.filter((f) => !wanted.includes(f.path)).map((flow) => ({ flow, reason: 'not requested' })) };
  }
  if (all) return { changed: [], selected: flows.map((flow) => ({ flow, because: ['--all'] })), skipped: [] };
  const p = selectFlows(flows, changedFiles(cfg.root, base), cfg.ignore);
  // A failure stays open until Kane replays that flow green, even if the diff no longer touches it.
  for (const path of readFailedFlows(cfg)) {
    const i = p.skipped.findIndex((s) => s.flow.path === path);
    if (i !== -1) p.selected.push({ flow: p.skipped.splice(i, 1)[0].flow, because: ['failed last run'] });
  }
  return p;
}

export async function verify(cfg, { base = 'HEAD', all = false, flowPaths = null, heal, author = false, log = () => {} } = {}) {
  const p = plan(cfg, { base, all, flowPaths });
  const summary = {
    type: 'kane_loop_summary',
    status: 'passed',
    base: flowPaths?.length || all ? null : base,
    changed: p.changed,
    flows: [],
    skipped: p.skipped.map((s) => ({ flow: s.flow.path, reason: s.reason })),
    credits: 0,
    last_failure: null,
    ts: new Date().toISOString(),
  };
  if (!p.selected.length) {
    summary.status = 'nothing_to_verify';
    writeState(cfg, { summary, failures: [] });
    return { summary, exitCode: 0 };
  }

  log(`kane-loop: ${p.selected.length} flow(s) to replay${p.changed.length ? ` for ${p.changed.length} changed file(s)` : ''}`);
  let app;
  try {
    app = await ensureApp(cfg.app, { cwd: cfg.root, log });
  } catch (err) {
    summary.status = 'error';
    summary.error = err.message;
    writeState(cfg, { summary, failures: [] });
    return { summary, exitCode: 2 };
  }

  const failures = [];
  try {
    for (const { flow, because } of p.selected) {
      log(`  ▶ ${flow.path}${!['requested', '--all', 'failed last run'].includes(because[0]) ? `  (changed: ${because.join(', ')})` : ''}`);
      const raw = await runKane(cfg.kane.bin, testmdArgs(flow.path, cfg.kane, { heal, author }), { cwd: cfg.root, onEvent: progress(log) });
      const r = summarizeTestmd(raw.events, raw.stderr, raw.exitCode);
      const entry = {
        flow: flow.path,
        status: r.status,
        exit: r.exitCode,
        because,
        duration_s: r.durationS,
        replayed: r.replayed,
        authored: r.authored,
        credits: r.credits,
        session_id: r.sessionId,
        evidence: projectEvidence(cfg, r.evidence),
      };
      if (r.shareUrl) entry.test_manager = r.shareUrl;
      r.evidence = entry.evidence;
      summary.credits += r.credits;
      if (r.status === 'not_started') entry.error = r.errors[0] || r.stderrTail || 'kane-cli did not start (exit 2)';
      if (r.failure) {
        const checks = compareChecks(recordedChecks(cfg.root, flow.outputDir, r.failure.stepIndex), r.failure.seen);
        const culprit = because.filter((b) => b !== flow.path && !['requested', '--all', 'failed last run'].includes(b));
        const shot = keepScreenshot(cfg, flow, r.failure.screenshot);
        entry.failed_step = { index: r.failure.stepIndex, heading: r.failure.heading, reason: r.failure.reason };
        entry.expected_vs_seen = checks.filter((c) => c.ok === false).map(({ check, expected, seen }) => ({ check, expected, seen }));
        if (r.failure.bug || r.failure.verdict) entry.kane_triage = r.failure.bug?.one_liner || r.failure.verdict?.one_liner;
        failures.push({
          flow: flow.path,
          markdown: renderFailure({ flow, result: r, checks, because: culprit, diff: diffFor(cfg.root, culprit, base), screenshot: shot }),
        });
      }
      log(`  ${icon[r.status] || '!'} ${flow.path}: ${r.status} in ${r.durationS ?? '?'}s (replayed ${r.replayed ?? 0}, authored ${r.authored ?? 0}, credits ${r.credits})`);
      summary.flows.push(entry);
    }
  } finally {
    app.stop();
  }

  summary.credits = Math.round(summary.credits * 100) / 100;
  const statuses = summary.flows.map((f) => f.status);
  summary.status = statuses.includes('failed') ? 'failed' : statuses.every((s) => s === 'passed') ? 'passed' : 'error';
  if (failures.length) summary.last_failure = `${cfg.stateDir || '.kane'}/last-failure.md`;
  writeState(cfg, { summary, failures });
  return { summary, exitCode: summary.status === 'passed' ? 0 : summary.status === 'failed' ? 1 : 2 };
}

/** One-off natural-language check (costs credits: nothing to replay). */
export async function verifyObjective(cfg, objective, { url, log = () => {} } = {}) {
  const app = await ensureApp(cfg.app, { cwd: cfg.root, log });
  try {
    log(`  ▶ kane-cli run "${objective.slice(0, 80)}${objective.length > 80 ? '…' : ''}"`);
    const raw = await runKane(cfg.kane.bin, objectiveArgs(objective, url || cfg.app?.url, cfg.kane), { cwd: cfg.root });
    const r = summarizeRun(raw.events, raw.stderr, raw.exitCode);
    const summary = { type: 'kane_loop_objective', objective, ...r, ts: new Date().toISOString() };
    if (r.status !== 'passed') {
      const md = [
        `# Kane: one-off objective ${r.status}`, '',
        '```text', objective, '```', '',
        `- Reason: ${r.reason ?? 'n/a'}`,
        r.failedAction ? `- Failed action: ${r.failedAction.kind}: ${r.failedAction.summary}` : null,
        r.summary ? `- Kane summary: ${r.summary}` : null,
        r.finalState ? `- Values Kane read: \`${JSON.stringify(r.finalState)}\`` : null,
        r.evidence ? `- Evidence pack: \`${r.evidence}\` (open with \`kane-cli evidence serve ${r.evidence}\`)` : null,
        r.testUrl ? `- Test Manager: ${r.testUrl}` : null,
        r.errors.length ? `- Errors: ${r.errors.join('; ')}` : null,
        '',
      ].filter((l) => l !== null).join('\n');
      writeFileSync(join(stateDir(cfg), 'last-failure.md'), scrub(md));
    }
    return { summary, exitCode: r.exitCode };
  } finally {
    app.stop();
  }
}
