// The island: one seeded heightfield, seven flattened airfields, a lake, a desert, a
// mountain ridge, a city, forests, clouds and the checkpoint rings. The mesh, the physics
// and the screenshots all read the same `heightAt(x, z)`, so what you see is what you land on.
import * as THREE from '../vendor/three.min.js';
import { AIRFIELDS, ISLAND_SIZE, SKIES, WORLD_SEED } from './data.js';
import { createRandom, createValueNoise } from './random.js';

const HALF = ISLAND_SIZE / 2;
const RING_RADIUS = 9;

/** Smoothstep between two edges. */
function smoothstep(a, b, t) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** Make the height function for the island. Pure and seeded: same input, same height. */
export function createHeightAt() {
  const fbm = createValueNoise(WORLD_SEED + 11);
  const fbm2 = createValueNoise(WORLD_SEED + 47);
  function rawHeight(x, z) {
    const r = Math.hypot(x, z) / (HALF + 60);
    const coast = smoothstep(1.0, 0.74, r);
    let h = fbm(x * 0.0009 + 7.3, z * 0.0009 + 2.1, 4) * 130;
    const mx = (x + 200) / 900; const mz = (z + 1050) / 800;
    const ridge = Math.exp(-(mx * mx + mz * mz) * 1.4);
    h += ridge * (190 + 130 * fbm(x * 0.002 + 3, z * 0.002 + 9, 3));
    const gx = (x - 620) / 520; const gz = (z + 1420) / 520;
    h += Math.exp(-(gx * gx + gz * gz)) * 130;
    const dx = (x + 1520) / 760; const dz = (z + 480) / 760;
    const desert = Math.exp(-(dx * dx + dz * dz));
    h = h * (1 - desert * 0.85) + 26 * desert * 0.85;
    const lx = (x - 760) / 390; const lz = (z - 1280) / 350;
    const lake = Math.exp(-(lx * lx + lz * lz));
    h = h * (1 - lake) + -9 * lake;
    h = h * coast - 20 * (1 - coast);
    return h;
  }
  function heightAt(x, z) {
    let h = rawHeight(x, z);
    for (const field of AIRFIELDS) {
      // Flatten elliptically along the strip: flat over the runway, blending out
      // across it quickly, so the field is a strip on the land — not a mesa.
      const rad = THREE.MathUtils.degToRad(field.heading);
      const dx = x - field.x; const dz = z - field.z;
      const along = dx * Math.sin(rad) - dz * Math.cos(rad);
      const across = dx * Math.cos(rad) + dz * Math.sin(rad);
      const e = Math.max(Math.abs(along) / (field.length * 0.62), Math.abs(across) / (field.width * 2.2));
      const flat = smoothstep(1.6, 0.9, e);
      if (flat > 0) h = h * (1 - flat) + field.elevation * flat;
    }
    return h;
  }
  return heightAt;
}

/** Paint a canvas texture for one runway: centreline, thresholds and the field id. */
function runwayTexture(field) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const asphalt = field.surface === 'asphalt';
  ctx.fillStyle = asphalt ? '#3c4148' : '#5d6b3a';
  ctx.fillRect(0, 0, 128, 512);
  if (asphalt) {
    ctx.fillStyle = '#454b53';
    for (let i = 0; i < 40; i += 1) ctx.fillRect(0, i * 13, 128, 3);
  } else {
    ctx.fillStyle = '#6b7a44';
    for (let i = 0; i < 24; i += 1) ctx.fillRect(0, i * 22, 128, 6);
  }
  ctx.fillStyle = '#f2f2e8';
  for (let y = 60; y < 452; y += 42) ctx.fillRect(62, y, 4, 24);
  ctx.fillRect(14, 26, 100, 6); ctx.fillRect(14, 480, 100, 6);
  for (let x = 14; x < 114; x += 18) { ctx.fillRect(x, 40, 10, 10); ctx.fillRect(x, 462, 10, 10); }
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(field.id, 64, 300);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A windsock: pole plus an orange cone that points downwind. */
function buildWindsock() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6 }),
  );
  pole.position.y = 3.5;
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 3.2, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xff6b2e, roughness: 0.7, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2 - 0.25;
  sock.position.set(1.6, 6.6, 0);
  group.add(pole, sock);
  return group;
}

/**
 * Build the whole world into `scene` and return the handles the game needs:
 * `heightAt`, the ring factory, the sky switcher and the per-frame cloud drift.
 */
export function buildWorld(scene) {
  const rand = createRandom(WORLD_SEED);
  const heightAt = createHeightAt();
  const fbm = createValueNoise(WORLD_SEED + 91);

  // --- Terrain mesh, vertex-coloured by height and biome. ---
  const SEG = 160;
  const geo = new THREE.PlaneGeometry(ISLAND_SIZE + 800, ISLAND_SIZE + 800, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xd9c28a); const grass = new THREE.Color(0x6f9e4f);
  const grassHigh = new THREE.Color(0x557f3e); const forest = new THREE.Color(0x3f7034);
  const desert = new THREE.Color(0xcfa96a); const rock = new THREE.Color(0x8a7f74);
  const snow = new THREE.Color(0xe8eef2); const city = new THREE.Color(0x9aa0a8);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i); const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.004 + 5, z * 0.004 + 1, 2);
    if (h < 3.5) tmp.copy(sand);
    else if (h < 70) tmp.copy(grass).lerp(grassHigh, h / 70);
    else if (h < 150) tmp.copy(grassHigh);
    else if (h < 260) tmp.copy(rock);
    else tmp.copy(snow);
    const dx = (x + 1520) / 760; const dz = (z + 480) / 760;
    if (Math.exp(-(dx * dx + dz * dz)) > 0.45 && h > 2 && h < 90) tmp.copy(desert);
    const cx = (x - 1480) / 620; const cz = (z + 260) / 620;
    if (Math.exp(-(cx * cx + cz * cz)) > 0.5 && h < 40) tmp.copy(city);
    if (h > 8 && h < 170 && fbm(x * 0.0016 + 21, z * 0.0016 + 13, 3) > 0.56) tmp.lerp(forest, 0.75);
    const shade = 0.92 + n * 0.16;
    colors[i * 3] = tmp.r * shade; colors[i * 3 + 1] = tmp.g * shade; colors[i * 3 + 2] = tmp.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  );
  terrain.receiveShadow = false;
  scene.add(terrain);

  // --- Sea. ---
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshPhongMaterial({ color: 0x2e6f8e, transparent: true, opacity: 0.92, shininess: 90 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.4;
  scene.add(sea);

  // --- Airfields: runway, edge lights, windsock, hangar. ---
  const edgeLightGeo = new THREE.SphereGeometry(0.5, 6, 5);
  const fieldGroups = new Map();
  for (const field of AIRFIELDS) {
    const group = new THREE.Group();
    const y = field.elevation + 0.15;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(field.width, field.length),
      new THREE.MeshStandardMaterial({ map: runwayTexture(field), roughness: 0.95 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -THREE.MathUtils.degToRad(field.heading);
    strip.position.y = y;
    group.add(strip);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let s = -1; s <= 1; s += 2) {
      for (let t = 0; t <= 10; t += 1) {
        const along = -field.length / 2 + (field.length * t) / 10;
        const across = (field.width / 2 + 2) * s;
        const light = new THREE.Mesh(edgeLightGeo, lightMat);
        const rad = THREE.MathUtils.degToRad(field.heading);
        light.position.set(
          Math.sin(rad) * along + Math.cos(rad) * across,
          y + 0.4,
          -Math.cos(rad) * along + Math.sin(rad) * across,
        );
        group.add(light);
      }
    }
    const sock = buildWindsock();
    sock.position.set(field.width / 2 + 14, y, -field.length * 0.28);
    group.add(sock);
    const hangar = new THREE.Mesh(
      new THREE.BoxGeometry(18, 7, 12),
      new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.8 }),
    );
    hangar.position.set(-field.width / 2 - 16, y + 3.5, field.length * 0.3);
    group.add(hangar);
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 18, 3, 1),
      new THREE.MeshStandardMaterial({ color: 0x7a8894, roughness: 0.8 }),
    );
    roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
    roof.position.set(-field.width / 2 - 16, y + 7, field.length * 0.3);
    roof.scale.set(1, 1, 0.6);
    group.add(roof);
    group.position.set(field.x, 0, field.z);
    scene.add(group);
    fieldGroups.set(field.id, group);
  }

  // --- Harbor City: a small town of boxes and a tower beside the strip. ---
  {
    const cityRand = createRandom(WORLD_SEED + 5);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const cityMat = new THREE.MeshStandardMaterial({ color: 0x8b98a5, roughness: 0.9 });
    const cityMat2 = new THREE.MeshStandardMaterial({ color: 0x6b7a8a, roughness: 0.9 });
    const cityMat3 = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.9 });
    const mats = [cityMat, cityMat2, cityMat3];
    for (let i = 0; i < 42; i += 1) {
      const bx = 1480 + cityRand.range(-320, 420);
      const bz = -260 + cityRand.range(-420, 320);
      if (Math.hypot(bx - 1480, bz + 260) < 190) continue;
      const w = cityRand.range(14, 30); const d = cityRand.range(14, 30);
      const hgt = cityRand.range(8, 42);
      const box = new THREE.Mesh(boxGeo, mats[i % 3]);
      box.scale.set(w, hgt, d);
      box.position.set(bx, heightAt(bx, bz) + hgt / 2, bz);
      scene.add(box);
    }
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 7, 46, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8dee2, roughness: 0.7 }),
    );
    tower.position.set(1480 - 90, heightAt(1390, -260) + 23, -260 + 120);
    scene.add(tower);
    const cab = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 6, 8, 10),
      new THREE.MeshStandardMaterial({ color: 0x2e4a66, roughness: 0.4, metalness: 0.3 }),
    );
    cab.position.set(1390, heightAt(1390, -140) + 48, -140);
    scene.add(cab);
  }

  // --- Forest: instanced trunks and canopies. ---
  {
    const spots = [];
    let guard = 0;
    while (spots.length < 750 && guard < 20000) {
      guard += 1;
      const x = rand.range(-HALF, HALF); const z = rand.range(-HALF, HALF);
      const h = heightAt(x, z);
      if (h < 10 || h > 175) continue;
      if (fbm(x * 0.0016 + 21, z * 0.0016 + 13, 3) < 0.56) continue;
      let nearField = false;
      for (const field of AIRFIELDS) {
        if (Math.hypot(x - field.x, z - field.z) < field.length * 0.7) { nearField = true; break; }
      }
      if (nearField) continue;
      spots.push([x, h, z]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 });
    const canopyGeo = new THREE.ConeGeometry(3.2, 9, 7);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f5d2a, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion();
    const s = new THREE.Vector3(); const p = new THREE.Vector3();
    for (let i = 0; i < spots.length; i += 1) {
      const [x, h, z] = spots[i];
      const scale = rand.range(0.8, 1.7);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand.range(0, Math.PI * 2));
      p.set(x, h + 2 * scale, z); s.set(scale, scale, scale);
      m.compose(p, q, s); trunks.setMatrixAt(i, m);
      p.set(x, h + (4 + 4.5) * scale, z);
      m.compose(p, q, s); canopies.setMatrixAt(i, m);
    }
    scene.add(trunks, canopies);
  }

  // --- Clouds: flattened white puffs that drift with the wind. ---
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85, flatShading: true,
  });
  const cloudBases = [];
  for (let i = 0; i < 34; i += 1) {
    const puff = new THREE.Group();
    const puffs = 2 + Math.floor(rand.next() * 3);
    for (let j = 0; j < puffs; j += 1) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(rand.range(14, 30), 8, 6), cloudMat);
      ball.position.set(rand.range(-26, 26), rand.range(-4, 4), rand.range(-14, 14));
      ball.scale.y = 0.45;
      puff.add(ball);
    }
    const bx = rand.range(-HALF, HALF); const bz = rand.range(-HALF, HALF);
    const by = rand.range(280, 470);
    puff.position.set(bx, by, bz);
    clouds.add(puff);
    cloudBases.push([bx, by, bz]);
  }
  scene.add(clouds);

  // --- Stars for the night sky. ---
  const starGeo = new THREE.BufferGeometry();
  {
    const starRand = createRandom(WORLD_SEED + 77);
    const pts = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i += 1) {
      const a = starRand.range(0, Math.PI * 2);
      const e = starRand.range(0.08, 1.4);
      const r = 3800;
      pts[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pts[i * 3 + 1] = Math.sin(e) * r;
      pts[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false }));
  stars.visible = false;
  scene.add(stars);

  // --- Lights: one sun plus hemisphere fill. The sky switcher re-aims them. ---
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x6b7c5a, 0.9);
  scene.add(sun, hemi);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(60, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
  );
  scene.add(sunDisc);

  function setSky(key) {
    const sky = SKIES[key];
    scene.background = new THREE.Color(sky.sky);
    scene.fog = new THREE.Fog(sky.fog, 900, 5200);
    const elev = THREE.MathUtils.degToRad(sky.sunElevation);
    const azim = THREE.MathUtils.degToRad(235);
    const dir = new THREE.Vector3(Math.cos(elev) * Math.cos(azim), Math.sin(elev), Math.cos(elev) * Math.sin(azim));
    sun.position.copy(dir).multiplyScalar(900);
    sun.color.setHex(sky.sunColor);
    sun.intensity = sky.sunIntensity;
    hemi.color.setHex(sky.hemiSky);
    hemi.groundColor.setHex(sky.hemiGround);
    hemi.intensity = sky.hemiIntensity;
    stars.visible = sky.stars;
    sunDisc.position.copy(dir).multiplyScalar(3600);
    sunDisc.lookAt(0, 0, 0);
    sunDisc.material.color.setHex(key === 'dusk' ? 0xff8c3a : key === 'night' ? 0xdfe8ff : 0xfff6d8);
    return sky;
  }

  // --- Checkpoint rings for a route: a gentle curve from field to field. ---
  // Each ring's altitude clears the highest ground on the legs around it by 70 m,
  // and no leg asks for more than 160 m of climb, so the rings are always reachable.
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, 1.1, 10, 30);
  const ringDiscGeo = new THREE.CircleGeometry(RING_RADIUS - 0.6, 30);
  function buildRings(route, fromField, toField) {
    const group = new THREE.Group();
    const rings = [];
    const midX = (fromField.x + toField.x) / 2 + (fbm(3.1, 8.7, 2) - 0.5) * 900;
    const midZ = (fromField.z + toField.z) / 2 + (fbm(9.4, 1.2, 2) - 0.5) * 900;
    const a = new THREE.Vector3(fromField.x, fromField.elevation, fromField.z);
    const b = new THREE.Vector3(midX, 0, midZ);
    const c = new THREE.Vector3(toField.x, toField.elevation, toField.z);
    function pathPoint(t, out) {
      const u = 1 - t;
      out.set(
        u * u * a.x + 2 * u * t * b.x + t * t * c.x,
        0,
        u * u * a.z + 2 * u * t * b.z + t * t * c.z,
      );
      return out;
    }
    const p = new THREE.Vector3(); const p2 = new THREE.Vector3();
    const alts = [];
    for (let i = 0; i < route.rings; i += 1) {
      const t = (i + 1) / (route.rings + 1);
      pathPoint(t, p);
      const ground = heightAt(p.x, p.z);
      let alt = Math.max(
        ground + 55,
        fromField.elevation + (toField.elevation - fromField.elevation) * t + 70 + Math.sin(t * 9.1) * 25,
      );
      // Clear the highest ground on the legs either side of this ring.
      let maxGround = ground;
      for (let s = 0; s <= 16; s += 1) {
        const tt = Math.min(1, Math.max(0, t + (s / 16 - 0.5) * (2 / (route.rings + 1))));
        pathPoint(tt, p2);
        maxGround = Math.max(maxGround, heightAt(p2.x, p2.z));
      }
      alt = Math.max(alt, maxGround + 70);
      alts.push(alt);
    }
    // No leg may ask for more than 160 m of climb: raise earlier rings to pre-climb,
    // but never more than 170 m above the departure field for the first ring.
    alts[0] = Math.min(alts[0], fromField.elevation + 170);
    for (let i = alts.length - 2; i >= 0; i -= 1) {
      alts[i] = Math.max(alts[i], alts[i + 1] - 160);
    }
    for (let i = 0; i < route.rings; i += 1) {
      const t = (i + 1) / (route.rings + 1);
      pathPoint(t, p);
      pathPoint(Math.min(1, t + 0.02), p2);
      const alt = alts[i];
      const dir = p2.clone().sub(p).setY(0).normalize();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff8c2e, emissive: 0xcc5500, emissiveIntensity: 0.55, roughness: 0.4,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.set(p.x, alt, p.z);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const disc = new THREE.Mesh(
        ringDiscGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffb36b, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      disc.position.copy(ring.position);
      disc.quaternion.copy(ring.quaternion);
      group.add(ring, disc);
      rings.push({ x: p.x, y: alt, z: p.z, passed: false, mesh: ring });
    }
    scene.add(group);
    return { group, rings };
  }

  function disposeRings(built) {
    scene.remove(built.group);
    for (const ring of built.rings) {
      ring.mesh.material.dispose();
    }
  }

  return {
    heightAt,
    setSky,
    buildRings,
    disposeRings,
    /** Drift the clouds with the wind; `t` is sim seconds, `wind` is m/s along `windFrom`. */
    updateClouds(t, wind, windFrom) {
      const rad = THREE.MathUtils.degToRad(windFrom + 180);
      const vx = Math.sin(rad) * wind; const vz = Math.cos(rad) * wind;
      for (let i = 0; i < clouds.children.length; i += 1) {
        const puff = clouds.children[i];
        const [bx, by, bz] = cloudBases[i];
        let x = bx + vx * t; let z = bz + vz * t;
        x = ((x + HALF + 400) % (ISLAND_SIZE + 800)) - HALF - 400;
        z = ((z + HALF + 400) % (ISLAND_SIZE + 800)) - HALF - 400;
        puff.position.set(x, by, z);
      }
    },
  };
}
