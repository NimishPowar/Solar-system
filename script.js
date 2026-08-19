import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =========================================================
   ORBITAL MECHANICS
   Standard low-precision Keplerian elements (J2000 epoch,
   valid ~1800–2050), the same public-domain set JPL publishes
   for "approximate positions of the major planets." Each
   element has a rate per Julian century, so a-e-I-L-ϖ-Ω are
   all recomputed for the current simulated date, then Kepler's
   equation is solved numerically (Newton-Raphson) for the
   eccentric anomaly, giving true 3D heliocentric coordinates —
   not a fixed static ellipse.
   NOTE on precision: this is the ~1-arcminute-accuracy JPL
   approximation, not a full VSOP87/DE ephemeris — correct
   orbital shape, orientation, and motion, but not
   spacecraft-navigation grade. The Moon uses a simplified
   two-body ellipse around Earth rather than full lunar theory.
   ========================================================= */
const AU_KM = 149597870.7;
const J2000_JD = 2451545.0;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;

// a(AU), e, I(deg), L(deg), ϖ(deg, longitude of perihelion), Ω(deg, longitude of ascending node)
// each as [value_at_J2000, rate_per_century]
const ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749],
    L: [252.25032350, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081],
    radiusKm: 2439.7, spinHours: 1407.6, axialTilt: 0.03
  },
  venus: {
    a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890],
    L: [181.97909950, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418],
    radiusKm: 6051.8, spinHours: -5832.5, axialTilt: 3.10
  },
  earth: {
    a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0],
    radiusKm: 6371.0, spinHours: 23.934, axialTilt: 0.41,
    moon: { radiusKm: 1737.4, distanceAU: 0.00257, periodDays: 27.32, eccentricity: 0.0549, spinHours: 655.7 }
  },
  mars: {
    a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
    radiusKm: 3389.5, spinHours: 24.623, axialTilt: 0.44
  },
  jupiter: {
    a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106],
    radiusKm: 69911, spinHours: 9.925, axialTilt: 0.05
  },
  saturn: {
    a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794],
    radiusKm: 58232, spinHours: 10.656, axialTilt: 0.47, ring: true
  },
  uranus: {
    a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785], peri: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589],
    radiusKm: 25362, spinHours: -17.24, axialTilt: 1.71
  },
  neptune: {
    a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664],
    radiusKm: 24622, spinHours: 16.11, axialTilt: 0.49
  }
};
const SUN_RADIUS_KM = 696000;
const EARTH_RADIUS_KM = ELEMENTS.earth.radiusKm;

function julianDate(msEpoch) {
  return msEpoch / DAY_MS + 2440587.5; // Unix epoch -> JD
}

function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  return E;
}

function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

// Returns heliocentric position in AU, already mapped to this scene's axis
// convention (sceneX = ecliptic x, sceneY = ecliptic z "north", sceneZ = ecliptic y)
function heliocentricAU(key, jd) {
  const el = ELEMENTS[key];
  const T = (jd - J2000_JD) / 36525;

  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const Ideg = el.I[0] + el.I[1] * T;
  const Ldeg = el.L[0] + el.L[1] * T;
  const periDeg = el.peri[0] + el.peri[1] * T;
  const nodeDeg = el.node[0] + el.node[1] * T;

  let Mdeg = normalizeDeg(Ldeg - periDeg);
  if (Mdeg > 180) Mdeg -= 360;
  const M = THREE.MathUtils.degToRad(Mdeg);
  const E = solveKepler(M, e);

  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const w = THREE.MathUtils.degToRad(periDeg - nodeDeg);
  const I = THREE.MathUtils.degToRad(Ideg);
  const Om = THREE.MathUtils.degToRad(nodeDeg);
  const cw = Math.cos(w), sw = Math.sin(w);
  const co = Math.cos(Om), so = Math.sin(Om);
  const ci = Math.cos(I), si = Math.sin(I);

  const xecl = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp;
  const yecl = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp;
  const zecl = (sw * si) * xp + (cw * si) * yp;

  return { x: xecl, y: zecl, z: yecl, a, e };
}

/* =========================================================
   SCALE MODES
   visual: cube-root-compressed radii, sqrt-compressed distance
           — everything stays comfortably on screen at once.
   true:   1 AU = TRUE_AU_SCALE scene units, real radii in km.
           Planets become sub-pixel dots at this scale (that's
           genuinely how empty the solar system is) so each one
           gets an always-visible marker sprite to stay clickable.
   ========================================================= */
const VISUAL_EARTH_R = 0.6;
const VISUAL_DIST_SCALE = 15;
const TRUE_AU_SCALE = 100;
const MARKER_HIDE_RATIO = 40; // marker hides once camera is within ~40x the body's true radius, letting the real texture show

let scaleMode = 'visual';

function sceneDistanceForAU(aAU, mode = scaleMode) {
  return mode === 'true' ? aAU * TRUE_AU_SCALE : VISUAL_DIST_SCALE * Math.sqrt(aAU);
}
function sceneRadiusForKm(radiusKm, mode = scaleMode) {
  if (mode === 'true') return (radiusKm / AU_KM) * TRUE_AU_SCALE;
  return VISUAL_EARTH_R * Math.cbrt(radiusKm / EARTH_RADIUS_KM);
}
function sceneVectorForAUPoint(p, mode = scaleMode) {
  const rAU = Math.hypot(p.x, p.y, p.z) || 1e-9;
  if (mode === 'true') {
    return new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(TRUE_AU_SCALE);
  }
  const scale = (VISUAL_DIST_SCALE * Math.sqrt(rAU)) / rAU;
  return new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(scale);
}

const BODY_INFO = {
  sun: { name: 'The Sun', tagline: 'A G-type main-sequence star and the gravitational anchor of the entire system.',
    stats: { 'Type': 'G2V star', 'Surface Temp': '≈5,500 °C', 'Age': '≈4.6 billion yrs', 'Diameter': '1.39 million km' } },
  mercury: { name: 'Mercury', tagline: 'The smallest planet and the closest to the Sun, with wild temperature swings.',
    stats: { 'Distance from Sun': '57.9M km', 'Day Length': '59 Earth days', 'Moons': '0', 'Fun Fact': 'A year is shorter than its day-night cycle.' } },
  venus: { name: 'Venus', tagline: 'The hottest planet in the solar system thanks to a runaway greenhouse atmosphere.',
    stats: { 'Distance from Sun': '108.2M km', 'Day Length': '243 Earth days (retrograde)', 'Moons': '0', 'Fun Fact': 'Spins backwards relative to most planets.' } },
  earth: { name: 'Earth', tagline: 'Our home — the only known planet with liquid water on its surface and life.',
    stats: { 'Distance from Sun': '149.6M km', 'Day Length': '24 hours', 'Moons': '1', 'Fun Fact': '71% of its surface is covered by ocean.' } },
  moon: { name: 'The Moon', tagline: "Earth's only natural satellite, responsible for our tides.",
    stats: { 'Distance from Earth': '384,400 km', 'Orbit Period': '27.3 days', 'Diameter': '3,474 km', 'Fun Fact': 'Always shows the same face to Earth.' } },
  mars: { name: 'Mars', tagline: "The 'Red Planet', named for the iron oxide that rusts its surface.",
    stats: { 'Distance from Sun': '227.9M km', 'Day Length': '24h 37m', 'Moons': '2 (Phobos, Deimos)', 'Fun Fact': 'Home to Olympus Mons, the tallest volcano in the system.' } },
  jupiter: { name: 'Jupiter', tagline: 'The largest planet — a gas giant with a storm bigger than Earth.',
    stats: { 'Distance from Sun': '778.5M km', 'Day Length': '9h 56m', 'Moons': '95+', 'Fun Fact': 'The Great Red Spot has raged for centuries.' } },
  saturn: { name: 'Saturn', tagline: 'Famous for its spectacular, brilliant ring system made of ice and rock.',
    stats: { 'Distance from Sun': '1.43B km', 'Day Length': '10h 33m', 'Moons': '146+', 'Fun Fact': "It's the least dense planet — it would float in water." } },
  uranus: { name: 'Uranus', tagline: 'An ice giant that rotates on its side, likely from an ancient collision.',
    stats: { 'Distance from Sun': '2.87B km', 'Day Length': '17h 14m (retrograde)', 'Moons': '27+', 'Fun Fact': 'Its axial tilt is roughly 98 degrees.' } },
  neptune: { name: 'Neptune', tagline: 'The windiest planet, with supersonic storms racing across its surface.',
    stats: { 'Distance from Sun': '4.50B km', 'Day Length': '16h 6m', 'Moons': '14+', 'Fun Fact': 'Winds can exceed 2,000 km/h.' } }
};
const PLANET_ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

/* ---------- renderer / scene / camera ---------- */
const stage = document.getElementById('stage');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, stage.clientWidth / stage.clientHeight, 0.01, 400000);
const VISUAL_CAM_POS = new THREE.Vector3(0, 70, 165);
const TRUE_CAM_POS = new THREE.Vector3(0, 1400, 3200);
let defaultCamPos = VISUAL_CAM_POS.clone();
camera.position.copy(defaultCamPos);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(stage.clientWidth, stage.clientHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
stage.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.05;
controls.maxDistance = 8000;
controls.target.set(0, 0, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(stage.clientWidth, stage.clientHeight),
  0.18, 0.3, 0.92
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
});

/* ---------- textures + loading screen ---------- */
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingFill = document.getElementById('loadingFill');
const loadingPct = document.getElementById('loadingPct');

const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => {
  const pct = Math.round((loaded / total) * 100);
  loadingFill.style.width = pct + '%';
  loadingPct.textContent = pct + '%';
};
manager.onLoad = () => {
  loadingOverlay.classList.add('hidden');
  setTimeout(() => loadingOverlay.remove(), 600);
};

const loader = new THREE.TextureLoader(manager);
function loadTexture(file, isColor = true) {
  const tex = loader.load(
    './images/' + file, undefined, undefined,
    () => console.warn('Missing texture, sphere will render plain:', file)
  );
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- milky way skybox + stars ---------- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(150000, 48, 32),
  new THREE.MeshBasicMaterial({ map: loadTexture('milkyway.jpg'), side: THREE.BackSide })
);
scene.add(sky);

function buildStars() {
  const count = 1600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 60000 + Math.random() * 60000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 60, sizeAttenuation: true, transparent: true, opacity: 0.75 });
  scene.add(new THREE.Points(geo, mat));
}
buildStars();

/* ---------- lighting ---------- */
scene.add(new THREE.AmbientLight(0x3c4356, 0.35));
const sunLight = new THREE.PointLight(0xfff2d0, 5.2, 0, 0.35);
scene.add(sunLight);

// Visual mode's light falloff was tuned for distances of tens of units.
// True mode's distances are 50-100x larger, so with the same decay the
// light barely reaches outer planets at all — they'd render essentially
// unlit. Zero decay keeps every body properly lit regardless of how far
// out its true orbit actually is.
function applyLighting() {
  if (scaleMode === 'true') {
    sunLight.decay = 0;
    sunLight.intensity = 3.4;
  } else {
    sunLight.decay = 0.35;
    sunLight.intensity = 5.2;
  }
}

/* ---------- marker sprite (keeps tiny/true-scale bodies clickable) ---------- */
function markerTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(125,211,252,0.9)');
  g.addColorStop(1, 'rgba(125,211,252,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const MARKER_TEX = markerTexture();
function makeMarker() {
  const mat = new THREE.SpriteMaterial({ map: MARKER_TEX, transparent: true, depthTest: false, sizeAttenuation: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.028, 0.028, 1);
  s.visible = false;
  s.renderOrder = 999;
  return s;
}

function makeLabel(text) {
  const div = document.createElement('div');
  div.className = 'body-label';
  div.textContent = text;
  return new CSS2DObject(div);
}

/* ---------- sun ---------- */
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 48),
  new THREE.MeshBasicMaterial({ map: loadTexture('sun.jpg') })
);
sunMesh.userData.body = 'sun';
scene.add(sunMesh);
const sunLabel = makeLabel('Sun');
sunMesh.add(sunLabel);
const sunMarker = makeMarker();
sunMesh.add(sunMarker);

/* ---------- orbit path lines, sampled from the real ellipse shape ---------- */
function buildOrbitLine(key) {
  const el = ELEMENTS[key];
  const points = [];
  for (let i = 0; i <= 200; i++) {
    const E = (i / 200) * Math.PI * 2;
    const a = el.a[0], e = el.e[0];
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const w = THREE.MathUtils.degToRad(el.peri[0] - el.node[0]);
    const I = THREE.MathUtils.degToRad(el.I[0]);
    const Om = THREE.MathUtils.degToRad(el.node[0]);
    const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(Om), so = Math.sin(Om), ci = Math.cos(I), si = Math.sin(I);
    const xecl = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp;
    const yecl = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp;
    const zecl = (sw * si) * xp + (cw * si) * yp;
    const v = sceneVectorForAUPoint({ x: xecl, y: zecl, z: yecl });
    points.push(v);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.12 });
  const line = new THREE.LineLoop(geo, mat);
  line.userData.orbitKey = key;
  return line;
}

function fixRingUVs(geometry, innerRadius, outerRadius) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const d = v3.length();
    uv.setXY(i, (d - innerRadius) / (outerRadius - innerRadius), 1);
  }
  uv.needsUpdate = true;
}

/* ---------- planets ---------- */
const planets = [];
const pickable = [sunMesh];
const TEX_FILES = {
  mercury: 'mercury.jpg', venus: 'venus.jpg', earth: 'earth_daymap.jpg', mars: 'mars.jpg',
  jupiter: 'jupiter.jpg', saturn: 'saturn.jpg', uranus: 'uranus.jpg', neptune: 'neptune.jpg'
};

PLANET_ORDER.forEach((key) => {
  const el = ELEMENTS[key];
  const orbitLine = buildOrbitLine(key);
  scene.add(orbitLine);

  const anchor = new THREE.Group();
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = el.axialTilt;

  const matOpts = { map: loadTexture(TEX_FILES[key]), roughness: 0.9, metalness: 0.05 };
  if (key === 'earth') {
    matOpts.emissiveMap = loadTexture('earth_nightmap.jpg');
    matOpts.emissive = new THREE.Color(0xffffff);
    matOpts.emissiveIntensity = 0.55;
  }
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), new THREE.MeshStandardMaterial(matOpts));
  mesh.userData.body = key;
  tiltGroup.add(mesh);

  let atmoMesh = null;
  if (key === 'earth') {
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false,
      uniforms: { glowColor: { value: new THREE.Color(0x6fb7ff) } },
      vertexShader: `
        varying float rim;
        void main() {
          vec3 viewDir = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
          rim = 1.0 - max(dot(normalize(normalMatrix * normal), viewDir), 0.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float rim;
        uniform vec3 glowColor;
        void main() {
          float intensity = pow(rim, 2.5);
          gl_FragColor = vec4(glowColor, intensity * 0.55);
        }`
    });
    atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), atmoMat);
    atmoMesh.userData.isAtmosphere = true;
    tiltGroup.add(atmoMesh);
  }

  let ringMesh = null;
  if (el.ring) {
    const ringGeo = new THREE.RingGeometry(1, 1.84, 128); // unit-relative: scaled with the planet in applyScaleMode
    fixRingUVs(ringGeo, 1, 1.84);
    const ringMat = new THREE.MeshBasicMaterial({
      map: loadTexture('saturn_ring_alpha.png'), transparent: true, side: THREE.DoubleSide, opacity: 0.85
    });
    ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    tiltGroup.add(ringMesh);
  }

  anchor.add(tiltGroup);
  const label = makeLabel(BODY_INFO[key].name);
  anchor.add(label);
  const marker = makeMarker();
  anchor.add(marker);

  scene.add(anchor);
  pickable.push(mesh);

  let moonMesh = null, moonAnchor = null, moonLabel = null, moonMarker = null;
  if (el.moon) {
    moonAnchor = new THREE.Group();
    moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshStandardMaterial({ map: loadTexture('moon.jpg'), roughness: 0.95 })
    );
    moonMesh.userData.body = 'moon';
    moonAnchor.add(moonMesh);
    moonLabel = makeLabel('Moon');
    moonAnchor.add(moonLabel);
    moonMarker = makeMarker();
    moonAnchor.add(moonMarker);
    scene.add(moonAnchor);
    pickable.push(moonMesh);
  }

  planets.push({
    key, el, anchor, mesh, tiltGroup, ringMesh, atmoMesh, orbitLine, label, marker,
    moonMesh, moonAnchor, moonLabel, moonMarker,
    moonPhase: Math.random() * Math.PI * 2
  });
});

/* ---------- asteroid belt (rebuilt on scale-mode toggle) ---------- */
let asteroidBelt = null;
function buildAsteroidBelt() {
  if (asteroidBelt) { scene.remove(asteroidBelt); asteroidBelt.geometry.dispose(); asteroidBelt.material.dispose(); }
  const innerAU = ELEMENTS.mars.a[0] + (ELEMENTS.jupiter.a[0] - ELEMENTS.mars.a[0]) * 0.35;
  const outerAU = ELEMENTS.mars.a[0] + (ELEMENTS.jupiter.a[0] - ELEMENTS.mars.a[0]) * 0.75;
  const innerR = sceneDistanceForAU(innerAU);
  const outerR = sceneDistanceForAU(outerAU);
  const count = 500;
  const geo = new THREE.IcosahedronGeometry(0.08, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1 });
  const belt = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const dist = innerR + Math.random() * (outerR - innerR);
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * (outerR - innerR) * 0.08;
    dummy.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.scale.setScalar(0.5 + Math.random() * 1.2);
    dummy.updateMatrix();
    belt.setMatrixAt(i, dummy.matrix);
  }
  scene.add(belt);
  asteroidBelt = belt;
}
buildAsteroidBelt();

/* ---------- apply the active scale mode to every object's size/marker ---------- */
function applyScaleMode() {
  applyLighting();
  sunMesh.scale.setScalar(sceneRadiusForKm(SUN_RADIUS_KM));
  sunMarker.visible = scaleMode === 'true';

  planets.forEach((p) => {
    const radiusScene = sceneRadiusForKm(p.el.radiusKm);
    p.mesh.scale.setScalar(radiusScene);
    p.marker.visible = scaleMode === 'true';
    p.label.position.set(0, scaleMode === 'true' ? radiusScene * 3 : radiusScene + 0.4, 0);

    if (p.atmoMesh) p.atmoMesh.scale.setScalar(radiusScene * 1.04);
    if (p.ringMesh) p.ringMesh.scale.setScalar(radiusScene);

    scene.remove(p.orbitLine);
    p.orbitLine.geometry.dispose();
    p.orbitLine = buildOrbitLine(p.key);
    scene.add(p.orbitLine);

    if (p.moonMesh) {
      const moonRadiusScene = sceneRadiusForKm(p.el.moon.radiusKm);
      p.moonMesh.scale.setScalar(moonRadiusScene);
      p.moonMarker.visible = scaleMode === 'true';
      p.moonLabel.position.set(0, scaleMode === 'true' ? moonRadiusScene * 3 : moonRadiusScene + 0.25, 0);
    }
  });

  buildAsteroidBelt();

  controls.minDistance = scaleMode === 'true' ? 0.02 : 0.05;
  controls.maxDistance = scaleMode === 'true' ? 20000 : 8000;
}
applyScaleMode();

/* ---------- HUD: play / pause ---------- */
const playPauseBtn = document.getElementById('playPause');
const iconPlay = document.getElementById('iconPlay');
const iconPause = document.getElementById('iconPause');
const playPauseLabel = document.getElementById('playPauseLabel');
let playing = true;

playPauseBtn.addEventListener('click', () => {
  playing = !playing;
  iconPlay.style.display = playing ? 'none' : 'inline';
  iconPause.style.display = playing ? 'inline' : 'none';
  playPauseLabel.textContent = playing ? 'Pause' : 'Play';
  playPauseBtn.setAttribute('aria-label', playing ? 'Pause orbits' : 'Resume orbits');
});

/* ---------- HUD: scale mode toggle ---------- */
const scaleModeBtn = document.getElementById('scaleModeBtn');
scaleModeBtn.addEventListener('click', () => {
  scaleMode = scaleMode === 'visual' ? 'true' : 'visual';
  scaleModeBtn.textContent = scaleMode === 'true' ? 'Scale: True' : 'Scale: Visual';
  scaleModeBtn.classList.toggle('reverse-active', scaleMode === 'true');
  applyScaleMode();

  followTarget = null;
  flying = false;
  defaultCamPos = scaleMode === 'true' ? TRUE_CAM_POS.clone() : VISUAL_CAM_POS.clone();
  camera.position.copy(defaultCamPos);
  controls.target.set(0, 0, 0);
  controls.update();
});

/* ---------- HUD: time rate (real-time base, reverse, fast-forward) ---------- */
let rateMagnitude = 1;
let reverseSign = 1;
let simulatedTime = Date.now();
let lastFrameMs = performance.now();

const reverseBtn = document.getElementById('reverseBtn');
reverseBtn.addEventListener('click', () => {
  reverseSign *= -1;
  reverseBtn.classList.toggle('reverse-active', reverseSign === -1);
});

document.querySelectorAll('.rate-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rate-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    rateMagnitude = parseFloat(btn.dataset.rate);
    if (rateMagnitude === 1) simulatedTime = Date.now();
  });
});

document.getElementById('nowBtn').addEventListener('click', () => {
  simulatedTime = Date.now();
  reverseSign = 1;
  reverseBtn.classList.remove('reverse-active');
  document.querySelectorAll('.rate-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('.rate-btn[data-rate="1"]').classList.add('active');
  rateMagnitude = 1;
});

const clockDate = document.getElementById('clockDate');
const clockTime = document.getElementById('clockTime');
const istDateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const istTimeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function updateClock() {
  const d = new Date(simulatedTime);
  clockDate.textContent = istDateFmt.format(d);
  clockTime.textContent = istTimeFmt.format(d) + ' IST';
}

/* ---------- HUD: zoom ---------- */
function dolly(factor) {
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
  dir.multiplyScalar(factor);
  camera.position.copy(controls.target).add(dir);
  controls.update();
}
document.getElementById('zoomIn').addEventListener('click', () => dolly(0.8));
document.getElementById('zoomOut').addEventListener('click', () => dolly(1.25));
document.getElementById('zoomReset').addEventListener('click', () => {
  followTarget = null;
  flying = false;
  camera.position.copy(defaultCamPos);
  controls.target.set(0, 0, 0);
  controls.update();
});

/* ---------- info panel + camera fly-to-focus ---------- */
const infoPanel = document.getElementById('infoPanel');
const infoName = document.getElementById('infoName');
const infoTagline = document.getElementById('infoTagline');
const infoStats = document.getElementById('infoStats');
const infoEyebrow = document.getElementById('infoEyebrow');
let selectedMesh = null;
let followTarget = null;
let flying = false;
let focusDir = new THREE.Vector3();
let currentDist = 0;
let desiredDist = 0;

function clearSelection() { selectedMesh = null; }

function selectBody(mesh) {
  const key = mesh.userData.body;
  const info = BODY_INFO[key];
  if (!info) return;

  clearSelection();
  selectedMesh = mesh;

  const radius = mesh.scale.x;
  focusDir.copy(camera.position).sub(controls.target);
  if (focusDir.lengthSq() < 1e-6) focusDir.set(0, 0.4, 1);
  focusDir.normalize();
  currentDist = camera.position.distanceTo(controls.target);
  desiredDist = scaleMode === 'true' ? Math.max(radius * 6, 0.03) : (radius * 4.2 + 0.3);
  followTarget = mesh;
  flying = true;

  infoEyebrow.textContent = key === 'sun' ? 'OUR STAR' : 'SELECTED BODY';
  infoName.textContent = info.name;
  infoTagline.textContent = info.tagline;
  infoStats.innerHTML = '';
  Object.entries(info.stats).forEach(([label, value]) => {
    const wrap = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    wrap.append(dt, dd);
    infoStats.appendChild(wrap);
  });
  infoPanel.classList.add('open');
}

document.getElementById('infoClose').addEventListener('click', () => {
  infoPanel.classList.remove('open');
  clearSelection();
  followTarget = null;
  flying = false;
});

/* ---------- hotkeys: 1-8 planets, 0 sun, arrows cycle, space pause, esc close ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('infoClose').click();
  if (e.key === ' ') { e.preventDefault(); playPauseBtn.click(); }

  if (e.key === '0') { selectBody(sunMesh); return; }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 8) {
    const planet = planets[n - 1];
    if (planet) selectBody(planet.mesh);
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const idx = selectedMesh ? pickable.indexOf(selectedMesh) : -1;
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = (idx + dir + pickable.length) % pickable.length;
    selectBody(pickable[next]);
  }
});

/* ---------- pointer interaction: hover tooltip + click select ---------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
let pointerDownPos = null;

function updatePointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}
function pickTargets() {
  if (scaleMode !== 'true') return pickable;
  const markers = [sunMarker, ...planets.flatMap((p) => (p.moonMarker ? [p.marker, p.moonMarker] : [p.marker]))];
  return markers;
}
function meshForPicked(obj) {
  if (obj === sunMarker) return sunMesh;
  for (const p of planets) {
    if (obj === p.marker) return p.mesh;
    if (obj === p.moonMarker) return p.moonMesh;
  }
  return obj;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickTargets())[0];
  if (hit) {
    const mesh = meshForPicked(hit.object);
    const info = BODY_INFO[mesh.userData.body];
    tooltip.textContent = info ? info.name : '';
    tooltip.classList.add('visible');
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
    renderer.domElement.style.cursor = 'pointer';
  } else {
    tooltip.classList.remove('visible');
    renderer.domElement.style.cursor = 'grab';
  }
});

renderer.domElement.addEventListener('pointerdown', (e) => { pointerDownPos = { x: e.clientX, y: e.clientY }; });

renderer.domElement.addEventListener('pointerup', (e) => {
  if (!pointerDownPos) return;
  const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  pointerDownPos = null;
  if (moved > 5) return;

  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickTargets())[0];
  if (hit) selectBody(meshForPicked(hit.object));
});

/* ---------- animation loop ---------- */
function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
  lastFrameMs = nowMs;

  if (playing) simulatedTime += dt * 1000 * rateMagnitude * reverseSign;
  updateClock();

  const jd = julianDate(simulatedTime);
  const t = simulatedTime;

  sunMesh.rotation.y = (t / (609.12 * HOUR_MS)) * Math.PI * 2;
  if (scaleMode === 'true') {
    sunMarker.visible = (camera.position.length() / sunMesh.scale.x) > MARKER_HIDE_RATIO;
  }

  planets.forEach((p) => {
    const posAU = heliocentricAU(p.key, jd);
    const scenePos = sceneVectorForAUPoint(posAU);
    p.anchor.position.copy(scenePos);
    p.mesh.rotation.y = (t / (p.el.spinHours * HOUR_MS)) * Math.PI * 2;

    if (scaleMode === 'true') {
      p.marker.visible = (camera.position.distanceTo(p.anchor.position) / p.mesh.scale.x) > MARKER_HIDE_RATIO;
    }

    if (p.moonAnchor) {
      const moonAngle = p.moonPhase + (t / (p.el.moon.periodDays * DAY_MS)) * Math.PI * 2;
      const mAU = p.el.moon.distanceAU;
      const me = p.el.moon.eccentricity;
      const r = (mAU * (1 - me * me)) / (1 + me * Math.cos(moonAngle));
      const moonOffsetScene = scaleMode === 'true'
        ? new THREE.Vector3(Math.cos(moonAngle) * r, 0, Math.sin(moonAngle) * r).multiplyScalar(TRUE_AU_SCALE)
        : new THREE.Vector3(Math.cos(moonAngle), 0, Math.sin(moonAngle)).multiplyScalar(p.mesh.scale.x * 2.3 + 0.35);
      p.moonAnchor.position.copy(scenePos).add(moonOffsetScene);
      p.moonMesh.rotation.y = moonAngle;

      if (scaleMode === 'true') {
        p.moonMarker.visible = (camera.position.distanceTo(p.moonAnchor.position) / p.moonMesh.scale.x) > MARKER_HIDE_RATIO;
      }
    }
  });

  scene.updateMatrixWorld(true);
  if (followTarget) {
    const worldPos = new THREE.Vector3();
    followTarget.getWorldPosition(worldPos);

    if (flying) {
      currentDist += (desiredDist - currentDist) * 0.07;
      camera.position.copy(worldPos).add(focusDir.clone().multiplyScalar(currentDist));
      controls.target.copy(worldPos);
      if (Math.abs(currentDist - desiredDist) < 0.001) flying = false;
    } else {
      controls.target.copy(worldPos);
    }
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}
animate();