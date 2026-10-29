import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PRESETS, applyPreset } from './presets.js';
import { buildControls } from './ui.js';
import { renderMetrics } from './panel.js';
import { FlowField, Particles, wallShear, flyPath, WSS_RANGE } from './flow.js';
import { specimenBox, SURFACES } from './tpms.js';
import { MATERIALS } from './metrics.js';
import { turbo } from './format.js';

const RES = { low: 70, mid: 110, high: 160 };
const LOOKS = {
  ti64: { color: 0xc3c7cf, metalness: 0.85, roughness: 0.32 },
  tantale: { color: 0x9aa1b2, metalness: 0.9, roughness: 0.3 },
  peek: { color: 0xd9c7a1, metalness: 0, roughness: 0.5, clearcoat: 0.3 },
  pcl: { color: 0xefe9dc, metalness: 0, roughness: 0.75, sheen: 0.4 },
  pla: { color: 0xdde5ef, metalness: 0, roughness: 0.45, clearcoat: 0.2 },
  ha: { color: 0xf0e9d8, metalness: 0, roughness: 0.85 },
};

const state = applyPreset('default');
const app = {
  metrics: null, flow: null, flowStatus: { state: 'idle' }, wss: null,
  mesh: null, back: null, particles: null, fly: null, recorder: null,
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

const frontMat = new THREE.MeshPhysicalMaterial({ side: THREE.FrontSide, clippingPlanes: [clip] });
const backMat = new THREE.MeshStandardMaterial({ side: THREE.BackSide, color: 0x6b2c36, roughness: 0.8, clippingPlanes: [clip] });

function applyLook() {
  const look = LOOKS[state.material];
  const wss = state.flow.wss && app.wss;
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
const geoWorker = new Worker(new URL('./geo.worker.js', import.meta.url), { type: 'module' });
let geoId = 0, geoBusy = false, geoQueued = false, firstGeo = true;

function geoParams() {
  return { ...structuredClone(state), res: RES[state.resKey] };
}
function requestGeometry() {
  stopFlow(true);
  if (geoBusy) { geoQueued = true; return; }
  geoBusy = true;
  busy(true, 'Calcul de la géométrie et des mesures');
  geoWorker.postMessage({ id: ++geoId, params: geoParams() });
}
geoWorker.onmessage = (e) => {
  geoBusy = false;
  const { ok, mesh, metrics, error } = e.data;
  if (geoQueued) { geoQueued = false; requestGeometry(); return; }
  busy(false);
  if (!ok) { status(`Erreur : ${error}`); return; }
  setMesh(mesh);
  app.metrics = metrics;
  app.wss = null;
  applyLook();
  updatePanel();
  updateDims();
  frameCamera(firstGeo);
  firstGeo = false;
  status(`${metrics.triangles.toLocaleString('fr-FR')} triangles · calcul ${(metrics.timeMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`);
  if (pendingFlowAfterGeo) { pendingFlowAfterGeo = false; startFlow(); }
};

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
  ctl.flowBtn.innerHTML = '<svg><use href="#i-stop"/></svg> Arrêter la perfusion';
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
  ctl && (ctl.flowBtn.innerHTML = '<svg><use href="#i-play"/></svg> Lancer la perfusion');
  updatePanel();
}
flowWorker.onmessage = (e) => {
  const d = e.data;
  if (d.id !== flowId) return;
  if (d.type === 'end') {
    app.flowStatus.state = d.converged ? 'converged' : d.stopped ? 'stopped' : 'max';
    ctl.flowBtn.innerHTML = '<svg><use href="#i-play"/></svg> Relancer la perfusion';
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
  g.attributes.color.array.set(res.colors);
  g.attributes.color.needsUpdate = true;
  app.wss = res;
  applyLook();
  showLegend();
}

function showLegend() {
  const el = document.getElementById('hud-legend');
  if (!state.flow.wss || !app.wss) { el.hidden = true; return; }
  const stops = Array.from({ length: 11 }, (_, i) => { const c = turbo(i / 10).map((v) => Math.round(v * 255)); return `rgb(${c}) ${i * 10}%`; });
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const v = 10 ** (WSS_RANGE[0] + (i * (WSS_RANGE[1] - WSS_RANGE[0])) / 4) * 1000;
    return Number(v.toPrecision(v < 1 ? 1 : 2)).toLocaleString('fr-FR');
  });
  el.innerHTML = `<div>Cisaillement pariétal (mPa)</div><div class="colorbar" style="background:linear-gradient(90deg,${stops.join(',')})"></div><div class="scale-legend">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>`;
  el.hidden = false;
}

// ---------- Vue ----------
function applyView() {
  applyLook();
  const [X] = specimenBox(state.shape);
  clip.constant = state.view.cut >= 100 ? 1e6 : (state.view.cut / 100) * X;
  controls.autoRotate = state.view.autoRotate && !app.fly;
  if (app.particles) app.particles.object.visible = state.view.particles;
  if (app.back) app.back.visible = state.view.cut < 100 && !app.fly;
}

function updateDims() {
  const [X, Y, Z] = specimenBox(state.shape);
  const f = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const dims = state.shape.kind === 'cylinder' ? `Ø ${f(X)} × ${f(Z)} mm` : `${f(X)} × ${f(Y)} × ${f(Z)} mm`;
  document.getElementById('hud-dims').textContent = `${SURFACES[state.type].label} · ${dims} · ${MATERIALS[state.material].label}`;
}

function updatePanel() {
  renderMetrics(document.getElementById('metrics'), state, app.metrics, app.flowStatus, app.flow, app.wss);
  const p = document.getElementById('flow-progress');
  if (p) p.style.width = app.flowStatus.state === 'idle' ? '0%' : `${Math.min(100, ((app.flowStatus.steps || 0) / 3000) * 100)}%`;
  if (p && ['converged', 'max'].includes(app.flowStatus.state)) p.style.width = '100%';
}

const busyEl = document.getElementById('hud-busy');
function busy(on, text) { busyEl.hidden = !on; if (text) document.getElementById('busy-text').textContent = text; }
function status(t) { document.getElementById('hud-status').textContent = t; }

// ---------- Mode vol ----------
function enterFly() {
  if (!app.flow) { pendingFly = true; if (app.flowStatus.state !== 'running') startFlow(); status('Perfusion en cours, le vol démarre dès que l\'écoulement est établi'); return; }
  const path = flyPath(app.flow);
  if (!path) { status('Aucune trajectoire trouvée dans les pores'); return; }
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
  document.getElementById('fly-text').textContent = `Vol dans les pores · profondeur ${zIn.toFixed(0)} %`;
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
    ['Matériau', MATERIALS[state.material].label, ''],
    ['Volume éprouvette', m.specimenVolume, 'mm3'], ['Volume solide', m.solidVolume, 'mm3'],
    ['Porosité mesurée', m.porosity * 100, '%'], ['Surface', m.surfaceArea, 'mm2'],
    ['Surface spécifique', m.specificSurface, 'mm-1'], ['Diamètre de pore moyen', m.pore.mean * 1000, 'µm'],
    ['Épaisseur de strut moyenne', m.strut.mean * 1000, 'µm'], ['Épaisseur de strut p10', m.strut.p10 * 1000, 'µm'],
    ['Interconnectivité', m.interconnectivity * 100, '%'], ['Module de Young estimé', m.E, 'GPa'],
    ['Limite d\'élasticité estimée', m.sy, 'MPa'], ['Masse', m.mass, 'g'],
    ['Perméabilité', app.flowStatus.permeability ?? '', 'm2'],
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
  if (!window.MediaRecorder) { status('Enregistrement vidéo non pris en charge par ce navigateur'); return; }
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
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
  if (k === 'h') document.body.classList.toggle('capture');
  else if (k === 'f') (app.fly ? exitFly() : enterFly());
  else if (k === 'escape') { exitFly(); document.body.classList.remove('capture'); }
  else if (k === 'r') toggleRecord();
  else if (k === 'p') snapshot();
  else if (k === ' ') { e.preventDefault(); onRunFlow(); }
});

// ---------- Panneau ----------
function onRunFlow() {
  if (app.flowStatus.state === 'running') stopFlow(false);
  else startFlow();
}
const presetSel = document.getElementById('preset');
for (const p of PRESETS) presetSel.append(new Option(p.label, p.id));
presetSel.onchange = () => {
  const next = applyPreset(presetSel.value);
  next.view = state.view;
  Object.assign(state, next);
  ctl.refresh();
  firstGeo = true;
  requestGeometry();
};
const ctl = buildControls(document.getElementById('controls'), state, {
  onGeometry: requestGeometry,
  onFlow: () => {
    if (app.flow) { app.flow.setInlet(state.flow.inlet); }
    if (app.particles && app.particles.count !== state.flow.particles && app.flow) { ensureParticles(); app.particles.setField(app.flow); }
    if (state.flow.wss) computeWss(); else { app.wss = null; applyLook(); showLegend(); }
    updatePanel();
  },
  onView: applyView,
  onRunFlow,
});
stopFlow(true);

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

window.scaffoldStudio = { app, state };
resize();
requestGeometry();
