// TAILWIND EXPRESS — the hand-in program (Node 22, standard library only).
//
// The game is the static files under game/ beside this file: index.html plus its ES
// modules, with three.js vendored as game/vendor/three.min.js and
// game/vendor/three.core.js. This program copies game/ and screenshots/ into the
// output directory and writes dossier.json with the kit's make.fun library, exactly
// as the gate rebuilds it. It runs twice in the grader and both runs must write the
// same bytes, so it does nothing time- or environment-dependent: no timestamps, no
// random numbers, no absolute paths in output.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The whole game, as handed in: every file under game/, plain copies.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// The screenshots, real renders of the game's own code (see shots.json).
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier the judge reads, with the gate's own caps: at most 4 screenshots of at
// most 256 KiB, at most 993 files and 48 MiB under game/, paths under 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
