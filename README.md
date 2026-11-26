# TAILWIND EXPRESS — fly 6 cargo routes across 7 named airfields, 3 aircraft, rings, weather, day/dusk/night, scored landings

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/satriax30-commits/makefun-flight-game/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/satriax30-commits/makefun-flight-game/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

A bush-plane cargo courier in the browser. Fly **6 cargo routes** across **7 named
airfields** — Coral Coast, Lakeview, Pine Ridge, Glacier Pass, Desert Strip, Harbor City,
Fern Hollow — on one seeded island of coast, lake, desert, city, pine forest and glacier,
in **3 aircraft** (Cub STOL, Otter turboprop, Falcon jet), through **31 checkpoint rings**,
in **day, dusk and night** light, with steady wind, gusts and fuel to manage. Every
landing is scored on time, smoothness and fuel left.

## How to play

1. **Career** — fly the 6 routes in order; finishing a route unlocks the next one.
   **Time Trial** — the same routes against your best time (saved on this computer).
   **Free Flight** — pick any airfield and fly with no rings and no timer.
2. Pick an aircraft: the Cub lifts off a 420 m strip, the Otter is the all-rounder,
   the Falcon is fast but needs a 950 m runway — it cannot fly the Fern Hollow finale.
3. Take off into the wind, fly through every ring, and land on the destination strip:
   slow, on centreline, gentle on the wheels. A smooth touchdown beats a fast one.

## Controls

| Key | Action |
| --- | --- |
| W / S | Throttle up / down (Shift = full, Ctrl = idle) |
| ↑ / ↓ | Pitch — nose down / nose up |
| ← / → | Roll — bank left / right (turns follow the bank) |
| F | Flaps — slower stall, more drag (use on final) |
| G | Landing gear up / down |
| B | Wheel brake (hold on the runway) |
| C | Camera — chase / near / nose |
| Mouse drag | Orbit the chase camera |
| P / Esc | Pause |
| M | Mute sound |
| R | Restart the route |

Watch the stall speed: below it the nose drops and the wings stop answering. Flaps
lower it; the gear adds drag. Fuel burns with throttle — an empty tank is a glider.

## Scoring

Completion 400 + time bonus up to 400 (against a par time per route) + landing bonus
up to 300 (vertical speed at touchdown and centreline offset) + fuel bonus up to 200
+ 150 per ring cleared. Grades run S / A / B / C.

## Tech

- Three.js (vendored as `game/vendor/three.min.js`) chase view over a procedural
  seeded island: heightfield terrain, lake, desert, mountain ridge, Harbor City,
  instanced pine forest, drifting clouds, day/dusk/night skies with stars and runway
  edge lights at night.
- 2D canvas HUD: artificial horizon with pitch ladder, airspeed and altitude tapes,
  heading tape, vertical speed, fuel and throttle gauges, flaps/gear lights, wind,
  ring progress and mission clock.
- WebAudio synth only: engine hum follows throttle, wind follows airspeed, ring
  chime, touchdown thud. No audio files, no network at runtime, no build step.
- Deterministic: one fixed world seed; the same seed always builds the same island
  and the same flight. Screenshots are staged from the real game with
  `?shot=cover|chase|approach|landing&seed=1` (see `shots.json`).

## Run it

```sh
node serve.ts   # then open http://localhost:8080
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the kit's make.fun library.

## License

MIT — see `LICENSE`.
