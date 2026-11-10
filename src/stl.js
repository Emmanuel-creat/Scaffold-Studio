// Import d'une forme STL (defaut osseux, implant) et conversion en distance signee sur grille.
import { edt3d } from './metrics.js';

export function parseSTL(buffer) {
  const dv = new DataView(buffer);
  const isBinary = buffer.byteLength >= 84 && 84 + dv.getUint32(80, true) * 50 === buffer.byteLength;
  if (isBinary) {
    const n = dv.getUint32(80, true);
    const tris = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) tris[i * 9 + k] = dv.getFloat32(o + k * 4, true);
    }
    return tris;
  }
  const text = new TextDecoder().decode(buffer);
  const nums = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  if (nums.length < 9) throw new Error('Fichier STL vide ou illisible');
  return Float32Array.from(nums);
}

// Ramene la piece a l'origine et renvoie sa boite englobante.
export function normalize(tris) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], tris[i + a]); hi[a] = Math.max(hi[a], tris[i + a]); }
  for (let i = 0; i < tris.length; i += 3) for (let a = 0; a < 3; a++) tris[i + a] -= lo[a];
  return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
}

// Voxelisation par parite de rayons selon z, puis distance signee (mm).
export function stlToSdf(tris, box, res = 96) {
  const h = Math.max(...box) / res;
  const pad = 2;
  const nx = Math.ceil(box[0] / h) + 1 + 2 * pad, ny = Math.ceil(box[1] / h) + 1 + 2 * pad, nz = Math.ceil(box[2] / h) + 1 + 2 * pad;
  const origin = [-pad * h, -pad * h, -pad * h];
  const inside = new Uint8Array(nx * ny * nz);
  // Rangement des triangles par colonne (i, j) pour accelerer les intersections.
  const cols = new Map();
  const nt = tris.length / 9;
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const xs = [tris[o], tris[o + 3], tris[o + 6]], ys = [tris[o + 1], tris[o + 4], tris[o + 7]];
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - origin[0]) / h)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) - origin[0]) / h));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - origin[1]) / h)), j1 = Math.min(ny - 1, Math.ceil((Math.max(...ys) - origin[1]) / h));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = i + j * nx;
      let l = cols.get(key);
      if (!l) cols.set(key, (l = []));
      l.push(t);
    }
  }
  for (const [key, list] of cols) {
    const i = key % nx, j = (key / nx) | 0;
    const px = origin[0] + i * h + 1e-7, py = origin[1] + j * h + 1.3e-7;
    const zs = [];
    for (const t of list) {
      const o = t * 9;
      const ax = tris[o], ay = tris[o + 1], az = tris[o + 2], bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5], cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-20) continue;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
      const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      zs.push(l1 * az + l2 * bz + l3 * cz);
    }
    zs.sort((a, b) => a - b);
    for (let s = 0; s + 1 < zs.length; s += 2) {
      const k0 = Math.max(0, Math.ceil((zs[s] - origin[2]) / h)), k1 = Math.min(nz - 1, Math.floor((zs[s + 1] - origin[2]) / h));
      for (let k = k0; k <= k1; k++) inside[i + j * nx + k * nx * ny] = 1;
    }
  }
  const outside = new Uint8Array(inside.length);
  let count = 0;
  for (let p = 0; p < inside.length; p++) { outside[p] = inside[p] ? 0 : 1; count += inside[p]; }
  const dOut = edt3d(inside, nx, ny, nz), dIn = edt3d(outside, nx, ny, nz);
  const data = new Float32Array(inside.length);
  for (let p = 0; p < inside.length; p++) data[p] = inside[p] ? -(Math.sqrt(dIn[p]) - 0.5) * h : (Math.sqrt(dOut[p]) - 0.5) * h;
  return { grid: { nx, ny, nz, h, data, origin }, volume: count * h ** 3 };
}
