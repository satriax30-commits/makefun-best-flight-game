// The aircraft: a procedural low-poly bush plane built from boxes, cylinders and cones
// (one body, three liveries and sizes), plus the arcade flight model — throttle, lift,
// stall, banked turns, flaps, gear, wind and gusts, all in fixed 1/60 s steps.
import * as THREE from '../vendor/three.min.js';

const STEP = 1 / 60;

/**
 * Build one aircraft mesh for `craft` (a row of AIRCRAFT). The plane faces -Z when its
 * rotation is zero, so it can be dropped straight onto the flight state's yaw/pitch/roll.
 * Returns the group plus the spinning propeller (null on the jet).
 */
export function buildAircraftMesh(craft) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: craft.color, roughness: 0.55, metalness: 0.15 });
  const trim = new THREE.MeshStandardMaterial({ color: craft.trim, roughness: 0.6, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.4, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.15, metalness: 0.5 });
  const scale = craft.id === 'falcon' ? 1.25 : craft.id === 'otter' ? 1.12 : 1.0;

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.6, 10), paint);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.scale.set(1, 1, 1);
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 10), trim);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.5;
  group.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 2.2), glass);
  cabin.position.set(0, 0.55, -0.4);
  group.add(cabin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, 5.0), trim);
  stripe.position.set(0, 0.15, 0.1);
  group.add(stripe);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.22, 1.9), paint);
  wing.position.set(0, 0.15, -0.5);
  group.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 1.9), trim);
  wingTipL.position.set(-4.9, 0.15, -0.5);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 4.9;
  group.add(wingTipL, wingTipR);
  const tailH = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 1.1), paint);
  tailH.position.set(0, 0.25, 2.6);
  group.add(tailH);
  const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.2), paint);
  tailV.position.set(0, 0.85, 2.6);
  group.add(tailV);
  const tailMark = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.9), trim);
  tailMark.position.set(0, 0.9, 2.65);
  group.add(tailMark);

  let propeller = null;
  if (craft.id !== 'falcon') {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), dark);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -4.35;
    group.add(hub);
    propeller = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(0.28, 2.6, 0.08);
    const blade1 = new THREE.Mesh(bladeGeo, dark);
    const blade2 = new THREE.Mesh(bladeGeo, dark);
    blade2.rotation.z = Math.PI / 2;
    propeller.add(blade1, blade2);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
    );
    propeller.add(disc);
    propeller.position.z = -4.5;
    group.add(propeller);
  } else {
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.2, 10), dark);
    intake.rotation.x = Math.PI / 2;
    intake.position.set(0, -0.35, -2.2);
    group.add(intake);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.8, 10), dark);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = 3.0;
    group.add(exhaust);
  }

  // Fixed gear on the Cub; retractable gear (shown down) on the others.
  const gearMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), gearMat);
    strut.position.set(side * 0.9, -0.85, -0.9);
    strut.rotation.z = side * 0.25;
    group.add(strut);
    const wheel = new THREE.Mesh(wheelGeo, gearMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.05, -1.35, -0.9);
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 8), gearMat);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.75, 2.5);
  group.add(tailWheel);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  beacon.position.set(0, 1.05, 0.4);
  group.add(beacon);

  group.scale.setScalar(scale);
  group.traverse((child) => { if (child.isMesh) child.castShadow = false; });
  return { group, propeller, beacon };
}

/** Fresh flight state for a departure from `field` in `craft`. */
export function createFlightState(craft, field, heightAt) {
  // Forward is (-sin yaw, 0, -cos yaw), so a heading of H degrees needs yaw = -H.
  const heading = THREE.MathUtils.degToRad(field.heading);
  const startX = field.x - Math.sin(heading) * field.length * 0.32;
  const startZ = field.z + Math.cos(heading) * field.length * 0.32;
  return {
    x: startX, y: field.elevation + 1.4, z: startZ,
    yaw: -heading, pitch: 0, roll: 0,
    speed: 0, throttle: 0, throttleTarget: 0,
    flaps: 0, flapsTarget: 0, gearDown: true,
    fuel: craft.fuel, onGround: true, airborne: false,
    verticalSpeed: 0, headingDeg: field.heading,
    crashed: false, crashReason: '', landed: false,
    distanceFlown: 0, time: 0,
  };
}

/**
 * One fixed flight step. `input` is { pitch, roll, throttle, flaps, gear, brake } with
 * pitch/roll in [-1, 1]; `wind` is { x, z, gust } in m/s; `isRunwayAt(x, z)` says whether
 * the point is on a runway strip. Returns an event string or ''.
 * The model is arcade on purpose: speed follows throttle, pitch follows the elevator,
 * turns follow the bank, and below stall speed the nose drops and the wings give up.
 * Forward is (-sin yaw, 0, -cos yaw), matching the mesh's -Z nose.
 */
export function stepFlight(state, craft, input, wind, heightAt, isRunwayAt, dt = STEP) {
  if (state.crashed || state.landed) return '';
  state.time += dt;

  // Throttle and flaps move toward their targets; the engine answers smoothly.
  state.throttle += (input.throttle - state.throttle) * Math.min(1, dt * 2.2);
  state.flaps += (input.flaps - state.flaps) * Math.min(1, dt * 1.5);

  const stallSpeed = craft.stall * (1 - state.flaps * 0.28);
  const drag = 0.011 + state.flaps * 0.02 + (state.gearDown ? 0.006 : 0);
  const accel = state.throttle * craft.accel - drag * state.speed * state.speed * 0.22
    - Math.sin(state.pitch) * 6.5;
  state.speed = Math.max(0, state.speed + accel * dt);

  // Elevator: the nose answers in proportion to airflow, and barely at all on the ground.
  const authority = THREE.MathUtils.clamp(state.speed / craft.cruise, 0.12, 1);
  const pitchRate = input.pitch * 0.85 * authority;
  state.pitch = THREE.MathUtils.clamp(state.pitch + pitchRate * dt, -0.5, 0.55);
  const rollRate = input.roll * craft.turn * authority;
  state.roll = THREE.MathUtils.clamp(state.roll + rollRate * dt, -1.1, 1.1);
  if (Math.abs(input.roll) < 0.05) state.roll *= Math.max(0, 1 - dt * 0.9);
  // A banked turn: heading follows the roll, faster with more speed.
  state.yaw += -Math.sin(state.roll) * 0.55 * THREE.MathUtils.clamp(state.speed / craft.cruise, 0.2, 1.4) * dt;
  state.headingDeg = ((-THREE.MathUtils.radToDeg(state.yaw)) % 360 + 360) % 360;

  // Velocity: forward times speed, plus wind, plus a sink when the wings are stalled.
  const cp = Math.cos(state.pitch);
  let vx = -Math.sin(state.yaw) * cp * state.speed;
  let vy = Math.sin(state.pitch) * state.speed;
  let vz = -Math.cos(state.yaw) * cp * state.speed;
  if (!state.onGround && state.speed < stallSpeed) {
    const sink = (stallSpeed - state.speed) * 0.9;
    vy -= sink;
    state.pitch = Math.max(state.pitch - dt * 0.25, -0.35);
  }
  vx += wind.x; vz += wind.z;
  const prevY = state.y;
  state.x += vx * dt;
  state.y += vy * dt;
  state.z += vz * dt;
  state.verticalSpeed = (state.y - prevY) / dt;
  state.distanceFlown += Math.hypot(vx, vz) * dt;

  // Fuel burns with throttle; an empty tank means a glider.
  const burn = (0.02 + state.throttle * 0.11) * dt * (craft.id === 'falcon' ? 2.4 : craft.id === 'otter' ? 1.4 : 1);
  state.fuel = Math.max(0, state.fuel - burn);
  if (state.fuel <= 0 && state.throttle > 0) state.throttle = 0;

  // Ground contact. A runway forgives speed; anywhere else, speed into the ground is a crash.
  const ground = heightAt(state.x, state.z);
  const clearance = 1.4;
  if (state.y <= ground + clearance) {
    state.y = ground + clearance;
    const onRunway = isRunwayAt ? isRunwayAt(state.x, state.z) : false;
    if (state.onGround) {
      // Rolling: brake and drag bleed speed; the nose stays level.
      state.pitch = 0;
      state.roll *= 0.9;
      state.speed = Math.max(0, state.speed - (input.brake ? 9 : 1.6) * dt);
      state.verticalSpeed = 0;
    } else if (state.verticalSpeed < -7.5) {
      state.crashed = true;
      state.crashReason = 'hard landing';
      return 'crash';
    } else if (!onRunway && state.speed > 45) {
      state.crashed = true;
      state.crashReason = 'flew into terrain';
      return 'crash';
    } else if (!onRunway && state.speed > 26 && state.verticalSpeed < -3.5) {
      state.crashed = true;
      state.crashReason = 'rough-field landing';
      return 'crash';
    } else {
      state.onGround = true;
      state.pitch = 0;
      state.verticalSpeed = 0;
      return 'touchdown';
    }
  } else if (state.onGround) {
    // Left the ground: airborne once the nose is up and the wings are flying.
    if (state.speed > craft.rotate && state.pitch > 0.05) {
      state.onGround = false;
      state.airborne = true;
      return 'takeoff';
    }
    // Rolled off a cliff or a strip end without flying: fall.
    if (ground < state.y - 30) state.onGround = false;
  }
  // Water is a crash, wherever it is touched.
  if (ground < -0.5 && state.y <= 1.2) {
    state.crashed = true;
    state.crashReason = 'ditched in the sea';
    return 'crash';
  }
  return '';
}

/** Write the flight state onto a mesh: position plus yaw / pitch / roll. */
export function poseAircraft(mesh, state) {
  mesh.position.set(state.x, state.y, state.z);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = state.yaw;
  mesh.rotation.x = state.pitch;
  mesh.rotation.z = -state.roll;
}
