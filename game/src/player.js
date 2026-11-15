// The Keeper: movement, aiming, firing, dashing and the upgrade counts that
// shape them. Stats are derived from the base numbers in config.js plus the
// upgrades taken, so the same code plays a fresh Keeper and a fully built one.
import { PLAYER } from './config.js';

export function createPlayer() {
  return {
    x: 480,
    y: 470,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    fireCd: 0,
    dashCd: 0,
    dashTime: 0,
    invulnerable: 0,
    sinceHit: 99,
    upgrades: {}, // id -> times taken
    alive: true,
  };
}

// Effective stats after upgrades.
export function playerStats(player) {
  const n = (id) => player.upgrades[id] || 0;
  return {
    speed: PLAYER.speed * 1.12 ** n('swift'),
    maxHp: PLAYER.maxHp + 25 * n('vitality'),
    fireInterval: PLAYER.fireInterval * 0.82 ** n('rapid'),
    damage: PLAYER.bulletDamage * 1.25 ** n('heavy'),
    bolts: 1 + Math.min(4, n('split')),
    pierce: n('pierce'),
    magnetRadius: PLAYER.magnetRadius * 1.6 ** n('magnet'),
    dashCooldown: Math.max(1.2, PLAYER.dashCooldown * 0.75 ** n('dash')),
  };
}

// Apply one upgrade's immediate effect (max HP / flame changes happen here;
// the multipliers above read the counts).
export function applyUpgrade(player, ember, upgrade) {
  player.upgrades[upgrade.id] = (player.upgrades[upgrade.id] || 0) + 1;
  const stats = playerStats(player);
  if (upgrade.id === 'vitality') {
    player.maxHp = stats.maxHp;
    player.hp = Math.min(player.maxHp, player.hp + 25);
  }
  if (upgrade.id === 'kindle') {
    ember.maxFlame += 30;
    ember.flame = Math.min(ember.maxFlame, ember.flame + 30);
  }
}

// Move the player for one step. Returns true when a dash started this step.
export function movePlayer(player, stats, move, dt) {
  let startedDash = false;
  if (player.dashTime > 0) {
    player.dashTime -= dt;
  } else if (player.dashCd > 0) {
    player.dashCd -= dt;
  }
  const speed = player.dashTime > 0 ? PLAYER.dashSpeed : stats.speed;
  player.x += move.x * speed * dt;
  player.y += move.y * speed * dt;
  const margin = PLAYER.radius + 4;
  player.x = Math.min(960 - margin, Math.max(margin, player.x));
  player.y = Math.min(600 - margin, Math.max(margin, player.y));
  if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
  if (player.fireCd > 0) player.fireCd -= dt;
  player.sinceHit += dt;
  // Slow health regen once the Keeper has been safe for a while.
  if (player.sinceHit > 5 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + PLAYER.hpRegen * dt);
  }
  return startedDash;
}

export function startDash(player, stats) {
  if (player.dashCd > 0 || player.dashTime > 0) return false;
  player.dashTime = PLAYER.dashTime;
  player.dashCd = stats.dashCooldown;
  player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.05);
  return true;
}

// Build the bolts for one shot: a fan of `bolts` projectiles around the aim
// angle, each with its own slight spread.
export function fireBolts(player, stats, angle) {
  const bolts = [];
  const count = stats.bolts;
  const spread = 0.09;
  for (let i = 0; i < count; i += 1) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    bolts.push({
      x: player.x + Math.cos(angle) * (PLAYER.radius + 6),
      y: player.y + Math.sin(angle) * (PLAYER.radius + 6),
      vx: Math.cos(angle + offset) * PLAYER.bulletSpeed,
      vy: Math.sin(angle + offset) * PLAYER.bulletSpeed,
      damage: stats.damage,
      pierce: stats.pierce,
      radius: PLAYER.bulletRadius,
      life: PLAYER.bulletLife,
    });
  }
  player.fireCd = stats.fireInterval;
  return bolts;
}
