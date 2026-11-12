#!/usr/bin/env node
// Stand-in for kane-cli in tests: replays a real, scrubbed NDJSON capture.
import { readFileSync, appendFileSync } from 'node:fs';
const fixture = process.env.FAKE_KANE_FIXTURE;
if (process.env.FAKE_KANE_ARGS_LOG) appendFileSync(process.env.FAKE_KANE_ARGS_LOG, JSON.stringify(process.argv.slice(2)) + '\n');
const lines = readFileSync(fixture, 'utf8').split('\n').filter(Boolean);
for (const l of lines) process.stdout.write(l + '\n');
const done = lines.map((l) => JSON.parse(l)).find((e) => e.type === 'test_md_done');
process.stderr.write('evidence: view locally with `kane-cli evidence serve /tmp/fake/evidence/abc.evidence`\n');
process.exit(done?.overall_status === 'passed' ? 0 : 1);
