// Seeded randomness for Tailwind Express. The whole island, the clouds, the trees and
// every gust are drawn from one seeded generator, so the same seed always builds the same
// world and the same flight. Nothing here reads the wall clock or Math.random.

/** Mulberry32: a small, fast, deterministic PRNG. `seed` is any 32-bit integer. */
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    /** Uniform float in [0, 1). */
    next,
    /** Uniform float in [min, max). */
    range(min, max) { return min + (max - min) * next(); },
    /** Uniform integer in [min, max]. */
    int(min, max) { return Math.floor(min + (max - min + 1) * next()); },
    /** Pick one element of `array`. */
    pick(array) { return array[Math.floor(next() * array.length)]; },
    /** True with probability `p`. */
    chance(p) { return next() < p; },
  };
}

/** Deterministic 2D value noise in [0, 1], built from a seeded hash of integer cells. */
export function createValueNoise(seed) {
  const rand = createRandom(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rand.next() * (i + 1));
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];
  function hash(ix, iz) { return perm[(perm[ix & 255] + iz) & 255] / 255; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise(x, z) {
    const ix = Math.floor(x); const iz = Math.floor(z);
    const fx = x - ix; const fz = z - iz;
    const a = hash(ix, iz); const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1); const d = hash(ix + 1, iz + 1);
    const u = smooth(fx); const v = smooth(fz);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
  }
  /** Fractal noise: `octaves` layers, each twice the frequency, half the weight. */
  return function fbm(x, z, octaves) {
    let sum = 0; let amp = 0.5; let freq = 1;
    for (let o = 0; o < octaves; o += 1) {
      sum += amp * noise(x * freq, z * freq);
      amp *= 0.5; freq *= 2.03;
    }
    return sum;
  };
}
