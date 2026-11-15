"""Emberwatch — staged screenshot capture + console-error smoke test.
Serves game/ on localhost (no proxy needed for a local page) and captures the
four shots named in shots.json. Staged shots run their sim synchronously
before painting, so headless Chromium is fine here; live play uses the
headed test-live.py run instead.
Usage: python3 qa/test-shots.py   (serve.ts must be running on :8081)
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)
BASE = "http://localhost:8081"
with open(ROOT / "shots.json") as f:
    SPECS = json.load(f)

failures = []

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    for spec in SPECS:
        name = spec["name"]
        errors.clear()
        page.goto(f"{BASE}/{spec['query']}", wait_until="load")
        try:
            page.wait_for_function("window.__shotReady === true", timeout=120000)
        except Exception:
            failures.append(f"{name}: __shotReady never set")
            print(f"[{name}] FAIL: __shotReady timeout")
            continue
        page.wait_for_timeout(300)
        out = SHOTS / name
        page.screenshot(path=str(out), type="jpeg", quality=82)
        size = out.stat().st_size
        status = "OK" if not errors and size <= 262144 else "CHECK"
        if errors:
            failures.append(f"{name}: console errors: {errors[:3]}")
        if size > 262144:
            failures.append(f"{name}: screenshot {size} B > 256 KiB")
        print(f"[{name}] {status} shotReady, {size} B, errors={errors[:2]}")
    browser.close()

print()
if failures:
    print("FAILURES:")
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("All staged shots OK, 0 JS errors.")
