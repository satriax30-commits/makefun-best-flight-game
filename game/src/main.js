// Boot and the one loop: the renderer paints the island, the game steps the flight in
// fixed 1/60 s steps, and the HUD paints the instruments over it. The game moves between
// title, aircraft and route menus, flying, paused and result screens.
//
// ?seed=N fixes the world seed (the island is the same either way; the seed only moves
// the clouds and trees). ?shot=cover|chase|approach|landing (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import * as THREE from '../vendor/three.min.js';
import { WORLD_SEED } from './data.js';
import { buildWorld } from './terrain.js';
import { createGame } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : WORLD_SEED;

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
const world = buildWorld(scene);
const hud = createHud(hudCanvas);
const audio = createAudio();
const input = createInput(glCanvas);
const game = createGame({ scene, world, hud, audio, input, status });

// Debug handle for automated play-testing: read the state, start a route, steer the
// autopilot. It changes nothing about the game itself.
window.__tw = { game, world, seed };

function runShot(name) {
  stageShot(name, game);
  game.snapCamera();
  let painted = 0;
  function paint() {
    game.frame(0);
    renderer.render(scene, game.camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.frame(dt);
    renderer.render(scene, game.camera);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
