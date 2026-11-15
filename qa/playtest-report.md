# Emberwatch — playtest report (builder-run)

Blind-run limitation, stated honestly: this run was done by the builder
session, not an independent blind player. The checks below are real-browser
runs (headed xvfb + staged shots), not a read of the design doc.

## What was played
- Staged shots (headless, seed 1): title, wave-3 play, upgrade choice,
  victory — all render, 0 JS errors. Viewed each: title reads cleanly,
  play shows HUD + lantern beam + shades + floaters, upgrade cards are
  legible, victory screen shows score/stats/restart.
- Live test (headed xvfb, `qa/test-live.py`, debug copy — see Limitations):
  14/14 PASS. Title -> Space start -> WASD move (x 480 -> 634) -> hold-click
  fires (9 bolts) -> Shift dash (cooldown 2.97s) -> P pause (world time
  frozen 8.80 -> 8.80) -> P resume -> autopilot driver through real input
  events clears wave 1 (score 145) -> upgrade screen -> clicking card 2
  starts wave 2 -> idle Keeper loses by flame-out (hp 28, flame 0) ->
  game-over screen -> Space restarts a fresh run (wave 1, score 0).
  0 console errors throughout (favicon 404 fixed with a real favicon.svg).
- Node regression (`qa/regression-autopilot.mjs`): seeds 1, 2, 3, 7, 42 all
  reach victory (scores 6313–7233), no non-finite positions, upgrade seen.

## Bugs found and fixed during verification
1. **P0 — upgrade screen never appeared in live play.** `world` moved to
   phase 'upgrade' on wave clear, but `main.js` never switched the screen
   from play to upgrade: the Keeper walked an empty glade forever and the
   HUD subtitle said "Choose a blessing" with no cards. Fixed: `playEvents`
   now sets `screen = SCREEN_UPGRADE` on EVENT_WAVE_CLEAR. Re-tested live:
   wave 1 -> upgrade -> card click -> wave 2. (Staged shots had masked it:
   `stageShot` returns the upgrade screen directly.)
2. **Autopilot division by zero.** When a shade or shard sat exactly on the
   Keeper, the autopilot divided by a zero distance and produced a NaN move.
   Fixed with `|| 1` guards on all three autopilot branches; regression
   script asserts finite positions on five seeds.
3. **Play shot showed an empty field.** Wave 2's spawn queue drained slower
   than the autopilot killed, so the frame had 0 live shades. Fixed: faster
   spawn interval (1.1s base), pair spawns from wave 4, and the play scene
   now stops only once >= 4 shades are alive with score > 100.
4. **Shades unreadable against the dark.** Body #1a1430 dissolved into the
   glade. Fixed: lighter body #2c2150, 3px rim, coloured halo, bigger eyes.
5. **favicon.ico 404** in console. Fixed with a real `game/favicon.svg`.

## Limitations
- Live test runs against `/tmp/dbg-root`, a copy of `game/` that differs by
  exactly two exposure lines (`window.__dbg`, `window.__dbgScreen`,
  `window.__dbgAutopilot`); the shipped `game/` has no debug hooks.
  All input in the live test is real Playwright keyboard/mouse events.
- Victory is proven by the staged end shot (real rules, autopilot, 5 seeds
  in node) and the live test proves the loss path + restart; no human has
  played a full 10-wave run to victory by hand.
- Testing ran on SwiftShader (software rendering); real Chrome on hardware
  will run the same canvas code faster.
- Balance: a perfect-aim autopilot wins every seed (scores ~6300–7200);
  a human player's accuracy will be lower, so the difficulty is tuned for
  humans, not for the autopilot.
