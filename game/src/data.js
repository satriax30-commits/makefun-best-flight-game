// The island, its airfields, its aircraft and its routes. Everything the game shows and
// scores comes from these tables: 7 named airfields, 3 aircraft with different handling,
// 6 career routes with 31 checkpoint rings, and day / dusk / night light per route.

/** The one seed the whole world is built from. Fixed, so every session flies the same island. */
export const WORLD_SEED = 20261126;
/** The island is a square, this many metres across, centred on (0, 0). */
export const ISLAND_SIZE = 4200;
/** Sea level. Terrain below this is water. */
export const SEA_LEVEL = 0;

/** Time-of-day presets: sky, fog, sun and how bright the runway lights burn. */
export const SKIES = {
  day: {
    label: 'Day', sky: 0x87b5e0, horizon: 0xcfe4f2, fog: 0xbdd3e6, sunColor: 0xfff2d8,
    sunIntensity: 2.6, sunElevation: 52, hemiSky: 0xbfd9ee, hemiGround: 0x6b7c5a,
    hemiIntensity: 0.9, ambient: 0.25, lightFactor: 1.0, stars: false,
  },
  dusk: {
    label: 'Dusk', sky: 0x5a6fa8, horizon: 0xff9a52, fog: 0xc98d5f, sunColor: 0xffb36b,
    sunIntensity: 1.9, sunElevation: 9, hemiSky: 0x8a7bb0, hemiGround: 0x5a4a3a,
    hemiIntensity: 0.55, ambient: 0.14, lightFactor: 0.55, stars: false,
  },
  night: {
    label: 'Night', sky: 0x0a1428, horizon: 0x1c2f4d, fog: 0x12233c, sunColor: 0xbfd4ff,
    sunIntensity: 0.7, sunElevation: 38, hemiSky: 0x2a3f5f, hemiGround: 0x1a2028,
    hemiIntensity: 0.3, ambient: 0.08, lightFactor: 0.3, stars: true,
  },
};

/**
 * The 7 airfields. `x`, `z` are metres from the island centre; `heading` is the runway
 * direction in degrees (the direction you take off towards); `elevation` is metres above
 * sea level; `length`/`width` are the strip in metres; `surface` is grass or asphalt.
 */
export const AIRFIELDS = [
  { id: 'COR', name: 'Coral Coast', x: -1380, z: 1150, heading: 70, elevation: 4, length: 620, width: 26, surface: 'grass', town: false },
  { id: 'LAK', name: 'Lakeview', x: 420, z: 980, heading: 250, elevation: 18, length: 700, width: 28, surface: 'grass', town: false },
  { id: 'PIN', name: 'Pine Ridge', x: -420, z: -620, heading: 140, elevation: 318, length: 560, width: 24, surface: 'grass', town: false },
  { id: 'GLA', name: 'Glacier Pass', x: 620, z: -1420, heading: 320, elevation: 402, length: 640, width: 26, surface: 'grass', town: false },
  { id: 'DES', name: 'Desert Strip', x: -1520, z: -480, heading: 20, elevation: 26, length: 780, width: 30, surface: 'asphalt', town: false },
  { id: 'HAR', name: 'Harbor City', x: 1480, z: -260, heading: 110, elevation: 8, length: 1100, width: 36, surface: 'asphalt', town: true },
  { id: 'FER', name: 'Fern Hollow', x: 1080, z: 1420, heading: 200, elevation: 64, length: 480, width: 22, surface: 'grass', town: false },
];

/** Look a field up by id. */
export function airfieldById(id) {
  return AIRFIELDS.find((field) => field.id === id);
}

/**
 * The 3 aircraft. Speeds are metres per second. `rotate` is the speed the nose comes up at,
 * `stall` is where the wings stop flying, `climb` is the best climb in m/s at full throttle,
 * `fuel` is litres on board, `turn` is the roll authority, and `runway` is the strip the
 * aircraft needs — the Falcon cannot use Fern Hollow's 480 m strip.
 */
export const AIRCRAFT = [
  {
    id: 'cub', name: 'Cub', fullName: 'Tailwind Cub', tag: 'STOL bush plane',
    desc: 'Slow, light and forgiving. Lifts off a short strip at walking pace and lands on a lawn.',
    color: 0xd94f30, trim: 0xf2e8d5, maxSpeed: 58, cruise: 42, rotate: 17, stall: 13,
    accel: 7.5, climb: 4.5, turn: 1.5, fuel: 90, runway: 420, gear: 'fixed',
  },
  {
    id: 'otter', name: 'Otter', fullName: 'Tailwind Otter', tag: 'Turboprop workhorse',
    desc: 'The courier fleet standard. Carries the heavy crates, handles a crosswind, still likes short strips.',
    color: 0x2e7f7a, trim: 0xf2f0e6, maxSpeed: 88, cruise: 64, rotate: 27, stall: 20,
    accel: 10, climb: 7, turn: 1.25, fuel: 160, runway: 560, gear: 'retractable',
  },
  {
    id: 'falcon', name: 'Falcon', fullName: 'Tailwind Falcon', tag: 'Light jet',
    desc: 'Fast enough to outrun the weather. Needs a long runway, hates going slow, and drinks fuel.',
    color: 0x3a4356, trim: 0xff8c2e, maxSpeed: 142, cruise: 105, rotate: 44, stall: 33,
    accel: 15, climb: 12, turn: 1.0, fuel: 320, runway: 950, gear: 'retractable',
  },
];

/** Look an aircraft up by id. */
export function aircraftById(id) {
  return AIRCRAFT.find((craft) => craft.id === id) ?? AIRCRAFT[0];
}

/**
 * The 6 career routes, in order. `rings` is how many checkpoint rings the route flies
 * through; `wind` is the steady wind in m/s from `windFrom` degrees; `gust` is the gust
 * strength added on top; `time` is the light the route flies in.
 */
export const ROUTES = [
  {
    id: 'r1', name: 'First Mail Run', from: 'COR', to: 'LAK', rings: 4,
    time: 'day', wind: 2, windFrom: 240, gust: 0, brief: 'Gentle first run: coast, then inland to the lake. Learn the rings, land on grass.',
  },
  {
    id: 'r2', name: 'Ridge Runner', from: 'LAK', to: 'PIN', rings: 5,
    time: 'day', wind: 5, windFrom: 190, gust: 2, brief: 'Climb out of the valley and thread the ridge to Pine Ridge, 318 m up.',
  },
  {
    id: 'r3', name: 'Dusk Delivery', from: 'PIN', to: 'GLA', rings: 5,
    time: 'dusk', wind: 6, windFrom: 300, gust: 4, brief: 'Golden hour over the high pass. Gusts shove you sideways — stay ahead of them.',
  },
  {
    id: 'r4', name: 'Night Freight', from: 'GLA', to: 'DES', rings: 6,
    time: 'night', wind: 3, windFrom: 80, gust: 1, brief: 'Stars, runway lights and six rings across the dark island to the desert strip.',
  },
  {
    id: 'r5', name: 'Crosswind Courier', from: 'DES', to: 'HAR', rings: 5,
    time: 'day', wind: 11, windFrom: 200, gust: 4, brief: 'A hard crosswind all the way to Harbor City. Crab into it or drift off the strip.',
  },
  {
    id: 'r6', name: 'Fern Hollow Finale', from: 'HAR', to: 'FER', rings: 6,
    time: 'dusk', wind: 7, windFrom: 340, gust: 5, brief: 'The last run: low cloud, strong gusts, and a 480 m grass strip in the trees. The Falcon cannot fly this one.',
  },
];

/** Look a route up by id. */
export function routeById(id) {
  return ROUTES.find((route) => route.id === id);
}

/** Which aircraft may fly a route: the strip at the far end must be long enough. */
export function aircraftAllowedOnRoute(craft, route) {
  const dest = airfieldById(route.to);
  return dest.length >= craft.runway;
}

/** The localStorage keys for career progress and best times. */
export const SAVE_KEYS = {
  unlocked: 'tailwind-express-unlocked',
  bestTimePrefix: 'tailwind-express-best-',
  careerScore: 'tailwind-express-career-score',
};
