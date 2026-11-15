// Drawing only: the world's state and the current screen in, pixels out. The
// 960x600 playfield is scaled to fit the window and centred; the margin is
// filled with the night colour. Everything is canvas 2D shapes and text — no
// image or font files, so the game loads with zero network requests.
import { EMBER, FIELD, PALETTE, PLAYER, TOTAL_WAVES } from './config.js';
import { drawHud, drawPanelScreen, upgradeCardAt } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function circle(x, y, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  function drawGround(state) {
    // Night glade: a dark radial wash, lighter toward the Ember.
    const glow = context.createRadialGradient(EMBER.x, EMBER.y, 40, EMBER.x, EMBER.y, 460);
    glow.addColorStop(0, '#1a2f4d');
    glow.addColorStop(0.55, PALETTE.glade);
    glow.addColorStop(1, PALETTE.nightEdge);
    context.fillStyle = glow;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Faint standing stones ringing the glade, purely decorative.
    context.strokeStyle = 'rgba(157,180,200,0.16)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(EMBER.x, EMBER.y, 250, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(EMBER.x, EMBER.y, 268, 0, Math.PI * 2);
    context.stroke();
    // Fireflies drift through the dark.
    for (const fly of state.fireflies) {
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(state.time * 1.4 + fly.phase));
      context.fillStyle = `rgba(255, 209, 102, ${0.55 * twinkle})`;
      context.beginPath();
      context.arc(fly.x, fly.y, 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawEmber(state) {
    const flame = state.ember.flame / state.ember.maxFlame;
    const flicker = 1 + 0.08 * Math.sin(state.time * 9) + 0.05 * Math.sin(state.time * 23);
    const glowRadius = (90 + 130 * flame) * flicker;
    const glow = context.createRadialGradient(EMBER.x, EMBER.y, 6, EMBER.x, EMBER.y, glowRadius);
    glow.addColorStop(0, 'rgba(255, 209, 102, 0.55)');
    glow.addColorStop(0.4, 'rgba(255, 154, 60, 0.28)');
    glow.addColorStop(1, 'rgba(255, 154, 60, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(EMBER.x, EMBER.y, glowRadius, 0, Math.PI * 2);
    context.fill();
    // Stone ring holding the flame.
    context.fillStyle = '#2a3a4d';
    context.beginPath();
    context.arc(EMBER.x, EMBER.y, EMBER.radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#4a6076';
    context.lineWidth = 3;
    context.stroke();
    // The flame itself: three layered teardrops that breathe with the fire.
    const h = (26 + 18 * flame) * flicker;
    const w = 13 + 6 * flame;
    const layers = [
      { scale: 1, color: flame > 0.25 ? PALETTE.emberDeep : '#7a3b2e' },
      { scale: 0.66, color: flame > 0.25 ? PALETTE.ember : '#a8542f' },
      { scale: 0.36, color: PALETTE.emberHot },
    ];
    for (const layer of layers) {
      context.fillStyle = layer.color;
      context.beginPath();
      context.moveTo(EMBER.x, EMBER.y - h * layer.scale);
      context.bezierCurveTo(
        EMBER.x + w * layer.scale, EMBER.y - h * layer.scale * 0.2,
        EMBER.x + w * layer.scale * 0.8, EMBER.y + h * layer.scale * 0.35,
        EMBER.x, EMBER.y + h * layer.scale * 0.32,
      );
      context.bezierCurveTo(
        EMBER.x - w * layer.scale * 0.8, EMBER.y + h * layer.scale * 0.35,
        EMBER.x - w * layer.scale, EMBER.y - h * layer.scale * 0.2,
        EMBER.x, EMBER.y - h * layer.scale,
      );
      context.fill();
    }
    if (flame <= 0.25) {
      text('THE EMBER FADES', EMBER.x, EMBER.y - EMBER.radius - 14, 15, PALETTE.bad, 'center');
    }
  }

  function drawShards(state) {
    for (const shard of state.shardList) {
      const spin = state.time * 3 + shard.x;
      context.save();
      context.translate(shard.x, shard.y);
      context.rotate(spin);
      context.fillStyle = PALETTE.gold;
      context.fillRect(-4, -4, 8, 8);
      context.fillStyle = 'rgba(255, 255, 255, 0.7)';
      context.fillRect(-2, -2, 4, 4);
      context.restore();
    }
  }

  function drawEnemy(enemy, time) {
    const flash = enemy.flash > 0;
    // A soft halo first, so a shade never dissolves into the dark glade.
    context.fillStyle = flash ? 'rgba(255,255,255,0.25)' : enemy.color;
    context.globalAlpha = 0.16;
    context.beginPath();
    context.arc(enemy.x, enemy.y, enemy.radius + 8, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    // Shadow body: dark violet, light enough to read against the night.
    context.fillStyle = flash ? '#ffffff' : '#2c2150';
    context.beginPath();
    context.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = flash ? '#ffffff' : enemy.color;
    context.lineWidth = 3;
    context.stroke();
    // Wobbling spikes around the rim make each kind read at a glance.
    const spikes = enemy.kind === 'brute' ? 8 : enemy.kind === 'herald' ? 12 : 6;
    context.strokeStyle = enemy.color;
    context.lineWidth = 2;
    for (let i = 0; i < spikes; i += 1) {
      const a = (i / spikes) * Math.PI * 2 + time * 0.6;
      const r0 = enemy.radius - 2;
      const r1 = enemy.radius + (enemy.kind === 'herald' ? 9 : 5) + Math.sin(time * 3 + i) * 2;
      context.beginPath();
      context.moveTo(enemy.x + Math.cos(a) * r0, enemy.y + Math.sin(a) * r0);
      context.lineTo(enemy.x + Math.cos(a) * r1, enemy.y + Math.sin(a) * r1);
      context.stroke();
    }
    // Two glowing eyes face the Ember: the direction the shade is hunting.
    const aim = Math.atan2(EMBER.y - enemy.y, EMBER.x - enemy.x);
    const ex = Math.cos(aim);
    const ey = Math.sin(aim);
    const px = -ey;
    const py = ex;
    for (const side of [-1, 1]) {
      circle(enemy.x + ex * 4 + px * side * 5, enemy.y + ey * 4 + py * side * 5, 3.2, flash ? '#ffffff' : enemy.color);
    }
    // Health bar over anything tougher than a wisp.
    if (enemy.maxHp > 25) {
      const width = enemy.radius * 2;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 12, width, 5);
      context.fillStyle = ratio > 0.5 ? PALETTE.good : ratio > 0.25 ? PALETTE.gold : PALETTE.bad;
      context.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 12, width * ratio, 5);
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (!player.alive) return;
    // Blink while invulnerable after a hit.
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;
    // Lantern light: a soft cone toward the aim.
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    const beam = context.createLinearGradient(0, 0, 190, 0);
    beam.addColorStop(0, 'rgba(255, 207, 92, 0.20)');
    beam.addColorStop(1, 'rgba(255, 207, 92, 0)');
    context.fillStyle = beam;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(190, -42);
    context.lineTo(190, 42);
    context.closePath();
    context.fill();
    context.restore();
    // Cloak body.
    circle(player.x, player.y, PLAYER.radius, '#274b63');
    context.strokeStyle = PALETTE.lantern;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(player.x, player.y, PLAYER.radius, 0, Math.PI * 2);
    context.stroke();
    // The lantern itself, held out toward the aim.
    const lx = player.x + Math.cos(player.angle) * (PLAYER.radius + 4);
    const ly = player.y + Math.sin(player.angle) * (PLAYER.radius + 4);
    circle(lx, ly, 6, PALETTE.lantern);
    circle(lx, ly, 3, '#fff6d8');
    // Eyes.
    const ex = Math.cos(player.angle);
    const ey = Math.sin(player.angle);
    circle(player.x + ex * 4 - ey * 4, player.y + ey * 4 + ex * 4, 2, PALETTE.text);
    circle(player.x + ex * 4 + ey * 4, player.y + ey * 4 - ex * 4, 2, PALETTE.text);
  }

  function drawBulletsAndOrbs(state) {
    for (const bolt of state.bullets) {
      context.strokeStyle = 'rgba(255, 154, 60, 0.55)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(bolt.x - bolt.vx * 0.03, bolt.y - bolt.vy * 0.03);
      context.lineTo(bolt.x, bolt.y);
      context.stroke();
      circle(bolt.x, bolt.y, bolt.radius, PALETTE.emberHot);
    }
    for (const orb of state.orbs) {
      circle(orb.x, orb.y, orb.radius + 2, 'rgba(255, 93, 115, 0.25)');
      circle(orb.x, orb.y, orb.radius, '#ff5d73');
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      circle(p.x, p.y, p.size, p.color);
    }
    context.globalAlpha = 1;
    for (const f of state.floaters) {
      context.globalAlpha = Math.max(0, f.life / 0.9);
      text(f.text, f.x, f.y, 15, f.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawField(state) {
    drawGround(state);
    drawEmber(state);
    drawShards(state);
    drawBulletsAndOrbs(state);
    for (const enemy of state.enemies) drawEnemy(enemy, state.time);
    drawPlayer(state);
    drawParticles(state);
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen. */
  function draw(state, screen, best, muted) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.nightEdge;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state);
    drawPanelScreen(context, text, state, screen, best, muted);
    // The HUD sits above play, upgrade and pause alike.
    if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED) {
      drawHud(context, text, state, muted);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Canvas pixels -> field coordinates, for click hit-testing. */
    toField(px, py) {
      return { x: (px * (window.devicePixelRatio || 1) - view.x) / view.scale, y: (py * (window.devicePixelRatio || 1) - view.y) / view.scale };
    },
    upgradeCardAt,
  };
}
