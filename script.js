import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =========================================================
   SCALED MODEL
   Radii use each body's real diameter relative to Earth,
   compressed with a cube root (keeps the ordering & a true
   sense of scale — Jupiter really is much bigger than Earth —
   without Mercury shrinking to an invisible speck).
   Distances use real AU compressed with a square root, same
   idea: correct relative order and spacing, fits on screen.
   Orbital + spin periods are the real values, in days/hours,
   used directly against the simulated clock — so motion is
   genuinely to-scale in time, not just in space.
   ========================================================= */
const EARTH_R = 0.6;
const DIST_SCALE = 11.2;
const cbrt = Math.cbrt;

const BODIES = [
  { key: 'mercury', img: 'mercury.jpg', diameterRatio: 0.383, au: 0.39,  periodDays: 87.97,   spinHours: 1407.6,  axialTilt: 0.03, eccentricity: 0.2056, inclinationDeg: 7.00 },
  { key: 'venus',   img: 'venus.jpg',   diameterRatio: 0.949, au: 0.72,  periodDays: 224.70,  spinHours: -5832.5, axialTilt: 3.10, eccentricity: 0.0068, inclinationDeg: 3.39 },
  { key: 'earth',   img: 'earth_daymap.jpg', night: 'earth_nightmap.jpg', diameterRatio: 1,    au: 1.00,  periodDays: 365.25,  spinHours: 23.934, axialTilt: 0.41, eccentricity: 0.0167, inclinationDeg: 0,
    moon: { img: 'moon.jpg', diameterRatio: 0.273, distance: 1.3, periodDays: 27.32, spinHours: 655.7 } },
  { key: 'mars',    img: 'mars.jpg',    diameterRatio: 0.532, au: 1.52,  periodDays: 686.98,  spinHours: 24.623, axialTilt: 0.44, eccentricity: 0.0934, inclinationDeg: 1.85 },
  { key: 'jupiter', img: 'jupiter.jpg', diameterRatio: 11.21, au: 5.20,  periodDays: 4332.59, spinHours: 9.925,  axialTilt: 0.05, eccentricity: 0.0484, inclinationDeg: 1.30 },
  { key: 'saturn',  img: 'saturn.jpg',  diameterRatio: 9.45,  au: 9.58,  periodDays: 10759.22,spinHours: 10.656, axialTilt: 0.47, eccentricity: 0.0539, inclinationDeg: 2.49, ring: true },
  { key: 'uranus',  img: 'uranus.jpg',  diameterRatio: 4.01,  au: 19.20, periodDays: 30688.5, spinHours: -17.24, axialTilt: 1.71, eccentricity: 0.0472, inclinationDeg: 0.77 },
  { key: 'neptune', img: 'neptune.jpg', diameterRatio: 3.88,  au: 30.05, periodDays: 60182,   spinHours: 16.11,  axialTilt: 0.49, eccentricity: 0.0086, inclinationDeg: 1.77 },
  { key: 'pluto',   img: 'pluto.png',   diameterRatio: 0.186, au: 39.50, periodDays: 90560,   spinHours: 153.3,  axialTilt: 2.13, eccentricity: 0.2488, inclinationDeg: 17.16 }
];

BODIES.forEach((b) => {
  b.radius = EARTH_R * cbrt(b.diameterRatio);
  b.distance = DIST_SCALE * Math.sqrt(b.au); // semi-major axis, in scene units
  b.inclination = (b.inclinationDeg * Math.PI) / 180;
  if (b.moon) b.moon.radius = EARTH_R * (b.moon.diameterRatio); // linear ratio reads better for a satellite this close in size to its planet
});
const SUN_RADIUS = EARTH_R * cbrt(109.2); // Sun/Earth diameter ratio ≈109.2, cube-rooted like the planets

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
    stats: { 'Distance from Sun': '4.50B km', 'Day Length': '16h 6m', 'Moons': '14+', 'Fun Fact': 'Winds can exceed 2,000 km/h.' } },
  pluto: { name: 'Pluto', tagline: 'A dwarf planet in the Kuiper Belt, reclassified from full planet status in 2006.',
    stats: { 'Distance from Sun': '5.9B km (avg)', 'Day Length': '6.4 Earth days', 'Moons': '5 (largest: Charon)', 'Fun Fact': "Its orbit is so elliptical it briefly crosses Neptune's." } }
};

/* ---------- renderer / scene / camera ---------- */
const stage = document.getElementById('stage');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, stage.clientWidth / stage.clientHeight, 0.05, 3000);
const defaultCamPos = new THREE.Vector3(0, 65, 155);
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
controls.minDistance = 0.15;
controls.maxDistance = 500;
controls.target.set(0, 0, 0);

// bloom kept almost fully off — just a whisper of glow on the sun, nothing else
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(stage.clientWidth, stage.clientHeight),
  0.18,  // strength — very low
  0.3,   // radius
  0.92   // luminance threshold — only the brightest sun pixels qualify
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
    './images/' + file,
    undefined,
    undefined,
    () => console.warn('Missing texture, sphere will render plain:', file)
  );
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- milky way skybox ---------- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(600, 48, 32),
  new THREE.MeshBasicMaterial({ map: loadTexture('milkyway.jpg'), side: THREE.BackSide })
);
scene.add(sky);

// a sparse layer of crisp point stars on top of the milky way band for parallax sparkle
function buildStars() {
  const count = 1600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 300 + Math.random() * 280;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.75 });
  scene.add(new THREE.Points(geo, mat));
}
buildStars();

/* ---------- lighting ---------- */
scene.add(new THREE.AmbientLight(0x3c4356, 0.35));
const sunLight = new THREE.PointLight(0xfff2d0, 5.2, 0, 0.35);
scene.add(sunLight);

/* ---------- sun ---------- */
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 48, 48),
  new THREE.MeshBasicMaterial({ map: loadTexture('sun.jpg') })
);
sunMesh.userData.body = 'sun';
scene.add(sunMesh);

function makeLabel(text) {
  const div = document.createElement('div');
  div.className = 'body-label';
  div.textContent = text;
  return new CSS2DObject(div);
}
const sunLabel = makeLabel('Sun');
sunLabel.position.set(0, SUN_RADIUS + 0.7, 0);
sunMesh.add(sunLabel);

/* ---------- orbit path rings (real ellipses, focus at the sun) ---------- */
function buildOrbitLine(a, eccentricity) {
  const points = [];
  for (let i = 0; i <= 200; i++) {
    const theta = (i / 200) * Math.PI * 2;
    const r = (a * (1 - eccentricity * eccentricity)) / (1 + eccentricity * Math.cos(theta));
    points.push(new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.12 });
  return new THREE.LineLoop(geo, mat);
}

// fixes THREE.RingGeometry's default UVs so a radial-strip texture (like the saturn
// ring alpha map) reads correctly from inner edge to outer edge instead of pinching
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
const EPOCH = new Date('2000-01-01T00:00:00Z').getTime();

BODIES.forEach((b) => {
  const orbitLine = buildOrbitLine(b.distance, b.eccentricity);
  orbitLine.rotation.x = b.inclination;
  scene.add(orbitLine);

  const inclineGroup = new THREE.Group(); // tilts the whole orbit to its real inclination
  inclineGroup.rotation.x = b.inclination;
  scene.add(inclineGroup);

  const orbitAnchor = new THREE.Group();
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = b.axialTilt;

  const matOpts = { map: loadTexture(b.img), roughness: 0.9, metalness: 0.05 };
  if (b.night) {
    matOpts.emissiveMap = loadTexture(b.night);
    matOpts.emissive = new THREE.Color(0xffffff);
    matOpts.emissiveIntensity = 0.55;
  }
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 48, 48), new THREE.MeshStandardMaterial(matOpts));
  mesh.userData.body = b.key;
  tiltGroup.add(mesh);

  if (b.key === 'earth') {
    const atmoGeo = new THREE.SphereGeometry(b.radius * 1.04, 48, 48);
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { glowColor: { value: new THREE.Color(0x6fb7ff) } },
      vertexShader: `
        varying float rim;
        void main() {
          vec3 viewDir = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
          rim = 1.0 - max(dot(normalize(normalMatrix * normal), viewDir), 0.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float rim;
        uniform vec3 glowColor;
        void main() {
          float intensity = pow(rim, 2.5);
          gl_FragColor = vec4(glowColor, intensity * 0.55);
        }
      `
    });
    tiltGroup.add(new THREE.Mesh(atmoGeo, atmoMat));
  }

  let ringMesh = null;
  if (b.ring) {
    const inner = b.radius * 1.25, outer = b.radius * 2.3;
    const ringGeo = new THREE.RingGeometry(inner, outer, 128);
    fixRingUVs(ringGeo, inner, outer);
    const ringMat = new THREE.MeshBasicMaterial({
      map: loadTexture('saturn_ring_alpha.png'),
      transparent: true,
      side: THREE.DoubleSide,
      opacity: 0.85
    });
    ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    tiltGroup.add(ringMesh);
  }

  orbitAnchor.add(tiltGroup);

  const label = makeLabel(BODY_INFO[b.key].name);
  label.position.set(0, b.radius + 0.4, 0);
  orbitAnchor.add(label);

  inclineGroup.add(orbitAnchor);
  pickable.push(mesh);

  let moonMesh = null, moonAnchor = null;
  if (b.moon) {
    moonAnchor = new THREE.Group();
    moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(b.moon.radius, 32, 32),
      new THREE.MeshStandardMaterial({ map: loadTexture(b.moon.img), roughness: 0.95 })
    );
    moonMesh.userData.body = 'moon';
    moonAnchor.add(moonMesh);
    const moonLabel = makeLabel('Moon');
    moonLabel.position.set(0, b.moon.radius + 0.25, 0);
    moonAnchor.add(moonLabel);
    inclineGroup.add(moonAnchor);
    pickable.push(moonMesh);
  }

  planets.push({
    ...b, orbitAnchor, mesh, ringMesh, moonMesh, moonAnchor,
    phase: Math.random() * Math.PI * 2,
    spinPhase: Math.random() * Math.PI * 2,
    moonPhase: Math.random() * Math.PI * 2
  });
});

/* ---------- asteroid belt ---------- */
function buildAsteroidBelt() {
  const count = 500;
  const geo = new THREE.IcosahedronGeometry(0.08, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1 });
  const belt = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const innerR = 25.6 * 0.72, outerR = 25.6 * 0.92; // between Mars and Jupiter orbits
  for (let i = 0; i < count; i++) {
    const dist = innerR + Math.random() * (outerR - innerR);
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 0.7;
    dummy.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.scale.setScalar(0.5 + Math.random() * 1.2);
    dummy.updateMatrix();
    belt.setMatrixAt(i, dummy.matrix);
  }
  scene.add(belt);
  return belt;
}
const asteroidBelt = buildAsteroidBelt();

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

/* ---------- HUD: time rate (real-time base, reverse, fast-forward) ---------- */
let rateMagnitude = 1;   // simulated seconds per real second
let reverseSign = 1;     // 1 forward, -1 reverse
let simulatedTime = Date.now(); // ms, starts at real "now"
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
    if (rateMagnitude === 1) simulatedTime = Date.now(); // "Real" means right now, not wherever fast-forward left off
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

/* ---------- info panel + camera fly-to-focus (zooms in to inspect textures) ---------- */
const infoPanel = document.getElementById('infoPanel');
const infoName = document.getElementById('infoName');
const infoTagline = document.getElementById('infoTagline');
const infoStats = document.getElementById('infoStats');
const infoEyebrow = document.getElementById('infoEyebrow');
let selectedMesh = null;
let followTarget = null;   // Object3D whose world position the camera keeps tracking
let flying = false;        // true while the camera is still dollying in
let focusDir = new THREE.Vector3();
let currentDist = 0;
let desiredDist = 0;

function clearSelection() {
  if (selectedMesh && selectedMesh.material.emissive && !selectedMesh.userData.hasNightMap) {
    selectedMesh.material.emissive.set(0x000000);
  }
  selectedMesh = null;
}

function selectBody(mesh) {
  const key = mesh.userData.body;
  const info = BODY_INFO[key];
  if (!info) return;

  clearSelection();
  selectedMesh = mesh;

  const radius = mesh.geometry.parameters.radius;
  focusDir.copy(camera.position).sub(controls.target);
  if (focusDir.lengthSq() < 1e-6) focusDir.set(0, 0.4, 1);
  focusDir.normalize();
  currentDist = camera.position.distanceTo(controls.target);
  desiredDist = radius * 4.2 + 0.3; // close enough to clearly see surface detail
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('infoClose').click();
  if (e.key === ' ') {
    e.preventDefault();
    playPauseBtn.click();
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

renderer.domElement.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickable)[0];
  if (hit) {
    const info = BODY_INFO[hit.object.userData.body];
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
  const hit = raycaster.intersectObjects(pickable)[0];
  if (hit) selectBody(hit.object);
});

/* ---------- animation loop ---------- */
const worldPos = new THREE.Vector3();
const DAY_MS = 86400000;
const HOUR_MS = 3600000;

function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
  lastFrameMs = nowMs;

  if (playing) {
    simulatedTime += dt * 1000 * rateMagnitude * reverseSign;
  }
  updateClock();

  const t = simulatedTime - EPOCH;

  sunMesh.rotation.y = (t / (609.12 * HOUR_MS)) * Math.PI * 2;

  planets.forEach((p) => {
    const angle = p.phase + (t / (p.periodDays * DAY_MS)) * Math.PI * 2;
    const r = (p.distance * (1 - p.eccentricity * p.eccentricity)) / (1 + p.eccentricity * Math.cos(angle));
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    p.orbitAnchor.position.set(x, 0, z);
    p.mesh.rotation.y = p.spinPhase + (t / (p.spinHours * HOUR_MS)) * Math.PI * 2;

    if (p.moonAnchor) {
      const moonAngle = p.moonPhase + (t / (p.moon.periodDays * DAY_MS)) * Math.PI * 2;
      p.moonAnchor.position.set(
        x + Math.cos(moonAngle) * p.moon.distance,
        0,
        z + Math.sin(moonAngle) * p.moon.distance
      );
      p.moonMesh.rotation.y = angle; // tidally locked-ish, faces roughly outward
    }
  });

  asteroidBelt.rotation.y = (t / (4332.59 * 6 * DAY_MS)) * Math.PI * 2;

  // camera fly-to-focus: dolly in on select, then just track the moving body
  if (followTarget) {
    followTarget.getWorldPosition(worldPos);
    controls.target.lerp(worldPos, 0.08);

    if (flying) {
      currentDist += (desiredDist - currentDist) * 0.07;
      camera.position.copy(controls.target).add(focusDir.clone().multiplyScalar(currentDist));
      if (Math.abs(currentDist - desiredDist) < 0.02) flying = false;
    }
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}
animate();
