#!/usr/bin/env node
// Minimal MCP client: start `kane-loop mcp`, initialize, call one tool, print the result.
// It sends the same JSON-RPC an MCP host (Cursor, Claude Code, Codex) sends.
//   node scripts/mcp-call.mjs verify_changed
//   node scripts/mcp-call.mjs verify_flow '{"testmd":"flows/tip_split_test.md"}'
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const [tool, json = '{}'] = process.argv.slice(2);
if (!tool) { console.error('usage: mcp-call.mjs <tool> [json-args]'); process.exit(2); }
const server = spawn(process.execPath, [fileURLToPath(new URL('../bin/kane-loop.js', import.meta.url)), 'mcp'], { stdio: ['pipe', 'pipe', 'inherit'] });
const waiting = new Map();
createInterface({ input: server.stdout }).on('line', (l) => { const m = JSON.parse(l); waiting.get(m.id)?.(m); });
let n = 0;
const rpc = (method, params) => new Promise((res) => { const id = ++n; waiting.set(id, res); server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });

await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-call', version: '0.1.0' } });
server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
console.error(`→ tools/call ${tool} ${json}`);
const res = await rpc('tools/call', { name: tool, arguments: JSON.parse(json) });
if (res.error) { console.error(res.error.message); process.exit(2); }
console.log(res.result.content.map((c) => c.text).join('\n'));
console.error(`← isError: ${res.result.isError}`);
server.kill();
process.exit(res.result.isError ? 1 : 0);
