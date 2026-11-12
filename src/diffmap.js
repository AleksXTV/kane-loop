// Map a git diff to the Kane flows it can break.

import { execFileSync } from 'node:child_process';

/** Minimal glob: `**` any depth, `*` within a segment, `?` one char. A pattern without `/` matches the basename. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function matches(file, glob) {
  const target = glob.includes('/') ? file : file.split('/').pop();
  // A bare directory ("src/cart" or "src/cart/") covers everything below it.
  if (!/[*?]/.test(glob) && (file === glob.replace(/\/$/, '') || file.startsWith(glob.replace(/\/?$/, '/')))) return true;
  return globToRegExp(glob).test(target);
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Files changed versus `base` (default HEAD: staged + unstaged), plus untracked files. */
export function changedFiles(root, base = 'HEAD') {
  const lines = new Set();
  try {
    for (const f of git(root, ['diff', '--name-only', base]).split('\n')) if (f) lines.add(f);
  } catch {
    // No commits yet: everything tracked counts as changed.
    for (const f of git(root, ['ls-files']).split('\n')) if (f) lines.add(f);
  }
  for (const f of git(root, ['ls-files', '--others', '--exclude-standard']).split('\n')) if (f) lines.add(f);
  return [...lines].sort();
}

export function diffFor(root, files, base = 'HEAD', maxLines = 60) {
  if (!files.length) return '';
  try {
    const out = git(root, ['diff', '-U2', base, '--', ...files]).split('\n');
    return out.length > maxLines ? [...out.slice(0, maxLines), `... (${out.length - maxLines} more lines)`].join('\n') : out.join('\n');
  } catch {
    return '';
  }
}

const isArtifact = (f) => /(^|\/)(output-|helper-output-)[^/]*\//.test(f) || /^(\.kane|\.testmuai)\//.test(f);

/**
 * Decide which flows a change set affects.
 * - The flow file itself changed -> affected.
 * - A changed file matches one of the flow's `covers` globs -> affected.
 * - A flow with no `covers` is affected by any relevant change (safe default).
 * Kane artifacts (output-*, .kane, .testmuai) and `ignore` globs never trigger a run.
 */
export function selectFlows(flows, changed, ignore = []) {
  const relevant = changed.filter((f) => !isArtifact(f));
  const selected = [];
  const skipped = [];
  for (const flow of flows) {
    const self = relevant.includes(flow.path);
    const app = relevant.filter((f) => !f.endsWith('_test.md') && !ignore.some((g) => matches(f, g)));
    const hits = flow.covers.length ? app.filter((f) => flow.covers.some((g) => matches(f, g))) : app;
    if (self || hits.length) selected.push({ flow, because: self ? [flow.path, ...hits] : hits });
    else skipped.push({ flow, reason: relevant.length ? 'no changed file is covered by this flow' : 'no changes' });
  }
  return { changed: relevant, selected, skipped };
}
