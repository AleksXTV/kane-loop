// `kane-loop watch`: on save, replay the flows the current diff affects.

import { watch as fsWatch, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { verify } from './verify.js';
import { changedFiles } from './diffmap.js';

const IGNORED = /(^|[/\\])(\.git|node_modules|\.kane|\.testmuai|output-[^/\\]*|helper-output-[^/\\]*)([/\\]|$)/;

function fingerprint(root, base) {
  const h = createHash('sha1');
  for (const f of changedFiles(root, base)) {
    h.update(f);
    const p = join(root, f);
    if (existsSync(p)) h.update(readFileSync(p));
  }
  return h.digest('hex');
}

export function watch(cfg, { base = 'HEAD', debounceMs = 800, log, onSummary }) {
  let timer = null;
  let running = false;
  let again = false;
  let last = null;

  const tick = async () => {
    if (running) { again = true; return; }
    const fp = fingerprint(cfg.root, base);
    if (fp === last) return; // same content as the last verified state
    running = true;
    try {
      const res = await verify(cfg, { base, log });
      last = fp;
      onSummary(res.summary);
    } catch (err) {
      log(`kane-loop: ${err.message}`);
    } finally {
      running = false;
      if (again) { again = false; schedule(); }
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(tick, debounceMs); };

  const watcher = fsWatch(cfg.root, { recursive: true }, (_evt, file) => {
    if (file && !IGNORED.test(String(file))) schedule();
  });
  log(`kane-loop watch: watching ${cfg.root} (diff vs ${base}); Ctrl-C to stop`);
  schedule();
  return watcher;
}
