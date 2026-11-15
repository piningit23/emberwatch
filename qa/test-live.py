"""Emberwatch — live end-to-end play test, headed under xvfb (headless freezes
the game clock). Runs against the DEBUG copy in /tmp/dbg-root, which is the
repo's game/ byte-identical except two exposure lines in main.js/shots.js
(window.__dbg + __dbgScreen + __dbgAutopilot) so the test can assert on the
real world state. All input is real Playwright keyboard/mouse events through
the game's own listeners; the only shortcut is the autopilot driver, which
drives those same events instead of a human hand.
Usage: xvfb-run -a python3 qa/test-live.py
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://localhost:8083"
EVIDENCE = ROOT / "qa" / "evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)

DRIVER_JS = """() => {
  if (window.__driverOn) return 'already';
  window.__driverOn = true;
  const keys = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
  const held = new Set();
  function setKey(code, on) {
    if (on && !held.has(code)) { held.add(code); window.dispatchEvent(new KeyboardEvent('keydown', { code })); }
    if (!on && held.has(code)) { held.delete(code); window.dispatchEvent(new KeyboardEvent('keyup', { code })); }
  }
  window.__driverTimer = setInterval(() => {
    const dbg = window.__dbg;
    if (!dbg || window.__dbgScreen() !== 'play') { for (const c of [...held]) setKey(c, false); return; }
    const input = window.__dbgAutopilot(dbg.world);
    setKey('KeyW', input.move.y < -0.3);
    setKey('KeyS', input.move.y > 0.3);
    setKey('KeyA', input.move.x < -0.3);
    setKey('KeyD', input.move.x > 0.3);
    const canvas = document.getElementById('game');
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / 960, rect.height / 600);
    const ox = (rect.width - 960 * scale) / 2;
    const oy = (rect.height - 600 * scale) / 2;
    const cx = rect.left + ox + input.aim.x * scale;
    const cy = rect.top + oy + input.aim.y * scale;
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cx, clientY: cy, bubbles: true }));
    if (input.firing && !window.__firing) {
      window.__firing = true;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
    } else if (!input.firing && window.__firing) {
      window.__firing = false;
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
    }
    if (input.dash) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  }, 50);
  return 'driver on';
}"""

STOP_DRIVER_JS = """() => { clearInterval(window.__driverTimer); window.__driverOn = false;
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  for (const c of ['KeyW','KeyA','KeyS','KeyD']) window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
  return 'driver off'; }"""

checks = []


def check(name, ok, detail=""):
    checks.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}")


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/", wait_until="load")
    page.wait_for_timeout(800)

    check("launch: title screen", page.evaluate("() => window.__dbgScreen()") == "title")
    check("launch: 0 JS errors", len(errors) == 0, str(errors[:2]))

    # Start with Space, then move right with D and confirm the Keeper moves.
    page.keyboard.press("Space")
    page.wait_for_timeout(400)
    check("start: Space begins play", page.evaluate("() => window.__dbgScreen()") == "play")
    x0 = page.evaluate("() => window.__dbg.world.state.player.x")
    page.keyboard.down("KeyD")
    page.wait_for_timeout(700)
    page.keyboard.up("KeyD")
    x1 = page.evaluate("() => window.__dbg.world.state.player.x")
    check("input: D moves the Keeper right", x1 - x0 > 50, f"x {x0:.0f} -> {x1:.0f}")

    # Aim and hold fire: bolts must leave the lantern.
    page.mouse.move(900, 300)
    page.mouse.down()
    page.wait_for_timeout(2000)
    page.mouse.up()
    st = page.evaluate("() => ({ fired: window.__dbg.world.state.shotsFired, bullets: window.__dbg.world.state.bullets.length })")
    check("input: hold-click fires bolts", st["fired"] > 0, json.dumps(st))

    # Dash on Shift.
    page.keyboard.press("ShiftLeft")
    page.wait_for_timeout(200)
    dc = page.evaluate("() => window.__dbg.world.state.player.dashCd")
    check("input: Shift dashes (cooldown running)", dc > 0, f"dashCd={dc:.2f}")
    page.screenshot(path=str(EVIDENCE / "live-play.png"))

    # Pause freezes the world; resume continues it.
    page.keyboard.press("KeyP")
    page.wait_for_timeout(300)
    check("pause: P shows paused", page.evaluate("() => window.__dbgScreen()") == "paused")
    t0 = page.evaluate("() => window.__dbg.world.state.time")
    page.wait_for_timeout(600)
    t1 = page.evaluate("() => window.__dbg.world.state.time")
    check("pause: world time frozen", abs(t1 - t0) < 0.001, f"t {t0:.2f} -> {t1:.2f}")
    page.screenshot(path=str(EVIDENCE / "live-paused.png"))
    page.keyboard.press("KeyP")
    page.wait_for_timeout(400)
    check("pause: P resumes", page.evaluate("() => window.__dbgScreen()") == "play")

    # Autopilot driver (real input events) through wave 1 into the upgrade pick.
    page.evaluate(DRIVER_JS)
    try:
        page.wait_for_function("() => window.__dbgScreen() === 'upgrade'", timeout=120000)
        up = True
    except Exception:
        up = False
    check("coreLoop: wave 1 clears into upgrade choice", up,
          page.evaluate("() => JSON.stringify({screen: window.__dbgScreen(), wave: window.__dbg.world.state.wave, score: window.__dbg.world.state.score})"))
    page.evaluate(STOP_DRIVER_JS)
    page.wait_for_timeout(300)
    page.screenshot(path=str(EVIDENCE / "live-upgrade.png"))
    if up:
        # Click the middle card (field 480,325 -> css 640,390 at 1280x720).
        page.mouse.click(640, 390)
        page.wait_for_timeout(400)
        check("upgrade: clicking a card starts wave 2",
              page.evaluate("() => window.__dbgScreen()") == "play"
              and page.evaluate("() => window.__dbg.world.state.wave") == 2)

    # Outcome + restart: stop playing and let the dark take the Ember/Keeper.
    page.wait_for_timeout(500)
    try:
        page.wait_for_function("() => window.__dbgScreen() === 'over'", timeout=180000)
        over = True
    except Exception:
        over = False
    st = page.evaluate("() => JSON.stringify({screen: window.__dbgScreen(), wave: window.__dbg.world.state.wave, score: window.__dbg.world.state.score, hp: window.__dbg.world.state.player.hp, flame: window.__dbg.world.state.ember.flame})")
    check("outcome: idle Keeper loses (game over shows)", over, st)
    page.screenshot(path=str(EVIDENCE / "live-over.png"))
    if over:
        page.keyboard.press("Space")
        page.wait_for_timeout(400)
        check("restart: Space after game over starts a new run",
              page.evaluate("() => window.__dbgScreen()") == "play"
              and page.evaluate("() => window.__dbg.world.state.wave") == 1
              and page.evaluate("() => window.__dbg.world.state.score") == 0)
    check("no JS errors during live play", len(errors) == 0, str(errors[:3]))
    browser.close()

print()
failed = [c for c in checks if not c[1]]
print(f"{len(checks) - len(failed)}/{len(checks)} live checks passed.")
sys.exit(1 if failed else 0)
