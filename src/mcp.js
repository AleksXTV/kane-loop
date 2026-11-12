// MCP server over stdio (newline-delimited JSON-RPC 2.0), no SDK needed.
// stdout carries protocol messages only; every log line goes to stderr.

import { createInterface } from 'node:readline';
import { verify, verifyObjective, plan } from './verify.js';
import { readLastFailure, readFailedFlows } from './report.js';
import { scrub } from './scrub.js';

const VERSION = '0.1.0';

export const TOOLS = [
  {
    name: 'verify_changed',
    description:
      'Replay, in a real headless Chrome via Kane CLI, every saved _test.md flow affected by the current git diff (working tree vs base). Use after editing app code and before saying the task is done. Replays of recorded steps cost 0 Kane credits. On failure, read the returned report (also saved to .kane/last-failure.md), fix the code, then call rerun_failed.',
    inputSchema: { type: 'object', properties: { base: { type: 'string', description: 'git ref to diff against (default HEAD)' } }, additionalProperties: false },
  },
  {
    name: 'verify_flow',
    description:
      'Verify one thing in a real browser. Either `testmd`: path of a saved *_test.md flow to replay (cheap), or `objective`: a plain-English check such as "Go to http://localhost:4173 and verify ..." that Kane runs once (costs credits; end it with a verify/assert). Returns pass/fail with Kane\'s evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        testmd: { type: 'string', description: 'path to a *_test.md flow, relative to the repo root' },
        objective: { type: 'string', description: 'natural-language objective for a one-off kane-cli run' },
        url: { type: 'string', description: 'start URL for an objective (default: the configured app URL)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'last_failure',
    description: 'Return .kane/last-failure.md: failing flow and step, expected vs seen values, Kane triage, the diff that triggered it, screenshot and evidence pack paths.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'rerun_failed',
    description: 'Replay only the flows that failed in the last kane-loop run. Use after fixing the code to prove the fix.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_flows',
    description: 'List saved Kane flows and which ones the current git diff would replay (no browser, no credits).',
    inputSchema: { type: 'object', properties: { base: { type: 'string' } }, additionalProperties: false },
  },
];

function describe({ summary }, cfg) {
  const lines = [`kane-loop: ${summary.status}` + (summary.credits != null ? ` (credits used: ${summary.credits})` : '')];
  for (const f of summary.flows || []) {
    lines.push(`- ${f.flow}: ${f.status}${f.failed_step ? ` at step ${f.failed_step.index} "${f.failed_step.heading}"` : ''}${f.error ? ` (${f.error})` : ''}${f.session_id ? ` [Kane session ${f.session_id}]` : ''}`);
  }
  for (const s of summary.skipped || []) lines.push(`- ${s.flow}: skipped (${s.reason})`);
  if (summary.status === 'nothing_to_verify') lines.push('No saved flow covers the changed files.');
  const report = summary.status !== 'passed' ? readLastFailure(cfg) : null;
  if (report) lines.push('', report);
  return lines.join('\n');
}

export async function callTool(cfg, name, args = {}) {
  const log = (m) => process.stderr.write(scrub(m) + '\n');
  switch (name) {
    case 'verify_changed': {
      const res = await verify(cfg, { base: args.base || 'HEAD', log });
      return { text: describe(res, cfg), data: res.summary, isError: res.exitCode !== 0 };
    }
    case 'verify_flow': {
      if (args.testmd) {
        const res = await verify(cfg, { flowPaths: [args.testmd], log });
        return { text: describe(res, cfg), data: res.summary, isError: res.exitCode !== 0 };
      }
      if (args.objective) {
        const res = await verifyObjective(cfg, args.objective, { url: args.url, log });
        const s = res.summary;
        const text = [`Kane: ${s.status} in ${s.durationS ?? '?'}s, credits ${s.credits}`, s.summary, s.reason && `reason: ${s.reason}`, s.testUrl && `Test Manager: ${s.testUrl}`, s.evidence && `evidence: ${s.evidence}`]
          .filter(Boolean).join('\n');
        return { text, data: s, isError: res.exitCode !== 0 };
      }
      return { text: 'verify_flow needs `testmd` or `objective`', isError: true };
    }
    case 'last_failure': {
      const md = readLastFailure(cfg);
      return { text: md || 'No failure recorded: the last kane-loop run passed (or nothing has run yet).', isError: false };
    }
    case 'rerun_failed': {
      const failed = readFailedFlows(cfg);
      if (!failed.length) return { text: 'Nothing to rerun: no failed flows recorded.', isError: false };
      const res = await verify(cfg, { flowPaths: failed, log });
      return { text: describe(res, cfg), data: res.summary, isError: res.exitCode !== 0 };
    }
    case 'list_flows': {
      const p = plan(cfg, { base: args.base || 'HEAD' });
      const text = [
        `changed: ${p.changed.join(', ') || '(none)'}`,
        ...p.selected.map((s) => `- ${s.flow.path}: WOULD REPLAY (covers ${s.because.join(', ')})`),
        ...p.skipped.map((s) => `- ${s.flow.path}: skip (${s.reason})`),
      ].join('\n');
      return { text, data: { changed: p.changed, selected: p.selected.map((s) => s.flow.path), skipped: p.skipped.map((s) => s.flow.path) }, isError: false };
    }
    default:
      throw Object.assign(new Error(`unknown tool: ${name}`), { code: -32602 });
  }
}

export function serve(cfg, { input = process.stdin, output = process.stdout } = {}) {
  const send = (msg) => output.write(JSON.stringify(msg) + '\n');
  let queue = Promise.resolve(); // one Kane run at a time

  const handle = async (msg) => {
    const { id, method, params } = msg;
    if (id === undefined) return; // notifications (initialized, cancelled) need no answer
    try {
      if (method === 'initialize') {
        return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'kane-loop', version: VERSION } } });
      }
      if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
      if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      if (method === 'tools/call') {
        const run = queue.then(() => callTool(cfg, params?.name, params?.arguments || {}));
        queue = run.catch(() => {});
        const r = await run;
        const result = { content: [{ type: 'text', text: scrub(r.text) }], isError: !!r.isError };
        if (r.data) result.structuredContent = JSON.parse(scrub(JSON.stringify(r.data)));
        return send({ jsonrpc: '2.0', id, result });
      }
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
    } catch (err) {
      if (method === 'tools/call' && err.code !== -32602) {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: scrub(`kane-loop error: ${err.message}`) }], isError: true } });
      }
      send({ jsonrpc: '2.0', id, error: { code: err.code || -32603, message: scrub(err.message) } });
    }
  };

  const rl = createInterface({ input });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
    handle(msg);
  });
  return rl;
}
