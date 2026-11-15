// Emberwatch — headless regression for the world + autopilot: no NaN positions,
// every seeded run ends won or lost (never stuck mid-wave), and the wave flow
// reaches the upgrade phase. Runs in plain node, no browser.
// Usage: node qa/regression-autopilot.mjs
import { createRandom } from '../game/src/random.js';
import { createWorld } from '../game/src/world.js';
import { autopilot } from '../game/src/shots.js';

const PRIORITY = ['split', 'heavy', 'rapid', 'pierce', 'vitality', 'kindle', 'swift', 'magnet', 'dash'];
let failed = 0;

for (const seed of [1, 2, 3, 7, 42]) {
  const world = createWorld(createRandom(seed));
  world.beginRun();
  let sawUpgrade = false;
  let steps = 0;
  for (; steps < 60 * 900; steps += 1) {
    const s = world.state;
    if (s.phase === 'upgrade') {
      sawUpgrade = true;
      let bi = 0;
      let br = 99;
      s.offered.forEach((u, idx) => {
        const r = PRIORITY.indexOf(u.id);
        if (r >= 0 && r < br) {
          br = r;
          bi = idx;
        }
      });
      world.chooseUpgrade(bi);
    }
    if (s.phase === 'won' || s.phase === 'lost') break;
    // Finite-position invariant: a NaN anywhere freezes the run.
    const bad =
      !Number.isFinite(s.player.x) ||
      !Number.isFinite(s.player.y) ||
      s.enemies.some((e) => !Number.isFinite(e.x) || !Number.isFinite(e.y)) ||
      s.bullets.some((b) => !Number.isFinite(b.x) || !Number.isFinite(b.y));
    if (bad) {
      console.log(`[FAIL] seed ${seed}: non-finite position at step ${steps}`);
      failed += 1;
      break;
    }
    world.step(1 / 60, autopilot(world));
  }
  const s = world.state;
  const ok = (s.phase === 'won' || s.phase === 'lost') && sawUpgrade;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] seed ${seed}: ${s.phase} wave ${s.wave} score ${s.score} kills ${s.kills} steps ${steps} upgradeSeen=${sawUpgrade}`);
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
