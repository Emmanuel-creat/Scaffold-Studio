// Modeles biologiques : oxygene (advection, diffusion, consommation cellulaire), croissance
// tissulaire pilotee par la courbure, correction non newtonienne du milieu.
import { buildField } from './tpms.js';
import { edt3d } from './metrics.js';

export const D_O2 = 3e-3; // mm2/s, oxygene dans le milieu a 37 degres (3e-9 m2/s)

// Grille de calcul pour l'oxygene a partir du champ de vitesse : une cellule periodique est
// repetee selon z jusqu'a la hauteur de la piece ; sinon la grille de la piece est reprise.
export function oxygenGrid(flow, Z) {
  const { nx, ny, nz, size, solid } = flow;
  const reps = flow.period ? Math.max(1, Math.round(Z / size[2])) : 1;
  const NZ = nz * reps;
  const N = nx * ny * NZ;
  const s = new Uint8Array(N), u = new Float32Array(N), v = new Float32Array(N), w = new Float32Array(N);
  const plane = nx * ny;
  for (let k = 0; k < NZ; k++) {
    const k0 = k % nz;
    for (let q = 0; q < plane; q++) {
      const a = k * plane + q, b = k0 * plane + q;
      s[a] = solid[b]; u[a] = flow.ux[b] * flow.scale; v[a] = flow.uy[b] * flow.scale; w[a] = flow.uz[b] * flow.scale;
    }
  }
  return { nx, ny, nz: NZ, h: size[0] / nx, solid: s, u, v, w, periodicXY: !!flow.period, length: (size[2] / nz) * NZ };
}

// Etat stationnaire de c (mol/m3) : D lap c - u.grad c = consommation de Michaelis-Menten
// par les cellules adherentes aux parois. Entree a c0 en z = 0 ; sortie libre (perfusion)
// ou milieu des deux cotes (culture statique).
export function solveOxygen(grid, { c0 = 0.2, vmax = 2e-17, density = 1000, km = 0.005, statique = false, iterations = 3000, tol = 1e-7, D = D_O2, hypoxia = 0.02, omega = 1.7 } = {}) {
  const { nx, ny, nz, h, solid, u, v, w, periodicXY } = grid;
  const N = nx * ny * nz, plane = nx * ny;
  const c = new Float32Array(N).fill(c0);
  // Nombre de faces de paroi par voxel fluide et coefficient de consommation (mol/m3/s a saturation).
  const wall = new Uint8Array(N);
  const nb = (i, j, k, di, dj, dk) => {
    let a = i + di, b = j + dj;
    const z = k + dk;
    if (periodicXY) { a = (a + nx) % nx; b = (b + ny) % ny; } else if (a < 0 || b < 0 || a >= nx || b >= ny) return -2;
    if (z < 0) return -3; // entree
    if (z >= nz) return -4; // sortie
    return a + b * nx + z * plane;
  };
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const nbr = new Int32Array(N * 6);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = i + j * nx + k * plane;
    let cnt = 0;
    DIRS.forEach(([a, b, d], q) => {
      const n = nb(i, j, k, a, b, d);
      nbr[p * 6 + q] = n;
      if (n >= 0 && solid[n]) cnt++;
    });
    wall[p] = solid[p] ? 0 : cnt;
  }
  // Flux surfacique maximal (mol/s/mm2) converti en taux volumique par face (mol/m3/s).
  const qmax = (vmax * density) / (h * 1e-9); // vmax * sigma * h^2 / (h^3 * 1e-9)
  const Dh = D / (h * h);
  let change = 0, it = 0, prev = Infinity;
  for (; it < iterations; it++) {
    // Sur-relaxation tant que l'on est loin de la solution, Gauss-Seidel simple pour finir.
    const om = prev > 1e-4 * c0 ? omega : 1;
    change = 0;
    const forward = it % 2 === 0;
    for (let s0 = 0; s0 < N; s0++) {
      const p = forward ? s0 : N - 1 - s0;
      if (solid[p]) continue;
      let num = 0, den = 0;
      for (let q = 0; q < 6; q++) {
        const n = nbr[p * 6 + q];
        if (n === -2) continue;
        let cn;
        if (n === -3) cn = c0;
        else if (n === -4) cn = statique ? c0 : c[p];
        else if (solid[n]) continue;
        else cn = c[n];
        num += Dh * cn; den += Dh;
      }
      // Advection amont.
      const ax = [u[p], v[p], w[p]];
      for (let a = 0; a < 3; a++) {
        const vel = ax[a];
        if (vel === 0) continue;
        const q = vel > 0 ? a * 2 + 1 : a * 2; // voisin amont
        const n = nbr[p * 6 + q];
        let cu;
        if (n === -3) cu = c0;
        else if (n < 0 || solid[n]) cu = c[p];
        else cu = c[n];
        num += (Math.abs(vel) / h) * cu; den += Math.abs(vel) / h;
      }
      // Consommation linearisee : R = qmax * nparois * c / (km + c).
      const r = wall[p] ? (qmax * wall[p]) / (km + Math.max(c[p], 0)) : 0;
      // Sur-relaxation (SOR) : la diffusion pure converge sinon en N^2 iterations.
      const cnew = Math.max(0, c[p] + om * (num / (den + r) - c[p]));
      change = Math.max(change, Math.abs(cnew - c[p]));
      c[p] = cnew;
    }
    if (change < tol * c0) break;
    prev = change;
  }
  // Profil moyen selon z et statistiques sur les voxels de paroi.
  const profile = [];
  let wallN = 0, hyp = 0, cmin = c0;
  for (let k = 0; k < nz; k++) {
    let s = 0, n = 0;
    for (let q = 0; q < plane; q++) { const p = k * plane + q; if (!solid[p]) { s += c[p]; n++; if (wall[p]) { wallN++; if (c[p] < hypoxia) hyp++; if (c[p] < cmin) cmin = c[p]; } } }
    profile.push([(k + 0.5) * h, n ? s / n : 0]);
  }
  return { c, profile, cmin, hypoxicWall: wallN ? hyp / wallN : 0, iterations: it, wallCount: wallN };
}

// Fraction des voxels de paroi sous un seuil donne.
export function hypoxicFraction(grid, c, threshold) {
  const { nx, ny, nz, solid } = grid;
  let n = 0, hyp = 0;
  const plane = nx * ny;
  for (let p = 0; p < nx * ny * nz; p++) {
    if (solid[p]) continue;
    const k = (p / plane) | 0, q = p % plane, i = q % nx, j = (q / nx) | 0;
    const isWall = (i > 0 && solid[p - 1]) || (i < nx - 1 && solid[p + 1]) || (j > 0 && solid[p - nx]) || (j < ny - 1 && solid[p + nx]) || (k > 0 && solid[p - plane]) || (k < nz - 1 && solid[p + plane]);
    if (!isWall) continue;
    n++; if (c[p] < threshold) hyp++;
  }
  return n ? hyp / n : 0;
}

// Epaisseur locale du vide (Hildebrand et Ruegsegger) : rayon de la plus grande sphere
// inscrite qui contient chaque voxel, a partir des centres de crete de la transformee de distance.
export function localRadius(dt2, mask, nx, ny, nz) {
  const N = nx * ny * nz, plane = nx * ny;
  const R = new Float32Array(N);
  const centers = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const p = i + j * nx + k * plane;
    if (!mask[p]) continue;
    const v = dt2[p];
    let isMax = true;
    for (let dk = -1; dk <= 1 && isMax; dk++) for (let dj = -1; dj <= 1 && isMax; dj++) for (let di = -1; di <= 1; di++)
      if (dt2[p + di + dj * nx + dk * plane] > v) { isMax = false; break; }
    if (isMax) centers.push(p);
  }
  centers.sort((a, b) => dt2[a] - dt2[b]);
  for (const c of centers) {
    const r = Math.sqrt(dt2[c]), r2 = dt2[c], ri = Math.ceil(r);
    const ci = c % nx, cj = ((c / nx) | 0) % ny, ck = (c / plane) | 0;
    for (let dk = -ri; dk <= ri; dk++) for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++) {
      if (di * di + dj * dj + dk * dk > r2) continue;
      const i = ci + di, j = cj + dj, k = ck + dk;
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
      const q = i + j * nx + k * plane;
      if (mask[q] && r > R[q]) R[q] = r;
    }
  }
  for (let p = 0; p < N; p++) if (mask[p] && !R[p]) R[p] = Math.sqrt(dt2[p]);
  return R;
}

// Croissance tissulaire pilotee par la courbure (Rumpler 2008, Bidan 2012). Dans un canal de
// rayon R, le front avance a v = lambda / r, d'ou r^2 = R^2 - 2 lambda t : un voxel a la distance d
// de la paroi est comble au temps t = d (2R - d) / (2 lambda), R etant le rayon local du pore.
// Les parois planes (R grand) croissent lentement, les pores etroits se comblent d'abord.
export function growTissue(params, { res = 56, lambda = 2.5e-3, days = 56, step = 1, snapshots = [7, 14, 28, 42, 56], field: given = undefined } = {}) {
  const field = given || buildField({ ...params, res });
  const { data, inside, nx, ny, nz, hx: h } = field;
  const N = nx * ny * nz;
  const solid = new Uint8Array(N), voidIn = new Uint8Array(N);
  for (let p = 0; p < N; p++) { solid[p] = data[p] < 0 ? 1 : 0; voidIn[p] = !solid[p] && inside[p] ? 1 : 0; }
  const dt2 = edt3d(solid, nx, ny, nz);
  const R = localRadius(dt2, voidIn, nx, ny, nz);
  const tFill = new Float32Array(N).fill(Infinity);
  let void0 = 0;
  for (let p = 0; p < N; p++) {
    if (!voidIn[p]) continue;
    void0++;
    const d = Math.max(0, (Math.sqrt(dt2[p]) - 0.5)) * h;
    const Rl = Math.max(R[p] * h, d);
    tFill[p] = (d * (2 * Rl - d)) / (2 * lambda);
  }
  const sorted = Float32Array.from(tFill.filter((v, p) => voidIn[p])).sort();
  const curve = [];
  for (let t = 0; t <= days + 1e-9; t += step) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= t) lo = m + 1; else hi = m; }
    curve.push([t, void0 ? lo / void0 : 0]);
  }
  const shots = snapshots.filter((d) => d <= days).map((day) => {
    // Negatif dans le tissu forme a cette date, positif ailleurs (solide compris).
    const tdata = new Float32Array(N);
    for (let p = 0; p < N; p++) tdata[p] = voidIn[p] ? (tFill[p] - day) / Math.max(day, 1) : 1;
    return { day, field: { data: tdata, nx, ny, nz, hx: field.hx, hy: field.hy, hz: field.hz, origin: field.origin } };
  });
  const half = curve.find((c) => c[1] >= 0.5);
  return { curve, shots, h, halfDay: half ? half[0] : null };
}

// Fluide non newtonien : viscosite de Carreau a un taux de cisaillement caracteristique (point 49).
export const FLUIDS = {
  medium: { label: 'Milieu de culture (newtonien)', mu: 0.75e-3 },
  serum: { label: 'Milieu avec 10 % de sérum (newtonien)', mu: 0.78e-3 },
  blood: { label: 'Sang (Carreau)', carreau: { mu0: 0.056, muInf: 0.00345, lambda: 3.313, n: 0.3568 } },
};
export function apparentViscosity(fluid, gamma) {
  const f = FLUIDS[fluid] || FLUIDS.medium;
  if (!f.carreau) return f.mu;
  const { mu0, muInf, lambda, n } = f.carreau;
  return muInf + (mu0 - muInf) * Math.pow(1 + (lambda * gamma) ** 2, (n - 1) / 2);
}
// Taux de cisaillement caracteristique dans les pores : u_pore / (d_pore / 2) ; point fixe sur mu.
export function nonNewtonian(fluid, { inlet, porosity, pore }) {
  const f = FLUIDS[fluid] || FLUIDS.medium;
  const uPore = (inlet / Math.max(porosity, 0.05)) * 1e-3; // m/s
  const gamma = uPore / (Math.max(pore, 0.01) * 1e-3 / 2) * 4;
  const mu = apparentViscosity(fluid, gamma);
  return { gamma, mu, ratio: mu / 0.75e-3, newtonian: !f.carreau };
}

// Concentration aux sommets du maillage : moyenne des voxels fluides voisins de la grille d'oxygene.
export function oxygenAtVertices(positions, grid, c, profile) {
  const { nx, ny, nz, h, solid, periodicXY } = grid;
  const out = new Float32Array(positions.length / 3);
  const plane = nx * ny;
  for (let v = 0; v < out.length; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const i0 = Math.floor(x / h), j0 = Math.floor(y / h), k0 = Math.floor(z / h);
    let s = 0, n = 0;
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      let i = i0 + di, j = j0 + dj;
      const k = k0 + dk;
      if (k < 0 || k >= nz) continue;
      if (periodicXY) { i = ((i % nx) + nx) % nx; j = ((j % ny) + ny) % ny; } else if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const p = i + j * nx + k * plane;
      if (!solid[p]) { s += c[p]; n++; }
    }
    // Faces de coupe pleines : on reprend la moyenne de la tranche.
    out[v] = n ? s / n : profile ? profile[Math.min(Math.max(k0, 0), nz - 1)][1] : NaN;
  }
  return out;
}

// Generateur pseudo-aleatoire reproductible (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Ensemencement par perfusion (point 47) : les cellules sont injectees en z = 0, transportees
// par le champ de vitesse et sedimentent (vitesse de Stokes d'une cellule de 15 um, environ 9 um/s,
// gravite selon -z, l'ecoulement montant selon +z). Au contact d'une paroi, elles adherent avec
// la probabilite donnee, sinon elles sont reprises par l'ecoulement.
export function seedCells(flow, box, { cells = 2000, attach = 0.3, settling = 0.009, radius = 0.0075, frames = 72, seed = 7, duration = undefined } = {}) {
  const { nx, ny, nz, size, solid, ux, uy, uz, scale } = flow;
  const [X, Y, Z] = box;
  const plane = nx * ny;
  const vox = (x, y, z) => {
    const i = ((Math.floor((x / size[0]) * nx) % nx) + nx) % nx;
    const j = ((Math.floor((y / size[1]) * ny) % ny) + ny) % ny;
    const k = ((Math.floor((z / size[2]) * nz) % nz) + nz) % nz;
    return i + j * nx + k * plane;
  };
  const wallAt = (x, y, z) => {
    if (solid[vox(x, y, z)]) return true;
    for (const [a, b, d] of [[radius, 0, 0], [-radius, 0, 0], [0, radius, 0], [0, -radius, 0], [0, 0, radius], [0, 0, -radius]]) if (solid[vox(x + a, y + b, z + d)]) return true;
    return false;
  };
  const vel = new Float32Array(3);
  const sample = (x, y, z) => {
    const fx = (x / size[0]) * nx - 0.5, fy = (y / size[1]) * ny - 0.5, fz = (z / size[2]) * nz - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
    const tx = fx - i0, ty = fy - j0, tz = fz - k0;
    let ax = 0, ay = 0, az = 0;
    for (let c = 0; c < 8; c++) {
      const di = c & 1, dj = (c >> 1) & 1, dk = (c >> 2) & 1;
      const i = (((i0 + di) % nx) + nx) % nx, j = (((j0 + dj) % ny) + ny) % ny, k = (((k0 + dk) % nz) + nz) % nz;
      const w = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty) * (dk ? tz : 1 - tz);
      const p = i + j * nx + k * plane;
      ax += w * ux[p]; ay += w * uy[p]; az += w * uz[p];
    }
    vel[0] = ax * scale; vel[1] = ay * scale; vel[2] = az * scale;
  };
  let umax = 0, usum = 0, nf = 0;
  for (let p = 0; p < ux.length; p++) { if (solid[p]) continue; const v = Math.hypot(ux[p], uy[p], uz[p]) * scale; umax = Math.max(umax, v); usum += uz[p] * scale; nf++; }
  const uMean = Math.max(usum / Math.max(nf, 1), 1e-6);
  const h = size[0] / nx;
  const T = duration || (3 * Z) / uMean;
  let dt = (0.4 * h) / Math.max(umax, settling);
  let steps = Math.ceil(T / dt);
  if (steps > 15000) { steps = 15000; dt = T / steps; }
  const rand = rng(seed);
  const pos = new Float32Array(cells * 3);
  for (let c = 0; c < cells; c++) {
    let x, y, z, tries = 0;
    do { x = rand() * X; y = rand() * Y; z = 0.02 + rand() * 0.05 * Z; tries++; } while (wallAt(x, y, z) && tries < 50);
    pos[c * 3] = x; pos[c * 3 + 1] = y; pos[c * 3 + 2] = z;
  }
  // 0 en transit, 1 adherente, 2 sortie par le haut, 3 retombee a l'entree
  const status = new Uint8Array(cells);
  const track = new Float32Array(cells * frames * 3);
  const every = Math.max(1, Math.floor(steps / (frames - 1)));
  let frame = 0;
  const record = () => { if (frame < frames) { track.set(pos, frame * cells * 3); frame++; } };
  record();
  for (let s = 1; s <= steps; s++) {
    for (let c = 0; c < cells; c++) {
      if (status[c]) continue;
      const b = c * 3;
      const x = pos[b], y = pos[b + 1], z = pos[b + 2];
      sample(x, y, z);
      let nx2 = x + vel[0] * dt, ny2 = y + vel[1] * dt, nz2 = z + (vel[2] - settling) * dt;
      nx2 = Math.min(Math.max(nx2, 0), X); ny2 = Math.min(Math.max(ny2, 0), Y);
      if (nz2 >= Z) { status[c] = 2; pos[b + 2] = Z; continue; }
      if (nz2 <= 0) { status[c] = 3; pos[b + 2] = 0; continue; }
      if (wallAt(nx2, ny2, nz2)) {
        if (rand() < attach) { status[c] = 1; continue; }
        // rejetee : elle suit l'ecoulement sans sedimenter pendant ce pas
        nx2 = x + vel[0] * dt; ny2 = y + vel[1] * dt; nz2 = z + vel[2] * dt;
        if (wallAt(nx2, ny2, nz2)) continue;
      }
      pos[b] = nx2; pos[b + 1] = ny2; pos[b + 2] = nz2;
    }
    if (s % every === 0) record();
  }
  while (frame < frames) record();
  const attached = [];
  const bins = new Array(10).fill(0);
  for (let c = 0; c < cells; c++) if (status[c] === 1) { attached.push(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]); bins[Math.min(9, Math.floor((pos[c * 3 + 2] / Z) * 10))]++; }
  const n1 = attached.length / 3;
  const mean = n1 / 10;
  const cv = mean > 0 ? Math.sqrt(bins.reduce((a, b) => a + (b - mean) ** 2, 0) / 10) / mean : NaN;
  const count = (k) => status.reduce((a, s) => a + (s === k ? 1 : 0), 0);
  return {
    efficiency: n1 / cells, exited: count(2) / cells, fellBack: count(3) / cells, inTransit: count(0) / cells,
    attached: Float32Array.from(attached), status, track, frames, cells, bins, cv, duration: T,
  };
}
