// Every byte kane-loop writes to disk or prints goes through scrub(): the Kane
// credentials come from the environment and must never end up in a file or log.

function secrets() {
  const names = ['LT_USERNAME', 'LT_ACCESS_KEY', ...(process.env.KANE_LOOP_SCRUB || '').split(',')];
  return names
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => process.env[n])
    .filter((v) => typeof v === 'string' && v.length >= 3)
    .sort((a, b) => b.length - a.length);
}

export function scrub(text) {
  let out = String(text);
  for (const value of secrets()) out = out.split(value).join('<redacted>');
  return out;
}

/** Arguments safe to show: values after --username / --access-key are masked. */
export function redactArgs(args) {
  return args.map((a, i) => (['--username', '--access-key'].includes(args[i - 1]) ? '<redacted>' : scrub(a)));
}
