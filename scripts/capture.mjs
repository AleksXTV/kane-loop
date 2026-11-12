#!/usr/bin/env node
// Run real commands and record their output with timings, for the demo video.
// Output is scrubbed of the Kane credentials before it is written.
//   node scripts/capture.mjs demo/transcript-1.json "caption::command" ...
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { scrub } from '../src/scrub.js';

const [out, ...scenes] = process.argv.slice(2);
const result = [];
for (const spec of scenes) {
  const [caption, cmd] = spec.split('::');
  const t0 = Date.now();
  const lines = [];
  process.stderr.write(`\n$ ${cmd}\n`);
  const code = await new Promise((resolve) => {
    const child = spawn('bash', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } });
    const onData = (stream) => (chunk) => {
      for (const l of scrub(chunk.toString()).split('\n')) {
        if (l === '') continue;
        lines.push([Date.now() - t0, stream, l]);
        process.stderr.write(l + '\n');
      }
    };
    child.stdout.on('data', onData('out'));
    child.stderr.on('data', onData('err'));
    child.on('close', resolve);
  });
  result.push({ caption, cmd, code, ms: Date.now() - t0, lines, at: new Date(t0).toISOString() });
}
writeFileSync(out, JSON.stringify(result, null, 1));
