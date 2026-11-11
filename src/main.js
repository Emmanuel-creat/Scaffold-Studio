import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PRESETS, applyPreset } from './presets.js';
import { buildControls } from './ui.js';
import { renderMetrics, pressureDrop, snapshotForCompare } from './panel.js';
import { FlowField, Particles, wallShear, flyPath, WSS_RANGE, streamlines, streamlineMesh } from './flow.js';
import { Studio, shotPose } from './studio.js';
import { specimenBox, SURFACES, fitWholeCells, gridSize, rotationMatrix, makeFieldFn } from './tpms.js';
import { buildEstimate } from './fabrication.js';
import { materialOf, porosityForE, PROCESSES } from './metrics.js';
import { parseSTL, normalize, stlToSdf } from './stl.js';
import { compressionCurve, fatigue } from './mechanics.js';
import { anisotropySurface, engineering } from './fem.js';
// Exports et rapport charges a la demande : demarrage plus rapide (point 89).
const exporters = () => import('./exporters.js');
import { History, serialize, deserialize, encodeHash, decodeHash } from './project.js';
import { t, getLang, setLang, translatePage } from './i18n.js';
import { turbo } from './format.js';
import { createPalette, controlCommands, createTour, describeState } from './ux.js';

const RES = { low: 70, mid: 110, high: 160 };
const PREVIEW_RES = 48;
const LOOKS = {
  ti64: { color: 0xc3c7cf, metalness: 0.85, roughness: 0.32 },
  tantale: { color: 0x9aa1b2, metalness: 0.9, roughness: 0.3 },
  peek: { color: 0xd9c7a1, metalness: 0, roughness: 0.5, clearcoat: 0.3 },
  pcl: { color: 0xefe9dc, metalness: 0, roughness: 0.75, sheen: 0.4 },
  pla: { color: 0xdde5ef, metalness: 0, roughness: 0.45, clearcoat: 0.2 },
  ha: { color: 0xf0e9d8, metalness: 0, roughness: 0.85 },
  cocr: { color: 0xd4d8de, metalness: 0.9, roughness: 0.22 },
  mg: { color: 0xb7bcc2, metalness: 0.75, roughness: 0.45 },
  zn: { color: 0xa9b3bd, metalness: 0.8, roughness: 0.38 },
  tcp: { color: 0xf3eee2, metalness: 0, roughness: 0.9 },
  custom: { color: 0x9fb7c9, metalness: 0.3, roughness: 0.5 },
};

// Etat initial : lien partage (#p=...), sinon session precedente, sinon modele par defaut.
function initialState() {
  try {
    const fromHash = decodeHash(location.hash);
    // Le lien est consomme : un rechargement reprend ensuite la session en cours.
    if (fromHash) { window.history.replaceState(null, '', location.pathname); return fromHash; }
  } catch { /* lien invalide */ }
  try { const saved = sessionStorage.getItem('ss-state'); if (saved) return deserialize(JSON.parse(saved)); } catch { /* ignore */ }
  return applyPreset('default');
}
const sharedLink = location.hash.length > 1;
const state = initialState();
// Mouvement reduit demande par le systeme : pas de rotation automatique au depart.
if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) state.view.autoRotate = false;
const history = new History();
const app = {
  metrics: null, flow: null, flowStatus: { state: 'idle' }, wss: null,
  mesh: null, back: null, particles: null, fly: null, recorder: null, tensor: null,
};

// ---------- Scene ----------
const canvas = document.getElementById('view');
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
// Fond degrade, sombre ou clair selon le theme (point 70).
const BACKGROUNDS = {};
function backgroundFor(theme) {
  if (BACKGROUNDS[theme]) return BACKGROUNDS[theme];
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 512);
  const stops = theme === 'light' ? ['#f4f6f9', '#e3e8ef', '#cfd6e0'] : ['#1b2333', '#10141c', '#07090d'];
  grd.addColorStop(0, stops[0]); grd.addColorStop(0.55, stops[1]); grd.addColorStop(1, stops[2]);
  g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  BACKGROUNDS[theme] = t;
  return t;
}
scene.background = backgroundFor('dark');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.autoRotateSpeed = 0.8;
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(1, -1.5, 2);
scene.add(key, new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.6));
const headlamp = new THREE.PointLight(0xfff1dd, 1.1, 0, 1.2);
headlamp.visible = false;
camera.add(headlamp);
scene.add(camera);
const root = new THREE.Group();
scene.add(root);
const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6);
const AXES = { x: 0, y: 1, z: 2 };

const frontMat = new THREE.MeshPhysicalMaterial({ side: THREE.FrontSide, clippingPlanes: [clip] });
// Grain de poudre partiellement fondue a la surface d'une piece imprimee (point 66) :
// billes de rayon aleatoire placees sur une grille de Voronoi en 3D, estompees au loin pour eviter le scintillement.
const grain = { amp: { value: 0 }, freq: { value: 1 / 0.04 } };
frontMat.onBeforeCompile = (sh) => {
  sh.uniforms.uGrain = grain.amp; sh.uniforms.uGrainFreq = grain.freq;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vObj;
uniform float uGrain, uGrainFreq;
vec3 gHash(vec3 p) { p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.xxy + p.yzz) * p.zyx); }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uGrain > 0.0) {
  vec3 gp = vObj * uGrainFreq;
  float fade = clamp(1.6 - length(fwidth(gp)) * 1.4, 0.0, 1.0);
  if (fade > 0.0) {
    // billes posees sur la paroi : seules comptent celles dont le centre est proche du plan tangent,
    // la normale devient celle de la calotte spherique qui depasse (rayon r, ecart tangent dt)
    mat3 vm = mat3(viewMatrix);
    vec3 cell = floor(gp), bestT = vec3(0.0); float bh = 0.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
      vec3 c = cell + vec3(float(i), float(j), float(k));
      vec3 h = gHash(c);
      vec3 v = vm * (gp - c - h);
      float dn = dot(v, normal);
      vec3 vt = v - dn * normal;
      float r = 0.35 + 0.3 * fract(h.x * 7.13);
      float hh = r * r - dot(vt, vt) - dn * dn * 0.5;
      if (hh > bh) { bh = hh; bestT = vt; }
    }
    if (bh > 0.0) {
      vec3 nb = normalize(normal * sqrt(bh) + bestT);
      normal = normalize(mix(normal, nb, uGrain * fade * smoothstep(0.0, 0.02, bh) * 0.8));
    }
  }
}`);
};
const backMat = new THREE.MeshStandardMaterial({ side: THREE.BackSide, color: 0x6b2c36, roughness: 0.8, clippingPlanes: [clip] });

function applyLook() {
  const look = LOOKS[state.material] || LOOKS.custom;
  const wss = app.colorMode && app.colorMode !== 'none';
  frontMat.vertexColors = !!wss;
  frontMat.color.set(wss ? 0xffffff : look.color);
  frontMat.metalness = wss ? 0 : look.metalness;
  frontMat.roughness = wss ? 0.55 : look.roughness;
  frontMat.envMapIntensity = wss ? 0.35 : 1;
  frontMat.clearcoat = wss ? 0 : (look.clearcoat || 0);
  frontMat.sheen = wss ? 0 : (look.sheen || 0);
  grain.amp.value = state.studio.grain && !wss ? 1 : 0;
  const op = state.view.opacity / 100;
  frontMat.transparent = op < 1; frontMat.opacity = op; frontMat.depthWrite = op >= 1;
  backMat.transparent = op < 1; backMat.opacity = op;
  frontMat.needsUpdate = true;
}

const studio = new Studio({ renderer, scene, camera, canvas, viewport });
function resize() {
  studio.settings = state.studio;
  studio.layout();
}
function applyTheme() {
  const light = !!state.view.light;
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  if (!app.fly) scene.background = backgroundFor(light ? 'light' : 'dark');
  studio.theme = light ? 'light' : 'dark';
}
new ResizeObserver(resize).observe(viewport);

function frameCamera(reset) {
  const [X, Y, Z] = specimenBox(state.shape);
  const c = new THREE.Vector3(X / 2, Y / 2, Z / 2);
  const r = Math.hypot(X, Y, Z) / 2;
  if (reset) {
    camera.position.set(c.x + r * 2.2, c.y - r * 2.6, c.z + r * 1.5);
  }
  controls.target.copy(c);
  camera.near = r * 0.01; camera.far = r * 100;
  camera.updateProjectionMatrix();
}

// Recule la camera pour que la piece tienne dans le cadre, quel que soit le format (point 68).
function fitView() {
  const [X, Y, Z] = specimenBox(state.shape);
  const r = Math.hypot(X, Y, Z) / 2;
  const v = THREE.MathUtils.degToRad(camera.fov);
  const h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
  const dist = (r / Math.sin(Math.min(v, h) / 2)) * 1.04;
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
}

// ---------- Geometrie (worker) ----------
// Un nouveau calcul annule le precedent en recreant le worker (point 83).
// Un apercu basse resolution s'affiche d'abord, puis la resolution demandee (point 82).
let geoWorker = null, geoId = 0, geoBusy = false, firstGeo = true;

function newGeoWorker() {
  if (geoWorker) geoWorker.terminate();
  geoWorker = new Worker(new URL('./geo.worker.js', import.meta.url), { type: 'module' });
  geoWorker.onmessage = onGeoMessage;
}
function geoParams(res = RES[state.resKey]) {
  return { ...History.snap(state), res };
}
function requestGeometry() {
  stopFlow(true);
  clearBio(true);
  app.tensor = null;
  if (app.fem) app.fem.showAniso = false;
  showAnisotropy(false);
  if (geoBusy) newGeoWorker();
  geoBusy = true;
  const id = ++geoId;
  const full = RES[state.resKey];
  const preview = full > PREVIEW_RES * 1.4 && gridSize(geoParams(full)).points > 1.2e6;
  busy(true, t(preview ? 'Aperçu rapide' : 'Calcul de la géométrie et des mesures'));
  geoWorker.postMessage({ id, params: geoParams(preview ? PREVIEW_RES : full), preview });
  saveSession();
}
function onGeoMessage(e) {
  const d = e.data;
  if (d.id !== geoId) return;
  if (d.stage) { busy(true, t(d.stage)); return; }
  if (d.analysis) {
    app.analysis = d.analysis; app.maps = d.maps;
    refreshColors();
    updatePanel();
    return;
  }
  if (d.cmd === 'inverseStrut') {
    geoBusy = false; busy(false);
    beforeChange();
    state.porosity = Math.round(d.porosity * 1000) / 1000;
    ctl.refresh();
    status(`${t('Porosité ajustée à')} ${(state.porosity * 100).toFixed(1)} % ${t('pour un strut de')} ${state.target.strut} µm`);
    requestGeometry();
    return;
  }
  if (!d.ok) { geoBusy = false; busy(false); status(`${t('Erreur')} : ${d.error}`); return; }
  setMesh(d.mesh);
  app.metrics = d.metrics;
  app.wss = null;
  app.analysis = null; app.maps = null;
  refreshColors();
  drawPlate(); drawLayer();
  updatePanel();
  updateDims();
  frameCamera(firstGeo);
  firstGeo = false;
  maybeStartTour();
  if (d.preview) {
    busy(true, t('Aperçu affiché, calcul en résolution finale'));
    geoWorker.postMessage({ id: geoId, params: geoParams(), preview: false });
    return;
  }
  geoBusy = false;
  busy(false);
  const m = d.metrics;
  // Rigidite visee : une correction avec la porosite reellement mesuree (point 38).
  if (app.inverseE) {
    const target = app.inverseE; app.inverseE = null;
    if (Math.abs(m.E - target) / target > 0.04) {
      const offset = m.porosity - state.porosity;
      state.porosity = Math.round(Math.min(0.95, Math.max(0.2, porosityForE(state, target) - offset)) * 1000) / 1000;
      ctl.refresh(); requestGeometry();
      return;
    }
  }
  status(`${m.triangles.toLocaleString('fr-FR')} ${t('triangles')} · ${t('calcul')} ${(m.timeMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s${m.capped ? ` · ${t('résolution réduite à')} ${m.res}` : ''}`);
  if (pendingFlowAfterGeo) { pendingFlowAfterGeo = false; startFlow(); }
}
newGeoWorker();

function setMesh(m) {
  if (app.mesh) { app.mesh.geometry.dispose(); root.remove(app.mesh, app.back); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.positions.length).fill(1), 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  app.mesh = new THREE.Mesh(g, frontMat);
  app.back = new THREE.Mesh(g, backMat);
  root.add(app.mesh, app.back);
  applyView();
}

// ---------- Perfusion (worker) ----------
const flowWorker = new Worker(new URL('./flow.worker.js', import.meta.url), { type: 'module' });
let flowId = 0, pendingFlowAfterGeo = false, pendingFly = false;

function startFlow() {
  if (geoBusy) { pendingFlowAfterGeo = true; return; }
  flowWorker.postMessage({ cmd: 'start', id: ++flowId, params: geoParams(), maxSteps: 3000 });
  app.flowStatus = { state: 'running', steps: 0 };
  ctl.flowBtn.innerHTML = `<svg><use href="#i-stop"/></svg> ${t('Arrêter la perfusion')}`;
  updatePanel();
}
function stopFlow(clear) {
  flowWorker.postMessage({ cmd: 'stop' });
  if (app.flowStatus.state === 'running') app.flowStatus.state = clear ? 'idle' : 'stopped';
  if (clear) {
    if (app.stream) { root.remove(app.stream.mesh); app.stream.mesh.geometry.dispose(); app.stream = null; }
    app.flow = null; app.wss = null; app.flowStatus = { state: 'idle' };
    clearBio(false);
    if (app.particles) { root.remove(app.particles.object); app.particles.dispose(); app.particles = null; }
    if (app.fly) exitFly();
    if (app.colorMode === 'wss') refreshColors();
  }
  ctl && (ctl.flowBtn.innerHTML = `<svg><use href="#i-play"/></svg> ${t('Lancer la perfusion')}`);
  updatePanel();
}
flowWorker.onmessage = (e) => {
  const d = e.data;
  if (d.id !== flowId) return;
  if (d.type === 'tensor-progress' || d.type === 'tensor') {
    app.tensor = { k: { ...(app.tensor && app.tensor.k), ...(d.k && d.type === 'tensor' ? d.k : { [d.dir]: d.k }) }, running: d.type !== 'tensor' };
    if (d.type === 'tensor') { busy(false); status(t('Tenseur de perméabilité calculé')); } else busy(true, `${t('Perméabilité selon')} ${d.dir.toUpperCase()} ${t('calculée')}`);
    updatePanel();
    return;
  }
  if (d.type === 'end') {
    app.flowStatus.state = d.converged ? 'converged' : d.stopped ? 'stopped' : 'max';
    ctl.flowBtn.innerHTML = `<svg><use href="#i-play"/></svg> ${t('Relancer la perfusion')}`;
    updatePanel();
    if (pendingBio && app.flow) { const c = pendingBio; pendingBio = null; runBio(c); }
    updateStreamlines();
    return;
  }
  app.flow = new FlowField(d.field, state);
  app.flowStatus.steps = d.steps;
  app.flowStatus.permeability = d.permeability;
  app.flowStatus.engine = d.engine;
  ensureParticles();
  app.particles.setField(app.flow);
  if (state.flow.wss) computeWss();
  updatePanel();
  if (pendingFly && d.steps >= 300) { pendingFly = false; enterFly(); }
};


// ---------- Biologie (worker) : oxygene, ensemencement, croissance tissulaire ----------
let bioWorker = null, bioId = 0, pendingBio = null;
app.bio = { oxygen: null, seed: null, tissue: null, running: null };
const tissueMat = new THREE.MeshStandardMaterial({ color: 0xd7838a, roughness: 0.55, transparent: true, opacity: 0.6, depthWrite: false, clippingPlanes: [clip], side: THREE.DoubleSide });
function flowPayload() {
  const f = app.flow;
  return { nx: f.nx, ny: f.ny, nz: f.nz, size: f.size, period: f.period, solid: f.solid, ux: f.ux, uy: f.uy, uz: f.uz, scale: f.scale };
}
function clearBio(all) {
  app.bio.oxygen = null; app.bio.seed = null; app.oxyMap = null; pendingBio = null;
  if (app.seedPoints) { root.remove(app.seedPoints); app.seedPoints.geometry.dispose(); app.seedPoints = null; }
  if (all) {
    app.bio.tissue = null;
    if (app.tissueMesh) { root.remove(app.tissueMesh); app.tissueMesh.geometry.dispose(); app.tissueMesh = null; }
  }
  if (app.bio.running && (all || app.bio.running !== 'tissue')) { app.bio.running = null; newBioWorker(); busy(false); }
  if (state.view.map === 'oxygen' && app.mesh) refreshColors();
}
function runBio(cmd) {
  if (!app.mesh || geoBusy) { status(t('Attends la fin du calcul de géométrie')); return; }
  if (cmd !== 'tissue' && (!app.flow || app.flowStatus.state === 'running')) {
    pendingBio = cmd;
    if (app.flowStatus.state !== 'running') startFlow();
    status(t('Perfusion en cours, le calcul démarre dès que l\'écoulement est établi'));
    return;
  }
  const msg = { id: ++bioId, cmd, params: geoParams() };
  if (cmd !== 'tissue') msg.flow = flowPayload();
  if (cmd === 'oxygen') msg.positions = app.mesh.geometry.attributes.position.array.slice();
  app.bio.running = cmd;
  busy(true, t({ oxygen: 'Oxygène en perfusion', seed: 'Ensemencement des cellules', tissue: 'Croissance du tissu' }[cmd]));
  bioWorker.postMessage(msg);
  updatePanel();
}
function onBioMessage(e) {
  const d = e.data;
  if (d.id !== bioId) return;
  if (d.stage) { busy(true, t(d.stage)); return; }
  app.bio.running = null;
  busy(false);
  if (!d.ok) { status(`${t('Erreur')} : ${d.error}`); updatePanel(); return; }
  if (d.cmd === 'oxygen') {
    app.bio.oxygen = d;
    app.oxyMap = d.map;
    // Echelle de couleur resserree sur les valeurs presentes, arrondie a 5 uM.
    let lo = Infinity, hi = -Infinity;
    for (const v of d.map) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    app.oxyRange = [Math.floor(lo * 200) / 200, Math.max(Math.ceil(hi * 200) / 200, Math.floor(lo * 200) / 200 + 0.005)];
    if (state.view.map !== 'oxygen') { state.view.map = 'oxygen'; ctl.refresh(); }
    refreshColors();
    status(t('Oxygène calculé'));
  } else if (d.cmd === 'seed') {
    app.bio.seed = d;
    showSeeding(d);
    status(`${t('Efficacité d\'ensemencement')} ${(d.efficiency * 100).toFixed(0)} %`);
  } else if (d.cmd === 'tissue') {
    app.bio.tissue = d;
    if (!d.meshes.some((m) => m.day === Number(state.bio.day))) state.bio.day = d.meshes[d.meshes.length - 1].day;
    state.bio.showTissue = true;
    ctl.refresh();
    showTissue();
    status(t('Croissance tissulaire simulée'));
  }
  updatePanel();
}
function newBioWorker() {
  if (bioWorker) bioWorker.terminate();
  bioWorker = new Worker(new URL('./bio.worker.js', import.meta.url), { type: 'module' });
  bioWorker.onmessage = onBioMessage;
}
newBioWorker();

// Tissu forme au jour choisi.
function showTissue() {
  if (app.tissueMesh) { root.remove(app.tissueMesh); app.tissueMesh.geometry.dispose(); app.tissueMesh = null; }
  const tis = app.bio.tissue;
  if (!tis || !state.bio.showTissue) return;
  const m = tis.meshes.find((x) => x.day === Number(state.bio.day)) || tis.meshes[tis.meshes.length - 1];
  if (!m.indices.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  app.tissueMesh = new THREE.Mesh(g, tissueMat);
  root.add(app.tissueMesh);
}

let dotTex = null;
function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.55, '#e8e8e8'); grd.addColorStop(0.8, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
  dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}
// Cellules ensemencees : trajectoires rejouees, puis cellules adherentes en couleur.
function showSeeding(d) {
  if (app.seedPoints) { root.remove(app.seedPoints); app.seedPoints.geometry.dispose(); }
  const { cells, frames, track, status: st } = d;
  const stop = new Uint16Array(cells);
  const last = (frames - 1) * cells * 3;
  for (let c = 0; c < cells; c++) {
    let f = frames - 1;
    while (f > 0) {
      const a = (f - 1) * cells * 3 + c * 3;
      if (track[a] !== track[last + c * 3] || track[a + 1] !== track[last + c * 3 + 1] || track[a + 2] !== track[last + c * 3 + 2]) break;
      f--;
    }
    stop[c] = f;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cells * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cells * 3), 3).setUsage(THREE.DynamicDrawUsage));
  // Cellules vues par transparence a travers le scaffold, pour suivre leur trajet dans les pores.
  const mat = new THREE.PointsMaterial({ size: Math.max(...specimenBox(state.shape)) * 0.045, vertexColors: true, sizeAttenuation: true, clippingPlanes: [clip], depthTest: false, transparent: true, opacity: 0.9 });
  mat.map = dotTexture(); mat.alphaTest = 0.2;
  app.seedPoints = new THREE.Points(g, mat);
  app.seedPoints.frustumCulled = false;
  app.seedPoints.renderOrder = 10;
  app.seedAnim = { t0: performance.now(), dur: 9000, stop, status: st, frames, cells, track };
  root.add(app.seedPoints);
}
function updateSeeding() {
  const a = app.seedAnim;
  if (!a || !app.seedPoints) return;
  const s = Math.min(1, (performance.now() - a.t0) / a.dur) * (a.frames - 1);
  const f0 = Math.floor(s), f1 = Math.min(a.frames - 1, f0 + 1), w = s - f0;
  const pos = app.seedPoints.geometry.attributes.position.array, col = app.seedPoints.geometry.attributes.color.array;
  const T = a.track, n3 = a.cells * 3;
  for (let c = 0; c < a.cells; c++) {
    const b = c * 3, st = a.status[c];
    const done = f0 >= a.stop[c];
    if (done && (st === 2 || st === 3)) { pos[b] = pos[b + 1] = pos[b + 2] = NaN; continue; }
    for (let k = 0; k < 3; k++) pos[b + k] = T[f0 * n3 + b + k] * (1 - w) + T[f1 * n3 + b + k] * w;
    const rgb = done && st === 1 ? [0.3, 0.92, 0.52] : [1.0, 0.68, 0.22];
    col[b] = rgb[0]; col[b + 1] = rgb[1]; col[b + 2] = rgb[2];
  }
  app.seedPoints.geometry.attributes.position.needsUpdate = true;
  app.seedPoints.geometry.attributes.color.needsUpdate = true;
  if (s >= a.frames - 1) app.seedAnim = null;
}

function ensureParticles() {
  if (app.particles && app.particles.count === state.flow.particles) return;
  if (app.particles) { root.remove(app.particles.object); app.particles.dispose(); }
  app.particles = new Particles(state.flow.particles);
  app.particles.mat.clippingPlanes = [clip];
  root.add(app.particles.object);
  applyView();
}

function computeWss() {
  if (!app.flow || !app.mesh) return;
  const g = app.mesh.geometry;
  const res = wallShear(g.attributes.position.array, g.attributes.normal.array, app.flow, state.flow.wssLow, state.flow.wssHigh);
  if (app.fem) app.fem.showVm = false;
  app.wss = res;
  refreshColors();
}

// Couleurs de la surface : von Mises, puis cisaillement, puis carte geometrique choisie.
const diverge = (x) => {
  const t = Math.min(1, Math.max(-1, x));
  const a = [0.23, 0.36, 0.78], w = [0.93, 0.93, 0.93], b = [0.80, 0.18, 0.18];
  const [c0, c1, f] = t < 0 ? [w, a, -t] : [w, b, t];
  return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
};
const MAP_INFO = {
  thickness: { label: 'Épaisseur locale (µm)', max: () => app.metrics.strut.p95 * 1.25 },
  pore: { label: 'Taille de pore locale (µm)', max: () => app.metrics.pore.p95 * 1.25 },
  curvature: { label: 'Courbure moyenne (mm⁻¹)', max: () => (app.analysis ? app.analysis.curvatureScale : 1) },
  gauss: { label: 'Courbure de Gauss (mm⁻²)', max: () => (app.analysis ? app.analysis.gaussScale : 1) },
  overhang: { label: 'Surplombs', max: () => 1 },
  oxygen: { label: 'Oxygène dissous (µM)', min: () => app.oxyRange[0], max: () => app.oxyRange[1] },
};
function refreshColors() {
  if (!app.mesh) return;
  const g = app.mesh.geometry;
  const col = g.attributes.color.array;
  let mode = 'none';
  if (app.fem && app.fem.showVm && app.fem.result && app.fem.key === femKey()) mode = 'vm';
  else if (state.flow.wss && app.wss) mode = 'wss';
  else if (state.view.map === 'oxygen') { if (app.oxyMap) mode = 'oxygen'; }
  else if (state.view.map && state.view.map !== 'none' && app.maps) mode = state.view.map;
  app.colorMode = mode;
  if (mode === 'vm') colorVm();
  else if (mode === 'wss') col.set(app.wss.colors);
  else if (mode !== 'none') {
    const vals = mode === 'oxygen' ? app.oxyMap : app.maps[mode];
    const max = MAP_INFO[mode].max(), min = MAP_INFO[mode].min ? MAP_INFO[mode].min() : 0;
    for (let v = 0; v < vals.length; v++) {
      let rgb;
      if (mode === 'curvature' || mode === 'gauss') rgb = diverge(vals[v] / max);
      else if (mode === 'overhang') rgb = vals[v] >= 1 ? [0.86, 0.2, 0.22] : [0.78 + vals[v] * 0.25, 0.8 - vals[v] * 0.2, 0.82 - vals[v] * 0.6];
      else if (!Number.isFinite(vals[v])) rgb = [0.55, 0.57, 0.6];
      else rgb = turbo((vals[v] - min) / Math.max(max - min, 1e-12));
      col[v * 3] = rgb[0]; col[v * 3 + 1] = rgb[1]; col[v * 3 + 2] = rgb[2];
    }
  }
  g.attributes.color.needsUpdate = true;
  applyLook();
  showLegend();
}

function showLegend() {
  const el = document.getElementById('hud-legend');
  const stops = Array.from({ length: 11 }, (_, i) => { const c = turbo(i / 10).map((v) => Math.round(v * 255)); return `rgb(${c}) ${i * 10}%`; });
  if (app.colorMode === 'vm') {
    const top = app.fem.result.kt99;
    const ticks = Array.from({ length: 5 }, (_, i) => ((top * i) / 4).toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
    el.innerHTML = `<div>${t('Von Mises / contrainte appliquée')}</div><div class="colorbar" style="background:linear-gradient(90deg,${stops.join(',')})"></div><div class="scale-legend">${ticks.map((x) => `<span>${x}</span>`).join('')}</div>`;
    el.hidden = false;
    return;
  }
  const mode = app.colorMode;
  if (mode && MAP_INFO[mode] && app.metrics) {
    const max = MAP_INFO[mode].max();
    let bar, ticks;
    if (mode === 'curvature' || mode === 'gauss') {
      bar = Array.from({ length: 11 }, (_, i) => `rgb(${diverge(i / 5 - 1).map((v) => Math.round(v * 255))}) ${i * 10}%`).join(',');
      ticks = [-max, -max / 2, 0, max / 2, max].map((v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
    } else if (mode === 'overhang') {
      bar = 'rgb(199,204,209) 0%, rgb(230,190,110) 70%, rgb(219,51,56) 71%, rgb(219,51,56) 100%';
      ticks = ['0°', '', `${PROCESSES[state.process].overhang}°`, '', '90°'];
    } else {
      bar = stops.join(',');
      const min = MAP_INFO[mode].min ? MAP_INFO[mode].min() : 0;
      ticks = Array.from({ length: 5 }, (_, i) => Math.round((min + ((max - min) * i) / 4) * 1000).toLocaleString('fr-FR'));
    }
    const extra = mode === 'curvature' ? `<div class="scale-legend"><span>${t('concave')}</span><span>${t('convexe')}</span></div>`
      : mode === 'gauss' ? `<div class="scale-legend"><span>${t('selle')}</span><span>${t('dôme')}</span></div>` : '';
    el.innerHTML = `<div>${t(MAP_INFO[mode].label)}</div><div class="colorbar" style="background:linear-gradient(90deg,${bar})"></div><div class="scale-legend">${ticks.map((x) => `<span>${x}</span>`).join('')}</div>${extra}`;
    el.hidden = false;
    return;
  }
  if (mode !== 'wss') { el.hidden = true; return; }
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const v = 10 ** (WSS_RANGE[0] + (i * (WSS_RANGE[1] - WSS_RANGE[0])) / 4) * 1000;
    return Number(v.toPrecision(v < 1 ? 1 : 2)).toLocaleString('fr-FR');
  });
  el.innerHTML = `<div>${t('Cisaillement pariétal (mPa)')}</div><div class="colorbar" style="background:linear-gradient(90deg,${stops.join(',')})"></div><div class="scale-legend">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>`;
  el.hidden = false;
}

// ---------- Vue ----------
// Apercu des couches d'impression : section 2D a la hauteur choisie (point 52).
const layerHud = document.getElementById('hud-layer');
const layerCanvas = document.getElementById('layer-canvas');
let layerFn = null, layerKey = '';
function drawLayer() {
  if (!state.view.layers) { layerHud.hidden = true; return; }
  layerHud.hidden = false;
  const key = JSON.stringify(History.snap({ ...state, view: null, flow: null }));
  if (key !== layerKey) { layerFn = makeFieldFn(state); layerKey = key; }
  const [X, Y, Z] = specimenBox(state.shape);
  const proc = PROCESSES[state.process];
  const N = Math.ceil(Z / proc.layer);
  const n = Math.max(1, Math.min(N, Math.round((Math.min(state.view.cut, 100) / 100) * N)));
  const z = Math.min(Z - 1e-4, (n - 0.5) * proc.layer);
  const W = layerCanvas.width, H = layerCanvas.height;
  const s = Math.max(X, Y) / Math.min(W, H);
  const ox = (X - W * s) / 2, oy = (Y - H * s) / 2;
  const ctx = layerCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  let solid = 0, inside = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = ox + (i + 0.5) * s, y = oy + (H - 1 - j + 0.5) * s;
    const o = (j * W + i) * 4;
    const d = layerFn.sdf(x, y, z);
    let c;
    if (d > 0) c = [11, 14, 19];
    else {
      inside++;
      const v = layerFn.value(x, y, z);
      if (v < 0) { solid++; c = [233, 223, 200]; } else c = [24, 32, 44];
    }
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  document.getElementById('layer-text').textContent = `${t('Couche')} ${n.toLocaleString('fr-FR')} / ${N.toLocaleString('fr-FR')} · z ${z.toFixed(2)} mm · ${t('solide')} ${inside ? Math.round((solid / inside) * 100) : 0} %`;
}

// Plateau de fabrication avec les autres pieces du lot (point 60).
const plateGroup = new THREE.Group();
scene.add(plateGroup);
function drawPlate() {
  plateGroup.clear();
  plateGroup.visible = !!state.view.plate && !app.fly;
  if (!state.view.plate || !app.metrics) return;
  const b = buildEstimate(state, app.metrics);
  const [X, Y, Z] = specimenBox(state.shape);
  const [W, D] = b.plate;
  // La piece reelle occupe la case centrale du lot.
  const ic = Math.floor(b.perRow / 2), jc = Math.floor(b.perCol / 2);
  const tx = (i) => (i - ic) * (X + b.gap), ty = (j) => (j - jc) * (Y + b.gap);
  const cx = (tx(0) + tx(b.perRow - 1) + X) / 2, cy = (ty(0) + ty(b.perCol - 1) + Y) / 2;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W, D, 1.5), new THREE.MeshStandardMaterial({ color: 0x5b6470, metalness: 0.7, roughness: 0.45 }));
  plate.position.set(cx, cy, -0.78);
  app.plateCenter = [cx, cy];
  plateGroup.add(plate);
  const grid = new THREE.GridHelper(Math.max(W, D), Math.round(Math.max(W, D) / 10), 0x8a95a5, 0x3a4350);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(cx, cy, 0.01);
  plateGroup.add(grid);
  const count = b.perPlate - 1;
  if (count > 0) {
    const ghost = new THREE.InstancedMesh(new THREE.BoxGeometry(X, Y, Z), new THREE.MeshStandardMaterial({ color: LOOKS[state.material]?.color || 0xaaaaaa, transparent: true, opacity: 0.3, roughness: 0.6 }), count);
    const mtx = new THREE.Matrix4();
    let q = 0;
    for (let j = 0; j < b.perCol; j++) for (let i = 0; i < b.perRow; i++) {
      if (i === ic && j === jc) continue;
      mtx.makeTranslation(tx(i) + X / 2, ty(j) + Y / 2, Z / 2);
      ghost.setMatrixAt(q++, mtx);
    }
    plateGroup.add(ghost);
  }
}

// Surface d'anisotropie du module, posee a cote de la piece (point 32).
const anisoGroup = new THREE.Group();
scene.add(anisoGroup);
function showAnisotropy(on) {
  for (const c of [...anisoGroup.children]) { anisoGroup.remove(c); c.geometry && c.geometry.dispose(); }
  if (!on || !app.fem || !app.fem.result) return;
  const sf = anisotropySurface(engineering(app.fem.result.C).S, 48);
  const [X, Y, Z] = specimenBox(state.shape);
  const R = Math.max(X, Y, Z) * 0.42;
  const pos = new Float32Array(sf.dirs.length), col = new Float32Array(sf.dirs.length);
  for (let v = 0; v < sf.E.length; v++) {
    const r = (sf.E[v] / sf.Emax) * R;
    for (let k = 0; k < 3; k++) pos[v * 3 + k] = sf.dirs[v * 3 + k] * r;
    const c = turbo(sf.ratio > 1.0001 ? (sf.E[v] - sf.Emin) / (sf.Emax - sf.Emin) : 0.5);
    col.set(c, v * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(sf.indices, 1));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide }));
  const axes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-R * 1.2, 0, 0), new THREE.Vector3(R * 1.2, 0, 0), new THREE.Vector3(0, -R * 1.2, 0), new THREE.Vector3(0, R * 1.2, 0),
    new THREE.Vector3(0, 0, -R * 1.2), new THREE.Vector3(0, 0, R * 1.2)]), new THREE.LineBasicMaterial({ color: 0x8892a0 }));
  const lab = ['x', 'y', 'z'].map((a, i) => { const sp = labelSprite(a, R * 0.22); sp.position.setComponent(i, R * 1.35); return sp; });
  anisoGroup.add(m, axes, ...lab);
  anisoGroup.position.set(X + R * 1.6, Y / 2, Z / 2);
}

// Cotes de la piece : trois lignes de cote avec leur longueur (point 19).
const dimsGroup = new THREE.Group();
scene.add(dimsGroup);
let dimsKey = '';
function labelSprite(text, size) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 34px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const light = !!state.view.light;
  g.fillStyle = light ? 'rgba(255,255,255,.85)' : 'rgba(13,16,22,.75)';
  const w = g.measureText(text).width + 28;
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 10); g.fill();
  g.fillStyle = light ? '#18202b' : '#e6e9ef'; g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(size * 4, size, 1);
  sp.renderOrder = 20;
  return sp;
}
function drawDims() {
  const [X, Y, Z] = specimenBox(state.shape);
  const key = `${state.view.dims}|${X}|${Y}|${Z}|${state.view.light}|${state.shape.kind}`;
  if (key === dimsKey) return;
  dimsKey = key;
  for (const o of [...dimsGroup.children]) { dimsGroup.remove(o); o.geometry && o.geometry.dispose(); o.material.map && o.material.map.dispose(); o.material.dispose(); }
  if (!state.view.dims) return;
  const L = Math.max(X, Y, Z), off = L * 0.08, tick = L * 0.025;
  const v = [];
  const seg = (a, b) => v.push(...a, ...b);
  // X le long de y = -off, Y le long de x = X + off, Z sur l'arete x = -off, y = -off
  seg([0, -off, 0], [X, -off, 0]); seg([0, -off - tick, 0], [0, -off + tick, 0]); seg([X, -off - tick, 0], [X, -off + tick, 0]);
  seg([X + off, 0, 0], [X + off, Y, 0]); seg([X + off - tick, 0, 0], [X + off + tick, 0, 0]); seg([X + off - tick, Y, 0], [X + off + tick, Y, 0]);
  seg([-off, -off, 0], [-off, -off, Z]); seg([-off - tick, -off, 0], [-off + tick, -off, 0]); seg([-off - tick, -off, Z], [-off + tick, -off, Z]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  dimsGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: state.view.light ? 0x1f9e8a : 0x78d6c6, depthTest: false, transparent: true })));
  const f = (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} mm`;
  const round = state.shape.kind === 'cylinder' || state.shape.kind === 'cup';
  const s1 = labelSprite(round ? `Ø ${f(X)}` : f(X), L * 0.05); s1.position.set(X / 2, -off * 1.9, 0);
  const s3 = labelSprite(f(Z), L * 0.05); s3.position.set(-off * 1.9, -off * 1.9, Z / 2);
  dimsGroup.add(s1, s3);
  if (!round) { const s2 = labelSprite(f(Y), L * 0.05); s2.position.set(X + off * 1.9, Y / 2, 0); dimsGroup.add(s2); }
}

function applyView() {
  applyLook();
  drawLayer();
  drawPlate();
  drawDims();
  const box = specimenBox(state.shape);
  if (state.view.layers && state.view.cutAxis !== 'z') { state.view.cutAxis = 'z'; ctl && ctl.refresh(); }
  const ax = AXES[state.view.cutAxis || 'x'];
  clip.normal.set(ax === 0 ? -1 : 0, ax === 1 ? -1 : 0, ax === 2 ? -1 : 0);
  clip.constant = state.view.cut >= 100 ? 1e6 : (state.view.cut / 100) * box[ax];
  controls.autoRotate = state.view.autoRotate && !app.fly;
  if (app.particles) app.particles.object.visible = state.view.particles;
  if (app.back) app.back.visible = state.view.cut < 100 && !app.fly;
}

function updateDims() {
  const [X, Y, Z] = specimenBox(state.shape);
  const f = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const dims = state.shape.kind === 'cylinder' ? `Ø ${f(X)} × ${f(Z)} mm` : `${f(X)} × ${f(Y)} × ${f(Z)} mm`;
  const dimsTxt = state.shape.kind === 'stl' ? `STL ${f(X)} × ${f(Y)} × ${f(Z)} mm` : dims;
  document.getElementById('hud-dims').textContent = `${t(SURFACES[state.type].label)} · ${dimsTxt} · ${t(materialOf(state).label)}`;
}

function updatePanel() {
  if (app.fem && app.fem.key && app.fem.key !== femKey()) { app.fem = null; refreshColors(); }
  renderMetrics(document.getElementById('metrics'), state, app);
  const p = document.getElementById('flow-progress');
  if (p) p.style.width = app.flowStatus.state === 'idle' ? '0%' : `${Math.min(100, ((app.flowStatus.steps || 0) / 3000) * 100)}%`;
  if (p && ['converged', 'max'].includes(app.flowStatus.state)) p.style.width = '100%';
}

const busyEl = document.getElementById('hud-busy');
function busy(on, text) { busyEl.hidden = !on; if (text) document.getElementById('busy-text').textContent = text; }
function status(t) { document.getElementById('hud-status').textContent = t; }

// ---------- Mode vol ----------
function enterFly() {
  if (!app.flow) { pendingFly = true; if (app.flowStatus.state !== 'running') startFlow(); status(t('Perfusion en cours, le vol démarre dès que l\'écoulement est établi')); return; }
  const path = flyPath(app.flow);
  if (!path) { status(t('Aucune trajectoire trouvée dans les pores')); return; }
  app.fly = { ...path, t: 0, saved: { pos: camera.position.clone(), up: camera.up.clone(), fov: camera.fov, near: camera.near } };
  camera.up.set(0, 1, 0);
  camera.fov = 72;
  camera.near = state.cell * 0.004;
  camera.updateProjectionMatrix();
  controls.enabled = false;
  scene.fog = new THREE.Fog(0x0a0f17, state.cell * 0.4, state.cell * 6);
  headlamp.visible = true;
  renderer.toneMappingExposure = 0.68;
  savedBg = scene.background; scene.background = new THREE.Color(0x0a0f17);
  frontMat.side = THREE.FrontSide;
  document.getElementById('hud-fly').hidden = false;
  applyView();
}
function exitFly() {
  if (!app.fly) return;
  const s = app.fly.saved;
  camera.position.copy(s.pos); camera.up.copy(s.up); camera.fov = s.fov; camera.near = s.near;
  camera.updateProjectionMatrix();
  controls.enabled = true;
  scene.fog = null;
  headlamp.visible = false;
  renderer.toneMappingExposure = 1.05;
  scene.background = savedBg || scene.background;
  app.fly = null;
  document.getElementById('hud-fly').hidden = true;
  applyView();
}
let savedBg = null;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function updateFly(dt) {
  const f = app.fly;
  const duration = 26; // secondes pour la traversee complete
  f.t += dt / duration;
  if (f.t >= 1) { f.t = 0; }
  const ease = (t) => t * t * (3 - 2 * t);
  const u = 0.02 + ease(f.t) * 0.96;
  f.curve.getPointAt(Math.min(u, 1), _a);
  f.curve.getPointAt(Math.min(u + 0.012, 1), _b);
  camera.position.lerp(_a, f.t < 0.01 ? 1 : 0.25);
  camera.lookAt(_b);
  const [, , Z] = specimenBox(state.shape);
  const zIn = Math.min(Math.max(_a.z / Z, 0), 1) * 100;
  document.getElementById('fly-text').textContent = `${t('Vol dans les pores')} · ${t('profondeur')} ${zIn.toFixed(0)} %`;
}

// ---------- Exports ----------
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function baseName() {
  return `scaffold_${state.type}_${state.mode}_${Math.round(state.porosity * 100)}pc_${String(state.cell).replace('.', '-')}mm`;
}
function exportStl() {
  if (!app.mesh) return;
  const data = new STLExporter().parse(new THREE.Mesh(app.mesh.geometry), { binary: true });
  download(new Blob([data], { type: 'model/stl' }), `${baseName()}.stl`);
}
function meshArrays() {
  const g = app.mesh.geometry;
  return { positions: g.attributes.position.array, indices: g.index.array, normals: g.attributes.normal.array };
}
const exportMenu = document.getElementById('export-menu');
const exportBtn = document.getElementById('btn-export');
exportBtn.onclick = (e) => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; exportBtn.setAttribute('aria-expanded', String(!exportMenu.hidden)); };
document.addEventListener('click', () => { exportMenu.hidden = true; exportBtn.setAttribute('aria-expanded', 'false'); });
exportMenu.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-export]');
  if (!b || !app.mesh) return;
  const kind = b.dataset.export;
  const { to3MF, toVTKSurface, toVTKVelocity } = await exporters();
  if (kind === 'stl') exportStl();
  else if (kind === '3mf') download(to3MF(meshArrays(), { name: baseName(), material: materialOf(state).label }), `${baseName()}.3mf`);
  else if (kind === 'vtk') {
    const f = {};
    if (app.maps) { f.epaisseur_mm = app.maps.thickness; f.pore_mm = app.maps.pore; f.courbure_mm1 = app.maps.curvature; f.surplomb = app.maps.overhang; }
    if (app.wss && app.wss.tau) f.cisaillement_Pa = app.wss.tau;
    download(toVTKSurface(meshArrays(), f), `${baseName()}_surface.vtk`);
  } else if (kind === 'inp') {
    busy(true, t('Maillage voxel pour Abaqus'));
    const w = new Worker(new URL('./geo.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => {
      const d = ev.data;
      if (d.stage) return;
      w.terminate(); busy(false);
      if (!d.ok) { status(`${t('Erreur')} : ${d.error}`); return; }
      download(new Blob([d.text], { type: 'text/plain' }), `${baseName()}.inp`);
      status(`Abaqus : ${d.elements.toLocaleString('fr-FR')} ${t('éléments')} C3D8, ${d.nodes.toLocaleString('fr-FR')} ${t('noeuds')}`);
    };
    w.postMessage({ id: 1, cmd: 'abaqus', params: geoParams(), name: baseName() });
  } else if (kind === 'vel') {
    if (!app.flow) { status(t('Lance d\'abord la perfusion pour exporter le champ de vitesse')); return; }
    download(toVTKVelocity(app.flow), `${baseName()}_vitesse.vtk`);
  } else if (kind === 'csv') exportCsv();
  exportMenu.hidden = true;
});
document.getElementById('btn-report').onclick = async () => {
  if (!app.metrics) return;
  const { buildReport } = await import('./report.js');
  studio.render(focusDistance());
  const html = buildReport(state, app, canvas.toDataURL('image/jpeg', 0.9));
  download(new Blob([html], { type: 'text/html' }), `${baseName()}_rapport.html`);
};
function exportCsv() {
  const m = app.metrics; if (!m) return;
  const rows = [
    ['Paramètre', 'Valeur', 'Unité'],
    ['Surface', SURFACES[state.type].label, ''], ['Mode', state.mode === 'sheet' ? 'Feuillet' : 'Réseau', ''],
    ['Taille de cellule', state.cell, 'mm'], ['Porosité visée', state.porosity * 100, '%'],
    ['Gradient', state.gradient.kind, ''], ['Porosité finale du gradient', state.gradient.kind === 'none' ? '' : state.gradient.p1 * 100, '%'],
    ['Matériau', materialOf(state).label, ''],
    ['Module du matériau dense', materialOf(state).E, 'GPa'],
    ['Volume éprouvette', m.specimenVolume, 'mm3'], ['Volume solide', m.solidVolume, 'mm3'],
    ['Porosité mesurée', m.porosity * 100, '%'], ['Surface', m.surfaceArea, 'mm2'],
    ['Surface spécifique', m.specificSurface, 'mm-1'], ['Diamètre de pore moyen', m.pore.mean * 1000, 'µm'],
    ['Épaisseur de strut moyenne', m.strut.mean * 1000, 'µm'], ['Épaisseur de strut p10', m.strut.p10 * 1000, 'µm'],
    ['Interconnectivité', m.interconnectivity * 100, '%'], ['Module de Young estimé', m.E, 'GPa'],
    ['Limite d\'élasticité estimée', m.sy, 'MPa'], ['Masse', m.mass, 'g'],
    ['Perméabilité', app.flowStatus.permeability ?? '', 'm2'],
    ['Perte de charge', app.flowStatus.permeability ? pressureDrop(state, app.flowStatus.permeability) : '', 'Pa'],
    ['Perméabilité kx', app.tensor?.k?.x ?? '', 'm2'], ['Perméabilité ky', app.tensor?.k?.y ?? '', 'm2'], ['Perméabilité kz', app.tensor?.k?.z ?? '', 'm2'],
    ['Module Ex (éléments finis)', app.fem?.result ? app.fem.result.eng.Ex * materialOf(state).E : '', 'GPa'],
    ['Module Ey (éléments finis)', app.fem?.result ? app.fem.result.eng.Ey * materialOf(state).E : '', 'GPa'],
    ['Module Ez (éléments finis)', app.fem?.result ? app.fem.result.eng.Ez * materialOf(state).E : '', 'GPa'],
    ['Concentration de contrainte p99', app.fem?.result?.kt99 ?? '', ''],
    ['Gibson-Ashby C', app.fem?.result?.fit.C ?? '', ''], ['Gibson-Ashby n', app.fem?.result?.fit.n ?? '', ''],
    ['Contrainte de plateau (modèle)', compressionCurve(state, m).plateau, 'MPa'],
    ['Énergie absorbée à 50 % (modèle)', compressionCurve(state, m).W50, 'MJ/m3'],
    ['Endurance à 1e6 cycles (modèle)', fatigue(state, m).endurance, 'MPa'],
    ['Vitesse d\'entrée', state.flow.inlet, 'mm/s'],
    ['Cisaillement médian', app.wss ? app.wss.median * 1000 : '', 'mPa'],
    ['Surface dans la fenêtre cible', app.wss ? app.wss.inWindow * 100 : '', '%'],
  ];
  const csv = rows.map((r) => r.map((v) => (typeof v === 'number' ? String(+v.toPrecision(6)).replace('.', ',') : `"${v}"`)).join(';')).join('\n');
  download(new Blob(['﻿' + csv], { type: 'text/csv' }), `${baseName()}_mesures.csv`);
}
function snapshot() {
  studio.render(focusDistance());
  canvas.toBlob((b) => b && download(b, `${baseName()}.png`), 'image/png');
}
document.getElementById('btn-photo').onclick = snapshot;

function toggleRecord() {
  const btn = document.getElementById('btn-rec');
  if (app.recorder) { app.recorder.stop(); return; }
  if (!window.MediaRecorder) { status(t('Enregistrement vidéo non pris en charge par ce navigateur')); return; }
  // MP4 (H.264) en priorite : lisible directement par LinkedIn et les lecteurs courants (point 61).
  const types = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(canvas.captureStream(60), { mimeType, videoBitsPerSecond: 20e6 });
  const chunks = [];
  const t0 = performance.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    download(new Blob(chunks, { type: mimeType || 'video/webm' }), `${baseName()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
    app.recorder = null; btn.classList.remove('recording');
    document.getElementById('hud-rec').hidden = true;
  };
  rec.start(250);
  app.recorder = rec; app.recT0 = t0;
  btn.classList.add('recording');
  document.getElementById('hud-rec').hidden = false;
}
document.getElementById('btn-rec').onclick = toggleRecord;

// ---------- Studio : rendu haute definition, sequences de camera, lignes de courant ----------
function focusDistance() { return camera.position.distanceTo(controls.target); }
async function renderHiRes() {
  busy(true, t('Rendu haute définition'));
  await new Promise((r) => setTimeout(r, 30));
  const { blob, W, H } = await studio.renderHiRes(focusDistance());
  busy(false);
  if (blob) download(blob, `${baseName()}_${W}x${H}.png`);
  status(`${t('Image rendue en')} ${W} × ${H} px`);
}
function startShot() {
  const s = state.studio;
  if (s.path === 'keys' && s.keys.length < 2) { status(t('Ajoute au moins deux vues clés')); return; }
  if (app.fly) exitFly();
  const start = { center: controls.target.clone(), pos: camera.position.clone() };
  if (s.path === 'keys') { camera.position.fromArray(s.keys[0].pos); controls.target.fromArray(s.keys[0].target); }
  if (s.record && s.offline) { renderFrames(start); return; }
  app.shot = { t0: performance.now(), dur: s.duration * 1000, path: s.path, start, keys: s.keys.slice(), rec: false, cut0: state.view.cut };
  controls.enabled = false;
  if (s.record && !app.recorder) { toggleRecord(); app.shot.rec = true; }
  status(t('Séquence en cours, Échap pour arrêter'));
}
function stopShot() {
  if (!app.shot) return;
  if (app.shot.rec && app.recorder) toggleRecord();
  if (app.shot.path === 'reveal') { state.view.cut = app.shot.cut0; applyView(); ctl.refresh(); }
  app.shot = null;
  controls.enabled = true;
  status(t('Séquence terminée'));
}
function updateShot() {
  const sh = app.shot;
  const u = Math.min(1, (performance.now() - sh.t0) / sh.dur);
  poseCamera(shotPose(sh.path, u, sh.start, sh.keys));
  if (u >= 1) stopShot();
}
function poseCamera(p) {
  camera.position.copy(p.pos);
  controls.target.copy(p.target);
  camera.lookAt(p.target);
  if (p.cut != null) { state.view.cut = p.cut; applyView(); }
}

// Rendu image par image : chaque image est calculee puis codee en H.264 avec son horodatage exact,
// la video reste fluide a 60 i/s meme si l'ordinateur met une seconde par image (point 62).
async function renderFrames(start) {
  const s = state.studio;
  if (!window.VideoEncoder) { status(t('Rendu image par image non pris en charge par ce navigateur')); return; }
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const fps = 60, n = Math.round(s.duration * fps);
  const cut0 = state.view.cut, cam0 = camera.position.clone(), tgt0 = controls.target.clone();
  const [W, H] = studio.beginOffscreen(Number(s.offlineRes) || 1080);
  // H.264 d'abord (lu partout), VP9 dans un MP4 si le navigateur n'a pas de codeur H.264.
  const bitrate = Math.round(W * H * fps * 0.12);
  const candidates = [
    { mux: 'avc', codec: W * H > 1920 * 1088 ? 'avc1.640033' : 'avc1.640028' },
    { mux: 'vp9', codec: W * H > 1920 * 1088 ? 'vp09.00.51.08' : 'vp09.00.40.08' },
  ];
  let pick = null;
  for (const c of candidates) {
    const r = await VideoEncoder.isConfigSupported({ codec: c.codec, width: W, height: H, bitrate, framerate: fps }).catch(() => ({ supported: false }));
    if (r.supported) { pick = c; break; }
  }
  if (!pick) { studio.endOffscreen(); status(t('Aucun codeur vidéo disponible sur ce navigateur')); return; }
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: pick.mux, width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
  let failed = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  const cfg = { codec: pick.codec, width: W, height: H, bitrate, framerate: fps };
  enc.configure(cfg);
  app.rendering = true; controls.enabled = false;
  busy(true, t('Rendu image par image'));
  try {
    for (let f = 0; f < n && !failed && app.rendering; f++) {
      poseCamera(shotPose(s.path, f / (n - 1), start, s.keys));
      if (app.particles && app.flow && state.view.particles) app.particles.update(1 / fps, state.flow.speed, state.cell * 0.12);
      studio.render(focusDistance());
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
      enc.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();
      if (enc.encodeQueueSize > 4 || f % 10 === 0) {
        busy(true, `${t('Rendu image par image')} ${f + 1} / ${n}`);
        while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 5));
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await enc.flush();
    muxer.finalize();
    if (failed) throw failed;
    if (app.rendering) download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), `${baseName()}_${s.path}_${W}x${H}_60fps.mp4`);
  } catch (e) {
    status(`${t('Rendu interrompu')} : ${e.message || e}`);
  } finally {
    enc.state !== 'closed' && enc.close();
    studio.endOffscreen();
    state.view.cut = cut0; applyView();
    camera.position.copy(cam0); controls.target.copy(tgt0);
    app.rendering = false; controls.enabled = true;
    busy(false);
  }
}
function addKey() {
  state.studio.keys.push({ pos: camera.position.toArray(), target: controls.target.toArray() });
  status(`${state.studio.keys.length} ${t('vues clés')}`);
  updatePanel(); saveSession(); ctl.refresh();
}
function clearKeys() { state.studio.keys = []; status(t('Vues clés effacées')); saveSession(); ctl.refresh(); }

const streamMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0, emissive: 0x0b1a2a, clippingPlanes: [clip] });
function updateStreamlines() {
  const want = state.flow.streamlines && app.flow && app.flowStatus.state !== 'running';
  if (app.stream && (!want || app.stream.flow !== app.flow)) { root.remove(app.stream.mesh); app.stream.mesh.geometry.dispose(); app.stream = null; }
  if (!want || app.stream) return;
  const lines = streamlines(app.flow, { count: 120 });
  if (!lines.length) return;
  const mesh = new THREE.Mesh(streamlineMesh(lines, Math.min(...specimenBox(state.shape)) * 0.0035), streamMat);
  root.add(mesh);
  app.stream = { mesh, flow: app.flow };
}
document.getElementById('btn-fly').onclick = () => (app.fly ? exitFly() : enterFly());
document.getElementById('btn-help').onclick = () => document.getElementById('help').showModal();

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.open(); return; }
  if (e.target.matches('input[type=number], input[type=text], input[type=search], select, textarea')) return;
  if (document.querySelector('dialog[open]') || !tour.el.hidden) return;
  const k = e.key.toLowerCase();
  if (k === '/') { e.preventDefault(); palette.open(); return; }
  if (k === 'h' && !e.ctrlKey) document.body.classList.toggle('capture');
  else if (k === 'f' && !e.ctrlKey && !e.metaKey) (app.fly ? exitFly() : enterFly());
  else if (k === 'escape') { app.rendering = false; stopShot(); exitFly(); document.body.classList.remove('capture'); }
  else if (k === 'r' && !e.ctrlKey && !e.metaKey) toggleRecord();
  else if (k === 'p' && !e.ctrlKey && !e.metaKey) snapshot();
  else if (k === ' ') { e.preventDefault(); onRunFlow(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveProject(); }
});

// ---------- Elements finis (worker) ----------
let femWorker = null, femId = 0;
const femKey = () => JSON.stringify([state.type, state.mode, state.porosity, state.cell, state.aniso]);
function runFem() {
  if (femWorker) femWorker.terminate();
  femWorker = new Worker(new URL('./fem.worker.js', import.meta.url), { type: 'module' });
  const id = ++femId;
  app.fem = { running: true, stage: t('Voxelisation de la cellule'), key: femKey() };
  femWorker.onmessage = (e) => {
    const d = e.data;
    if (d.id !== femId) return;
    if (d.stage) { app.fem.stage = d.stage; app.fem.detail = d.detail; updateFemStage(); return; }
    if (!d.ok) { app.fem = { error: d.error }; updatePanel(); return; }
    const r = d.result;
    app.fem = { result: r, key: app.fem.key, showVm: true };
    showAnisotropy(false);
    // L'ajustement de Gibson-Ashby remplace la loi generique pour cette surface.
    state.gaFits = { ...(state.gaFits || {}), [`${state.type}|${state.mode}`]: { C: r.fit.C, n: r.fit.n } };
    if (app.metrics) {
      const mat = materialOf(state);
      app.metrics.E = r.fit.C * mat.E * Math.pow(Math.max(0, 1 - app.metrics.porosity), r.fit.n);
    }
    refreshColors();
    updatePanel();
    status(`${t('Éléments finis terminés en')} ${(r.timeMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`);
    saveSession();
  };
  femWorker.postMessage({ id, params: geoParams(), n: 24 });
  updatePanel();
}
function updateFemStage() {
  const el = document.querySelector('#g-fem .hint');
  if (el) el.innerHTML = `<span class="spinner inline"></span> ${t(app.fem.stage)} ${app.fem.detail || ''}`;
}
// Couleur de von Mises sur la surface : position du sommet ramenee dans la cellule periodique.
function colorVm() {
  if (!app.mesh || !app.fem || !app.fem.result) return;
  const r = app.fem.result;
  const g = app.mesh.geometry;
  const pos = g.attributes.position.array, col = g.attributes.color.array;
  const [nx, ny, nz] = r.dims;
  const [X, Y, Z] = specimenBox(state.shape);
  const cx = X / 2, cy = Y / 2, cz = Z / 2;
  const R = rotationMatrix(state.rotation);
  const size = r.size;
  const wrap = (v, n) => ((v % n) + n) % n;
  for (let v = 0; v < pos.length / 3; v++) {
    const u = pos[v * 3] - cx, w = pos[v * 3 + 1] - cy, q = pos[v * 3 + 2] - cz;
    const a = R[0] * u + R[3] * w + R[6] * q + cx, b = R[1] * u + R[4] * w + R[7] * q + cy, c = R[2] * u + R[5] * w + R[8] * q + cz;
    const fx = (a / size[0]) * nx - 0.5, fy = (b / size[1]) * ny - 0.5, fz = (c / size[2]) * nz - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
    let m = 0;
    for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      const val = r.vmGrid[wrap(i0 + di, nx) + wrap(j0 + dj, ny) * nx + wrap(k0 + dk, nz) * nx * ny];
      if (val > m) m = val;
    }
    const rgb = turbo(m / r.kt99);
    col[v * 3] = rgb[0]; col[v * 3 + 1] = rgb[1]; col[v * 3 + 2] = rgb[2];
  }
}
document.getElementById('metrics').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'fem') runFem();
  else if (b.dataset.act === 'ref') { app.ref = snapshotForCompare(state, app); updatePanel(); }
  else if (b.dataset.act === 'unref') { app.ref = null; updatePanel(); }
  else if (b.dataset.act === 'aniso' && app.fem) {
    app.fem.showAniso = !app.fem.showAniso;
    showAnisotropy(app.fem.showAniso);
    updatePanel();
  }
  else if (b.dataset.act === 'vm' && app.fem) {
    app.fem.showVm = !app.fem.showVm;
    if (!app.fem.showVm && state.flow.wss && app.flow && !app.wss) computeWss();
    refreshColors();
    updatePanel();
  }
});

// ---------- Historique et projet ----------
// Vignette de la vue courante, gardee avec chaque etat de l'historique (point 77).
const thumbs = new WeakMap();
function thumbnail() {
  try {
    const c = document.createElement('canvas'); c.width = 144; c.height = 108;
    const g = c.getContext('2d');
    studio.render(focusDistance()); // le tampon WebGL n'est pas conserve entre deux images
    const w = canvas.width, h = canvas.height, r = Math.min(w / 4, h / 3);
    g.drawImage(canvas, (w - r * 4) / 2, (h - r * 3) / 2, r * 4, r * 3, 0, 0, 144, 108);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return null; }
}
function beforeChange() {
  const snap = history.push(state);
  if (snap) thumbs.set(snap, thumbnail());
  updateHistoryButtons();
}
function restore(snap) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, snap);
  rebuildControls();
  requestGeometry();
  updateHistoryButtons();
}
function undo() { const s = history.undo(state); if (s) { restore(s); status(t('Modification annulée')); } }
function redo() { const s = history.redo(state); if (s) { restore(s); status(t('Modification rétablie')); } }
function updateHistoryButtons() {
  document.getElementById('btn-undo').disabled = !history.canUndo;
  document.getElementById('btn-redo').disabled = !history.canRedo;
}
document.getElementById('btn-undo').onclick = undo;
document.getElementById('btn-redo').onclick = redo;

const histPop = document.getElementById('history-pop');
const histBtn = document.getElementById('btn-history');
function showHistory() {
  const items = history.past.map((s, i) => ({ s, i })).reverse().slice(0, 20);
  const label = (s) => describeState(s, (k) => t(SURFACES[k].label));
  histPop.innerHTML = `<button type="button" class="current" disabled><span class="noimg"></span><span>${label(state)}<small>${t('Version actuelle')}</small></span></button>`
    + items.map(({ s, i }) => {
      const img = thumbs.get(s);
      return `<button type="button" role="menuitem" data-i="${i}">${img ? `<img src="${img}" alt="">` : '<span class="noimg"></span>'}<span>${label(s)}<small>${history.past.length - i} ${t('étape(s) en arrière')}</small></span></button>`;
    }).join('') + (items.length ? '' : `<p class="hint">${t('Aucune modification pour l\'instant')}</p>`);
  const r = histBtn.getBoundingClientRect();
  Object.assign(histPop.style, { left: `${Math.max(8, Math.min(r.left, innerWidth - 310))}px`, top: `${r.bottom + 6}px` });
  histPop.hidden = false;
  histBtn.setAttribute('aria-expanded', 'true');
  const first = histPop.querySelector('button[data-i]'); if (first) first.focus();
}
function hideHistory() { histPop.hidden = true; histBtn.setAttribute('aria-expanded', 'false'); }
histBtn.onclick = (e) => { e.stopPropagation(); if (histPop.hidden) showHistory(); else hideHistory(); };
histPop.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const target = Number(b.dataset.i);
  // On remonte pas a pas pour que chaque version intermediaire reste dans le retablissement.
  let s = null;
  while (history.past.length > target) {
    s = history.undo(state);
    if (history.past.length > target) restoreQuiet(s);
  }
  if (s) { restore(s); status(t('Version restaurée')); }
  hideHistory();
});
function restoreQuiet(s) { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, s); }
document.addEventListener('click', (e) => { if (!histPop.hidden && !histPop.contains(e.target) && e.target !== histBtn) hideHistory(); });
histPop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideHistory(); histBtn.focus(); } });

// Palette de commandes (Ctrl+K) : actions et tous les reglages du panneau.
const ACTIONS = () => [
  { label: t('Lancer ou arrêter la perfusion'), key: 'Espace', keywords: 'flow lbm', run: onRunFlow },
  { label: t('Éléments finis de la cellule'), keywords: 'fem rigidite', run: runFem },
  { label: t('Calculer l\'oxygène'), keywords: 'o2 hypoxie', run: () => runBio('oxygen') },
  { label: t('Ensemencer'), keywords: 'cellules seeding', run: () => runBio('seed') },
  { label: t('Simuler la croissance du tissu'), keywords: 'tissu', run: () => runBio('tissue') },
  { label: t('Rendu 4K (PNG)'), keywords: 'image photo', run: renderHiRes },
  { label: t('Tourner la séquence'), keywords: 'video camera', run: () => (app.shot ? stopShot() : startShot()) },
  { label: t('Capture d\'image'), key: 'P', run: snapshot },
  { label: t('Enregistrer une vidéo'), key: 'R', run: toggleRecord },
  { label: t('Mode vol'), key: 'F', run: () => (app.fly ? exitFly() : enterFly()) },
  { label: t('Masquer l\'interface'), key: 'H', run: () => document.body.classList.toggle('capture') },
  { label: t('Rapport de conception (HTML imprimable)'), run: () => document.getElementById('btn-report').click() },
  { label: t('Exporter'), keywords: 'stl 3mf vtk abaqus', run: () => document.getElementById('btn-export').click() },
  { label: t('Enregistrer le projet'), key: 'Ctrl+S', run: saveProject },
  { label: t('Copier un lien vers ce projet'), run: () => document.getElementById('btn-link').click() },
  { label: t('Annuler'), key: 'Ctrl+Z', run: undo },
  { label: t('Rétablir'), key: 'Ctrl+Y', run: redo },
  { label: t('Historique des versions'), run: showHistory },
  { label: t('Visite guidée'), run: () => tour.start() },
  { label: t('Thème clair'), run: () => { state.view.light = !state.view.light; ctl.refresh(); callbacks.onView(); } },
  ...PRESETS.map((p) => ({ label: t(p.label), group: t('Modèle'), run: () => { presetSel.value = p.id; presetSel.onchange(); } })),
].map((c) => ({ group: t('Action'), ...c }));
const palette = createPalette(() => [...ACTIONS(), ...controlCommands(document.getElementById('controls'))]);
document.getElementById('btn-palette').onclick = () => palette.open();

// Visite guidee au premier lancement (point 76).
const tour = createTour([
  { sel: '#preset', title: t('Choisis un modèle'), text: t('Six cas réels pour démarrer : cage lombaire, cupule, os trabéculaire, défaut osseux. Tout reste modifiable.') },
  { sel: '#sec-archi', title: t('Architecture'), text: t('Surface ou treillis, taille de cellule et porosité visée. La géométrie et les mesures se recalculent à chaque réglage.'), open: true },
  { sel: '#sec-shape', title: t('Forme de la pièce'), text: t('Pavé, cylindre, cage, cupule ou ta propre forme STL, avec peau pleine et trou de greffe.'), open: true },
  { sel: '#metrics', title: t('Mesures'), text: t('Porosité, pores, struts, rigidité comparés aux plages de l\'os, puis analyses avancées, fabrication et mécanique.') },
  { sel: '#btn-flow', title: t('Perfusion'), text: t('Lance le calcul d\'écoulement : perméabilité, perte de charge, cisaillement sur les parois et particules du milieu de culture.'), open: true },
  { sel: '#sec-studio', title: t('Studio image et vidéo'), text: t('Formats LinkedIn, rendu réaliste, titre incrusté, rendu 4K et séquences de caméra enregistrées.') },
  { sel: '#btn-palette', title: t('Tout au clavier'), text: t('Ctrl+K ouvre la recherche de commandes et de réglages. L\'aide liste les autres raccourcis.') },
], { onEnd: () => { try { localStorage.setItem('ss-tour', '1'); } catch { /* ignore */ } } });
let tourChecked = false;
// Premiere visite : la visite guidee demarre seule une fois la piece affichee.
function maybeStartTour() {
  if (tourChecked) return;
  tourChecked = true;
  let seen = '1';
  try { seen = localStorage.getItem('ss-tour'); } catch { /* ignore */ }
  if (!seen && !sharedLink && !navigator.webdriver) setTimeout(() => tour.start(), 600);
}
document.getElementById('btn-tour').onclick = () => { document.getElementById('help').close(); tour.start(); };

// Onglets sur telephone (point 74).
function setTab(tab) {
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
  setTimeout(resize, 0);
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => setTab(b.dataset.tab);
document.body.dataset.tab = 'view';

function saveSession() {
  // Un lien copie plus tot ne doit pas ecraser les changements suivants au rechargement.
  if (location.hash.includes('p=')) window.history.replaceState(null, '', location.pathname);
  try { sessionStorage.setItem('ss-state', JSON.stringify(serialize(state))); } catch { /* quota */ }
}
function saveProject() {
  const data = JSON.stringify(serialize(state), null, 2);
  download(new Blob([data], { type: 'application/json' }), `${baseName()}.scaffold.json`);
  if (state.shape.kind === 'stl') status(t('Projet enregistré. La forme STL importée devra être réimportée à l\'ouverture.'));
}
const projectInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true });
document.body.append(projectInput);
projectInput.onchange = async () => {
  const f = projectInput.files[0]; projectInput.value = '';
  if (!f) return;
  try {
    const next = deserialize(JSON.parse(await f.text()));
    beforeChange();
    restore(next);
    firstGeo = true;
    status(`${t('Projet ouvert')} : ${f.name}`);
  } catch (err) { status(`${t('Projet illisible')} : ${err.message}`); }
};
document.getElementById('btn-save').onclick = saveProject;
document.getElementById('btn-open').onclick = () => projectInput.click();
document.getElementById('btn-link').onclick = async () => {
  const url = `${location.origin}${location.pathname}#${encodeHash(state)}`;
  window.history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); status(t('Lien du projet copié dans le presse-papiers')); }
  catch { status(t('Lien du projet placé dans la barre d\'adresse')); }
};

// ---------- Langue ----------
const langBtn = document.getElementById('btn-lang');
langBtn.textContent = getLang() === 'fr' ? 'EN' : 'FR';
langBtn.onclick = () => { saveSession(); setLang(getLang() === 'fr' ? 'en' : 'fr'); location.reload(); };
translatePage();
if (getLang() === 'en') {
  document.getElementById('help').innerHTML = `<h2>Scaffold Studio</h2>
  <p>Design a porous scaffold, measure its morphology, estimate its stiffness and simulate culture medium perfusion through its pores.</p>
  <h3>Shortcuts</h3>
  <ul class="keys">
    <li><kbd>F</kbd> fly through the pores</li><li><kbd>H</kbd> hide the interface (capture mode)</li>
    <li><kbd>R</kbd> start or stop video recording</li><li><kbd>P</kbd> image capture</li>
    <li><kbd>Space</kbd> run or stop perfusion</li><li><kbd>Esc</kbd> leave fly mode</li>
    <li><kbd>Ctrl</kbd><kbd>Z</kbd> undo, <kbd>Ctrl</kbd><kbd>Y</kbd> redo</li><li><kbd>Ctrl</kbd><kbd>S</kbd> save the project</li>
  </ul>
  <h3>Methods</h3>
  <p>Geometry: triply periodic minimal surfaces, threshold solved for the target porosity, surface nets meshing. Measurements: pore diameter and strut thickness by inscribed spheres (exact distance transform). Stiffness: Gibson-Ashby law. Perfusion: D3Q19 lattice Boltzmann with TRT collision, Darcy permeability, wall shear stress from the near-wall velocity gradient.</p>
  <p class="note">Mechanical and shear values are design estimates, to be confirmed by finite elements and testing.</p>
  <p><button type="button" id="btn-tour-en" class="btn">Guided tour</button> <a class="btn" href="./methodes.html" target="_blank" rel="noopener">Illustrated methods (French)</a></p>
  <form method="dialog"><button class="primary">Close</button></form>`;
  document.getElementById('btn-tour-en').onclick = () => { document.getElementById('help').close(); tour.start(); };
}

// ---------- Import STL ----------
// Carte de densite : image ramenee a 48 x 48 niveaux de gris (point 14).
const imgInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
document.body.append(imgInput);
imgInput.onchange = async () => {
  const f = imgInput.files[0]; imgInput.value = '';
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    const n = 48, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, n, n);
    const px = g.getImageData(0, 0, n, n).data;
    const data = [];
    for (let i = 0; i < n * n; i++) data.push(Math.round(0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]));
    beforeChange();
    state.gradient.map = { w: n, h: n, data, name: f.name };
    ctl.refresh(); requestGeometry();
    status(`${t('Carte de densité chargée')} : ${f.name}`);
  } catch { status(t('Image illisible')); }
};
const stlInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.stl', hidden: true });
document.body.append(stlInput);
stlInput.onchange = async () => {
  const f = stlInput.files[0]; stlInput.value = '';
  if (!f) return;
  busy(true, t('Voxelisation de la forme importée'));
  await new Promise((r) => setTimeout(r, 30));
  try {
    const tris = parseSTL(await f.arrayBuffer());
    const box = normalize(tris);
    const { grid, volume } = stlToSdf(tris, box, 96);
    beforeChange();
    state.shape = { ...state.shape, kind: 'stl', box, sdfGrid: grid, volume, name: f.name };
    state.gradient.kind = state.gradient.kind === 'radial' ? 'surface' : state.gradient.kind;
    firstGeo = true;
    rebuildControls();
    const info = document.getElementById('stl-info');
    if (info) info.textContent = `${f.name} · ${box.map((v) => v.toFixed(1)).join(' × ')} mm · ${(volume / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} cm³`;
    requestGeometry();
  } catch (err) { busy(false); status(`${t('Import STL impossible')} : ${err.message}`); }
};

// ---------- Panneau ----------
function onRunFlow() {
  if (app.flowStatus.state === 'running') stopFlow(false);
  else startFlow();
}
function onAction(name) {
  if (name === 'fit') {
    beforeChange(); fitWholeCells(state); ctl.refresh(); requestGeometry();
    status(`${t('Cellule ajustée à')} ${state.cell} mm`);
  } else if (name === 'inverseStrut') {
    stopFlow(true);
    if (geoBusy) newGeoWorker();
    geoBusy = true;
    busy(true, t('Recherche de la porosité qui donne ce strut'));
    geoWorker.postMessage({ id: ++geoId, cmd: 'inverseStrut', params: geoParams(), target: state.target.strut / 1000 });
  } else if (name === 'inverseE') {
    beforeChange();
    state.porosity = Math.round(porosityForE(state, state.target.E) * 1000) / 1000;
    app.inverseE = state.target.E;
    ctl.refresh(); requestGeometry();
    status(`${t('Porosité ajustée à')} ${(state.porosity * 100).toFixed(1)} % ${t('pour')} E = ${state.target.E} GPa`);
  } else if (name === 'tensor') {
    if (geoBusy) { status(t('Attends la fin du calcul de géométrie')); return; }
    stopFlow(false);
    app.tensor = { k: {}, running: true };
    busy(true, t('Perméabilité selon X'));
    flowWorker.postMessage({ cmd: 'tensor', id: ++flowId, params: geoParams(), maxSteps: 3000 });
    updatePanel();
  } else if (name === 'oxygen' || name === 'seed' || name === 'tissue') {
    runBio(name);
  } else if (name === 'replaySeed') {
    if (app.bio.seed) showSeeding(app.bio.seed);
  } else if (name === 'gradImage') {
    imgInput.click();
  } else if (name === 'hires') {
    renderHiRes();
  } else if (name === 'shot') {
    if (app.shot) stopShot(); else startShot();
  } else if (name === 'addKey') {
    addKey();
  } else if (name === 'clearKeys') {
    clearKeys();
  } else if (name === 'importStl') {
    stlInput.click();
  }
}
const presetSel = document.getElementById('preset');
for (const p of PRESETS) presetSel.append(new Option(t(p.label), p.id));
presetSel.onchange = () => {
  beforeChange();
  const next = applyPreset(presetSel.value);
  next.view = state.view;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  rebuildControls();
  firstGeo = true;
  requestGeometry();
};
const callbacks = {
  onGeometry: requestGeometry,
  onFlow: () => {
    if (state.flow.streamlines && !app.flow && app.flowStatus.state !== 'running') startFlow();
    updateStreamlines();
    if (app.flow) { app.flow.setInlet(state.flow.inlet); }
    if (app.particles && app.particles.count !== state.flow.particles && app.flow) { ensureParticles(); app.particles.setField(app.flow); }
    if (state.flow.wss) computeWss(); else { app.wss = null; refreshColors(); }
    updatePanel();
    saveSession();
  },
  onView: () => {
    refreshColors(); applyView(); applyTheme(); saveSession();
    if (state.view.plate !== app.plateShown) {
      app.plateShown = state.view.plate;
      if (state.view.plate) { const b = buildEstimate(state, app.metrics); const r = Math.max(...b.plate); const [cx, cy] = app.plateCenter || [0, 0]; camera.position.set(cx + r * 0.35, cy - r * 0.75, r * 0.6); controls.target.set(cx, cy, 0); controls.autoRotate = false; camera.far = r * 20; camera.updateProjectionMatrix(); }
      else frameCamera(true);
    }
  },
  onRunFlow,
  onAction,
  beforeChange,
  onStudio: () => {
    resize();
    applyLook();
    if (state.studio.format !== app.lastFormat) { app.lastFormat = state.studio.format; fitView(); }
    saveSession();
  },
  onSolver: () => { stopFlow(true); updatePanel(); saveSession(); },
  onBio: () => { showTissue(); updatePanel(); saveSession(); },
};
let ctl = null;
// Le panneau est reconstruit quand la liste des formes change (forme STL importee ou retiree).
function rebuildControls() {
  const root = document.getElementById('controls');
  const open = [...root.querySelectorAll('details.sec')].map((d) => [d.id, d.open]);
  root.textContent = '';
  ctl = buildControls(root, state, callbacks);
  for (const [id, o] of open) { const d = document.getElementById(id); if (d) d.open = o; }
  if (app.flowStatus) stopFlow(false);
}
rebuildControls();
stopFlow(true);
updateHistoryButtons();

// ---------- Boucle ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (app.rendering) return; // le rendu image par image pilote lui-meme la scene
  if (app.shot) updateShot(); else if (app.fly) updateFly(dt); else controls.update();
  if (app.particles && app.flow && state.view.particles) {
    app.particles.update(dt, state.flow.speed, state.cell * 0.12);
  }
  if (app.seedAnim) updateSeeding();
  if (app.recorder) {
    const s = Math.floor((performance.now() - app.recT0) / 1000);
    document.getElementById('rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  studio.settings = state.studio;
  studio.render(focusDistance());
});

window.scaffoldStudio = { app, state, history, studio };
// Application installable et utilisable hors ligne une fois chargee (point 88).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
applyTheme();
app.lastFormat = state.studio.format;
resize();
requestGeometry();
