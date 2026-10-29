// Modeles de depart : cas d'usage reels de l'ingenierie tissulaire osseuse.
export const DEFAULT = {
  type: 'gyroid', mode: 'network', cell: 1.5, porosity: 0.7,
  shape: { kind: 'cube', x: 8, y: 8, z: 8, diameter: 8, height: 10 },
  gradient: { kind: 'none', p1: 0.5 },
  material: 'ti64', process: 'lpbf', resKey: 'mid',
  view: { cut: 100, opacity: 100, autoRotate: true, particles: true },
  flow: { inlet: 0.5, particles: 5000, speed: 3, wss: false, wssLow: 0.1, wssHigh: 10 },
};

export const PRESETS = [
  { id: 'default', label: 'Gyroïde titane (cube 8 mm)', p: {} },
  { id: 'cage', label: 'Cage rachidienne titane, gradient radial', p: {
    type: 'diamond', cell: 2, porosity: 0.75, shape: { kind: 'cylinder', diameter: 12, height: 8 },
    gradient: { kind: 'radial', p1: 0.45 }, material: 'ti64', process: 'lpbf' } },
  { id: 'pcl', label: 'Substitut osseux résorbable PCL', p: {
    type: 'gyroid', mode: 'sheet', cell: 2.2, porosity: 0.8, shape: { kind: 'cube', x: 10, y: 10, z: 6 },
    material: 'pcl', process: 'sla' } },
  { id: 'trab', label: 'Os trabéculaire bio-inspiré (gradient axial)', p: {
    type: 'iwp', cell: 1.8, porosity: 0.85, shape: { kind: 'cylinder', diameter: 8, height: 12 },
    gradient: { kind: 'axial', p1: 0.6 }, material: 'ha', process: 'sla' } },
  { id: 'tantale', label: 'Bouchon tantale Schwarz P', p: {
    type: 'primitive', cell: 1.6, porosity: 0.72, shape: { kind: 'cylinder', diameter: 6, height: 8 },
    material: 'tantale', process: 'lpbf' } },
  { id: 'peek', label: 'Implant PEEK Neovius', p: {
    type: 'neovius', cell: 3, porosity: 0.65, shape: { kind: 'cube', x: 9, y: 9, z: 9 },
    material: 'peek', process: 'fdm' } },
];

export function applyPreset(id) {
  const pr = PRESETS.find((x) => x.id === id) || PRESETS[0];
  const p = structuredClone(DEFAULT);
  for (const [k, v] of Object.entries(pr.p)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) p[k] = { ...p[k], ...v };
    else p[k] = v;
  }
  return p;
}
