"""Render demo/kane-loop-demo.mp4 from the real captured runs in demo/captures/.

    python scripts/record_demo.py   (needs Python Playwright + ffmpeg)

The terminal output shown is exactly what demo/captures/*.json recorded during real
kane-cli runs; only the waits between lines are shortened (a badge says so).
"""
import json, shutil, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo"
RAW = DEMO / "raw"

def main() -> int:
    p1 = json.loads((DEMO / "captures/phase1.json").read_text())
    p2 = json.loads((DEMO / "captures/phase2.json").read_text())
    fail = next(l for l in p1[3]["lines"] if l[2].startswith('{"type":"kane_loop_summary"'))
    fail = json.loads(fail[2])
    green = json.loads(next(l for l in p2[2]["lines"] if l[2].startswith('{"type":"kane_loop_summary"'))[2])
    tip_fail = next(f for f in fail["flows"] if f["flow"].endswith("tip_split_test.md"))
    tip_green = next(f for f in green["flows"] if f["flow"].endswith("tip_split_test.md"))
    end = [
        f"Caught: <code>tip_split</code> failed at step 2, expected $33.00, saw $39.00 (Kane session <code>{tip_fail['session_id'][:8]}…</code>, {tip_fail['credits']} credits for Kane's triage)",
        f"Fixed by the agent from <code>.kane/last-failure.md</code>, proven green by replay (session <code>{tip_green['session_id'][:8]}…</code>, 0 credits)",
        "The unit tests passed with the bug in place: only the browser check caught it",
        "Same loop from the CLI, <code>kane-loop watch</code>, or any MCP host (configs for Cursor and Claude Code included)",
    ]
    shutil.rmtree(RAW, ignore_errors=True); RAW.mkdir(parents=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 720}, record_video_dir=str(RAW), record_video_size={"width": 1280, "height": 720})
        pg = ctx.new_page()
        pg.add_init_script(f"window.DATA = {json.dumps([p1, p2])}; window.ENDLIST = {json.dumps(end)};")
        pg.goto((DEMO / "player.html").as_uri())
        pg.wait_for_timeout(500)
        pg.evaluate("window.start()")
        pg.wait_for_function("window.done === true", timeout=300_000, polling=500)
        pg.wait_for_timeout(300)
        ctx.close(); b.close()
    webm = next(RAW.glob("*.webm"))
    out = DEMO / "kane-loop-demo.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(webm), "-ss", "0.6", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-crf", "22", "-preset", "medium", "-movflags", "+faststart", str(out)], check=True)
    print(out)
    return 0

if __name__ == "__main__":
    sys.exit(main())
