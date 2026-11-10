// Modeles de depart : cas d'usage reels de l'ingenierie tissulaire osseuse.
export const DEFAULT = {
  type: 'gyroid', mode: 'network', cell: 1.5, porosity: 0.7,
  aniso: { x: 1, y: 1, z: 1 },
  rotation: { x: 0, y: 0, z: 0 },
  shape: { kind: 'cube', x: 8, y: 8, z: 8, diameter: 8, height: 10, radius: 2, thickness: 3, hole: 0 },
  skin: { t: 0, faces: 'lateral' },
  gradient: { kind: 'none', p1: 0.5, c1: 1.5, depth: 2 },
  material: 'ti64', customMaterial: { E: 10, sy: 100, rho: 2 },
  process: 'lpbf', resKey: 'mid', smooth: 2,
  target: { strut: 400, E: 3 },
  gaFits: {},
  view: { cut: 100, cutAxis: 'x', opacity: 100, autoRotate: true, particles: true },
  flow: { inlet: 0.5, particles: 5000, speed: 3, wss: false, wssLow: 0.1, wssHigh: 10 },
};

export const PRESETS = [
  { id: 'default', label: 'Gyroïde titane (cube 8 mm)', p: {} },
  { id: 'lumbar', label: 'Cage lombaire titane avec fenêtre de greffe', p: {
    type: 'diamond', cell: 1.8, porosity: 0.7, shape: { kind: 'cage', x: 22, y: 10, z: 9, radius: 3, hole: 5 },
    skin: { t: 0.6, faces: 'lateral' }, material: 'ti64', process: 'lpbf', resKey: 'mid' } },
  { id: 'cage', label: 'Cage cylindrique titane, gradient radial', p: {
    type: 'diamond', cell: 2, porosity: 0.75, shape: { kind: 'cylinder', diameter: 12, height: 8 },
    gradient: { kind: 'radial', p1: 0.45, c1: 2 }, material: 'ti64', process: 'lpbf' } },
  { id: 'cup', label: 'Cupule acétabulaire poreuse', p: {
    type: 'gyroid', cell: 1.5, porosity: 0.65, shape: { kind: 'cup', diameter: 30, thickness: 3 },
    material: 'ti64', process: 'lpbf' } },
  { id: 'femur', label: 'Défaut segmentaire fémur de rat (Ø 4 × 5 mm)', p: {
    type: 'gyroid', cell: 0.8, porosity: 0.7, shape: { kind: 'cylinder', diameter: 4, height: 5, hole: 1.5 },
    material: 'ti64', process: 'lpbf' } },
  { id: 'calvaria', label: 'Défaut de calvaria de rat (Ø 8 × 1,5 mm)', p: {
    type: 'gyroid', mode: 'sheet', cell: 0.9, porosity: 0.72, shape: { kind: 'cylinder', diameter: 8, height: 1.5 },
    material: 'tcp', process: 'sla' } },
  { id: 'pcl', label: 'Substitut osseux résorbable PCL', p: {
    type: 'gyroid', mode: 'sheet', cell: 2.2, porosity: 0.8, shape: { kind: 'cube', x: 10, y: 10, z: 6 },
    material: 'pcl', process: 'sla' } },
  { id: 'trab', label: 'Os trabéculaire bio-inspiré (gradient axial)', p: {
    type: 'iwp', cell: 1.8, porosity: 0.85, shape: { kind: 'cylinder', diameter: 8, height: 12 },
    gradient: { kind: 'axial', p1: 0.6, c1: 1.4 }, aniso: { x: 1, y: 1, z: 1.4 }, material: 'ha', process: 'sla' } },
  { id: 'cortical', label: 'Coque corticale et coeur spongieux', p: {
    type: 'gyroid', cell: 1.6, porosity: 0.8, shape: { kind: 'cylinder', diameter: 10, height: 10 },
    gradient: { kind: 'surface', p1: 0.45, c1: 1.2, depth: 2.5 }, material: 'mg', process: 'lpbf' } },
  { id: 'tantale', label: 'Bouchon tantale Schwarz P', p: {
    type: 'primitive', cell: 1.6, porosity: 0.72, shape: { kind: 'cylinder', diameter: 6, height: 8 },
    material: 'tantale', process: 'lpbf' } },
  { id: 'peek', label: 'Implant PEEK Neovius', p: {
    type: 'neovius', cell: 3, porosity: 0.65, shape: { kind: 'cube', x: 9, y: 9, z: 9 },
    material: 'peek', process: 'fdm' } },
];

// Fusion profonde d'un objet de parametres partiel dans les valeurs par defaut.
export function mergeParams(base, part) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(part || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') out[k] = { ...out[k], ...v };
    else out[k] = v;
  }
  return out;
}

export function applyPreset(id) {
  const pr = PRESETS.find((x) => x.id === id) || PRESETS[0];
  return mergeParams(DEFAULT, pr.p);
}
