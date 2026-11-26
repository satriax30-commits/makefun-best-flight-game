// The screenshot scenes behind ?shot=cover|chase|approach|landing. Each one stages the
// real game at a real moment — a mid-flight ring chase, a dusk cruise, a final approach,
// a touchdown rollout — flown forward by the same autopilot and flight model the player
// uses, from the same seeded world. The same seed always gives the same frame.
import { createGame } from './game.js';

/**
 * The four scenes, each with the route and aircraft that shows it best:
 * cover flies the Otter through a ring over the lake in daylight; chase flies the Cub
 * at dusk over the high pass; approach brings the Otter down to Harbor City; landing
 * rolls the Otter out on Harbor City's strip.
 */
export const SHOT_SCENES = {
  cover: { phase: 'cruise', route: 'r1', aircraft: 'otter' },
  chase: { phase: 'chase', route: 'r3', aircraft: 'cub' },
  approach: { phase: 'approach', route: 'r5', aircraft: 'otter' },
  landing: { phase: 'landing', route: 'r5', aircraft: 'otter' },
};

/** Stage `name` (any other name is the cover) and return the staged game. */
export function stageShot(name, game) {
  const scene = SHOT_SCENES[name] ?? SHOT_SCENES.cover;
  game.stageForShot(scene.phase, scene.route, scene.aircraft);
  return scene;
}
