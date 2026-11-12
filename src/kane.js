// Run kane-cli headless in agent mode and turn its NDJSON stream into one result object.

import { spawn } from 'node:child_process';
import { scrub, redactArgs } from './scrub.js';

function authArgs() {
  const { LT_USERNAME, LT_ACCESS_KEY } = process.env;
  // CI-style basic auth when both are set; otherwise kane-cli uses the stored `kane-cli login` profile.
  return LT_USERNAME && LT_ACCESS_KEY ? ['--username', LT_USERNAME, '--access-key', LT_ACCESS_KEY] : [];
}

export function testmdArgs(flowPath, kane, { heal } = {}) {
  const args = ['testmd', 'run', flowPath, '--agent'];
  if (kane.headless) args.push('--headless');
  if (!(heal ?? kane.adaptiveHeal)) args.push('--no-adaptive-heal');
  if (kane.timeoutS) args.push('--timeout', String(kane.timeoutS));
  return [...args, ...(kane.extraArgs || []), ...authArgs()];
}

export function objectiveArgs(objective, url, kane) {
  const args = ['run', objective, '--agent'];
  if (kane.headless) args.push('--headless');
  if (url) args.push('--url', url);
  args.push('--max-steps', String(kane.maxSteps || 20));
  if (kane.timeoutS) args.push('--timeout', String(kane.timeoutS));
  return [...args, ...(kane.extraArgs || []), ...authArgs()];
}

/** Spawn kane-cli; resolve with { exitCode, events, stderr, command }. Output is scrubbed as it arrives. */
export function runKane(bin, args, { cwd, onEvent = () => {}, onStderr = () => {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, KANE_CLI_USER_AGENT: process.env.KANE_CLI_USER_AGENT || 'kane-loop' },
      stdio: ['ignore', 'pipe', 'pipe'], // stdin not a TTY -> kane-cli never waits for input
    });
    const events = [];
    let buf = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = scrub(buf.slice(0, nl).trim());
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          events.push(ev);
          onEvent(ev);
        } catch {
          /* non-JSON noise */
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      const text = scrub(chunk.toString());
      stderr += text;
      onStderr(text);
    });
    child.on('error', (err) => resolve({ exitCode: 2, events, stderr: stderr + `\nspawn failed: ${err.message}`, command: [bin, ...redactArgs(args)] }));
    child.on('close', (code) => resolve({ exitCode: code ?? 3, events, stderr, command: [bin, ...redactArgs(args)] }));
  });
}

const evidenceFrom = (stderr, events) =>
  /kane-cli evidence serve (\S+?\.evidence)/.exec(stderr)?.[1] || events.find((e) => e.type === 'coverage' && e.pack)?.pack || null;

const creditsOf = (events) =>
  Math.round(events.filter((e) => e.type === 'run_end').reduce((s, e) => s + (e.credits_consumed || 0) + (e.verdict?.credits_consumed || 0), 0) * 100) / 100;

const varsOf = (runEnd) => Object.fromEntries(Object.entries(runEnd?.variables_out || {}).map(([k, v]) => [k, v?.value]));

/** Summarise a `kane-cli testmd run --agent` stream. */
export function summarizeTestmd(events, stderr = '', exitCode = 0) {
  const steps = [];
  let cur = null;
  for (const ev of events) {
    if (ev.type === 'test_md_step_start') {
      cur = { index: ev.step_index, heading: ev.heading, objective: null, status: 'running', runEnd: null, lastFailedAction: null, assertions: [], bug: null };
      steps.push(cur);
    } else if (!cur) continue;
    else if (ev.type === 'run_start') cur.objective = ev.objective;
    else if (ev.type === 'step_end' && ev.status === 'failed') cur.lastFailedAction = { kind: ev.kind, summary: ev.summary, ordinal: ev.ordinal };
    else if (ev.type === 'step_event' && ev.event === 'assertion') cur.assertions.push({ detail: ev.detail, passed: ev.passed });
    else if (ev.type === 'run_end') cur.runEnd = ev;
    else if (ev.type === 'test_md_bug_verdict') cur.bug = ev;
    else if (ev.type === 'test_md_step_end') {
      cur.status = ev.status;
      cur.duration_s = ev.duration_s;
    }
  }
  const done = events.find((e) => e.type === 'test_md_done');
  const summary = events.find((e) => e.type === 'test_md_summary');
  const failed = steps.find((s) => s.status === 'failed');
  const status = done?.overall_status || (exitCode === 0 ? 'passed' : exitCode === 1 ? 'failed' : 'not_started');
  const errors = events.filter((e) => e.type === 'error').map((e) => e.message || e.code || JSON.stringify(e));

  return {
    status: exitCode === 2 && !done ? 'not_started' : status,
    exitCode,
    durationS: done?.duration_s ?? summary?.duration_s ?? null,
    sessionId: done?.session_id || null,
    shareUrl: done?.share_url || summary?.share_url || null,
    replayed: summary?.steps?.replay_decisions ?? null,
    authored: summary?.steps?.author_decisions ?? null,
    healed: summary?.adaptive_heal?.triggered ?? false,
    testcaseId: summary?.commit?.testcase_id || null,
    credits: creditsOf(events),
    evidence: evidenceFrom(stderr, events),
    steps: steps.map((s) => ({ index: s.index, heading: s.heading, status: s.status, duration_s: s.duration_s })),
    failure: failed
      ? {
          stepIndex: failed.index,
          heading: failed.heading,
          objective: failed.objective,
          reason: failed.runEnd?.reason || null,
          failedAction: failed.lastFailedAction,
          assertions: failed.assertions,
          seen: varsOf(failed.runEnd),
          finalUrl: failed.runEnd?.final_url || null,
          screenshot: failed.runEnd?.screenshot_path || null,
          verdict: failed.runEnd?.verdict || null,
          bug: failed.bug || null,
        }
      : null,
    errors,
    stderrTail: exitCode === 0 ? '' : stderr.split('\n').filter(Boolean).slice(-8).join('\n'),
  };
}

/** Summarise a one-off `kane-cli run --agent` stream. */
export function summarizeRun(events, stderr = '', exitCode = 0) {
  const end = [...events].reverse().find((e) => e.type === 'run_end');
  const failedAction = [...events].reverse().find((e) => e.type === 'step_end' && e.status === 'failed');
  return {
    status: end?.status || (exitCode === 2 ? 'not_started' : exitCode === 3 ? 'timeout' : 'failed'),
    exitCode,
    summary: end?.summary || null,
    oneLiner: end?.one_liner || null,
    reason: end?.reason || null,
    durationS: end?.duration ?? null,
    credits: creditsOf(events),
    finalState: end?.final_state || null,
    testUrl: end?.test_url || null,
    sessionDir: end?.session_dir || null,
    evidence: evidenceFrom(stderr, events),
    failedAction: failedAction ? { kind: failedAction.kind, summary: failedAction.summary } : null,
    errors: events.filter((e) => e.type === 'error').map((e) => e.message || e.code || JSON.stringify(e)),
    stderrTail: exitCode === 0 ? '' : stderr.split('\n').filter(Boolean).slice(-8).join('\n'),
  };
}
