// Enemies: what each kind is, how it moves, and how a wave spends its budget.
// Enemies are plain objects in the world's array; this file only builds them
// and steers them. A shade's target is the Ember when it is closer than the
// player, otherwise the player — so standing between the dark and the flame
// is a real choice, not a scripted one.
import { ENEMIES, EMBER, FIELD } from './config.js';

export const KIND_WISP = 'wisp';
export const KIND_SPLITTER = 'splitter';
export const KIND_BRUTE = 'brute';
export const KIND_HERALD = 'herald';

function edgeSpawn(random) {
  const side = Math.floor(random() * 4);
  const margin = 24;
  if (side === 0) return { x: margin + random() * (FIELD.width - margin * 2), y: margin };
  if (side === 1) return { x: margin + random() * (FIELD.width - margin * 2), y: FIELD.height - margin };
  if (side === 2) return { x: margin, y: margin + random() * (FIELD.height - margin * 2) };
  return { x: FIELD.width - margin, y: margin + random() * (FIELD.height - margin * 2) };
}

export function spawnEnemy(random, kind, x, y) {
  const def = ENEMIES[kind];
  const at = x === undefined ? edgeSpawn(random) : { x, y };
  return {
    kind,
    x: at.x,
    y: at.y,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed * (0.9 + random() * 0.2),
    radius: def.radius,
    touchPlayer: def.touchPlayer,
    touchEmber: def.touchEmber,
    score: def.score,
    color: def.color,
    wobble: random() * Math.PI * 2,
    wobbleSpeed: 1.5 + random() * 2,
    burstTimer: 0, // herald only: seconds until its next radial burst
    flash: 0, // seconds of white hit-flash left
  };
}

// Spend a wave's budget on a shuffled list of kinds to spawn, cheapest first
// so early waves are mostly wisps and brutes only arrive once the budget
// allows them. The herald is spawned by the world, not by the budget.
export function planWave(random, wave) {
  const budget = 6 + wave * 4;
  const kinds = [];
  let left = budget;
  while (left >= 3 && random() < 0.3 + wave * 0.04) {
    kinds.push(KIND_BRUTE);
    left -= 3;
  }
  while (left >= 2 && random() < 0.45) {
    kinds.push(KIND_SPLITTER);
    left -= 2;
  }
  while (left >= 1) {
    kinds.push(KIND_WISP);
    left -= 1;
  }
  // Shuffle so the wave does not arrive in cost order.
  for (let i = kinds.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = tmp;
  }
  return kinds;
}

// Steer one enemy for a step: drift toward its target with a sideways wobble
// so the swarm never walks in a straight parade line.
export function steerEnemy(enemy, targetX, targetY, dt, time) {
  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const wobble = Math.sin(time * enemy.wobbleSpeed + enemy.wobble) * 0.45;
  const nx = dx / dist;
  const ny = dy / dist;
  const mx = nx - ny * wobble;
  const my = ny + nx * wobble;
  const len = Math.hypot(mx, my) || 1;
  enemy.x += (mx / len) * enemy.speed * dt;
  enemy.y += (my / len) * enemy.speed * dt;
  if (enemy.flash > 0) enemy.flash = Math.max(0, enemy.flash - dt);
}
