// Elements finis voxel : homogeneisation periodique d'une cellule de scaffold.
// Hexaedres a 8 noeuds, materiau isotrope unitaire, gradient conjugue preconditionne sans matrice assemblee.
import { makeFieldFn } from './tpms.js';

// Coordonnees locales des 8 noeuds de l'hexaedre unite.
const NODES = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

export function isoD(E = 1, nu = 0.3) {
  const l = (E * nu) / ((1 + nu) * (1 - 2 * nu)), m = E / (2 * (1 + nu));
  const D = new Float64Array(36);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D[i * 6 + j] = l + (i === j ? 2 * m : 0);
  for (let i = 3; i < 6; i++) D[i * 6 + i] = m;
  return D;
}

// Matrice B (6 x 24) au point (xi, eta, zeta) de [0,1]^3, voxel de cote 1.
function bMatrix(p) {
  const B = new Float64Array(6 * 24);
  for (let a = 0; a < 8; a++) {
    const [ax, ay, az] = NODES[a];
    const sx = ax ? 1 : -1, sy = ay ? 1 : -1, sz = az ? 1 : -1;
    const nx = ax ? p[0] : 1 - p[0], ny = ay ? p[1] : 1 - p[1], nz = az ? p[2] : 1 - p[2];
    const dx = sx * ny * nz, dy = nx * sy * nz, dz = nx * ny * sz;
    const c = a * 3;
    B[0 * 24 + c] = dx; B[1 * 24 + c + 1] = dy; B[2 * 24 + c + 2] = dz;
    B[3 * 24 + c + 1] = dz; B[3 * 24 + c + 2] = dy; // gamma_yz
    B[4 * 24 + c] = dz; B[4 * 24 + c + 2] = dx; // gamma_xz
    B[5 * 24 + c] = dy; B[5 * 24 + c + 1] = dx; // gamma_xy
  }
  return B;
}

// Raideur elementaire 24 x 24 (Gauss 2 x 2 x 2) et matrice B au centre.
export function hexStiffness(nu = 0.3) {
  const D = isoD(1, nu);
  const K = new Float64Array(576);
  const g = [0.5 - 0.5 / Math.sqrt(3), 0.5 + 0.5 / Math.sqrt(3)];
  for (const a of g) for (const b of g) for (const c of g) {
    const B = bMatrix([a, b, c]);
    const DB = new Float64Array(6 * 24);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 24; j++) {
      let s = 0;
      for (let k = 0; k < 6; k++) s += D[i * 6 + k] * B[k * 24 + j];
      DB[i * 24 + j] = s;
    }
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
      let s = 0;
      for (let k = 0; k < 6; k++) s += B[k * 24 + i] * DB[k * 24 + j];
      K[i * 24 + j] += s / 8;
    }
  }
  return { K, B0: bMatrix([0.5, 0.5, 0.5]), D };
}

// Voxelisation periodique de la cellule (sans gradient ni rotation), voxels cubiques.
export function cellVoxels(params, n = 24) {
  const an = params.aniso || { x: 1, y: 1, z: 1 };
  const size = [params.cell * (an.x || 1), params.cell * (an.y || 1), params.cell * (an.z || 1)];
  const m = Math.max(...size);
  const dims = size.map((s) => Math.max(6, Math.round((n * s) / m)));
  const p = { ...params, gradient: { kind: 'none' }, rotation: null, skin: null, shape: { kind: 'cube', x: size[0], y: size[1], z: size[2] } };
  const fn = makeFieldFn(p);
  const [nx, ny, nz] = dims;
  const solid = new Uint8Array(nx * ny * nz);
  let q = 0, cnt = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = fn.tpms(((i + 0.5) * size[0]) / nx, ((j + 0.5) * size[1]) / ny, ((k + 0.5) * size[2]) / nz) < 0;
    solid[q++] = s ? 1 : 0; cnt += s;
  }
  return { solid, nx, ny, nz, size, density: cnt / solid.length };
}

// Homogeneisation : renvoie le tenseur effectif C (6 x 6, Voigt) pour un module Es = 1.
// cases : liste des deformations macroscopiques unitaires a calculer (0..5).
export function homogenize(vox, { nu = 0.3, cases = [0, 1, 2, 3, 4, 5], tol = 1e-6, maxIter = 4000, onProgress } = {}) {
  const { solid, nx, ny, nz } = vox;
  const { K, B0, D } = hexStiffness(nu);
  const nn = nx * ny * nz, ndof = nn * 3;
  const elems = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (solid[i + j * nx + k * nx * ny]) elems.push(i, j, k);
  const ne = elems.length / 3;
  // Table de connectivite periodique.
  const conn = new Int32Array(ne * 8);
  for (let e = 0; e < ne; e++) {
    const i = elems[e * 3], j = elems[e * 3 + 1], k = elems[e * 3 + 2];
    for (let a = 0; a < 8; a++) {
      const [dx, dy, dz] = NODES[a];
      conn[e * 8 + a] = ((i + dx) % nx) + ((j + dy) % ny) * nx + ((k + dz) % nz) * nx * ny;
    }
  }
  const diag = new Float64Array(ndof);
  for (let e = 0; e < ne; e++) for (let a = 0; a < 8; a++) for (let d = 0; d < 3; d++) diag[conn[e * 8 + a] * 3 + d] += K[(a * 3 + d) * 25];
  // Un noeud solide est bloque pour supprimer les translations de corps rigide.
  let pin = -1;
  for (let n = 0; n < nn && pin < 0; n++) if (diag[n * 3] > 0) pin = n;
  const free = new Uint8Array(ndof);
  for (let q = 0; q < ndof; q++) free[q] = diag[q] > 0 ? 1 : 0;
  if (pin >= 0) free[pin * 3] = free[pin * 3 + 1] = free[pin * 3 + 2] = 0;

  const ue = new Float64Array(24), fe = new Float64Array(24);
  const matvec = (x, y) => {
    y.fill(0);
    for (let e = 0; e < ne; e++) {
      for (let a = 0; a < 8; a++) { const n = conn[e * 8 + a] * 3; ue[a * 3] = x[n]; ue[a * 3 + 1] = x[n + 1]; ue[a * 3 + 2] = x[n + 2]; }
      for (let r = 0; r < 24; r++) {
        let s = 0; const o = r * 24;
        for (let c = 0; c < 24; c++) s += K[o + c] * ue[c];
        fe[r] = s;
      }
      for (let a = 0; a < 8; a++) { const n = conn[e * 8 + a] * 3; y[n] += fe[a * 3]; y[n + 1] += fe[a * 3 + 1]; y[n + 2] += fe[a * 3 + 2]; }
    }
    for (let q = 0; q < ndof; q++) if (!free[q]) y[q] = 0;
  };

  const C = new Float64Array(36);
  const strains = {}; // deformation moyenne par element pour chaque cas (6 composantes)
  let iterations = 0;
  for (const cs of cases) {
    // Deplacement affine local pour la deformation unitaire cs (cisaillements en glissement).
    const eps = [0, 0, 0, 0, 0, 0]; eps[cs] = 1;
    const E3 = [[eps[0], eps[5] / 2, eps[4] / 2], [eps[5] / 2, eps[1], eps[3] / 2], [eps[4] / 2, eps[3] / 2, eps[2]]];
    const ua = new Float64Array(24);
    for (let a = 0; a < 8; a++) for (let d = 0; d < 3; d++) ua[a * 3 + d] = E3[d][0] * NODES[a][0] + E3[d][1] * NODES[a][1] + E3[d][2] * NODES[a][2];
    const fa = new Float64Array(24);
    for (let r = 0; r < 24; r++) { let s = 0; for (let c = 0; c < 24; c++) s += K[r * 24 + c] * ua[c]; fa[r] = -s; }
    const b = new Float64Array(ndof);
    for (let e = 0; e < ne; e++) for (let a = 0; a < 8; a++) { const n = conn[e * 8 + a] * 3; b[n] += fa[a * 3]; b[n + 1] += fa[a * 3 + 1]; b[n + 2] += fa[a * 3 + 2]; }
    for (let q = 0; q < ndof; q++) if (!free[q]) b[q] = 0;
    // Gradient conjugue preconditionne (Jacobi).
    const x = new Float64Array(ndof), r = b.slice(), z = new Float64Array(ndof), p = new Float64Array(ndof), Ap = new Float64Array(ndof);
    for (let q = 0; q < ndof; q++) z[q] = free[q] ? r[q] / diag[q] : 0;
    p.set(z);
    let rz = 0, bn = 0;
    for (let q = 0; q < ndof; q++) { rz += r[q] * z[q]; bn += b[q] * b[q]; }
    bn = Math.sqrt(bn) || 1;
    let it = 0;
    for (; it < maxIter; it++) {
      matvec(p, Ap);
      let pAp = 0;
      for (let q = 0; q < ndof; q++) pAp += p[q] * Ap[q];
      if (!(pAp > 0)) break;
      const alpha = rz / pAp;
      let rn = 0;
      for (let q = 0; q < ndof; q++) { x[q] += alpha * p[q]; r[q] -= alpha * Ap[q]; rn += r[q] * r[q]; }
      if (Math.sqrt(rn) / bn < tol) { it++; break; }
      let rz2 = 0;
      for (let q = 0; q < ndof; q++) { z[q] = free[q] ? r[q] / diag[q] : 0; rz2 += r[q] * z[q]; }
      const beta = rz2 / rz; rz = rz2;
      for (let q = 0; q < ndof; q++) p[q] = z[q] + beta * p[q];
      if (onProgress && it % 50 === 0) onProgress(cs, it);
    }
    iterations += it;
    // Deformation et contrainte moyennes.
    const st = new Float32Array(ne * 6);
    const sig = [0, 0, 0, 0, 0, 0];
    for (let e = 0; e < ne; e++) {
      for (let a = 0; a < 8; a++) { const n = conn[e * 8 + a] * 3; ue[a * 3] = x[n]; ue[a * 3 + 1] = x[n + 1]; ue[a * 3 + 2] = x[n + 2]; }
      const ep = eps.slice();
      for (let i = 0; i < 6; i++) { let s = 0; for (let c = 0; c < 24; c++) s += B0[i * 24 + c] * ue[c]; ep[i] += s; }
      for (let i = 0; i < 6; i++) {
        st[e * 6 + i] = ep[i];
        let s = 0; for (let k = 0; k < 6; k++) s += D[i * 6 + k] * ep[k];
        sig[i] += s;
      }
    }
    for (let i = 0; i < 6; i++) C[i * 6 + cs] = sig[i] / nn;
    strains[cs] = st;
  }
  return { C, strains, elems, ne, iterations, D };
}

// Inversion d'une matrice carree (Gauss-Jordan).
export function invert(M, n) {
  const A = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => M[i * n + j]), ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-30;
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = A[i][n + j];
  return out;
}

// Constantes d'ingenierie relatives (E/Es, G/Es, nu) a partir de C.
export function engineering(C) {
  const S = invert(C, 6);
  return {
    Ex: 1 / S[0], Ey: 1 / S[7], Ez: 1 / S[14],
    Gyz: 1 / S[21], Gxz: 1 / S[28], Gxy: 1 / S[35],
    nuxy: -S[1] / S[0], nuzx: -S[12] / S[14],
    S,
  };
}

// Module relatif a partir des seuls cas normaux (couplage normal-cisaillement neglige).
export function normalModuli(C) {
  const M = [C[0], C[1], C[2], C[6], C[7], C[8], C[12], C[13], C[14]];
  const S = invert(M, 3);
  return { Ex: 1 / S[0], Ey: 1 / S[4], Ez: 1 / S[8] };
}

// Contrainte de von Mises par element pour une contrainte macroscopique uniaxiale unitaire selon z.
export function vonMisesUniaxial(res, nu = 0.3) {
  const { C, strains, ne } = res;
  const S = invert(C, 6);
  const macro = [S[2], S[8], S[14], S[20], S[26], S[32]]; // deformation macro pour sigma_zz = 1
  const D = res.D;
  const vm = new Float32Array(ne);
  for (let e = 0; e < ne; e++) {
    const ep = [0, 0, 0, 0, 0, 0];
    for (let cs = 0; cs < 6; cs++) {
      if (!strains[cs] || !macro[cs]) continue;
      for (let i = 0; i < 6; i++) ep[i] += macro[cs] * strains[cs][e * 6 + i];
    }
    const s = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6; i++) { let v = 0; for (let k = 0; k < 6; k++) v += D[i * 6 + k] * ep[k]; s[i] = v; }
    vm[e] = Math.sqrt(0.5 * ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2));
  }
  return vm;
}

// Ajustement de Gibson-Ashby E/Es = C * rho^n par regression log-log.
export function fitGibsonAshby(points) {
  const pts = points.filter((p) => p.rho > 0 && p.E > 0);
  const n = pts.length;
  const xs = pts.map((p) => Math.log(p.rho)), ys = pts.map((p) => Math.log(p.E));
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const slope = sxy / sxx;
  return { C: Math.exp(my - slope * mx), n: slope, r2: (sxy * sxy) / (sxx * syy || 1) };
}

export function percentile(arr, p) {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

// Module de Young dans la direction n : 1/E(n) = a . S . a, a = [n1², n2², n3², n2n3, n1n3, n1n2] (notation de Voigt).
export function directionalModulus(S, n) {
  const [x, y, z] = n;
  const a = [x * x, y * y, z * z, y * z, x * z, x * y];
  let inv = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) inv += a[i] * S[i * 6 + j] * a[j];
  return 1 / inv;
}

// Surface d'anisotropie : rayon proportionnel a E(n) sur une sphere discretisee (point 32).
export function anisotropySurface(S, seg = 48) {
  const rows = seg + 1, cols = seg * 2 + 1;
  const dirs = new Float32Array(rows * cols * 3), E = new Float32Array(rows * cols);
  let Emin = Infinity, Emax = 0, nMin = null, nMax = null;
  for (let i = 0; i < rows; i++) {
    const th = (Math.PI * i) / seg;
    for (let j = 0; j < cols; j++) {
      const ph = (Math.PI * j) / seg;
      const n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      const v = i * cols + j;
      dirs.set(n, v * 3);
      E[v] = directionalModulus(S, n);
      if (E[v] < Emin) { Emin = E[v]; nMin = n; }
      if (E[v] > Emax) { Emax = E[v]; nMax = n; }
    }
  }
  const indices = [];
  for (let i = 0; i < seg; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + cols;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { dirs, E, indices: new Uint32Array(indices), Emin, Emax, nMin, nMax, ratio: Emax / Emin };
}
