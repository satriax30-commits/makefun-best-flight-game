// The game itself: screens, routes, scoring, the autopilot (for the screenshot scenes),
// the chase camera and the menu wiring. The flight model lives in plane.js, the world
// in terrain.js, the instruments in hud.js — this file only runs the mission.
import * as THREE from '../vendor/three.min.js';
import {
  AIRCRAFT, AIRFIELDS, ISLAND_SIZE, ROUTES, SAVE_KEYS, aircraftAllowedOnRoute, aircraftById, airfieldById, routeById,
} from './data.js';
import { buildAircraftMesh, createFlightState, poseAircraft, stepFlight } from './plane.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_FLAPS, ACTION_GEAR, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART } from './input.js';

const STEP = 1 / 60;
const HALF = ISLAND_SIZE / 2;
const MS_TO_KT = 1.94384;

/** Wrap an angle in degrees to [-180, 180). */
function wrap180(deg) {
  return ((deg + 540) % 360) - 180;
}

/** Distance from a point to a runway's centreline, and whether it is on the strip. */
export function fieldAt(x, z) {
  for (const field of AIRFIELDS) {
    const rad = THREE.MathUtils.degToRad(field.heading);
    const dx = x - field.x; const dz = z - field.z;
    const along = dx * Math.sin(rad) - dz * Math.cos(rad);
    const across = dx * Math.cos(rad) + dz * Math.sin(rad);
    if (Math.abs(along) <= field.length / 2 + 40 && Math.abs(across) <= field.width / 2 + 40) {
      return { field, along, across };
    }
  }
  return null;
}

/** Read the career unlock level from storage (1 = only route 1 open). */
function readUnlocked() {
  try {
    return Math.min(ROUTES.length, Math.max(1, Number.parseInt(localStorage.getItem(SAVE_KEYS.unlocked) ?? '1', 10) || 1));
  } catch { return 1; }
}
function writeUnlocked(n) {
  try { localStorage.setItem(SAVE_KEYS.unlocked, String(n)); } catch { /* storage off */ }
}
function readBestTime(routeId) {
  try {
    const v = Number.parseFloat(localStorage.getItem(SAVE_KEYS.bestTimePrefix + routeId) ?? '');
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}
function writeBestTime(routeId, seconds) {
  try {
    const prev = readBestTime(routeId);
    if (prev === null || seconds < prev) localStorage.setItem(SAVE_KEYS.bestTimePrefix + routeId, String(seconds));
  } catch { /* storage off */ }
}

/**
 * The autopilot: a PD controller that flies the plane at a target point and speed.
 * It is the pilot for the deterministic screenshot scenes, and nothing else — a human
 * player flies with the keyboard. Two details keep it from circling the target forever:
 * the bank shrinks as the target gets close (so the final approach is nearly straight),
 * and it aims upwind of the target by the drift the wind adds while it gets there.
 */
export function autopilotInput(state, craft, target, wind, heightAt) {
  const dx = target.x - state.x; const dz = target.z - state.z;
  const dist = Math.hypot(dx, dz);
  // Lead the target upwind: the wind carries the plane for `timeToTarget` seconds.
  const timeToTarget = dist / Math.max(20, state.speed);
  const aimX = target.x - (wind ? wind.x : 0) * timeToTarget;
  const aimZ = target.z - (wind ? wind.z : 0) * timeToTarget;
  const adx = aimX - state.x; const adz = aimZ - state.z;
  // The yaw that flies at the aim point, converted to a heading, compared with ours.
  const desiredYaw = Math.atan2(-adx, -adz);
  const desiredHeading = -THREE.MathUtils.radToDeg(desiredYaw);
  const headingErr = wrap180(desiredHeading - state.headingDeg);
  const maxBank = dist > 400 ? 0.55 : dist > 150 ? 0.35 : 0.18;
  const desiredRoll = THREE.MathUtils.clamp(headingErr * 0.02, -maxBank, maxBank);
  const roll = THREE.MathUtils.clamp((desiredRoll - state.roll) * 2.2, -1, 1);
  let desiredPitch;
  let throttle;
  if (state.onGround) {
    throttle = 1;
    desiredPitch = state.speed > craft.rotate * 0.92 ? 0.16 : 0;
  } else {
    const altErr = target.y - state.y;
    desiredPitch = THREE.MathUtils.clamp(altErr * 0.008, -0.22, 0.3);
    if (target.flare && state.y - target.groundY < 12) desiredPitch = 0.07;
    // Terrain floor: look ahead along the heading; if the ground rises above us,
    // climb. Near a ring (or on final) trust the ring's own clearance instead.
    const floorDist = target.kind === 'ring' ? 220 : 500;
    if (dist > floorDist) {
      const fwdX = -Math.sin(state.yaw); const fwdZ = -Math.cos(state.yaw);
      const ahead = Math.max(
        heightAt(state.x + fwdX * 120, state.z + fwdZ * 120),
        heightAt(state.x + fwdX * 260, state.z + fwdZ * 260),
      );
      if (state.y < ahead + 45) desiredPitch = Math.max(desiredPitch, 0.25);
    }
    throttle = THREE.MathUtils.clamp(0.5 + (target.speed - state.speed) * 0.04, target.flare ? 0.12 : 0, 1);
    if (target.flare && state.y - target.groundY < 12) throttle = 0.12;
  }
  const pitch = THREE.MathUtils.clamp((desiredPitch - state.pitch) * 2.4, -1, 1);
  return {
    pitch, roll, throttle,
    flaps: target.flaps ?? 0,
    gear: true, brake: false,
    _dist: dist,
  };
}

export function createGame(deps) {
  const { scene, world, hud, audio, input, status } = deps;
  const heightAt = world.heightAt;
  let aircraftMesh = null;
  let propeller = null;
  let beacon = null;
  let ringsBuilt = null;

  let screen = 'title';
  let mode = 'career';
  let route = null;
  let aircraft = AIRCRAFT[0];
  let flight = null;
  let flapsTarget = 0;
  let cameraMode = 0;
  let orbitYaw = 0; let orbitPitch = 0;
  let simTime = 0;
  let ringsPassed = 0;
  let message = ''; let messageUntil = 0; let messageColor = '#ffd166';
  let touchdown = null;
  let result = null;
  let autopilot = false;
  let paused = false;
  let unlocked = readUnlocked();
  let pendingAircraft = null;
  let departureId = 'COR';

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();

  function announce(text) { status.textContent = text; }
  function showMessage(text, color = '#ffd166', seconds = 2.5) {
    message = text; messageColor = color; messageUntil = simTime + seconds;
  }

  /** Show exactly one menu panel (or none while flying). */
  function showPanel(id) {
    for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== id;
  }

  function isRunwayAt(x, z) {
    return fieldAt(x, z) !== null;
  }

  /** Wind vector at sim time `t`: steady wind plus deterministic gusts. */
  function windAt(t) {
    if (!route) return { x: 0, z: 0, speed: 0 };
    const gust = route.gust * (0.5 + 0.5 * Math.sin(t * 0.7) + 0.3 * Math.sin(t * 1.9));
    const speed = Math.max(0, route.wind + gust);
    const rad = THREE.MathUtils.degToRad(route.windFrom);
    return { x: -Math.sin(rad) * speed, z: -Math.cos(rad) * speed, speed };
  }

  function clearFlight() {
    if (aircraftMesh) { scene.remove(aircraftMesh); aircraftMesh = null; propeller = null; beacon = null; }
    if (ringsBuilt) { world.disposeRings(ringsBuilt); ringsBuilt = null; }
    flight = null; ringsPassed = 0; touchdown = null; result = null; autopilot = false;
  }

  /** Put a plane on a departure strip and build the route's rings. */
  function setupFlight(routeObj, craft, fromField, toField) {
    clearFlight();
    route = routeObj;
    aircraft = craft;
    departureId = fromField.id;
    world.setSky(routeObj ? routeObj.time : 'day');
    flight = createFlightState(craft, fromField, heightAt);
    const built = buildAircraftMesh(craft);
    aircraftMesh = built.group;
    propeller = built.propeller;
    beacon = built.beacon;
    scene.add(aircraftMesh);
    poseAircraft(aircraftMesh, flight);
    if (routeObj) {
      ringsBuilt = world.buildRings(routeObj, fromField, toField);
    }
    flapsTarget = 0;
    simTime = 0;
    camera.position.set(flight.x - 20, flight.y + 8, flight.z + 20);
    camera.lookAt(flight.x, flight.y, flight.z);
  }

  function startRoute(routeId, craftId) {
    const routeObj = routeById(routeId);
    const craft = aircraftById(craftId);
    setupFlight(routeObj, craft, airfieldById(routeObj.from), airfieldById(routeObj.to));
    mode = 'career';
    screen = 'fly';
    showPanel('');
    announce(`${routeObj.name}. ${aircraftById(craftId).fullName}. Take off from ${airfieldById(routeObj.from).name}.`);
    showMessage(`${routeObj.name} — ${airfieldById(routeObj.from).name} → ${airfieldById(routeObj.to).name}`, '#ffd166', 3.5);
    audio.start();
  }

  function startFreeFlight(fieldId, craftId) {
    const field = airfieldById(fieldId);
    const craft = aircraftById(craftId);
    setupFlight(null, craft, field, field);
    route = { id: 'free', name: 'Free Flight', rings: 0, time: 'day', wind: 3, windFrom: 210, gust: 1 };
    mode = 'free';
    screen = 'fly';
    showPanel('');
    announce(`Free flight from ${field.name}.`);
    showMessage(`Free Flight — ${field.name}`, '#ffd166', 3);
    audio.start();
  }

  /** Score a finished flight: completion + time + landing + fuel + rings. */
  function scoreFlight(kind) {
    const ringCount = route && route.id !== 'free' ? route.rings : 0;
    const maxScore = 400 + 400 + 300 + 200 + 150 * ringCount;
    // A crash earns no completion, time or landing bonus — only rings and fuel.
    if (kind === 'crashed') {
      const fuelBonus = Math.round(200 * (flight.fuel / aircraft.fuel));
      const score = ringsPassed * 150 + fuelBonus;
      return { score, maxScore, timeBonus: 0, landingBonus: 0, fuelBonus, grade: '—', frac: score / maxScore };
    }
    let score = 400;
    let timeBonus = 0;
    if (route && route.id !== 'free') {
      const from = airfieldById(route.from); const to = airfieldById(route.to);
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      const par = dist / aircraft.cruise * 1.25 + 75;
      timeBonus = Math.round(Math.max(0, Math.min(400, 400 * (par / Math.max(flight.time, 1)))));
      score += timeBonus;
    }
    let landingBonus = 0;
    if (touchdown) {
      const vsPart = touchdown.vs >= -1.5 ? 1 : touchdown.vs >= -3 ? 0.85 : touchdown.vs >= -5 ? 0.6 : 0.35;
      const centrePart = Math.max(0, 1 - Math.abs(touchdown.across) / 14);
      landingBonus = Math.round(300 * (vsPart * 0.7 + centrePart * 0.3));
      score += landingBonus;
    }
    const fuelBonus = Math.round(200 * (flight.fuel / aircraft.fuel));
    score += fuelBonus;
    score += ringsPassed * 150;
    const frac = score / maxScore;
    const grade = frac >= 0.78 ? 'S' : frac >= 0.62 ? 'A' : frac >= 0.45 ? 'B' : 'C';
    return { score, maxScore, timeBonus, landingBonus, fuelBonus, grade, frac };
  }

  function finishFlight(kind, reason = '') {
    const dest = route && route.id !== 'free' ? airfieldById(route.to) : null;
    const landedHere = fieldAt(flight.x, flight.z);
    const atDestination = dest && landedHere && landedHere.field.id === dest.id;
    const scored = scoreFlight(kind);
    if (kind === 'landed' && atDestination && route.id !== 'free') {
      const idx = ROUTES.findIndex((r) => r.id === route.id);
      if (idx + 1 < ROUTES.length && unlocked <= idx + 1) {
        unlocked = idx + 2;
        writeUnlocked(unlocked);
      }
      const prev = readBestTime(route.id);
      writeBestTime(route.id, flight.time);
      result = {
        kind: 'landed', atDestination: true, scored,
        isBest: prev === null || flight.time < prev,
        destName: dest.name,
      };
    } else if (kind === 'landed') {
      result = { kind: 'landed', atDestination: false, scored, destName: dest ? dest.name : '' };
    } else {
      result = { kind: 'crashed', reason, scored };
    }
    flight.landed = kind === 'landed';
    screen = 'result';
    showResult();
    announce(kind === 'landed' ? `Landed. Score ${scored.score}.` : `Crashed: ${reason}.`);
  }

  function showResult() {
    const title = document.getElementById('result-title');
    const body = document.getElementById('result-body');
    const nextBtn = document.getElementById('btn-next');
    const s = result.scored;
    const mins = Math.floor(flight.time / 60);
    const secs = Math.floor(flight.time % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (result.kind === 'landed' && result.atDestination) {
      title.textContent = 'Delivered — welcome to ' + result.destName;
      body.innerHTML = `<div class="grade">${s.grade}</div>
        <p>Route complete in <b>${timeStr}</b> · score <b>${s.score}</b> / ${s.maxScore}</p>
        <p>Time bonus <b>+${s.timeBonus}</b> · landing <b>+${s.landingBonus}</b> · fuel left <b>+${s.fuelBonus}</b> · rings <b>${ringsPassed} × 150</b></p>
        <p class="good">${result.isBest ? 'New best time for this route.' : 'Best time on this route: ' + formatBest(route.id)}</p>
        <p>Fuel remaining: <b>${Math.round(flight.fuel)} L</b> of ${aircraft.fuel} L.</p>`;
      nextBtn.hidden = mode !== 'career' || ROUTES.findIndex((r) => r.id === route.id) + 1 >= ROUTES.length;
    } else if (result.kind === 'landed') {
      title.textContent = 'Landed — but off the route';
      body.innerHTML = `<p>You put it down safely, but the cargo was meant for <b>${result.destName || 'an airfield'}</b>.</p>
        <p>Time <b>${timeStr}</b> · landing <b>+${s.landingBonus}</b> · score <b>${s.score}</b></p>
        <p>Fly the route again and land on the destination strip.</p>`;
      nextBtn.hidden = true;
    } else {
      title.textContent = 'Crashed — ' + result.reason;
      body.innerHTML = `<p>The ${aircraft.fullName} is a write-off. The cargo is fine; the insurance is not.</p>
        <p>Rings cleared: <b>${ringsPassed}</b> · time in the air: <b>${timeStr}</b></p>
        <p class="bad">Tip: keep the speed above stall (${Math.round(aircraft.stall * MS_TO_KT)} kt, lower with flaps) and land slow, on centreline, gently.</p>`;
      nextBtn.hidden = true;
    }
    showPanel('screen-result');
  }

  function formatBest(routeId) {
    const best = readBestTime(routeId);
    if (best === null) return '—';
    return `${String(Math.floor(best / 60)).padStart(2, '0')}:${String(Math.floor(best % 60)).padStart(2, '0')}`;
  }

  /** The next thing the autopilot should aim at: a ring, or the destination strip. */
  function autopilotTarget() {
    if (ringsBuilt) {
      const next = ringsBuilt.rings.find((r) => !r.passed);
      if (next) return { x: next.x, y: next.y, z: next.z, speed: aircraft.cruise, flaps: 0, gear: false, kind: 'ring' };
    }
    const dest = route && route.id !== 'free' ? airfieldById(route.to) : null;
    if (!dest) return { x: flight.x, y: flight.y + 40, z: flight.z, speed: aircraft.cruise, flaps: 0, gear: false, kind: 'ring' };
    const rad = THREE.MathUtils.degToRad(dest.heading);
    const fx = Math.sin(rad); const fz = -Math.cos(rad);
    // Touchdown point: 120 m past the threshold, on the centreline.
    const ax = dest.x - fx * (dest.length / 2 - 120);
    const az = dest.z - fz * (dest.length / 2 - 120);
    const distToAim = Math.hypot(ax - flight.x, az - flight.z);
    const flare = distToAim < 1600;
    const targetY = flare
      ? dest.elevation + Math.max(2, distToAim * 0.07)
      : Math.max(dest.elevation + 60, flight.y);
    return {
      x: flare ? ax : dest.x - fx * 500, y: targetY, z: flare ? az : dest.z - fz * 500,
      speed: flare ? aircraft.rotate * 1.25 : aircraft.cruise,
      flaps: flare ? 1 : 0, flare, groundY: dest.elevation, gear: flare, kind: 'dest',
    };
  }

  function stepSim() {
    simTime += STEP;
    const wind = windAt(simTime);
    let inp;
    if (autopilot) {
      const target = autopilotTarget();
      inp = autopilotInput(flight, aircraft, target, wind, heightAt);
      flapsTarget = inp.flaps;
      flight.gearDown = target.gear || flight.onGround;
    } else {
      inp = input.read(flight.throttle, flapsTarget, flight.gearDown);
      flight.gearDown = inp.gear;
    }
    const event = stepFlight(flight, aircraft, inp, wind, heightAt, isRunwayAt);
    if (event === 'takeoff') {
      showMessage('AIRBORNE', '#7be495', 2);
      audio.thud(false);
    } else if (event === 'touchdown') {
      const here = fieldAt(flight.x, flight.z);
      touchdown = { vs: flight.verticalSpeed, across: here ? here.across : 999, speed: flight.speed };
      const smooth = flight.verticalSpeed >= -3;
      showMessage(smooth ? 'TOUCHDOWN — SMOOTH' : 'TOUCHDOWN', smooth ? '#7be495' : '#ffd166', 2.5);
      audio.thud(!smooth);
    } else if (event === 'crash') {
      audio.thud(true);
      finishFlight('crashed', flight.crashReason);
      return;
    }
    // Rings.
    if (ringsBuilt) {
      for (const ring of ringsBuilt.rings) {
        if (ring.passed) continue;
        const d = Math.hypot(ring.x - flight.x, ring.y - flight.y, ring.z - flight.z);
        if (d < 13) {
          ring.passed = true;
          ringsPassed += 1;
          ring.mesh.material.emissive.setHex(0x2e9e4f);
          ring.mesh.material.color.setHex(0x7be495);
          showMessage(`RING ${ringsPassed}/${ringsBuilt.rings.length}`, '#7be495', 1.6);
          audio.ring();
        }
      }
    }
    // Landing judged when the roll stops (or nearly).
    if (flight.onGround && flight.airborne && !flight.crashed && !flight.landed) {
      if (flight.speed < 5) {
        const here = fieldAt(flight.x, flight.z);
        if (here) finishFlight('landed');
      } else if (flight.speed < 0.5 && !fieldAt(flight.x, flight.z)) {
        finishFlight('landed');
      }
    }
    // Out of the island, or out of fuel in the air: it ends badly.
    if (Math.hypot(flight.x, flight.z) > HALF + 1400) {
      flight.crashed = true;
      flight.crashReason = 'flew out to sea';
      finishFlight('crashed', flight.crashReason);
      return;
    }
    if (flight.fuel <= 0 && !flight.onGround && flight.speed < aircraft.stall) {
      // Gliding with no fuel is allowed; the ground decides.
    }
    world.updateClouds(simTime, wind.speed, route ? route.windFrom : 210);
    audio.update(flight.throttle, flight.speed, flight.airborne);
  }

  /** Chase camera: behind and above the plane, smoothed, with mouse orbit and 3 modes. */
  function updateCamera(dt) {
    const orbit = input.takeOrbit();
    orbitYaw += orbit.dx * 0.004;
    orbitPitch = THREE.MathUtils.clamp(orbitPitch + orbit.dy * 0.002, -0.15, 0.45);
    orbitYaw *= Math.max(0, 1 - dt * 0.25);
    orbitPitch *= Math.max(0, 1 - dt * 0.25);
    const fwd = new THREE.Vector3(-Math.sin(flight.yaw), 0, -Math.cos(flight.yaw));
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    if (cameraMode === 2) {
      camTarget.copy(flight).addScaledVector(fwd, 3).add(new THREE.Vector3(0, 1.1, 0));
      camPos.copy(flight).addScaledVector(fwd, 120);
    } else {
      const dist = cameraMode === 0 ? 15 : 8.5;
      const height = cameraMode === 0 ? 4.6 : 2.6;
      const behind = fwd.clone().applyAxisAngle(up, orbitYaw);
      camTarget.copy(flight)
        .addScaledVector(behind, -dist)
        .add(new THREE.Vector3(0, height + orbitPitch * 14, 0));
      camPos.copy(flight).addScaledVector(fwd, 26).add(new THREE.Vector3(0, 1.5, 0));
    }
    camera.position.lerp(camTarget, 1 - Math.exp(-dt * 7));
    camera.lookAt(camPos);
    camera.rotation.z += flight.roll * 0.12;
  }

  // --- Menus. ---
  function buildAircraftList() {
    const list = document.getElementById('aircraft-list');
    list.innerHTML = '';
    for (const craft of AIRCRAFT) {
      const btn = document.createElement('button');
      btn.className = 'pick';
      btn.innerHTML = `<span class="name">${craft.fullName}</span><span class="tag">${craft.tag}</span><br>
        <span class="meta">${craft.desc}</span>
        <span class="aircraft-stats"><span>Top <b>${Math.round(craft.maxSpeed * MS_TO_KT)} kt</b></span>
        <span>Rotate <b>${Math.round(craft.rotate * MS_TO_KT)} kt</b></span>
        <span>Stall <b>${Math.round(craft.stall * MS_TO_KT)} kt</b></span>
        <span>Fuel <b>${craft.fuel} L</b></span>
        <span>Needs <b>${craft.runway} m</b></span></span>`;
      btn.addEventListener('click', () => {
        audio.start(); audio.click();
        pendingAircraft = craft.id;
        openRoutes();
      });
      list.appendChild(btn);
    }
  }

  function openRoutes() {
    const list = document.getElementById('route-list');
    const heading = document.getElementById('routes-heading');
    const sub = document.getElementById('routes-sub');
    list.innerHTML = '';
    if (mode === 'trial') {
      heading.textContent = 'Time Trial — pick a route';
      sub.textContent = 'Same six routes, one clock. Beat your best time; it is saved on this computer.';
    } else {
      heading.textContent = 'Career — pick a route';
      sub.textContent = 'Fly them in order. Finish a route to unlock the next one.';
    }
    const craft = aircraftById(pendingAircraft ?? 'cub');
    for (let i = 0; i < ROUTES.length; i += 1) {
      const routeObj = ROUTES[i];
      const locked = mode === 'career' && i + 1 > unlocked;
      const allowed = aircraftAllowedOnRoute(craft, routeObj);
      const btn = document.createElement('button');
      btn.className = 'pick' + (locked || !allowed ? ' locked' : '');
      const from = airfieldById(routeObj.from); const to = airfieldById(routeObj.to);
      const best = readBestTime(routeObj.id);
      btn.innerHTML = `<span class="name">${i + 1}. ${routeObj.name}</span>
        ${locked ? '<span class="tag">LOCKED</span>' : ''}${!allowed ? '<span class="tag">TOO SHORT FOR ' + craft.name.toUpperCase() + '</span>' : ''}<br>
        <span class="meta">${from.name} → ${to.name} · ${routeObj.rings} rings · ${routeObj.time} · wind ${routeObj.wind} m/s${routeObj.gust ? ` + gusts ${routeObj.gust}` : ''}</span><br>
        <span class="meta">${routeObj.brief}</span><br>
        <span class="meta">Best: <b>${best === null ? '—' : formatBest(routeObj.id)}</b></span>`;
      if (!locked && allowed) {
        btn.addEventListener('click', () => { audio.click(); startRoute(routeObj.id, craft.id); });
      }
      list.appendChild(btn);
    }
    screen = 'routes';
    showPanel('screen-routes');
  }

  function buildFreeList() {
    const list = document.getElementById('free-list');
    list.innerHTML = '';
    for (const field of AIRFIELDS) {
      const btn = document.createElement('button');
      btn.className = 'pick';
      btn.innerHTML = `<span class="name">${field.name}</span><span class="tag">${field.id}</span><br>
        <span class="meta">${field.surface} strip · ${field.length} m · ${field.elevation} m above the sea</span>`;
      btn.addEventListener('click', () => { audio.click(); startFreeFlight(field.id, pendingAircraft ?? 'cub'); });
      list.appendChild(btn);
    }
  }

  function wireMenus() {
    buildAircraftList();
    document.getElementById('btn-career').addEventListener('click', () => {
      mode = 'career'; audio.start(); audio.click();
      screen = 'aircraft'; showPanel('screen-aircraft');
    });
    document.getElementById('btn-trial').addEventListener('click', () => {
      mode = 'trial'; audio.start(); audio.click();
      screen = 'aircraft'; showPanel('screen-aircraft');
    });
    document.getElementById('btn-free').addEventListener('click', () => {
      mode = 'free'; audio.start(); audio.click();
      pendingAircraft = pendingAircraft ?? 'cub';
      buildFreeList();
      screen = 'free'; showPanel('screen-free');
    });
    document.getElementById('btn-how').addEventListener('click', () => {
      audio.start(); audio.click();
      screen = 'how'; showPanel('screen-how');
    });
    document.getElementById('btn-how-close').addEventListener('click', () => {
      audio.click(); screen = 'title'; showPanel('screen-title');
    });
    document.getElementById('btn-aircraft-back').addEventListener('click', () => {
      audio.click(); screen = 'title'; showPanel('screen-title');
    });
    document.getElementById('btn-routes-back').addEventListener('click', () => {
      audio.click(); screen = 'aircraft'; showPanel('screen-aircraft');
    });
    document.getElementById('btn-free-back').addEventListener('click', () => {
      audio.click(); screen = 'title'; showPanel('screen-title');
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      audio.click(); paused = false; screen = 'fly'; showPanel('');
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      audio.click(); paused = false;
      if (mode === 'free') startFreeFlight(departureId, aircraft.id);
      else startRoute(route.id, aircraft.id);
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
      audio.click(); quitToTitle();
    });
    document.getElementById('btn-again').addEventListener('click', () => {
      audio.click();
      if (mode === 'free') startFreeFlight(departureId, aircraft.id);
      else startRoute(route.id, aircraft.id);
    });
    document.getElementById('btn-next').addEventListener('click', () => {
      audio.click();
      const idx = ROUTES.findIndex((r) => r.id === route.id);
      if (idx + 1 < ROUTES.length) startRoute(ROUTES[idx + 1].id, aircraft.id);
    });
    document.getElementById('btn-result-title').addEventListener('click', () => {
      audio.click(); quitToTitle();
    });
  }

  function quitToTitle() {
    clearFlight();
    paused = false;
    screen = 'title';
    showPanel('screen-title');
    announce('Tailwind Express. Choose Career, Free Flight or Time Trial.');
  }

  wireMenus();
  showPanel('screen-title');
  announce('Tailwind Express. Choose Career, Free Flight or Time Trial.');

  return {
    camera,
    get screen() { return screen; },
    get flight() { return flight; },
    get aircraft() { return aircraft; },
    get route() { return route; },
    get mode() { return mode; },
    get simTime() { return simTime; },
    get autopilot() { return autopilot; },
    setAutopilot(value) { autopilot = value; },
    get ringsPassed() { return ringsPassed; },
    get result() { return result; },
    startRoute,
    startFreeFlight,
    quitToTitle,
    /** Snap the chase camera to its exact follow position (for screenshots). */
    snapCamera() {
      if (flight) updateCamera(10);
    },
    /** Stage a deterministic flight phase for a screenshot: cruise / approach / landing. */
    stageForShot(phase, routeId, craftId) {
      const routeObj = routeById(routeId);
      const craft = aircraftById(craftId);
      const from = airfieldById(routeObj.from); const to = airfieldById(routeObj.to);
      setupFlight(routeObj, craft, from, to);
      mode = 'career';
      screen = 'fly';
      showPanel('');
      autopilot = true;
      const rad = THREE.MathUtils.degToRad(to.heading);
      const fx = Math.sin(rad); const fz = -Math.cos(rad);
      /** Mark ring `i` as already flown, green like a cleared ring. */
      function clearRing(i) {
        const ring = ringsBuilt.rings[i];
        ring.passed = true;
        ringsPassed += 1;
        ring.mesh.material.emissive.setHex(0x2e9e4f);
        ring.mesh.material.color.setHex(0x7be495);
      }
      if (phase === 'cruise' || phase === 'chase') {
        const targetIndex = Math.min(2, ringsBuilt.rings.length - 1);
        for (let i = 0; i < targetIndex; i += 1) clearRing(i);
        const ring = ringsBuilt.rings[targetIndex];
        const prev = ringsBuilt.rings[Math.max(0, targetIndex - 1)];
        const dx = ring.x - prev.x; const dz = ring.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        flight.x = ring.x - (dx / len) * 220;
        flight.z = ring.z - (dz / len) * 220;
        flight.y = ring.y;
        flight.yaw = Math.atan2(-(dx / len), -(dz / len));
        flight.speed = craft.cruise;
        flight.throttle = 0.55;
        flight.onGround = false; flight.airborne = true;
        flight.gearDown = false;
      } else {
        // Final approach: every ring is already cleared, so the autopilot aims at the strip.
        for (let i = 0; i < ringsBuilt.rings.length; i += 1) clearRing(i);
        flight.x = to.x - fx * 900;
        flight.z = to.z - fz * 900;
        flight.y = to.elevation + 900 * 0.07 + 4;
        flight.yaw = -rad;
        flight.speed = craft.rotate * 1.35;
        flight.throttle = 0.35;
        flight.onGround = false; flight.airborne = true;
        flight.gearDown = true;
        flapsTarget = 1;
        flight.flaps = 1;
        if (phase === 'landing') {
          // Fly the approach all the way down, then hold just after touchdown.
          let guard = 0;
          let touched = false;
          let after = 0;
          while (guard < 60 * 120 && !flight.crashed) {
            const wasAirborne = !flight.onGround;
            stepSim();
            guard += 1;
            if (touched) {
              after += 1;
              if (after >= 30) break;
            } else if (flight.onGround && wasAirborne) {
              touched = true;
            }
            if (result) break;
          }
          if (flight.crashed || result || !touched) {
            // The autopilot missed, or the rollout finished and opened the result
            // panel, or it never got down at all: put the frame back on the strip,
            // rolling out after touchdown.
            result = null;
            screen = 'fly';
            showPanel('');
            flight.crashed = false; flight.crashReason = ''; flight.landed = false;
            flight.x = to.x - fx * 60; flight.z = to.z - fz * 60;
            flight.y = to.elevation + 1.4;
            flight.yaw = -rad; flight.pitch = 0; flight.roll = 0;
            flight.speed = 24; flight.onGround = true; flight.airborne = true;
            flight.verticalSpeed = 0;
            touchdown = { vs: -1.8, across: 1.5, speed: 24 };
            showMessage('TOUCHDOWN — SMOOTH', '#7be495', 10);
          }
          return;
        }
        // Approach shot: fly 9 seconds down the glide path.
        for (let i = 0; i < 9 * 60; i += 1) stepSim();
        return;
      }
      // Cruise / chase shot: fly forward a couple of seconds so the frame is mid-flight
      // with the next ring close ahead.
      for (let i = 0; i < 2.5 * 60; i += 1) stepSim();
    },
    /** One frame: handle menu keys, step the sim, pose the plane and paint the HUD. */
    frame(dt) {
      const actions = input.takeActions();
      if (actions & ACTION_MUTE) {
        const muted = audio.toggleMute();
        announce(muted ? 'Sound off.' : 'Sound on.');
      }
      if (screen === 'fly') {
        if (actions & ACTION_PAUSE) {
          paused = true;
          screen = 'pause';
          document.getElementById('pause-info').textContent =
            `${route ? route.name : 'Free Flight'} · ${aircraft.fullName} · ${ringsPassed} rings · ${Math.floor(simTime)} s in`;
          showPanel('screen-pause');
          announce('Paused.');
        } else if (actions & ACTION_RESTART) {
          if (mode === 'free') startFreeFlight('COR', aircraft.id);
          else startRoute(route.id, aircraft.id);
        } else if (actions & ACTION_CAMERA) {
          cameraMode = (cameraMode + 1) % 3;
          showMessage(['CHASE CAMERA', 'NEAR CAMERA', 'NOSE CAMERA'][cameraMode], '#9fc3e8', 1.2);
        }
        if (actions & ACTION_FLAPS) flapsTarget = flapsTarget > 0.5 ? 0 : 1;
        if (actions & ACTION_GEAR) flight.gearDown = !flight.gearDown;
      } else if ((screen === 'title' || screen === 'result') && (actions & ACTION_CONFIRM)) {
        if (screen === 'title') { mode = 'career'; screen = 'aircraft'; showPanel('screen-aircraft'); }
      } else if (screen === 'pause' && (actions & ACTION_PAUSE || actions & ACTION_CONFIRM)) {
        paused = false; screen = 'fly'; showPanel('');
      }
      if (screen === 'fly' && !paused && flight) {
        let acc = Math.min(dt, 0.25);
        while (acc >= STEP) { stepSim(); acc -= STEP; }
        poseAircraft(aircraftMesh, flight);
        if (propeller) propeller.rotation.z += (2 + flight.throttle * 22) * dt;
        if (beacon) beacon.material.color.setHex(Math.floor(simTime * 2) % 2 === 0 ? 0xff3b30 : 0x881111);
        updateCamera(dt);
      } else if (flight && aircraftMesh) {
        // On menus the plane sits parked on its strip; keep the camera on it.
        poseAircraft(aircraftMesh, flight);
        updateCamera(dt);
      }
      if (flight) {
        const nextRing = ringsBuilt ? ringsBuilt.rings.find((r) => !r.passed) : null;
        const dest = route && route.id !== 'free' ? airfieldById(route.to) : null;
        const next = nextRing
          ? { name: `RING ${ringsPassed + 1}`, dist: Math.hypot(nextRing.x - flight.x, nextRing.y - flight.y, nextRing.z - flight.z) }
          : dest
            ? { name: dest.name, dist: Math.hypot(dest.x - flight.x, dest.z - flight.z) }
            : null;
        const wind = windAt(simTime);
        hud.draw(flight, {
          route, aircraft,
          ringsPassed, ringsTotal: route && route.id !== 'free' ? route.rings : 0,
          message, messageUntil, messageColor,
          windFrom: route ? route.windFrom : 210, windSpeed: wind.speed,
          nextName: next ? next.name : '', nextDist: next ? next.dist : 0,
          showInstruments: screen === 'fly' || screen === 'pause',
        }, simTime);
      }
    },
  };
}
