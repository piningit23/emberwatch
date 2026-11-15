// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the
// real rules forward from a fresh run for a fixed amount of sim time, steered by
// an autopilot that kites the shades, gathers shards and dashes out of trouble,
// so every frame is what a real game looks like and the same seed always gives
// the same frame. The victory scene plays all ten waves; if the autopilot falls
// it shows the game-over screen instead, which is still a real ending.
import { EMBER, FIELD, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 40;
const UPGRADE_LIMIT_SECONDS = 150;
const END_LIMIT_SECONDS = 900;

const UPGRADE_PRIORITY = ['split', 'heavy', 'rapid', 'pierce', 'vitality', 'kindle', 'swift', 'magnet', 'dash'];

// One autopilot decision: where to move, where to aim, whether to fire or dash.
export function autopilot(world) {
  const state = world.state;
  const player = state.player;
  let nearest = null;
  let nearestDist = Infinity;
  for (const enemy of state.enemies) {
    const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = enemy;
    }
  }
  let nearestShard = null;
  let nearestShardDist = Infinity;
  for (const shard of state.shardList) {
    const d = Math.hypot(shard.x - player.x, shard.y - player.y);
    if (d < nearestShardDist) {
      nearestShardDist = d;
      nearestShard = shard;
    }
  }

  let mx = 0;
  let my = 0;
  if (nearest && nearestDist < 70) {
    // Too close: run straight away from the shade. The `|| 1` guards the
    // division: a shade exactly on the Keeper must not turn the move NaN
    // and freeze the whole run.
    const d = nearestDist || 1;
    mx = (player.x - nearest.x) / d;
    my = (player.y - nearest.y) / d;
  } else if (nearest && nearestDist < 260) {
    // Hold a firing ring around the shade: close in when far, back off when
    // near, and keep circling so the swarm cannot line up on the Keeper.
    const toward = nearestDist > 190 ? 1 : -0.7;
    const d = nearestDist || 1;
    const dx = (nearest.x - player.x) / d;
    const dy = (nearest.y - player.y) / d;
    mx = dx * toward - dy * 0.55;
    my = dy * toward + dx * 0.55;
  } else if (nearestShard && nearestShardDist < 260) {
    const d = nearestShardDist || 1;
    mx = (nearestShard.x - player.x) / d;
    my = (nearestShard.y - player.y) / d;
  } else {
    // Nothing pressing: patrol the ring around the Ember.
    const dx = player.x - EMBER.x;
    const dy = player.y - EMBER.y;
    const dist = Math.hypot(dx, dy) || 1;
    const target = 180;
    const radial = dist > target + 20 ? -1 : dist < target - 20 ? 1 : 0;
    mx = (dx / dist) * radial - (dy / dist) * 0.6;
    my = (dy / dist) * radial + (dx / dist) * 0.6;
  }
  const len = Math.hypot(mx, my) || 1;
  const dash = Boolean(nearest && nearestDist < 55);
  return {
    move: { x: mx / len, y: my / len },
    aim: nearest ? { x: nearest.x, y: nearest.y, seen: true } : { x: player.x, y: player.y - 1, seen: true },
    firing: Boolean(nearest),
    dash,
  };
}

function runSteps(world, seconds, until) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    // The stop condition is checked before any auto-pick, so a staged scene
    // that waits for the upgrade screen actually stops on it.
    if (until && until(world.state)) break;
    if (world.state.phase === 'upgrade') {
      // Auto-pick the best offered blessing by a fixed priority, so a long
      // staged run keeps playing through the waves.
      let bestIndex = 0;
      let bestRank = 99;
      world.state.offered.forEach((upgrade, index) => {
        const rank = UPGRADE_PRIORITY.indexOf(upgrade.id);
        if (rank >= 0 && rank < bestRank) {
          bestRank = rank;
          bestIndex = index;
        }
      });
      world.chooseUpgrade(bestIndex);
    }
    if (world.state.phase === 'won' || world.state.phase === 'lost') break;
    world.step(STEP, autopilot(world));
  }
}

/**
 * Set `world` to the named scene (start, play, upgrade or end; any other name
 * is start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.stepAmbient(STEP);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.beginRun();
  if (name === 'play') {
    // Stop mid-wave once the field is busy: at least four shades alive and
    // some score on the board, so the frame shows a real fight, not an empty
    // glade between spawns.
    runSteps(world, PLAY_SECONDS, (state) => state.wave >= 2 && state.enemies.length >= 4 && state.score > 100);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    runSteps(world, UPGRADE_LIMIT_SECONDS, (state) => state.phase === 'upgrade');
    if (world.state.phase !== 'upgrade') return { screen: SCREEN_PLAY, best: world.state.score };
    return { screen: SCREEN_UPGRADE, best: world.state.score };
  }
  runSteps(world, END_LIMIT_SECONDS);
  if (world.state.phase === 'won') return { screen: SCREEN_WIN, best: world.state.score };
  return { screen: SCREEN_OVER, best: world.state.score };
}
