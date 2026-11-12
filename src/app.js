// Make sure the app under test answers before Kane opens it, starting it if needed.

import { spawn } from 'node:child_process';

async function up(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function ensureApp(app, { cwd, log = () => {} } = {}) {
  if (!app?.url) return { stop() {}, started: false };
  if (await up(app.url)) return { stop() {}, started: false };
  if (!app.command) throw new Error(`app not reachable at ${app.url} and no app.command configured`);
  log(`starting app: ${app.command}`);
  const child = spawn(app.command, { cwd, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' });
  const deadline = Date.now() + (app.readyTimeoutMs || 15000);
  while (Date.now() < deadline) {
    if (await up(app.url)) {
      const stop = () => {
        try { process.platform === 'win32' ? child.kill() : process.kill(-child.pid); } catch { /* already gone */ }
      };
      process.once('exit', stop); // never leave the app running behind us
      return { started: true, stop };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  try { process.kill(-child.pid); } catch { /* ignore */ }
  throw new Error(`app did not come up at ${app.url} within ${app.readyTimeoutMs || 15000} ms`);
}
