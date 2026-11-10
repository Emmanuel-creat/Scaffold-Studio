import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PRESETS, applyPreset } from './presets.js';
import { buildControls } from './ui.js';
import { renderMetrics, pressureDrop } from './panel.js';
import { FlowField, Particles, wallShear, flyPath, WSS_RANGE } from './flow.js';
import { specimenBox, SURFACES, fitWholeCells, gridSize, rotationMatrix } from './tpms.js';
import { materialOf, porosityForE } from './metrics.js';
import { parseSTL, normalize, stlToSdf } from './stl.js';
import { compressionCurve, fatigue } from './mechanics.js';
import { History, serialize, deserialize, encodeHash, decodeHash } from './project.js';
import { t, getLang, setLang, translatePage } from './i18n.js';
import { turbo } from './format.js';

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
const state = initialState();
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
scene.background = (() => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#1b2333'); grd.addColorStop(0.55, '#10141c'); grd.addColorStop(1, '#07090d');
  g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
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
const backMat = new THREE.MeshStandardMaterial({ side: THREE.BackSide, color: 0x6b2c36, roughness: 0.8, clippingPlanes: [clip] });

function applyLook() {
  const look = LOOKS[state.material] || LOOKS.custom;
  const wss = (state.flow.wss && app.wss) || (app.fem && app.fem.showVm && app.fem.result);
  frontMat.vertexColors = !!wss;
  frontMat.color.set(wss ? 0xffffff : look.color);
  frontMat.metalness = wss ? 0 : look.metalness;
  frontMat.roughness = wss ? 0.55 : look.roughness;
  frontMat.envMapIntensity = wss ? 0.35 : 1;
  frontMat.clearcoat = wss ? 0 : (look.clearcoat || 0);
  frontMat.sheen = wss ? 0 : (look.sheen || 0);
  const op = state.view.opacity / 100;
  frontMat.transparent = op < 1; frontMat.opacity = op; frontMat.depthWrite = op >= 1;
  backMat.transparent = op < 1; backMat.opacity = op;
  frontMat.needsUpdate = true;
}

function resize() {
  const r = viewport.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(r.height, 1);
  camera.updateProjectionMatrix();
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
  app.tensor = null;
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
  if (app.fem && app.fem.showVm && app.fem.key === femKey()) colorVm();
  applyLook();
  updatePanel();
  updateDims();
  frameCamera(firstGeo);
  firstGeo = false;
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
    app.flow = null; app.wss = null; app.flowStatus = { state: 'idle' };
    if (app.particles) { root.remove(app.particles.object); app.particles.dispose(); app.particles = null; }
    if (app.fly) exitFly();
    document.getElementById('hud-legend').hidden = true;
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
    return;
  }
  app.flow = new FlowField(d.field, state);
  app.flowStatus.steps = d.steps;
  app.flowStatus.permeability = d.permeability;
  ensureParticles();
  app.particles.setField(app.flow);
  if (state.flow.wss) computeWss();
  updatePanel();
  if (pendingFly && d.steps >= 300) { pendingFly = false; enterFly(); }
};

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
  g.attributes.color.array.set(res.colors);
  g.attributes.color.needsUpdate = true;
  app.wss = res;
  applyLook();
  showLegend();
}

function showLegend() {
  const el = document.getElementById('hud-legend');
  const stops = Array.from({ length: 11 }, (_, i) => { const c = turbo(i / 10).map((v) => Math.round(v * 255)); return `rgb(${c}) ${i * 10}%`; });
  if (app.fem && app.fem.showVm && app.fem.result) {
    const top = app.fem.result.kt99;
    const ticks = Array.from({ length: 5 }, (_, i) => ((top * i) / 4).toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
    el.innerHTML = `<div>${t('Von Mises / contrainte appliquée')}</div><div class="colorbar" style="background:linear-gradient(90deg,${stops.join(',')})"></div><div class="scale-legend">${ticks.map((x) => `<span>${x}</span>`).join('')}</div>`;
    el.hidden = false;
    return;
  }
  if (!state.flow.wss || !app.wss) { el.hidden = true; return; }
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const v = 10 ** (WSS_RANGE[0] + (i * (WSS_RANGE[1] - WSS_RANGE[0])) / 4) * 1000;
    return Number(v.toPrecision(v < 1 ? 1 : 2)).toLocaleString('fr-FR');
  });
  el.innerHTML = `<div>${t('Cisaillement pariétal (mPa)')}</div><div class="colorbar" style="background:linear-gradient(90deg,${stops.join(',')})"></div><div class="scale-legend">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>`;
  el.hidden = false;
}

// ---------- Vue ----------
function applyView() {
  applyLook();
  const box = specimenBox(state.shape);
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
  if (app.fem && app.fem.key && app.fem.key !== femKey()) { app.fem = null; applyLook(); showLegend(); }
  renderMetrics(document.getElementById('metrics'), state, app.metrics, app.flowStatus, app.flow, app.wss, app.tensor, app.fem);
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
document.getElementById('btn-stl').onclick = () => {
  if (!app.mesh) return;
  const data = new STLExporter().parse(new THREE.Mesh(app.mesh.geometry), { binary: true });
  download(new Blob([data], { type: 'model/stl' }), `${baseName()}.stl`);
};
document.getElementById('btn-report').onclick = () => {
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
};
function snapshot() {
  renderer.render(scene, camera);
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
document.getElementById('btn-fly').onclick = () => (app.fly ? exitFly() : enterFly());
document.getElementById('btn-help').onclick = () => document.getElementById('help').showModal();

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input[type=number], input[type=text], select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'h' && !e.ctrlKey) document.body.classList.toggle('capture');
  else if (k === 'f' && !e.ctrlKey && !e.metaKey) (app.fly ? exitFly() : enterFly());
  else if (k === 'escape') { exitFly(); document.body.classList.remove('capture'); }
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
    // L'ajustement de Gibson-Ashby remplace la loi generique pour cette surface.
    state.gaFits = { ...(state.gaFits || {}), [`${state.type}|${state.mode}`]: { C: r.fit.C, n: r.fit.n } };
    if (app.metrics) {
      const mat = materialOf(state);
      app.metrics.E = r.fit.C * mat.E * Math.pow(Math.max(0, 1 - app.metrics.porosity), r.fit.n);
    }
    colorVm();
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
  g.attributes.color.needsUpdate = true;
  applyLook();
  showLegend();
}
document.getElementById('metrics').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'fem') runFem();
  else if (b.dataset.act === 'vm' && app.fem) {
    app.fem.showVm = !app.fem.showVm;
    if (app.fem.showVm) colorVm(); else { if (state.flow.wss && app.flow) computeWss(); applyLook(); showLegend(); }
    updatePanel();
  }
});

// ---------- Historique et projet ----------
function beforeChange() {
  history.push(state);
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
  <form method="dialog"><button class="primary">Close</button></form>`;
}

// ---------- Import STL ----------
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
    if (app.flow) { app.flow.setInlet(state.flow.inlet); }
    if (app.particles && app.particles.count !== state.flow.particles && app.flow) { ensureParticles(); app.particles.setField(app.flow); }
    if (state.flow.wss) computeWss(); else { app.wss = null; applyLook(); showLegend(); }
    updatePanel();
    saveSession();
  },
  onView: () => { applyView(); saveSession(); },
  onRunFlow,
  onAction,
  beforeChange,
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
  if (app.fly) updateFly(dt); else controls.update();
  if (app.particles && app.flow && state.view.particles) {
    app.particles.update(dt, state.flow.speed, state.cell * 0.12);
  }
  if (app.recorder) {
    const s = Math.floor((performance.now() - app.recT0) / 1000);
    document.getElementById('rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  renderer.render(scene, camera);
});

window.scaffoldStudio = { app, state, history };
resize();
requestGeometry();
