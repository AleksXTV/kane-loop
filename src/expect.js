// Expected vs seen. When Kane authors a step it records each check it made: what it read
// (an `analyze` action with a key) and the value it expected. On replay the same keys come
// back in run_end.variables_out with the value seen on the page now. Joining the two gives
// a precise "expected $33.00, saw $39.00" without asking any model.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function recordedChecks(root, outputDir, stepIndex) {
  const stepsDir = join(root, outputDir, '.internal', 'steps');
  if (!existsSync(stepsDir)) return [];
  const dir = readdirSync(stepsDir).find((d) => d.startsWith(`${stepIndex}-`));
  if (!dir) return [];
  const checks = [];
  const flowsDir = join(stepsDir, dir, 'flows');
  for (const flow of existsSync(flowsDir) ? readdirSync(flowsDir) : []) {
    const file = join(flowsDir, flow, 'actions.ndjson');
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let a;
      try { a = JSON.parse(line); } catch { continue; }
      const p = a.action_params || {};
      if (a.action_type === 'analyze' && p.key) checks.push({ key: p.key, check: p.condition || p.query || a.intent, expected: p.expected_value ?? null });
    }
  }
  return checks;
}

const norm = (v) => (v == null ? v : String(v).trim());

export function compareChecks(checks, seen = {}) {
  return checks.map((c) => {
    const got = seen[c.key];
    const ok = c.expected == null || got == null ? null : norm(got) === norm(c.expected) || (c.expected === 'true' && got === 'true');
    return { ...c, seen: got ?? null, ok };
  });
}
