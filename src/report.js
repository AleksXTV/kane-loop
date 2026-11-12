// .kane/last-failure.md is the hand-off file: written for a coding agent (or a human)
// that has to fix the code next. It says what broke, where, what Kane expected and saw,
// what Kane's own triage concluded, which part of the diff is the likely culprit, and
// where the evidence is.

import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { scrub } from './scrub.js';

const cell = (v) => (v == null ? '–' : String(v).replace(/\|/g, '\\|').replace(/\n/g, ' '));

export function renderFailure({ flow, result, checks = [], because = [], diff = '', screenshot = null, rerun = 'kane-loop rerun-failed' }) {
  const f = result.failure || {};
  const out = [];
  out.push(`# Kane caught a failure in \`${flow.path}\``, '');
  out.push(`- **Failing step:** ${f.stepIndex ?? '?'} of ${flow.steps.length}: "${f.heading ?? 'unknown'}"`);
  if (f.reason) out.push(`- **Kane reason:** \`${f.reason}\`${f.failedAction ? ` (failed action: ${f.failedAction.summary})` : ''}`);
  if (f.finalUrl) out.push(`- **Page:** ${f.finalUrl}`);
  out.push(`- **Run:** session \`${result.sessionId ?? 'n/a'}\`, ${result.durationS ?? '?'}s, ${result.replayed ?? 0} steps replayed / ${result.authored ?? 0} authored, credits ${result.credits}`);
  out.push('');

  if (f.objective) out.push('## What the step asks', '', '```text', f.objective.trim(), '```', '');

  const bad = checks.filter((c) => c.ok === false);
  if (checks.length) {
    out.push('## Expected vs seen', '', '| Check | Expected | Seen on the page | |', '|---|---|---|---|');
    for (const c of checks) out.push(`| ${cell(c.check)} | ${cell(c.expected)} | ${cell(c.seen)} | ${c.ok === false ? '❌' : c.ok ? '✓' : '?'} |`);
    out.push('');
  } else if (f.assertions?.length) {
    out.push('## Assertions', '');
    for (const a of f.assertions) out.push(`- ${a.passed ? '✓' : '❌'} ${a.detail}`);
    out.push('');
  }

  const v = f.verdict;
  if (v || f.bug) {
    out.push(`## Kane's triage${v ? ` (${v.family}/${v.category}, severity ${v.severity}, confidence ${v.confidence})` : ''}`, '');
    const title = f.bug?.bug_title || v?.bug_title;
    if (title) out.push(`**${title}**`, '');
    if (f.bug?.one_liner || v?.one_liner) out.push(f.bug?.one_liner || v.one_liner, '');
    if (v?.root_cause) out.push(`- Root cause: ${v.root_cause}`);
    if (v?.suggestion) out.push(`- Suggested fix: ${v.suggestion}`);
    if (v?.signals?.length) out.push(`- Signal: ${v.signals.map((s) => `"${s.excerpt}"`).join(', ')}`);
    out.push('');
  }

  if (because.length || diff) {
    out.push('## Likely culprit: the change that triggered this replay', '');
    if (because.length) out.push(`Changed files covered by this flow: ${because.map((b) => `\`${b}\``).join(', ')}`, '');
    if (diff) out.push('```diff', diff, '```', '');
  }

  out.push('## Evidence', '');
  if (screenshot) out.push(`- Screenshot at the failing step: \`${screenshot}\``);
  if (result.evidence) out.push(`- Evidence pack (screenshots, console, network, failure record): \`${result.evidence}\`  \n  open it with \`kane-cli evidence serve ${result.evidence}\``);
  if (result.shareUrl) out.push(`- Test Manager: ${result.shareUrl}`);
  out.push('');

  out.push('## Next', '');
  out.push(
    bad.length || v?.family === 'application_issue'
      ? '1. Fix the application code (the recorded flow describes the intended behaviour; do not edit the `_test.md` to make it pass unless the requirement really changed).'
      : '1. Decide whether the app is broken or the flow is out of date (a selector or text change). Fix the app, or update only the affected step.',
    `2. Re-run: \`${rerun}\` (MCP: \`rerun_failed\`). Replays of unchanged steps cost 0 credits.`,
    '',
  );
  return scrub(out.join('\n'));
}

export function stateDir(cfg) {
  const dir = join(cfg.root, cfg.stateDir || '.kane');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Copy Kane's own screenshot of the failing step next to the report (relative path for the md). */
export function keepScreenshot(cfg, flow, src) {
  if (!src || !existsSync(src)) return null;
  const name = `failure-${flow.stem}${extname(src) || '.png'}`;
  copyFileSync(src, join(stateDir(cfg), name));
  return `${cfg.stateDir || '.kane'}/${name}`;
}

export function writeState(cfg, { summary, failures }) {
  const dir = stateDir(cfg);
  writeFileSync(join(dir, 'last-run.json'), scrub(JSON.stringify(summary, null, 2)) + '\n');
  writeFileSync(join(dir, 'failed.json'), JSON.stringify(failures.map((f) => f.flow), null, 2) + '\n');
  const md = join(dir, 'last-failure.md');
  if (failures.length) writeFileSync(md, failures.map((f) => f.markdown).join('\n---\n\n'));
  else if (existsSync(md)) rmSync(md);
}

export function readLastFailure(cfg) {
  const md = join(cfg.root, cfg.stateDir || '.kane', 'last-failure.md');
  return existsSync(md) ? readFileSync(md, 'utf8') : null;
}

export function readFailedFlows(cfg) {
  const p = join(cfg.root, cfg.stateDir || '.kane', 'failed.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}
