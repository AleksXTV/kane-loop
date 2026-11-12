// Discover and parse Kane `_test.md` flows.
//
// kane-cli rejects unknown frontmatter keys, so kane-loop keeps its own metadata in
// an HTML comment before the first `## ` heading. kane-cli ignores everything before
// the first step, so the comment never changes a step hash or forces a re-author:
//
//   <!-- kane-loop covers: src/cart/** src/pages/checkout.tsx -->

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.kane', '.testmuai']);

export function listFlowFiles(root, flowsDir = '.') {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name.startsWith('output-') || name.startsWith('helper-output-')) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('_test.md')) out.push(relative(root, p).split('\\').join('/'));
    }
  };
  walk(join(root, flowsDir));
  return out.sort();
}

export function parseFlow(text, path = 'flow_test.md') {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const front = {};
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = /^([a-z_]+):\s*(.*)$/.exec(line);
      if (m) front[m[1]] = m[2].trim();
    }
  }
  const tags = front.tags ? front.tags.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [];

  const firstStep = text.search(/^## /m);
  const preamble = firstStep === -1 ? text : text.slice(0, firstStep);
  const covers = [];
  for (const m of preamble.matchAll(/<!--\s*kane-loop\s+covers:\s*([\s\S]*?)-->/g)) covers.push(...m[1].split(/[\s,]+/).filter(Boolean));

  // Steps: H2 headings outside fenced blocks, with their prose bodies.
  const steps = [];
  let fence = false;
  let current = null;
  for (const line of (firstStep === -1 ? '' : text.slice(firstStep)).split(/\r?\n/)) {
    if (/^```/.test(line)) fence = !fence;
    if (!fence && line.startsWith('## ')) {
      current = { index: steps.length + 1, heading: line.slice(3).trim(), body: [] };
      steps.push(current);
    } else if (current && !fence && !/^```/.test(line)) {
      current.body.push(line);
    }
  }
  for (const s of steps) s.body = s.body.join('\n').trim();

  const stem = basename(path).replace(/_test\.md$/, '');
  return { path, stem, outputDir: join(dirname(path), `output-${stem}`).split('\\').join('/'), url: front.url || null, tags, covers, steps };
}

export function loadFlows(root, flowsDir) {
  return listFlowFiles(root, flowsDir).map((p) => parseFlow(readFileSync(join(root, p), 'utf8'), p));
}
