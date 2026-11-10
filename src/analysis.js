// Analyses morphologiques avancees sur la grille du champ et sur le maillage.
import { edt3d } from './metrics.js';
import { makeFieldFn } from './tpms.js';

const isVoid = (data, p) => data[p] >= 0;

// Profil de porosite selon la hauteur (point 27).
export function zProfile(field) {
  const { data, inside, nx, ny, nz, hz, origin } = field;
  const z = [], porosity = [];
  for (let k = 0; k < nz; k++) {
    let n = 0, v = 0;
    const o = k * nx * ny;
    for (let q = 0; q < nx * ny; q++) if (inside[o + q]) { n++; if (data[o + q] >= 0) v++; }
    if (n > nx * ny * 0.02) { z.push(origin[2] + k * hz); porosity.push(v / n); }
  }
  return { z, porosity };
}

// Etiquetage des composantes connexes d'un masque (6-connexite).
export function components(mask, nx, ny, nz) {
  const N = nx * ny * nz;
  const label = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const sizes = [];
  const sz = nx * ny;
  for (let s = 0; s < N; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = sizes.length;
    let top = 0, size = 0;
    stack[top++] = s; label[s] = id;
    while (top) {
      const p = stack[--top]; size++;
      const i = p % nx, j = ((p / nx) | 0) % ny, k = (p / sz) | 0;
      if (i > 0 && mask[p - 1] && label[p - 1] < 0) { label[p - 1] = id; stack[top++] = p - 1; }
      if (i < nx - 1 && mask[p + 1] && label[p + 1] < 0) { label[p + 1] = id; stack[top++] = p + 1; }
      if (j > 0 && mask[p - nx] && label[p - nx] < 0) { label[p - nx] = id; stack[top++] = p - nx; }
      if (j < ny - 1 && mask[p + nx] && label[p + nx] < 0) { label[p + nx] = id; stack[top++] = p + nx; }
      if (k > 0 && mask[p - sz] && label[p - sz] < 0) { label[p - sz] = id; stack[top++] = p - sz; }
      if (k < nz - 1 && mask[p + sz] && label[p + sz] < 0) { label[p + sz] = id; stack[top++] = p + sz; }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

// Retire les fragments solides detaches du corps principal (bouts de poutres coupes au bord).
// Ils tomberaient du plateau a l'impression ; on les passe en vide avant le maillage.
export function removeIslands(field) {
  const { data, nx, ny, nz } = field;
  const N = nx * ny * nz;
  const mask = new Uint8Array(N);
  for (let p = 0; p < N; p++) mask[p] = data[p] < 0 ? 1 : 0;
  const sc = components(mask, nx, ny, nz);
  if (sc.sizes.length < 2) return 0;
  let main = 0;
  sc.sizes.forEach((s, i) => { if (s > sc.sizes[main]) main = i; });
  const eps = Math.abs(data.reduce((m, v) => Math.max(m, Math.abs(v)), 0)) * 1e-3 || 1e-3;
  for (let p = 0; p < N; p++) if (mask[p] && sc.label[p] !== main) data[p] = eps;
  return sc.sizes.length - 1;
}

// Volumes fermes (poudre ou resine piegee) et ilots solides detaches (point 28).
export function closedRegions(field) {
  const { data, inside, nx, ny, nz, hx, hy, hz } = field;
  const N = nx * ny * nz;
  const vox = hx * hy * hz;
  const voidMask = new Uint8Array(N), solidMask = new Uint8Array(N);
  for (let p = 0; p < N; p++) { voidMask[p] = data[p] >= 0 ? 1 : 0; solidMask[p] = data[p] < 0 ? 1 : 0; }
  const v = components(voidMask, nx, ny, nz);
  // Composantes du vide qui touchent l'exterieur de l'eprouvette.
  const open = new Uint8Array(v.sizes.length);
  for (let p = 0; p < N; p++) if (voidMask[p] && !inside[p]) open[v.label[p]] = 1;
  let closedCount = 0, closedVol = 0;
  v.sizes.forEach((s, i) => { if (!open[i]) { closedCount++; closedVol += s * vox; } });
  const sc = components(solidMask, nx, ny, nz);
  let main = 0;
  sc.sizes.forEach((s, i) => { if (s > sc.sizes[main]) main = i; });
  let islands = 0, islandVol = 0;
  sc.sizes.forEach((s, i) => { if (i !== main && s > 0) { islands++; islandVol += s * vox; } });
  return { closedCount, closedVol, islands, islandVol };
}

// Tas binaire minimal pour Dijkstra.
class Heap {
  constructor(n) { this.k = new Float64Array(n); this.v = new Int32Array(n); this.n = 0; }
  push(key, val) {
    let i = this.n++;
    if (i >= this.k.length) { const k = new Float64Array(this.k.length * 2); k.set(this.k); this.k = k; const v = new Int32Array(this.v.length * 2); v.set(this.v); this.v = v; }
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const top = this.v[0], key = this.k[0];
    const lk = this.k[--this.n], lv = this.v[this.n];
    let i = 0;
    while (true) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= lk) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = lk; this.v[i] = lv;
    return [key, top];
  }
}

// Tortuosite geometrique : chemin le plus court dans le vide, de la base au sommet (point 23).
export function geometricTortuosity(field) {
  const { data, inside, nx, ny, nz } = field;
  const sz = nx * ny;
  let k0 = -1, k1 = -1;
  for (let k = 0; k < nz; k++) { let c = 0; for (let q = 0; q < sz; q++) if (inside[k * sz + q]) c++; if (c > sz * 0.05) { if (k0 < 0) k0 = k; k1 = k; } }
  if (k0 < 0 || k1 - k0 < 4) return null;
  const N = nx * ny * nz;
  const dist = new Float32Array(N).fill(Infinity);
  const heap = new Heap(1 << 16);
  for (let q = 0; q < sz; q++) { const p = k0 * sz + q; if (inside[p] && isVoid(data, p)) { dist[p] = 0; heap.push(0, p); } }
  const offs = [];
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj && !dk) continue;
    offs.push([di, dj, dk, Math.hypot(di, dj, dk)]);
  }
  while (heap.n) {
    const [d, p] = heap.pop();
    if (d > dist[p]) continue;
    const i = p % nx, j = ((p / nx) | 0) % ny, k = (p / sz) | 0;
    if (k === k1) continue;
    for (const [di, dj, dk, w] of offs) {
      const a = i + di, b = j + dj, c = k + dk;
      if (a < 0 || b < 0 || c < k0 || a >= nx || b >= ny || c > k1) continue;
      const q = a + b * nx + c * sz;
      if (!inside[q] || !isVoid(data, q)) continue;
      const nd = d + w;
      if (nd < dist[q]) { dist[q] = nd; heap.push(nd, q); }
    }
  }
  let s = 0, n = 0;
  for (let q = 0; q < sz; q++) { const d = dist[k1 * sz + q]; if (Number.isFinite(d)) { s += d; n++; } }
  return n ? s / n / (k1 - k0) : null;
}

// Parcours en largeur dans un masque, de la tranche k0 a la tranche k1 (6-connexite).
function percolates(mask, nx, ny, k0, k1) {
  const sz = nx * ny;
  const seen = new Uint8Array(mask.length);
  const stack = [];
  for (let q = 0; q < sz; q++) { const p = k0 * sz + q; if (mask[p]) { seen[p] = 1; stack.push(p); } }
  while (stack.length) {
    const p = stack.pop();
    const k = (p / sz) | 0;
    if (k === k1) return true;
    const i = p % nx, j = ((p / nx) | 0) % ny;
    const nb = [i > 0 ? p - 1 : -1, i < nx - 1 ? p + 1 : -1, j > 0 ? p - nx : -1, j < ny - 1 ? p + nx : -1, k > k0 ? p - sz : -1, k < k1 ? p + sz : -1];
    for (const q of nb) if (q >= 0 && mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
  }
  return false;
}

// Diametre de passage : plus grosse sphere qui traverse l'eprouvette de bas en haut (point 24).
export function percolationDiameter(field, dtVoid) {
  const { data, inside, nx, ny, nz, hx } = field;
  const sz = nx * ny, N = nx * ny * nz;
  let k0 = -1, k1 = -1;
  for (let k = 0; k < nz; k++) { let c = 0; for (let q = 0; q < sz; q++) if (inside[k * sz + q]) c++; if (c > sz * 0.05) { if (k0 < 0) k0 = k; k1 = k; } }
  if (k0 < 0) return 0;
  const vals = new Set();
  for (let p = 0; p < N; p++) if (inside[p] && data[p] >= 0) vals.add(dtVoid[p]);
  const sorted = [...vals].sort((a, b) => a - b);
  const mask = new Uint8Array(N);
  const ok = (r2) => {
    for (let p = 0; p < N; p++) mask[p] = inside[p] && data[p] >= 0 && dtVoid[p] >= r2 ? 1 : 0;
    return percolates(mask, nx, ny, k0, k1);
  };
  let lo = 0, hi = sorted.length - 1;
  if (!ok(sorted[0])) return 0;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ok(sorted[mid])) lo = mid; else hi = mid - 1; }
  return 2 * Math.sqrt(sorted[lo]) * hx;
}

// Porosimetrie simulee : volume de vide atteint par une sphere de diametre donne entrant par l'exterieur
// (equivalent numerique de l'intrusion de mercure, point 25).
export function intrusionCurve(field, dtVoid, diameters) {
  const { data, inside, nx, ny, nz, hx } = field;
  const N = nx * ny * nz;
  let totalVoid = 0;
  for (let p = 0; p < N; p++) if (inside[p] && data[p] >= 0) totalVoid++;
  const out = [];
  const centers = new Uint8Array(N);
  const stack = new Int32Array(N);
  const sz = nx * ny;
  for (const D of diameters) {
    const r = D / 2 / hx, r2 = r * r;
    // Centres admissibles relies a l'exterieur.
    centers.fill(0);
    let top = 0;
    for (let p = 0; p < N; p++) if (!inside[p] && data[p] >= 0 && dtVoid[p] >= r2) { centers[p] = 1; stack[top++] = p; }
    while (top) {
      const p = stack[--top];
      const i = p % nx, j = ((p / nx) | 0) % ny, k = (p / sz) | 0;
      const nb = [i > 0 ? p - 1 : -1, i < nx - 1 ? p + 1 : -1, j > 0 ? p - nx : -1, j < ny - 1 ? p + nx : -1, k > 0 ? p - sz : -1, k < nz - 1 ? p + sz : -1];
      for (const q of nb) if (q >= 0 && !centers[q] && data[q] >= 0 && dtVoid[q] >= r2) { centers[q] = 1; stack[top++] = q; }
    }
    // Dilatation des centres par le rayon de la sphere.
    const dc = edt3d(centers, nx, ny, nz);
    let acc = 0;
    for (let p = 0; p < N; p++) if (inside[p] && data[p] >= 0 && dc[p] <= r2) acc++;
    out.push({ D, fraction: totalVoid ? acc / totalVoid : 0 });
  }
  return out;
}

// Cartes par sommet : epaisseur locale, taille de pore locale, courbure moyenne, surplombs (points 22, 29, 53).
export function vertexMaps(params, field, mesh, dt, { overhangDeg = 45 } = {}) {
  const { positions, normals, indices } = mesh;
  const { nx, ny, nz, hx, hy, hz, origin } = field;
  const nv = positions.length / 3;
  const thickness = new Float32Array(nv), pore = new Float32Array(nv), curvature = new Float32Array(nv), overhang = new Float32Array(nv), gauss = new Float32Array(nv);
  const idx = (x, y, z) => {
    const i = Math.round((x - origin[0]) / hx), j = Math.round((y - origin[1]) / hy), k = Math.round((z - origin[2]) / hz);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
    return i + j * nx + k * nx * ny;
  };
  const h = hx;
  const reach = Math.max(params.cell * 0.6, 4 * h);
  const fn = makeFieldFn(params);
  const e = h * 0.5;
  const f = (x, y, z) => fn.value(x, y, z);
  const cosO = Math.cos((overhangDeg * Math.PI) / 180);
  for (let v = 0; v < nv; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    let n0 = normals[v * 3], n1 = normals[v * 3 + 1], n2 = normals[v * 3 + 2];
    // Le maillage oriente les normales vers le vide : on le verifie sur le champ.
    const probe = f(x + n0 * e, y + n1 * e, z + n2 * e);
    if (probe < 0) { n0 = -n0; n1 = -n1; n2 = -n2; }
    let tMax = 0, pMax = 0;
    for (let s = h * 0.5; s <= reach; s += h * 0.5) {
      const a = idx(x - n0 * s, y - n1 * s, z - n2 * s);
      if (a >= 0 && dt.dtSolid[a] > tMax) tMax = dt.dtSolid[a];
      const b = idx(x + n0 * s, y + n1 * s, z + n2 * s);
      if (b >= 0 && field.inside[b] && dt.dtVoid[b] > pMax) pMax = dt.dtVoid[b];
    }
    thickness[v] = 2 * Math.sqrt(tMax) * h;
    pore[v] = 2 * Math.sqrt(pMax) * h;
    // Courbure moyenne H = div(grad f / |grad f|) / 2, par differences finies.
    const fx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), fy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), fz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
    const f0 = f(x, y, z);
    const fxx = (f(x + e, y, z) - 2 * f0 + f(x - e, y, z)) / (e * e), fyy = (f(x, y + e, z) - 2 * f0 + f(x, y - e, z)) / (e * e), fzz = (f(x, y, z + e) - 2 * f0 + f(x, y, z - e)) / (e * e);
    const fxy = (f(x + e, y + e, z) - f(x + e, y - e, z) - f(x - e, y + e, z) + f(x - e, y - e, z)) / (4 * e * e);
    const fxz = (f(x + e, y, z + e) - f(x + e, y, z - e) - f(x - e, y, z + e) + f(x - e, y, z - e)) / (4 * e * e);
    const fyz = (f(x, y + e, z + e) - f(x, y + e, z - e) - f(x, y - e, z + e) + f(x, y - e, z - e)) / (4 * e * e);
    const g2 = fx * fx + fy * fy + fz * fz, g = Math.sqrt(g2) || 1e-12;
    const num = fx * fx * (fyy + fzz) + fy * fy * (fxx + fzz) + fz * fz * (fxx + fyy) - 2 * (fx * fy * fxy + fx * fz * fxz + fy * fz * fyz);
    curvature[v] = num / (2 * g * g * g);
    // Courbure de Gauss K = grad f . adj(Hess f) . grad f / |grad f|^4 (Goldman 2005).
    const kn = fx * fx * (fyy * fzz - fyz * fyz) + fy * fy * (fxx * fzz - fxz * fxz) + fz * fz * (fxx * fyy - fxy * fxy)
      + 2 * (fx * fy * (fxz * fyz - fxy * fzz) + fx * fz * (fxy * fyz - fxz * fyy) + fy * fz * (fxy * fxz - fyz * fxx));
    gauss[v] = kn / (g2 * g2);
    // Surplomb : surface tournee vers le bas, plus inclinee que l'angle limite.
    overhang[v] = n2 < -cosO ? 1 : Math.max(0, -n2) / cosO * 0.6;
  }
  // Statistiques ponderees par l'aire des triangles.
  let area = 0, overA = 0, concA = 0, Hsum = 0, saddleA = 0, accA = 0;
  const absH = [], absK = [];
  const accessMin = 0.1; // pore de 100 µm : seuil courant de colonisation osseuse (Karageorgiou 2005)
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const A = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const o = (overhang[indices[t]] + overhang[indices[t + 1]] + overhang[indices[t + 2]]) / 3;
    const Hm = (curvature[indices[t]] + curvature[indices[t + 1]] + curvature[indices[t + 2]]) / 3;
    area += A;
    if (o >= 0.999) overA += A;
    if (Hm < 0) concA += A;
    if (gauss[indices[t]] + gauss[indices[t + 1]] + gauss[indices[t + 2]] < 0) saddleA += A;
    if (Math.min(pore[indices[t]], pore[indices[t + 1]], pore[indices[t + 2]]) >= accessMin) accA += A;
    Hsum += Hm * A;
  }
  for (let v = 0; v < nv; v += 7) { absH.push(Math.abs(curvature[v])); absK.push(Math.abs(gauss[v])); }
  absH.sort((a, b) => a - b);
  absK.sort((a, b) => a - b);
  return {
    thickness, pore, curvature, overhang, gauss,
    saddleFraction: area ? saddleA / area : 0,
    accessibleFraction: area ? accA / area : 0,
    gaussScale: absK[Math.floor(absK.length * 0.9)] || 1,
    overhangFraction: area ? overA / area : 0,
    concaveFraction: area ? concA / area : 0,
    meanCurvature: area ? Hsum / area : 0,
    curvatureScale: absH[Math.floor(absH.length * 0.9)] || 1,
  };
}
