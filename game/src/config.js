// Emberwatch: every tuning number, colour and wave rule in one place, so a
// balance pass touches this file and nothing else. The playfield is a fixed
// 960x600 logical area; the renderer scales it to the window.
export const STEP = 1 / 60;
export const FIELD = { width: 960, height: 600 };
export const BEST_KEY = 'emberwatch-best';
export const EMBER = { x: 480, y: 300, radius: 34, maxFlame: 100 };
export const TOTAL_WAVES = 10;

export const PALETTE = {
  night: '#0b1420',
  nightEdge: '#060b13',
  glade: '#12233a',
  ember: '#ff9a3c',
  emberHot: '#ffd166',
  emberDeep: '#e4572e',
  gold: '#ffd166',
  shade: '#8b7bff',
  shadeDeep: '#5b4bc4',
  brute: '#c94f7c',
  splitter: '#7fd1c0',
  herald: '#ff5d73',
  player: '#ffe9b8',
  lantern: '#ffcf5c',
  text: '#f2ede3',
  dim: '#9db4c8',
  panel: '#101d2e',
  panelEdge: '#2a4a6b',
  good: '#7ddb8a',
  bad: '#ff6b6b',
};

// Player base stats; upgrades in player.js multiply or add to these.
export const PLAYER = {
  radius: 14,
  speed: 215,
  maxHp: 100,
  hpRegen: 0.6, // per second, only after 5 s without taking a hit
  fireInterval: 0.24, // seconds between bolts
  bulletSpeed: 540,
  bulletDamage: 14,
  bulletRadius: 5,
  bulletLife: 0.85,
  dashSpeed: 460,
  dashTime: 0.18,
  dashCooldown: 3.0,
  magnetRadius: 70,
  pickupRadius: 18,
};

// Enemy definitions. cost is the wave-budget price; score is the base kill value.
export const ENEMIES = {
  wisp: { hp: 20, speed: 58, radius: 11, touchPlayer: 8, touchEmber: 8, score: 10, color: PALETTE.shade, cost: 1 },
  splitter: { hp: 42, speed: 44, radius: 14, touchPlayer: 12, touchEmber: 10, score: 20, color: PALETTE.splitter, cost: 2 },
  brute: { hp: 95, speed: 31, radius: 20, touchPlayer: 18, touchEmber: 15, score: 30, color: PALETTE.brute, cost: 3 },
  herald: { hp: 950, speed: 25, radius: 34, touchPlayer: 25, touchEmber: 20, score: 500, color: PALETTE.herald, cost: 0 },
};

// Wave composition: a budget of points spent on wisps/splitters/brutes, plus a
// trickle of extra wisps that keeps late waves pressing. Wave 10 is the boss.
export function waveBudget(wave) {
  return 6 + wave * 4;
}
export function waveSpawnInterval(wave) {
  return Math.max(0.35, 1.1 - wave * 0.07);
}
export function waveTrickle(wave) {
  return wave >= 6 ? 1 : 0; // extra wisps slip in from wave 6 on
}

// Upgrade pool: id, name, short description, and how many times it can stack.
// Offered three at a time when a wave is cleared; multishot caps at 4 extra bolts.
export const UPGRADES = [
  { id: 'rapid', name: 'Quick Wick', desc: 'Fire 18% faster.', max: 99 },
  { id: 'heavy', name: 'Heavy Ember', desc: 'Bolts deal 25% more damage.', max: 99 },
  { id: 'split', name: 'Twin Flame', desc: '+1 bolt per shot (max 5).', max: 4 },
  { id: 'swift', name: 'Soft Steps', desc: 'Move 12% faster.', max: 99 },
  { id: 'vitality', name: 'Warm Heart', desc: '+25 max health, heal 25.', max: 99 },
  { id: 'magnet', name: 'Ember Pull', desc: 'Shards fly to you from 60% further.', max: 99 },
  { id: 'kindle', name: 'Kindle', desc: '+30 max flame, restore 30 flame.', max: 99 },
  { id: 'pierce', name: 'Piercing Light', desc: 'Bolts pass through +1 shade.', max: 3 },
  { id: 'dash', name: 'Flicker Step', desc: 'Dash recharges 25% faster.', max: 99 },
];
