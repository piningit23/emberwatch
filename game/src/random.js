// A small seeded random number generator (mulberry32): the same seed gives the
// same spawns, drops and upgrade offers, which is what makes the screenshot
// scenes repeatable and the game fair to re-run.
export function createRandom(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one element of an array with the seeded generator.
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}
