# Instructions for coding agents in this repo

This repo uses **kane-loop** to prove UI changes in a real browser with Kane CLI before
you call a task done. It works the same from Cursor, Claude Code, Codex or any agent
that can run a shell command or call MCP tools (`.cursor/mcp.json` and `.mcp.json`
register the `kane-loop` MCP server).

1. After you change app code, verify it:
   - MCP: call `verify_changed`
   - shell: `node bin/kane-loop.js verify` (exit 0 = green, 1 = a flow failed, 2 = Kane or the app did not start)
   kane-loop maps your git diff to the saved flows in `flows/*_test.md` that cover the
   changed files and replays only those, headless. Replays of recorded steps cost 0 credits.
2. If a flow fails, read `.kane/last-failure.md` (MCP: `last_failure`). It has the failing
   step, the values Kane expected and the values it saw, Kane's own triage, the part of
   your diff that triggered the replay, a screenshot and the evidence pack.
3. Fix the **application code**. The flows describe intended behaviour: do not edit a
   `_test.md` to make it pass unless the requirement itself changed (and say so).
4. Re-run only what failed: MCP `rerun_failed`, or `node bin/kane-loop.js rerun-failed`.
   Repeat until green, then report the result with the Kane session id.
5. To check something no flow covers yet, use MCP `verify_flow` with an `objective`
   ("Go to http://localhost:4173/ and ... then verify ..."). That run costs Kane credits.

Never print, log or commit `LT_USERNAME` / `LT_ACCESS_KEY`. Never commit `.testmuai/evidence/`
(packs include the account identity) or `.kane/`. Do commit `flows/output-*/`: those are
the recordings that make replays free and deterministic.
