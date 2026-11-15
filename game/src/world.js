// The game's rules and state, with no drawing and no browser in it: the Keeper,
// the Ember, the shades, the bolts, the shards, the waves and the score. step()
// advances one fixed step and returns what happened as bit flags, so the caller
// can play sounds and change screens without the world knowing about either.
import { EMBER, FIELD, PLAYER, TOTAL_WAVES, UPGRADES, waveSpawnInterval, waveTrickle } from './config.js';
import { KIND_BRUTE, KIND_HERALD, KIND_SPLITTER, KIND_WISP, planWave, spawnEnemy, steerEnemy } from './enemies.js';
import { applyUpgrade, createPlayer, fireBolts, movePlayer, playerStats, startDash } from './player.js';
import { pick } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_EMBER = 2;
export const EVENT_KILL = 4;
export const EVENT_PICKUP = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_OVER = 32;
export const EVENT_WIN = 64;
export const EVENT_SHOT = 128;
export const EVENT_DASH = 256;
export const EVENT_STRIKE = 512;

const MAX_ENEMIES = 120;

function burst(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    state.particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life: 0.5, maxLife: 0.5, color, size: 2 + Math.random() * 3 });
  }
}

function floater(state, x, y, text, color) {
  state.floaters.push({ x, y, text, life: 0.9, color });
}

export function createWorld(random) {
  const state = {
    time: 0,
    phase: 'title', // title | fight | upgrade | won | lost
    wave: 0,
    score: 0,
    best: 0,
    combo: 0,
    comboTimer: 0,
    shards: 0,
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    player: createPlayer(),
    ember: { flame: EMBER.maxFlame, maxFlame: EMBER.maxFlame },
    enemies: [],
    bullets: [],
    orbs: [],
    shardList: [],
    particles: [],
    floaters: [],
    fireflies: [],
    spawnQueue: [],
    spawnTimer: 0,
    trickleTimer: 0,
    offered: [],
    heraldSpawned: false,
  };

  function seedFireflies() {
    state.fireflies = [];
    for (let i = 0; i < 26; i += 1) {
      state.fireflies.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        phase: random() * Math.PI * 2,
        speed: 6 + random() * 10,
      });
    }
  }

  function reset() {
    state.time = 0;
    state.phase = 'title';
    state.wave = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.shards = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.shotsHit = 0;
    state.player = createPlayer();
    state.ember = { flame: EMBER.maxFlame, maxFlame: EMBER.maxFlame };
    state.enemies = [];
    state.bullets = [];
    state.orbs = [];
    state.shardList = [];
    state.particles = [];
    state.floaters = [];
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.trickleTimer = 0;
    state.offered = [];
    state.heraldSpawned = false;
    seedFireflies();
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'fight';
    state.spawnQueue = planWave(random, wave);
    if (wave === TOTAL_WAVES) {
      state.heraldSpawned = false;
    }
    state.spawnTimer = 0.8;
    state.trickleTimer = 6;
  }

  function beginRun() {
    reset();
    startWave(1);
  }

  // Three distinct upgrades the Keeper has not maxed out.
  function offerUpgrades() {
    const available = UPGRADES.filter((u) => (state.player.upgrades[u.id] || 0) < u.max);
    const offered = [];
    while (offered.length < 3 && available.length > 0) {
      const choice = pick(random, available);
      offered.push(choice);
      available.splice(available.indexOf(choice), 1);
    }
    state.offered = offered;
    state.phase = 'upgrade';
  }

  function chooseUpgrade(index) {
    const upgrade = state.offered[index];
    if (!upgrade || state.phase !== 'upgrade') return false;
    applyUpgrade(state.player, state.ember, upgrade);
    if (state.wave >= TOTAL_WAVES) {
      state.phase = 'won';
      return true;
    }
    startWave(state.wave + 1);
    return true;
  }

  function killEnemy(enemy, index) {
    state.enemies.splice(index, 1);
    state.kills += 1;
    if (state.comboTimer > 0) state.combo += 1;
    else state.combo = 1;
    state.comboTimer = 3;
    const multiplier = 1 + Math.min(state.combo, 20) * 0.05;
    const gained = Math.round(enemy.score * multiplier);
    state.score += gained;
    floater(state, enemy.x, enemy.y - enemy.radius, `+${gained}`, '#ffd166');
    burst(state, enemy.x, enemy.y, enemy.color, 10, 120);
    // Shards: brutes and splitters always drop, wisps mostly do.
    const drops = enemy.kind === KIND_WISP ? (random() < 0.6 ? 1 : 0) : enemy.kind === KIND_BRUTE ? 3 : 2;
    for (let i = 0; i < drops; i += 1) {
      const angle = random() * Math.PI * 2;
      state.shardList.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * 60,
        vy: Math.sin(angle) * 60,
        life: 12,
      });
    }
    if (enemy.kind === KIND_SPLITTER && state.enemies.length < MAX_ENEMIES - 1) {
      for (let i = 0; i < 2; i += 1) {
        const wisp = spawnEnemy(random, KIND_WISP, enemy.x + (i === 0 ? -14 : 14), enemy.y);
        state.enemies.push(wisp);
      }
    }
  }

  function damagePlayer(amount, fromX, fromY) {
    const player = state.player;
    if (player.invulnerable > 0 || !player.alive) return 0;
    player.hp -= amount;
    player.invulnerable = 1.0;
    player.sinceHit = 0;
    state.combo = 0;
    state.comboTimer = 0;
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    player.x = Math.min(FIELD.width - 18, Math.max(18, player.x + (dx / dist) * 26));
    player.y = Math.min(FIELD.height - 18, Math.max(18, player.y + (dy / dist) * 26));
    burst(state, player.x, player.y, '#ff6b6b', 8, 100);
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      state.phase = 'lost';
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function damageEmber(amount) {
    state.ember.flame -= amount;
    burst(state, EMBER.x, EMBER.y, '#ff9a3c', 8, 90);
    if (state.ember.flame <= 0) {
      state.ember.flame = 0;
      state.phase = 'lost';
      return EVENT_EMBER | EVENT_OVER;
    }
    return EVENT_EMBER;
  }

  function stepAmbient(dt) {
    state.time += dt;
    for (const fly of state.fireflies) {
      fly.phase += dt;
      fly.x += Math.cos(fly.phase * 0.5) * fly.speed * dt;
      fly.y += Math.sin(fly.phase * 0.7) * fly.speed * dt * 0.6;
      if (fly.x < 0) fly.x = FIELD.width;
      if (fly.x > FIELD.width) fly.x = 0;
      if (fly.y < 0) fly.y = FIELD.height;
      if (fly.y > FIELD.height) fly.y = 0;
    }
    updateParticles(dt);
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
  }

  // One fixed step of live play. `input` is { move, aim, firing, dash } with
  // aim in field coordinates. Returns EVENT_* flags for the caller.
  function step(dt, input) {
    let events = 0;
    state.time += dt;
    const player = state.player;
    const stats = playerStats(player);

    // Aim: toward the mouse when it has moved, else at the nearest shade.
    let aimX = input.aim.x;
    let aimY = input.aim.y;
    if (!input.aim.seen) {
      let nearest = null;
      let nearestDist = Infinity;
      for (const enemy of state.enemies) {
        const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = enemy;
        }
      }
      if (nearest) {
        aimX = nearest.x;
        aimY = nearest.y;
      } else {
        aimX = player.x;
        aimY = player.y - 1;
      }
    }
    player.angle = Math.atan2(aimY - player.y, aimX - player.x);

    if (input.dash && startDash(player, stats)) events |= EVENT_DASH;
    movePlayer(player, stats, input.move, dt);

    // Fire while held and the cooldown has run out.
    if (input.firing && player.fireCd <= 0 && player.alive) {
      const bolts = fireBolts(player, stats, player.angle);
      for (const bolt of bolts) state.bullets.push(bolt);
      state.shotsFired += bolts.length;
      events |= EVENT_SHOT;
    }

    // Spawn the wave: the planned queue first, then the boss on wave 10, then
    // the late-wave trickle that keeps the pressure on.
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.enemies.length < MAX_ENEMIES) {
        // From wave 4 the dark sends shades in pairs, so the field stays busy.
        const batch = state.wave >= 4 ? 2 : 1;
        for (let n = 0; n < batch && state.spawnQueue.length > 0; n += 1) {
          state.enemies.push(spawnEnemy(random, state.spawnQueue.shift()));
        }
        state.spawnTimer = waveSpawnInterval(state.wave);
      }
    } else if (state.wave === TOTAL_WAVES && !state.heraldSpawned) {
      state.enemies.push(spawnEnemy(random, KIND_HERALD, FIELD.width / 2, 60));
      state.heraldSpawned = true;
    } else if (waveTrickle(state.wave) > 0 && state.enemies.length < 12) {
      state.trickleTimer -= dt;
      if (state.trickleTimer <= 0) {
        state.enemies.push(spawnEnemy(random, KIND_WISP));
        state.trickleTimer = 8;
      }
    }

    // Bullets fly and strike shades.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bolt = state.bullets[i];
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      bolt.life -= dt;
      let dead = bolt.life <= 0 || bolt.x < 0 || bolt.x > FIELD.width || bolt.y < 0 || bolt.y > FIELD.height;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const enemy = state.enemies[j];
          const dx = enemy.x - bolt.x;
          const dy = enemy.y - bolt.y;
          const r = enemy.radius + bolt.radius;
          if (dx * dx + dy * dy > r * r) continue;
          enemy.hp -= bolt.damage;
          enemy.flash = 0.12;
          state.shotsHit += 1;
          events |= EVENT_STRIKE;
          if (enemy.hp <= 0) {
            killEnemy(enemy, j);
            events |= EVENT_KILL;
          }
          if (bolt.pierce > 0) bolt.pierce -= 1;
          else {
            dead = true;
          }
          break;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }

    // Herald orbs drift and burst on contact with the Keeper or the Ember.
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const orb = state.orbs[i];
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      let gone = orb.life <= 0;
      if (!gone && player.alive) {
        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        if (dx * dx + dy * dy < (PLAYER.radius + orb.radius) ** 2) {
          events |= damagePlayer(10, orb.x, orb.y);
          gone = true;
        }
      }
      if (!gone) {
        const dx = EMBER.x - orb.x;
        const dy = EMBER.y - orb.y;
        if (dx * dx + dy * dy < (EMBER.radius + orb.radius) ** 2) {
          events |= damageEmber(6);
          gone = true;
        }
      }
      if (gone) {
        burst(state, orb.x, orb.y, '#ff5d73', 6, 80);
        state.orbs.splice(i, 1);
      }
    }

    // Shades advance: toward the Ember when it is nearer, else the Keeper.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      const dEmber = Math.hypot(EMBER.x - enemy.x, EMBER.y - enemy.y);
      const dPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (dEmber < dPlayer) steerEnemy(enemy, EMBER.x, EMBER.y, dt, state.time);
      else steerEnemy(enemy, player.x, player.y, dt, state.time);
      if (enemy.kind === KIND_HERALD) {
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0) {
          enemy.burstTimer = 4;
          for (let k = 0; k < 8; k += 1) {
            const angle = (k / 8) * Math.PI * 2 + state.time;
            state.orbs.push({
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(angle) * 70,
              vy: Math.sin(angle) * 70,
              radius: 7,
              life: 6,
            });
          }
        }
      }
      // A shade that reaches the Ember snuffs some flame and burns out.
      if (dEmber < EMBER.radius + enemy.radius) {
        events |= damageEmber(enemy.touchEmber);
        burst(state, enemy.x, enemy.y, enemy.color, 10, 110);
        state.enemies.splice(i, 1);
        continue;
      }
      // A shade that touches the Keeper bites.
      if (player.alive && dPlayer < enemy.radius + PLAYER.radius) {
        events |= damagePlayer(enemy.touchPlayer, enemy.x, enemy.y);
        enemy.x += ((enemy.x - player.x) / (dPlayer || 1)) * 18;
        enemy.y += ((enemy.y - player.y) / (dPlayer || 1)) * 18;
      }
    }

    // Shards drift, then fly to the Keeper inside the magnet radius.
    for (let i = state.shardList.length - 1; i >= 0; i -= 1) {
      const shard = state.shardList[i];
      shard.life -= dt;
      const dx = player.x - shard.x;
      const dy = player.y - shard.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (player.alive && dist < stats.magnetRadius) {
        const pull = 420 * (1 - dist / (stats.magnetRadius + 1));
        shard.vx += (dx / dist) * pull * dt * 8;
        shard.vy += (dy / dist) * pull * dt * 8;
      } else {
        shard.vx *= 0.96;
        shard.vy *= 0.96;
      }
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (shard.life <= 0) {
        state.shardList.splice(i, 1);
        continue;
      }
      if (player.alive && dist < PLAYER.pickupRadius + 6) {
        state.shardList.splice(i, 1);
        state.shards += 1;
        state.score += 5;
        state.ember.flame = Math.min(state.ember.maxFlame, state.ember.flame + 2);
        events |= EVENT_PICKUP;
      }
    }

    // Combo fades when the Keeper stops killing.
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    stepAmbient(dt);

    // Wave cleared: every shade gone and nothing left to spawn.
    if (state.phase === 'fight' && state.spawnQueue.length === 0 && state.enemies.length === 0 && state.orbs.length === 0) {
      if (state.wave >= TOTAL_WAVES) {
        state.phase = 'won';
        events |= EVENT_WIN;
      } else {
        offerUpgrades();
        events |= EVENT_WAVE_CLEAR;
      }
    }
    return events;
  }

  reset();
  return { state, reset, beginRun, startWave, chooseUpgrade, step, stepAmbient };
}
