// Mesures morphologiques et mecaniques d'un scaffold.
import { meshVolumeArea } from './mesher.js';
import { specimenBox } from './tpms.js';

export const MATERIALS = {
  ti64: { label: 'Ti-6Al-4V (titane, fusion laser)', E: 110, sy: 880, rho: 4.43 },
  tantale: { label: 'Tantale', E: 186, sy: 170, rho: 16.6 },
  peek: { label: 'PEEK', E: 3.6, sy: 100, rho: 1.30 },
  pcl: { label: 'PCL (polycaprolactone)', E: 0.4, sy: 16, rho: 1.145 },
  pla: { label: 'PLA', E: 3.5, sy: 60, rho: 1.24 },
  ha: { label: 'Hydroxyapatite dense', E: 100, sy: 400, rho: 3.16 },
};

export const PROCESSES = {
  sla: { label: 'Stéréolithographie (résine)', minFeature: 0.15 },
  lpbf: { label: 'Fusion laser sur lit de poudre (métal)', minFeature: 0.3 },
  fdm: { label: 'Dépôt de fil fondu', minFeature: 0.4 },
};

// Valeurs de reference pour l'os (ordres de grandeur de la litterature).
export const BONE = {
  trabecular: { E: [0.1, 2], sy: [2, 12], porosity: [0.5, 0.9], k: [1e-10, 1e-8] },
  cortical: { E: [7, 30], sy: [100, 200], porosity: [0.05, 0.1] },
  poreTarget: [0.3, 0.9], // mm, plage souvent visee pour l'osteoconduction
};

// Transformee de distance euclidienne exacte (Felzenszwalb et Huttenlocher), au carre, en voxels.
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      const p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
    }
    if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

export function edt3d(feature, nx, ny, nz) {
  const INF = 1e20;
  const N = nx * ny * nz;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = feature[i] ? 0 : INF;
  const m = Math.max(nx, ny, nz);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  const pass = (len, stride, starts) => {
    for (const s0 of starts) {
      for (let q = 0; q < len; q++) f[q] = out[s0 + q * stride];
      edt1d(f, len, d, v, z);
      for (let q = 0; q < len; q++) out[s0 + q * stride] = d[q];
    }
  };
  function* startsX() { for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) yield j * nx + k * nx * ny; }
  function* startsY() { for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) yield i + k * nx * ny; }
  function* startsZ() { for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) yield i + j * nx; }
  pass(nx, 1, startsX());
  pass(ny, nx, startsY());
  pass(nz, nx * ny, startsZ());
  return out;
}

// Diametres des plus grandes spheres inscrites aux maxima locaux (lignes de crete).
function ridgeDiameters(dt, region, field, h) {
  const { nx, ny, nz, sdf } = field;
  const out = [];
  const sy = nx, sz = nx * ny;
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const p = i + j * sy + k * sz;
    if (!region[p]) continue;
    const v = dt[p];
    if (v < 2) continue;
    const r = Math.sqrt(v) * h;
    if (-sdf[p] < r * 0.9) continue; // sphere qui deborde de l'eprouvette
    let isMax = true;
    for (let dk = -1; dk <= 1 && isMax; dk++) for (let dj = -1; dj <= 1 && isMax; dj++) for (let di = -1; di <= 1; di++) {
      if (dt[p + di + dj * sy + dk * sz] > v) { isMax = false; break; }
    }
    if (isMax) out.push(2 * r);
  }
  return out;
}

function stats(arr) {
  if (!arr.length) return { mean: 0, p10: 0, p95: 0 };
  const s = Float32Array.from(arr).sort();
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { mean, p10: s[Math.floor(0.1 * (s.length - 1))], p95: s[Math.floor(0.95 * (s.length - 1))] };
}

// Fraction du vide relie a l'exterieur (interconnectivite), par remplissage depuis la peau.
function interconnectivity(field) {
  const { data, inside, nx, ny, nz } = field;
  const N = nx * ny * nz;
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  let top = 0, total = 0, reached = 0;
  for (let p = 0; p < N; p++) {
    if (!inside[p] && data[p] >= 0) { seen[p] = 1; stack[top++] = p; }
    if (inside[p] && data[p] >= 0) total++;
  }
  const sy = nx, sz = nx * ny;
  while (top > 0) {
    const p = stack[--top];
    const i = p % nx, j = ((p / nx) | 0) % ny, k = (p / sz) | 0;
    const nb = [i > 0 ? p - 1 : -1, i < nx - 1 ? p + 1 : -1, j > 0 ? p - sy : -1, j < ny - 1 ? p + sy : -1, k > 0 ? p - sz : -1, k < nz - 1 ? p + sz : -1];
    for (const q of nb) {
      if (q < 0 || seen[q] || data[q] < 0) continue;
      seen[q] = 1;
      if (inside[q]) reached++;
      stack[top++] = q;
    }
  }
  return total ? reached / total : 1;
}

export function computeMetrics(params, field, mesh) {
  const { data, inside, nx, ny, nz, hx } = field;
  const N = nx * ny * nz;
  let nIn = 0, nVoid = 0;
  for (let p = 0; p < N; p++) if (inside[p]) { nIn++; if (data[p] >= 0) nVoid++; }
  const [X, Y, Z] = specimenBox(params.shape);
  const specimenVolume = params.shape.kind === 'cylinder' ? Math.PI * (X / 2) ** 2 * Z : X * Y * Z;
  const { volume, area } = meshVolumeArea(mesh.positions, mesh.indices);
  const porosity = 1 - volume / specimenVolume;

  const solid = new Uint8Array(N), voidOrOut = new Uint8Array(N), voidIn = new Uint8Array(N), solidIn = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const s = data[p] < 0;
    solid[p] = s ? 1 : 0;
    voidOrOut[p] = s ? 0 : 1;
    voidIn[p] = !s && inside[p] ? 1 : 0;
    solidIn[p] = s ? 1 : 0;
  }
  const dtVoid = edt3d(solid, nx, ny, nz);
  const dtSolid = edt3d(voidOrOut, nx, ny, nz);
  const pore = stats(ridgeDiameters(dtVoid, voidIn, field, hx));
  const strut = stats(ridgeDiameters(dtSolid, solidIn, field, hx));

  const mat = MATERIALS[params.material];
  const rel = Math.max(0, 1 - porosity);
  const n = params.mode === 'sheet' ? 1.5 : 2;
  const C1 = params.mode === 'sheet' ? 0.6 : 1;
  const E = C1 * mat.E * Math.pow(rel, n); // GPa
  const sy = 0.3 * mat.sy * Math.pow(rel, 1.5); // MPa
  const mass = volume * mat.rho / 1000; // g (mm3 * g/cm3 / 1000)
  const proc = PROCESSES[params.process];

  return {
    specimenVolume,
    solidVolume: volume,
    surfaceArea: area,
    porosity,
    voxelPorosity: nVoid / nIn,
    specificSurface: area / Math.max(volume, 1e-9), // mm-1
    surfaceDensity: area / specimenVolume, // mm-1
    pore,
    strut,
    interconnectivity: interconnectivity(field),
    E, sy, mass,
    printable: strut.p10 >= proc.minFeature,
    minFeature: proc.minFeature,
    triangles: mesh.indices.length / 3,
  };
}
