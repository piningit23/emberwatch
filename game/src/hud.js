// The HUD and the screens: bars, wave and score readouts, and the title,
// upgrade, pause, victory and game-over panels. All drawing goes through the
// `text` helper the renderer hands in, so fonts stay consistent. Card geometry
// lives here too, so clicks and drawing can never drift apart.
import { FIELD, PALETTE, TOTAL_WAVES } from './config.js';

const CARD = { width: 250, height: 150, gap: 24, top: 250 };

export function cardRects() {
  const total = CARD.width * 3 + CARD.gap * 2;
  const firstX = (FIELD.width - total) / 2;
  return [0, 1, 2].map((i) => ({ x: firstX + i * (CARD.width + CARD.gap), y: CARD.top, width: CARD.width, height: CARD.height }));
}

export function upgradeCardAt(x, y) {
  const rects = cardRects();
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return i;
  }
  return -1;
}

function bar(context, x, y, width, height, ratio, fill, label) {
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillRect(x, y, width, height);
  context.fillStyle = fill;
  context.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
  context.strokeStyle = 'rgba(242, 237, 227, 0.5)';
  context.lineWidth = 1;
  context.strokeRect(x, y, width, height);
  context.fillStyle = PALETTE.text;
  context.font = 'bold 12px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(label, x + 6, y + height / 2);
}

export function drawHud(context, text, state, muted) {
  const player = state.player;
  const enemiesLeft = state.enemies.length + state.spawnQueue.length;
  // Top-left: health and flame.
  bar(context, 16, 14, 220, 20, player.hp / player.maxHp, '#c94f5e', `HP ${Math.ceil(player.hp)} / ${player.maxHp}`);
  bar(context, 16, 40, 220, 20, state.ember.flame / state.ember.maxFlame, '#ff9a3c', `FLAME ${Math.ceil(state.ember.flame)}`);
  // Top-centre: wave and what is left of it.
  text(`WAVE ${Math.max(1, state.wave)} / ${TOTAL_WAVES}`, FIELD.width / 2, 30, 22, PALETTE.text, 'center');
  text(state.phase === 'fight' ? `${enemiesLeft} shades remain` : 'Choose a blessing', FIELD.width / 2, 54, 14, PALETTE.dim, 'center');
  // Top-right: score, best, shards, combo.
  text(`SCORE ${state.score}`, FIELD.width - 16, 26, 22, PALETTE.gold, 'right');
  text(`BEST ${Math.max(state.best, state.score)}   SHARDS ${state.shards}`, FIELD.width - 16, 50, 14, PALETTE.dim, 'right');
  if (state.combo >= 3) {
    text(`COMBO x${(1 + Math.min(state.combo, 20) * 0.05).toFixed(2)}  (${state.combo})`, FIELD.width - 16, 72, 15, PALETTE.emberHot, 'right');
  }
  // Bottom-left: dash readiness and the keys that matter.
  const dashReady = player.dashCd <= 0;
  text(dashReady ? 'DASH READY  [Shift]' : `Dash ${player.dashCd.toFixed(1)}s`, 16, FIELD.height - 16, 13, dashReady ? PALETTE.good : PALETTE.dim, 'left');
  text('WASD move · Mouse aim · Hold Click / Space to fire · P pause · M mute', FIELD.width / 2, FIELD.height - 16, 13, PALETTE.dim, 'center');
  if (muted) text('MUTED', FIELD.width - 16, FIELD.height - 16, 13, PALETTE.dim, 'right');
}

function panel(context, text, title, lines, prompt, accent) {
  const width = 620;
  const lineHeight = 30;
  const height = 120 + lines.length * lineHeight + 64;
  const x = (FIELD.width - width) / 2;
  const y = (FIELD.height - height) / 2;
  context.fillStyle = 'rgba(6, 11, 19, 0.72)';
  context.fillRect(0, 0, FIELD.width, FIELD.height);
  context.fillStyle = PALETTE.panel;
  context.fillRect(x, y, width, height);
  context.strokeStyle = accent || PALETTE.panelEdge;
  context.lineWidth = 2;
  context.strokeRect(x, y, width, height);
  text(title, FIELD.width / 2, y + 58, 40, accent || PALETTE.text, 'center');
  for (let i = 0; i < lines.length; i += 1) {
    text(lines[i], FIELD.width / 2, y + 108 + i * lineHeight, 18, i === 0 ? PALETTE.text : PALETTE.dim, 'center');
  }
  text(prompt, FIELD.width / 2, y + height - 26, 18, PALETTE.gold, 'center');
}

function upgradePanel(context, text, state) {
  context.fillStyle = 'rgba(6, 11, 19, 0.66)';
  context.fillRect(0, 0, FIELD.width, FIELD.height);
  text('THE EMBER BURNS BRIGHTER', FIELD.width / 2, 130, 34, PALETTE.gold, 'center');
  text(`Wave ${state.wave} cleared — choose one blessing, Keeper.`, FIELD.width / 2, 168, 18, PALETTE.text, 'center');
  text(`Score ${state.score} · Flame ${Math.ceil(state.ember.flame)} · HP ${Math.ceil(state.player.hp)}`, FIELD.width / 2, 196, 15, PALETTE.dim, 'center');
  const rects = cardRects();
  for (let i = 0; i < state.offered.length; i += 1) {
    const upgrade = state.offered[i];
    const r = rects[i];
    context.fillStyle = PALETTE.panel;
    context.fillRect(r.x, r.y, r.width, r.height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(r.x, r.y, r.width, r.height);
    text(`[${i + 1}]`, r.x + r.width / 2, r.y + 30, 15, PALETTE.dim, 'center');
    text(upgrade.name, r.x + r.width / 2, r.y + 62, 20, PALETTE.emberHot, 'center');
    // Wrap the description across two centred lines.
    const words = upgrade.desc.split(' ');
    let line = '';
    let lineY = r.y + 96;
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 22 && line) {
        text(line.trim(), r.x + r.width / 2, lineY, 14, PALETTE.text, 'center');
        line = word;
        lineY += 20;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    text(line, r.x + r.width / 2, lineY, 14, PALETTE.text, 'center');
    const taken = state.player.upgrades[upgrade.id] || 0;
    if (taken > 0) text(`Taken ${taken}x`, r.x + r.width / 2, r.y + r.height - 12, 12, PALETTE.dim, 'center');
  }
  text('Click a card or press 1 / 2 / 3', FIELD.width / 2, CARD.top + CARD.height + 44, 16, PALETTE.gold, 'center');
}

export function drawPanelScreen(context, text, state, screen, best, muted) {
  if (screen === 'title') {
    panel(context, text, 'EMBERWATCH', [
      'You are the Keeper of the Last Ember.',
      'Shades crawl out of the dark to snuff its flame.',
      'Hold the line for 10 waves. If the flame dies, all is dark.',
      'WASD / Arrows to move · Mouse to aim · Hold Click or Space to fire',
      'Shift to dash · Gather shards to feed the flame · Pick a blessing each wave',
      `Best score: ${best}`,
    ], 'Press Space or click to begin', PALETTE.ember);
  } else if (screen === 'upgrade') {
    upgradePanel(context, text, state);
  } else if (screen === 'paused') {
    panel(context, text, 'PAUSED', ['The shades wait in the dark.', 'The Ember keeps burning.'], 'Press P or click to resume');
  } else if (screen === 'over') {
    const lostTo = state.ember.flame <= 0 ? 'The Ember has gone out.' : 'The Keeper has fallen.';
    const accuracy = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
    panel(context, text, 'THE DARK WINS', [
      lostTo,
      `Score ${state.score} · Best ${Math.max(best, state.score)}`,
      `Waves cleared ${Math.max(0, state.wave - 1)} · Shades banished ${state.kills} · Accuracy ${accuracy}%`,
    ], 'Press Space or click to keep watch again', PALETTE.bad);
  } else if (screen === 'win') {
    const accuracy = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
    panel(context, text, 'DAWN BREAKS', [
      'Ten waves, and the Ember still burns. The glade is yours, Keeper.',
      `Score ${state.score} · Best ${Math.max(best, state.score)}`,
      `Shades banished ${state.kills} · Shards gathered ${state.shards} · Accuracy ${accuracy}%`,
    ], 'Press Space or click to play again', PALETTE.gold);
  }
  void muted;
}
