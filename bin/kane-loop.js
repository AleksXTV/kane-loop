#!/usr/bin/env node
// kane-loop: an agent-agnostic verification loop around Kane CLI.
// Human-readable progress goes to stderr; stdout gets exactly one NDJSON summary per run.

import { findRoot, loadConfig } from '../src/config.js';
import { verify, verifyObjective, plan } from '../src/verify.js';
import { watch } from '../src/watch.js';
import { serve } from '../src/mcp.js';
import { readLastFailure, readFailedFlows } from '../src/report.js';
import { scrub } from '../src/scrub.js';

const HELP = `kane-loop: replay the Kane flows your change can break, and hand failures to your coding agent.

Usage:
  kane-loop verify [--base <ref>] [--all] [--flow <path>]... [--heal] [--author]
                         replay affected _test.md flows headless (default: diff vs HEAD)
                         --heal: let Kane re-author a step whose replay misses (credits)
                         --author: re-record every step, e.g. on a new account (credits)
  kane-loop watch [--base <ref>]   re-verify on every save
  kane-loop rerun-failed           replay only the flows that failed last time
  kane-loop last-failure           print .kane/last-failure.md
  kane-loop flows [--base <ref>]   show which flows the diff selects (no browser)
  kane-loop check "<objective>" [--url <url>]
                         one-off kane-cli run (costs credits)
  kane-loop mcp                    MCP server on stdio (verify_changed, verify_flow,
                                   last_failure, rerun_failed, list_flows)

Exit codes: 0 passed / nothing to verify, 1 a flow failed, 2 Kane or the app did not start.
Auth: LT_USERNAME + LT_ACCESS_KEY from the environment (CI style), else your kane-cli login.`;

function parse(argv) {
  const opts = { _: [], flow: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' || a === '--url') opts[a.slice(2)] = argv[++i];
    else if (a === '--flow') opts.flow.push(argv[++i]);
    else if (a === '--all' || a === '--heal' || a === '--author') opts[a.slice(2)] = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else opts._.push(a);
  }
  return opts;
}

const log = (m) => process.stderr.write(scrub(m) + '\n');
const emit = (obj) => process.stdout.write(scrub(JSON.stringify(obj)) + '\n');

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = parse(rest);
  if (!cmd || opts.help || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(HELP); return 0; }
  const cfg = loadConfig(findRoot());

  switch (cmd) {
    case 'verify': {
      const flowPaths = [...opts.flow, ...opts._.filter((p) => p.endsWith('_test.md'))];
      const { summary, exitCode } = await verify(cfg, { base: opts.base || 'HEAD', all: opts.all, flowPaths, heal: opts.heal || undefined, author: opts.author, log });
      if (summary.status === 'nothing_to_verify') log('kane-loop: no saved flow covers the changed files; nothing to replay');
      if (summary.last_failure) log(`kane-loop: wrote ${summary.last_failure}`);
      emit(summary);
      return exitCode;
    }
    case 'rerun-failed': {
      const failed = readFailedFlows(cfg);
      if (!failed.length) { log('kane-loop: no failed flows recorded'); emit({ type: 'kane_loop_summary', status: 'nothing_to_verify', flows: [] }); return 0; }
      const { summary, exitCode } = await verify(cfg, { flowPaths: failed, heal: opts.heal || undefined, log });
      emit(summary);
      return exitCode;
    }
    case 'last-failure': {
      const md = readLastFailure(cfg);
      console.log(md || 'No failure recorded: the last kane-loop run passed (or nothing has run yet).');
      return 0;
    }
    case 'flows': {
      const p = plan(cfg, { base: opts.base || 'HEAD', all: opts.all });
      log(`changed: ${p.changed.join(', ') || '(none)'}`);
      for (const s of p.selected) log(`  REPLAY ${s.flow.path}  <- ${s.because.join(', ')}`);
      for (const s of p.skipped) log(`  skip   ${s.flow.path}  (${s.reason})`);
      emit({ type: 'kane_loop_plan', changed: p.changed, selected: p.selected.map((s) => s.flow.path), skipped: p.skipped.map((s) => s.flow.path) });
      return 0;
    }
    case 'check': {
      const objective = opts._.join(' ');
      if (!objective) { log('usage: kane-loop check "<objective>" [--url <url>]'); return 2; }
      const { summary, exitCode } = await verifyObjective(cfg, objective, { url: opts.url, log });
      emit(summary);
      return exitCode;
    }
    case 'watch':
      watch(cfg, { base: opts.base || 'HEAD', log, onSummary: emit });
      return new Promise(() => {}); // until Ctrl-C
    case 'mcp':
      serve(cfg);
      return new Promise(() => {});
    default:
      log(`unknown command: ${cmd}\n\n${HELP}`);
      return 2;
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

main().then((code) => process.exit(code), (err) => { log(`kane-loop: ${err.stack || err.message}`); process.exit(2); });
